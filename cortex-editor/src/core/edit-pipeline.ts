import { resolve, sep } from 'path'
import { realpathSync } from 'fs'
import type { ServerChannel } from '../adapters/types.js'
import type { TailwindResolver } from './tailwind-resolver.js'
import type { TailwindRewriter } from './rewriter/tailwind.js'
import type { HMRVerifier } from './hmr-verifier.js'
import type { CSSModulesRewriter } from './rewriter/css-modules.js'
import type { RuntimeCSSResolver } from './rewriter/runtime-resolver.js'
import type { UndoStack, UndoFileChange } from './session/undo-stack.js'
import type { AIWriter } from './ai-writer.js'
import type { DeferredWriter, BatchedWriteRequest } from './deferred-writer.js'
import type { InlineStyleRewriter } from './rewriter/inline-style.js'
import { classifyEdit } from './edit-strategy.js'
import { ExternalRevertError } from '../adapters/atomic-write.js'
import { validateClassOpToken } from './class-op-validator.js'
import { createJsxTransaction } from './rewriter/jsx-transaction.js'

/** Classify a write-time error into a reason_code for edit_status.failed.
 *  ExternalRevertError → `'external_revert'`; everything else → `'write_failed'`. */
function classifyWriteError(err: unknown): 'external_revert' | 'write_failed' {
  return err instanceof ExternalRevertError ? 'external_revert' : 'write_failed'
}

/** Max length (chars) of an error message surfaced to the browser.
 *  Long error messages from fs/ts-morph routinely embed absolute
 *  filesystem paths and internal library identifiers. Truncation is
 *  defense-in-depth atop the typed errors that already self-redact
 *  (like ExternalRevertError). 200 chars is enough room for a useful
 *  human-readable reason while containing the information-disclosure
 *  surface in --host mode and cross-team-shared sessions. */
const MAX_CLIENT_ERROR_LEN = 200

/** Max length for an inline-op property name. Tight bound since valid
 *  CSS property names are ~30 chars tops (`background-clip-path`). */
const MAX_INLINE_PROP_NAME_LEN = 64

/** Max length for an inline-op value. Generous to allow `calc()` and
 *  `linear-gradient(...)` strings without being a payload vector. */
const MAX_INLINE_PROP_VALUE_LEN = 512

/** Block `url(` substrings in inline values — same defense class-op-validator
 *  applies to classOp tokens. Compound inline values are written as
 *  `style={{ property: value }}` in JSX source; browsers execute
 *  `background-image: url(...)`, `cursor: url(...)`, etc. at render time.
 *  C-R2-2 (Round 2): H1's classOp url()-defense was not extended to the
 *  compound protocol's new inlineSets values — closing that gap here. */
const REJECT_URL_IN_INLINE = /url\s*\(/i

/** Whitelist regex for inline property names. Matches standard CSS
 *  (`font-size`), CSS custom properties (`--primary`), and vendor-prefixed
 *  (`-webkit-transform`). Rejects anything outside `[a-zA-Z0-9-]` to block
 *  JSX-attribute-breakout shapes like `\"]injection` even though ts-morph's
 *  AST writers escape them. Defense-in-depth, not replacement. */
const VALID_INLINE_PROP_NAME = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/

/** Shape-validate the compound-edit inline op arrays. Returns null on
 *  success or a specific rejection reason (for reason_code propagation).
 *  Values for sets must be non-empty — empty-string inline edits were
 *  the bug commit 11066da removed; the compound protocol inherits the
 *  same non-empty invariant. */
function validateInlineOps(
  sets: ReadonlyArray<{ property: string; value: string }> | undefined,
  removes: ReadonlyArray<{ property: string }> | undefined,
): string | null {
  for (const s of sets ?? []) {
    if (typeof s.property !== 'string' || s.property.length === 0) {
      return 'inlineSets entry has empty property name'
    }
    if (s.property.length > MAX_INLINE_PROP_NAME_LEN) {
      return `inlineSets property name exceeds ${MAX_INLINE_PROP_NAME_LEN} chars`
    }
    if (!VALID_INLINE_PROP_NAME.test(s.property)) {
      return 'inlineSets property name has invalid shape (must match CSS property name charset)'
    }
    if (typeof s.value !== 'string' || s.value.length === 0) {
      return 'inlineSets entry has empty value — use inlineRemoves instead'
    }
    if (s.value.length > MAX_INLINE_PROP_VALUE_LEN) {
      return `inlineSets value exceeds ${MAX_INLINE_PROP_VALUE_LEN} chars`
    }
    if (REJECT_URL_IN_INLINE.test(s.value)) {
      return 'inlineSets value must not contain url() — use @theme or static asset imports for images'
    }
    if (s.value.includes('//')) {
      return 'inlineSets value must not contain protocol-relative `//`'
    }
    // C-R3-1 (Round 3): reject backslash. No legitimate inline-style value
    // needs it, and it is the entry-point for CSS Unicode escape bypass —
    // `\75 rl(javascript:alert(1))` survives REJECT_URL_IN_INLINE (starts
    // with `\`, not `u`), gets written to JSX as `"\\75 rl(...)"`, and is
    // decoded by the CSS tokenizer when React assigns to element.style
    // (CSSOM setProperty invokes the value parser per CSSOM 6.7). The
    // resulting token is `url(...)`. Blocking `\` closes the entire
    // escape-decoding class at the validator layer, mirroring H1's
    // whitelist approach for classOp tokens.
    if (s.value.includes('\\')) {
      return 'inlineSets value must not contain backslash (blocks CSS Unicode escape bypass)'
    }
    // C-R3-1 (Round 3): reject CSS comment openers. The CSS tokenizer
    // strips `/* ... */` comments BEFORE function-name matching, so
    // `url/**/(evil)` decodes to `url(evil)` — another path around
    // REJECT_URL_IN_INLINE.
    if (s.value.includes('/*')) {
      return 'inlineSets value must not contain /* (blocks CSS comment-injection bypass)'
    }
  }
  for (const r of removes ?? []) {
    if (typeof r.property !== 'string' || r.property.length === 0) {
      return 'inlineRemoves entry has empty property name'
    }
    if (r.property.length > MAX_INLINE_PROP_NAME_LEN) {
      return `inlineRemoves property name exceeds ${MAX_INLINE_PROP_NAME_LEN} chars`
    }
    if (!VALID_INLINE_PROP_NAME.test(r.property)) {
      return 'inlineRemoves property name has invalid shape (must match CSS property name charset)'
    }
  }
  return null
}

/** H-R3-2 (Round 3): quoted-path pre-pass for sanitizer. Node.js fs
 *  errors follow the convention of wrapping absolute paths in single
 *  or double quotes: `ENOENT: ... open '/Users/John Doe/Hero.tsx'`.
 *  A regex that matches between quotes captures paths CONTAINING
 *  SPACES — which the unquoted-regex fallback cannot, because its
 *  character class stops at whitespace. This closes the macOS
 *  Display Name leak that 4 Round 3 reviewers flagged independently.
 *
 *  Backreference `\1` ensures we match matching quote pairs. Inside,
 *  `\/[^'"]*` requires a leading slash (absolute POSIX) followed by
 *  any non-quote chars — spaces, slashes, dots all allowed. */
const QUOTED_POSIX_PATH_REGEX = /(['"])(\/[^'"]*)\1/g

/** Windows quoted-path equivalent: drive letter + colon + separator. */
const QUOTED_WIN_PATH_REGEX = /(['"])([A-Za-z]:[\\/][^'"]*)\1/g

/** POSIX absolute path matcher for sanitization (unquoted fallback).
 *  Requires at least 2 `/segment` parts so single literals (`/tmp`)
 *  don't over-match, but `/Users/alice/...`, `/home/...`, `/var/...`,
 *  `/etc/...` are all caught. The negative lookbehind prevents
 *  matching inside a relative path like `src/components/Hero.tsx`.
 *  Character class excludes whitespace — which means this regex
 *  CANNOT handle paths with spaces. That case is handled by the
 *  QUOTED_POSIX_PATH_REGEX pre-pass (runs first), which covers the
 *  Node fs error convention of quoting paths.
 *
 *  Documented limitation: unquoted paths WITH spaces followed by
 *  prose (`at /Users/John Doe/foo because X`) still partially leak.
 *  This case is rare (Node fs errors always quote), and full handling
 *  requires prose-vs-path disambiguation which is unsolvable without
 *  a wrapping delimiter. See the `it.skip` in sanitize.test.ts. */
const POSIX_ABS_PATH_REGEX = /(?<![\w./-])(?:\/[^\s:,'"\\]+){2,}/g

/** Windows absolute path matcher (unquoted fallback). Drive letter +
 *  colon + separator + segments. Same space-handling limitation as
 *  POSIX_ABS_PATH_REGEX — handled by the quoted-path pre-pass. */
const WINDOWS_ABS_PATH_REGEX = /[A-Za-z]:[\\/](?:[^\s:,'"<>?*|]+[\\/]?)+/g

/** Sanitize an error for surface to the browser over the WebSocket.
 *
 *  H5 (Round 1 review) + H-R2-2 (Round 2 review): three concerns —
 *    - ExternalRevertError.message previously embedded the absolute
 *      file path, propagating straight to the Panel's UI (Round 1
 *      fixed this at the error's constructor)
 *    - ts-morph / fs errors routinely include path fragments that
 *      likewise flowed verbatim to the browser (Round 1 added
 *      truncation at MAX_CLIENT_ERROR_LEN)
 *    - Short fs errors (e.g. ENOENT ~65 chars) fit UNDER the 200-char
 *      truncation ceiling with the absolute path INTACT (Round 2)
 *
 *  Path-stripping happens BEFORE truncation so paths of any length
 *  are redacted. We apply both POSIX and Windows regexes; the order
 *  doesn't matter because replacements are static text and the
 *  regexes match disjoint shapes (slash-leading vs drive-letter-
 *  leading). Non-absolute paths (`./foo`, `../bar`, `src/x.tsx`)
 *  are preserved — they don't contain deployment-specific data. */
export function sanitizeErrorForClient(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown error'
  let msg = err.message
  // Pass 1 (H-R3-2, Round 3): quoted absolute paths. Supports embedded
  // spaces (macOS Display Name home dirs like `/Users/John Doe/...`).
  // Node fs errors always quote paths, so this pre-pass handles the
  // common case. Runs first so the path inside the quotes is replaced
  // with `<path>` (quotes preserved via the $1 backreferences) before
  // the unquoted fallback can partial-match the inside.
  msg = msg.replace(QUOTED_POSIX_PATH_REGEX, '$1<path>$1')
  msg = msg.replace(QUOTED_WIN_PATH_REGEX, '$1<path>$1')
  // Pass 2: unquoted absolute paths. Handles ts-morph / ESBuild
  // error messages that interpolate paths without quotes.
  msg = msg.replace(POSIX_ABS_PATH_REGEX, '<path>')
  msg = msg.replace(WINDOWS_ABS_PATH_REGEX, '<path>')
  return msg.length <= MAX_CLIENT_ERROR_LEN
    ? msg
    : msg.slice(0, MAX_CLIENT_ERROR_LEN) + '…'
}

export interface EditRequest {
  editId: string
  /** data-cortex-source value: "filePath:line:col" */
  source: string
  /** CSS property name, e.g. 'padding-top' */
  property: string
  /** New CSS value, e.g. '16px' */
  value: string
  /** DOM selector for the element */
  elementSelector: string
  /** From data-cortex-css annotation, e.g. "src/Hero.module.css:.hero,.heroTitle" */
  cssMapping?: string
  /** Editing scope: 'instance' edits this element only (inline style),
   *  'all' edits the shared CSS class (affects all instances). */
  scope?: 'instance' | 'all'
  /** Source locations of all shared elements (for scope='all' inline style cleanup). */
  instanceSources?: string[]
  /** Current Tailwind class for this property, read directly from element.className.
   *  When present, used as oldToken directly — bypasses the fragile computed-style
   *  → hex → class-name reverse lookup. Sent by the browser's class extractor. */
  currentClass?: string
  /** When present, pipeline skips the property/value path and rewrites the
   *  element's className attribute directly. `property` and `value` are
   *  ignored on this branch. */
  classOp?: { remove?: string; add?: string }
  /** ZF0-1215 C2: inline property SETS applied as part of a compound
   *  edit. Only honored when `classOp` is also present. See
   *  handleCompoundEdit. */
  inlineSets?: ReadonlyArray<{ property: string; value: string }>
  /** ZF0-1215 C2: inline property REMOVES applied as part of a compound
   *  edit. Only honored when `classOp` is also present. */
  inlineRemoves?: ReadonlyArray<{ property: string }>
}

export interface WriteIntent {
  kind: 'immediate' | 'jsx-immediate' | 'deferred' | 'undo' | 'redo'
  /** Override HMR suppression. When set, takes precedence over kind-based default.
   *  false = allow HMR (file not added to recentEditWriteTimers).
   *  true = suppress HMR (file added to recentEditWriteTimers with a TTL).
   *  undefined = use kind-based default (immediate/undo/redo suppress; others allow). */
  suppressHmr?: boolean
  filePath: string
  content: string
}

export interface EditPipelineOptions {
  channel: ServerChannel
  resolver: TailwindResolver
  rewriter: TailwindRewriter
  verifier: HMRVerifier
  /** Injected for testability. Receives a WriteIntent and writes intent.content to intent.filePath. */
  writeFile: (intent: WriteIntent) => Promise<void>
  /** Absolute path to project root. File writes are scoped to this directory. */
  projectRoot: string
  /** Debounce delay in ms. Default: 400 */
  debounceMs?: number
  /** CSS Modules rewriter for Layer 1/2 routing */
  cssModulesRewriter?: CSSModulesRewriter
  /** Style detection result for routing decisions */
  detector?: { hasCSSModules: boolean; hasTailwind: boolean }
  /** Runtime CSS resolver for Layer 2 (unannotated elements) */
  runtimeResolver?: RuntimeCSSResolver
  /** Undo/redo stack for tracking file changes */
  undoStack?: UndoStack
  /** Injected for testability. Used by undo to verify file hasn't changed. */
  readFile?: (path: string) => Promise<string>
  /** AI writer for framework-agnostic source edits when deterministic layers fail */
  aiWriter?: AIWriter
  /** Deferred writer for batched AI edits with coalescing + cancellation */
  deferredWriter?: DeferredWriter
  /** Inline style rewriter for deterministic style prop editing (Layer 3.5) */
  inlineStyleRewriter?: InlineStyleRewriter
}

const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%+*!]+$/
const REJECT_URL = /url\s*\(/i
const REJECT_COMMENT = /\/\*/

function isValidCSSProperty(property: string): boolean {
  return VALID_PROPERTY.test(property)
}

function isValidCSSValue(value: string): boolean {
  return VALID_VALUE.test(value) && !REJECT_URL.test(value) && !REJECT_COMMENT.test(value)
}

function parseCssMapping(raw: string): { cssFilePath: string; selectors: string[] } | null {
  // Anchor to known CSS module extensions to find the path/selector delimiter
  const extMatch = raw.match(/\.module\.(css|scss|less|sass)/)
  if (!extMatch) return null
  const delimIdx = raw.indexOf(':', extMatch.index! + extMatch[0].length)
  if (delimIdx === -1) return null
  const cssPath = raw.slice(0, delimIdx)
  const selectorStr = raw.slice(delimIdx + 1)
  const selectors = selectorStr.split(',').map(s => s.trim()).filter(Boolean)
  if (selectors.length === 0) return null
  return { cssFilePath: cssPath, selectors }
}

/**
 * Orchestrates the edit flow from browser request to file write.
 *
 * For each edit:
 * 1. Debounce at 400ms per source:property (rapid edits cancel previous)
 * 2. Resolve CSS value → Tailwind class via TailwindResolver
 * 3. Attempt deterministic rewrite via TailwindRewriter
 * 4. On success: write file, send status, track HMR verification
 * 5. On failure: route to AI path (sends edit_status: 'failed')
 */
export class EditPipeline {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastValues = new Map<string, string>()
  private fileLocks = new Map<string, Promise<void>>()
  private readonly channel: ServerChannel
  private readonly resolver: TailwindResolver
  private readonly rewriter: TailwindRewriter
  private readonly verifier: HMRVerifier
  private readonly writeFile: (intent: WriteIntent) => Promise<void>
  private readonly projectRoot: string
  private readonly debounceMs: number
  private readonly cssModulesRewriter?: CSSModulesRewriter
  private readonly detector?: { hasCSSModules: boolean; hasTailwind: boolean }
  private readonly classifyDetector?: { hasCSSModules: boolean; hasTailwind: boolean; hasComponentLibrary: boolean; hasCSSInJS: boolean }
  private readonly runtimeResolver?: RuntimeCSSResolver
  private readonly undoStack?: UndoStack
  private readonly readFile?: (path: string) => Promise<string>
  private readonly aiWriter?: AIWriter
  private readonly deferredWriter?: DeferredWriter
  private readonly inlineStyleRewriter?: InlineStyleRewriter
  private undoLock = Promise.resolve()
  private disposed = false

  constructor(options: EditPipelineOptions) {
    this.channel = options.channel
    this.resolver = options.resolver
    this.rewriter = options.rewriter
    this.verifier = options.verifier
    this.writeFile = options.writeFile
    try { this.projectRoot = realpathSync(resolve(options.projectRoot)) } catch { this.projectRoot = resolve(options.projectRoot) }
    this.debounceMs = options.debounceMs ?? 400
    this.cssModulesRewriter = options.cssModulesRewriter
    this.detector = options.detector
    this.classifyDetector = options.detector
      ? { ...options.detector, hasComponentLibrary: false, hasCSSInJS: false }
      : undefined
    this.runtimeResolver = options.runtimeResolver
    this.undoStack = options.undoStack
    this.readFile = options.readFile
    this.aiWriter = options.aiWriter
    this.deferredWriter = options.deferredWriter
    this.inlineStyleRewriter = options.inlineStyleRewriter
  }

  handleEdit(edit: EditRequest): void {
    if (this.disposed) return

    // classOp branch — pure className mutation. Bypasses debounce (no
    // property key to coalesce on) and bypasses property/value validation
    // (both are empty on link/unlink). Precedence: if classOp is present,
    // the property-keyed path does not run even if property/value are set.
    if (edit.classOp) {
      // Trust-boundary validation: classOp strings come straight from the
      // browser over the WebSocket, bypass property/value validation, and
      // land in a JSX string literal + Tailwind compiler. ts-morph's
      // setLiteralValue is escape-safe, but Tailwind v4's arbitrary-value
      // bracket syntax (`bg-[url(javascript:...)]`) survives JSX escaping
      // and executes as CSS in the user's browser on next load. Validate
      // BEFORE any fs operation or undo push.
      for (const field of ['remove', 'add'] as const) {
        const token = edit.classOp[field]
        if (token === undefined) continue
        const result = validateClassOpToken(token)
        if (!result.ok) {
          this.channel.send({
            type: 'edit_status',
            editId: edit.editId,
            status: 'failed',
            reason: `Invalid classOp.${field}: ${result.reason}`,
            reason_code: 'invalid_class_token',
          })
          return
        }
      }

      const parsed = this.parseSource(edit.source)
      if (!parsed.ok) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: parsed.reason, reason_code: 'parse_failed' })
        return
      }

      // ZF0-1215 C2: compound routing. If the browser sent inline ops
      // alongside classOp, dispatch to handleCompoundEdit so classOp +
      // inlineSets + inlineRemoves apply to ONE source file in ONE
      // read-mutate-write cycle producing ONE UndoFileChange. Otherwise
      // the classOp-only path remains — simpler, doesn't need the
      // JsxTransaction scaffold.
      const hasInlineOps =
        (edit.inlineSets?.length ?? 0) > 0 || (edit.inlineRemoves?.length ?? 0) > 0
      if (hasInlineOps) {
        // Validate inline-op shape before any fs work. Property names
        // are lightly validated: non-empty, reasonable length cap.
        // Values for sets must be non-empty — empty-string writes were
        // the exact bug commit 11066da removed, and the compound-edit
        // protocol inherits that guarantee.
        const shapeError = validateInlineOps(edit.inlineSets, edit.inlineRemoves)
        if (shapeError) {
          this.channel.send({
            type: 'edit_status',
            editId: edit.editId,
            status: 'failed',
            reason: shapeError,
            reason_code: 'invalid_class_token',
          })
          return
        }
        this.handleCompoundEdit(edit, parsed.resolvedPath, parsed.line, parsed.col).catch((err) => {
          console.error('[cortex] compound-edit pipeline error for editId=%s:', edit.editId, err)
          this.channel.send({
            type: 'edit_status',
            editId: edit.editId,
            status: 'failed',
            reason: sanitizeErrorForClient(err),
            reason_code: classifyWriteError(err),
          })
        })
        return
      }

      this.handleClassOp(edit, parsed.resolvedPath, parsed.line, parsed.col).catch((err) => {
        console.error('[cortex] classOp pipeline error for editId=%s:', edit.editId, err)
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: sanitizeErrorForClient(err),
          reason_code: classifyWriteError(err),
        })
      })
      return
    }

    // Fast path: pure AI projects bypass the 400ms debounce and route
    // directly to DeferredWriter's 250ms coalescing window
    if (this.shouldBypassDebounce(edit)) {
      const parsed = this.parseSource(edit.source)
      if (!parsed.ok) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: parsed.reason })
        return
      }
      if (!isValidCSSProperty(edit.property)) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS property name' })
        return
      }
      if (!isValidCSSValue(edit.value)) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS value' })
        return
      }
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
      this.deferredWriter!.enqueue({
        editId: edit.editId,
        filePath: parsed.resolvedPath,
        line: parsed.line,
        col: parsed.col,
        property: edit.property,
        value: edit.value,
        failureReason: 'Deferred to AI writer',
      })
      return
    }

    const debounceKey = `${edit.source}:${edit.property}`

    const existing = this.debounceTimers.get(debounceKey)
    if (existing) clearTimeout(existing)

    const previousValue = this.lastValues.get(debounceKey)
    this.lastValues.set(debounceKey, edit.value)
    this.debounceTimers.set(
      debounceKey,
      setTimeout(() => {
        this.debounceTimers.delete(debounceKey)
        this.executeEdit(edit, previousValue).catch(err => {
          console.error('[cortex] Edit pipeline error for editId=%s source=%s:', edit.editId, edit.source, err)
          this.channel.send({
            type: 'edit_status',
            editId: edit.editId,
            status: 'failed',
            reason: sanitizeErrorForClient(err),
          })
        })
      }, this.debounceMs),
    )
  }

  /**
   * Parse a source string ("filePath:line:col") into its components.
   * Returns a discriminated union with the parsed result or a failure reason.
   */
  private parseSource(source: string):
    | { ok: true; resolvedPath: string; line: number; col: number }
    | { ok: false; reason: string } {
    const lastColon = source.lastIndexOf(':')
    const secondLastColon = source.lastIndexOf(':', lastColon - 1)
    if (lastColon === -1 || secondLastColon === -1 || secondLastColon === 0) {
      return { ok: false, reason: `Invalid source format: ${source}` }
    }

    const filePath = source.slice(0, secondLastColon)
    const lineStr = source.slice(secondLastColon + 1, lastColon)
    const colStr = source.slice(lastColon + 1)

    const line = parseInt(lineStr, 10)
    const col = parseInt(colStr, 10)
    if (Number.isNaN(line) || Number.isNaN(col)) {
      return { ok: false, reason: `Invalid line/col in source: ${source}` }
    }

    const resolvedPath = resolve(this.projectRoot, filePath)
    if (!this.isInsideProjectRoot(resolvedPath)) {
      return { ok: false, reason: 'File path outside project root' }
    }

    return { ok: true, resolvedPath, line, col }
  }

  /** Check if this edit can skip the 400ms debounce and route directly to DeferredWriter. */
  private shouldBypassDebounce(edit: EditRequest): boolean {
    // No DeferredWriter → can't bypass (nothing to enqueue to)
    if (!this.deferredWriter) return false
    // Instance scope needs debounced path for InlineStyleRewriter routing
    if (edit.scope === 'instance') return false
    // CSS Modules annotation → always immediate path, need debounce
    if (edit.cssMapping) return false
    // No detector → can't determine framework, use debounce
    if (!this.detector) return false
    // InlineStyleRewriter provides a deterministic path — use debounce for coalescing
    if (this.inlineStyleRewriter) return false
    // Pure AI project (no Tailwind, no CSS Modules) → bypass
    if (!this.detector.hasTailwind && !this.detector.hasCSSModules) return true
    // Mixed framework → use debounce, let executeEdit decide
    return false
  }

  private async executeEdit(edit: EditRequest, previousValue: string | undefined): Promise<void> {
    // Parse source as "filePath:line:col" — parse from right to handle
    // Windows drive letters (e.g. "C:\Users\foo\App.tsx:2:10")
    const parsed = this.parseSource(edit.source)
    if (!parsed.ok) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: parsed.reason })
      return
    }
    const { resolvedPath, line, col } = parsed

    // Server-side CSS property + value validation
    if (!isValidCSSProperty(edit.property)) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS property name' })
      return
    }
    if (!isValidCSSValue(edit.value)) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS value' })
      return
    }

    // Layer 1: CSS Modules routing via annotation — bypasses classifyEdit entirely
    if (edit.cssMapping && this.cssModulesRewriter) {
      // Instance scope: route to InlineStyleRewriter instead of shared CSS rule
      if (edit.scope === 'instance') {
        if (this.inlineStyleRewriter) {
          let handled = false
          try {
            handled = await this.tryInlineStyleWrite(edit, resolvedPath, line, col)
          } catch { /* treat throws as failed, fall through to deferred/AI */ }
          if (handled) return
        }
        // InlineStyleRewriter unavailable or failed — fall through to deferred/AI
        if (this.deferredWriter) {
          this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
          this.deferredWriter.enqueue({
            editId: edit.editId, filePath: resolvedPath, line, col,
            property: edit.property, value: edit.value,
            failureReason: 'Inline style rewrite failed for instance-scoped edit.',
          })
          return
        }
        if (this.aiWriter) {
          await this.commitAIWrite(edit, resolvedPath, line, col, 'Inline style rewrite failed for instance-scoped edit.')
          return
        }
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Instance-scoped editing requires InlineStyleRewriter or AI writer.' })
        return
      }

      // scope === 'all' or undefined — existing CSSModulesRewriter path
      const mapping = parseCssMapping(edit.cssMapping)
      if (mapping) {
        const resolvedCssPath = resolve(this.projectRoot, mapping.cssFilePath)
        if (!this.isInsideProjectRoot(resolvedCssPath)) {
          this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'CSS file path outside project root' })
          return
        }
        // Extension check
        if (!resolvedCssPath.endsWith('.module.css')) {
          if (resolvedCssPath.match(/\.module\.(scss|less|sass)$/)) {
            this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: `${resolvedCssPath.match(/\.(scss|less|sass)$/)?.[0]} Modules editing not yet supported. Connect Claude Code for AI-assisted editing.` })
          } else {
            this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'CSS mapping must target a CSS Module file' })
          }
          return
        }

        // Try each selector individually — first match wins (handles clsx(styles.a, styles.b))
        const selector = mapping.selectors.length === 1 ? mapping.selectors[0]! : mapping.selectors.find(s => s === '*') ?? mapping.selectors[0]!
        await this.commitCSSModulesRewrite(edit, resolvedCssPath, selector)
        return
      }
    }

    // Classify the edit strategy — single source of truth for routing decisions.
    // Only meaningful when detection has run (detector exists); without it, fall
    // through to the legacy Tailwind path for backward compatibility.
    const strategy = this.classifyDetector
      ? classifyEdit(
          edit,
          this.classifyDetector,
          {
            resolverAvailable: !!this.resolver,
            aiAvailable: !!this.deferredWriter || !!this.aiWriter,
            inlineStyleAvailable: !!this.inlineStyleRewriter,
          },
        )
      : undefined

    // Layer 2: Runtime CSS resolver (fallback for unannotated elements when CSS Modules detected)
    if (!edit.cssMapping && this.detector?.hasCSSModules && this.runtimeResolver && this.cssModulesRewriter) {
      const resolved = await this.runtimeResolver.resolve(edit.source, this.projectRoot)
      if (resolved && this.isInsideProjectRoot(resolved.cssFilePath)) {
        // Instance scope: route to InlineStyleRewriter, never to CSSModulesRewriter
        if (edit.scope === 'instance') {
          if (this.inlineStyleRewriter) {
            let handled = false
            try {
              handled = await this.tryInlineStyleWrite(edit, resolvedPath, line, col)
            } catch { /* treat throws as failed, fall through to deferred/AI */ }
            if (handled) return
          }
          // InlineStyleRewriter unavailable or failed — route to deferred/AI
          if (this.deferredWriter) {
            this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
            this.deferredWriter.enqueue({
              editId: edit.editId, filePath: resolvedPath, line, col,
              property: edit.property, value: edit.value,
              failureReason: 'Inline style rewrite failed for instance-scoped CSS Module element.',
            })
            return
          }
          if (this.aiWriter) {
            await this.commitAIWrite(edit, resolvedPath, line, col, 'Inline style rewrite failed for instance-scoped CSS Module element.')
            return
          }
          this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Instance-scoped editing requires InlineStyleRewriter or AI writer.' })
          return
        } else {
          await this.commitCSSModulesRewrite(edit, resolved.cssFilePath, resolved.selector)
          return
        }
      }
      // CSS Modules-only project → don't fall through to Tailwind
      if (!this.detector.hasTailwind) {
        // Layer 3.5: Inline style rewriter — deterministic fallback
        // Note: when resolved was truthy + scope=instance, the explicit fallback above
        // already returned. We only reach here when resolved was null (InlineStyleRewriter
        // was never tried) or resolved was outside project root.
        if (this.inlineStyleRewriter) {
          let handled = false
          try {
            handled = await this.tryInlineStyleWrite(edit, resolvedPath, line, col)
          } catch { /* treat throws as failed, fall through to deferred/AI */ }
          if (handled) return
        }
        if (this.deferredWriter) {
          this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
          this.deferredWriter.enqueue({
            editId: edit.editId, filePath: resolvedPath, line, col,
            property: edit.property, value: edit.value,
            failureReason: 'Could not resolve CSS module mapping for this element.',
          })
          return
        }
        if (this.aiWriter) {
          await this.commitAIWrite(edit, resolvedPath, line, col, 'Could not resolve CSS module mapping for this element.')
          return
        }
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Could not resolve CSS module mapping for this element. Connect Claude Code for AI-assisted editing.' })
        return
      }
    }

    // Strategy-driven early exits (only when detection is available)
    // InlineStyleRewriter provides a fallback — don't bail when it's available
    if (strategy === 'unsupported' && !this.inlineStyleRewriter) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'No supported editing strategy for this framework.',
      })
      return
    }

    // Layer 3: Tailwind path (strategy is 'immediate', 'deferred', or undefined for legacy)
    //
    // Direct class path: when the browser sends currentClass (read from element.className),
    // we use it directly as oldToken — no seed-skip needed, no fragile reverse lookup.
    // This is the fast path for Tailwind edits: first edit writes immediately.
    //
    // Fallback: when currentClass is absent, use the legacy seed-skip + resolver lookup.
    const hasDirectOldToken = !!edit.currentClass
    if (!hasDirectOldToken) {
      // Legacy seed-skip: first edit establishes the baseline for Tailwind (oldToken = null without it).
      const canHandleWithoutBaseline = !!this.inlineStyleRewriter
      if (!previousValue && !this.deferredWriter && !canHandleWithoutBaseline) return
    }

    const newToken = this.resolver.findClass(edit.property, edit.value)
    const oldToken = (edit.currentClass || null)
      ?? (previousValue ? this.resolver.findClass(edit.property, previousValue) : null)

    if (!newToken || !oldToken) {
      // Layer 3.5: Inline style rewriter — only when there is no Tailwind utility
      // for this property on the element (elements with currentClass should stay on
      // the Tailwind/AI path)
      if (this.inlineStyleRewriter && !edit.currentClass) {
        let handled = false
        try {
          handled = await this.tryInlineStyleWrite(edit, resolvedPath, line, col)
        } catch { /* treat throws as failed, fall through to deferred/AI */ }
        if (handled) return
      }
      if (this.deferredWriter) {
        const reason = !newToken
          ? `Cannot resolve Tailwind class for ${edit.property}: ${edit.value}`
          : previousValue
            ? `Cannot resolve Tailwind class for ${edit.property}: ${previousValue}`
            : `No baseline value for Tailwind token on ${edit.property}`
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
        this.deferredWriter.enqueue({
          editId: edit.editId, filePath: resolvedPath, line, col,
          property: edit.property, value: edit.value,
          failureReason: reason,
        })
        return
      }
      if (this.aiWriter) {
        const reason = !newToken
          ? `Cannot resolve Tailwind class for ${edit.property}: ${edit.value}`
          : `Cannot resolve Tailwind class for ${edit.property}: ${previousValue}`
        await this.commitAIWrite(edit, resolvedPath, line, col, reason)
        return
      }
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'Cannot resolve Tailwind class for this change. Visual preview is active — file write skipped.',
      })
      return
    }

    // Signal writing only after all validation passes
    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    // Serialize rewrite + write per file to prevent concurrent TOCTOU races
    await this.withFileLock(resolvedPath, async () => {
      const result = await this.rewriter.rewrite({
        filePath: resolvedPath,
        line,
        col,
        property: edit.property,
        oldToken,
        newToken,
      })

      if (!result.success) {
        if (this.deferredWriter) {
          // enqueue() is synchronous — releases the file lock immediately.
          // DeferredWriter's writeFn acquires its own lock later. No deadlock.
          this.deferredWriter.enqueue({
            editId: edit.editId, filePath: resolvedPath, line, col,
            property: edit.property, value: edit.value,
            failureReason: result.reason,
          })
          return
        }
        if (this.aiWriter) {
          // Already inside withFileLock — call inner helper directly to avoid deadlock
          await this.executeAIWrite(edit, resolvedPath, line, col, result.reason)
          return
        }
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: result.reason,
        })
        return
      }

      // Immediate writes have HMR suppressed (recentEditWriteTimers in vite.ts),
      // so don't track for HMR verification — it would never resolve.

      // Write file FIRST — side effects only after successful write
      try {
        await this.writeFile({ kind: 'immediate', filePath: resolvedPath, content: result.newContent })
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Write failed: ${sanitizeErrorForClient(err)}`,
          reason_code: classifyWriteError(err),
        })
        return
      }

      // Push to undo stack only after successful write.
      // requiresHmr=false: inline-style property edits are painted by the
      // browser-side !important override layer; HMR would only cause flicker.
      if (this.undoStack) {
        this.undoStack.push({ changes: [{ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: false }] })
      }

      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'done',
        newToken,
        strategy: 'immediate',
      })
    })
  }

  async handleUndo(): Promise<void> {
    if (this.disposed || !this.undoStack) return
    this.undoLock = this.undoLock.then(
      () => this._doUndo(),
      (err) => { console.error('[cortex] Prior undo error:', err); return this._doUndo() },
    )
    try {
      await this.undoLock
    } catch (err) {
      console.error('[cortex] Undo failed:', err)
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: sanitizeErrorForClient(err) })
    }
  }

  private async _doUndo(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()

    const entry = this.undoStack!.peekUndo()
    if (!entry) {
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: 'Nothing to undo.', reason_code: 'empty_stack' })
      return
    }

    for (const change of entry.changes) {
      for (const [key] of this.lastValues) {
        if (key.startsWith(change.filePath + ':')) {
          this.lastValues.delete(key)
        }
      }
      const cancelledIds = this.deferredWriter?.cancelForFile(change.filePath) ?? []
      this.sendDeferredStatus(cancelledIds, 'cancelled', 'Cancelled by undo')
    }

    // H-R2-4 (Round 2): validate-all + write-all under ONE continuous
    // set of file locks, held for the duration of both phases. The
    // prior two-phase design (validate each file under its own lock →
    // release all → re-acquire each lock to write) left a TOCTOU
    // window between per-file validate and write: a concurrent forward
    // edit could slip in and invalidate the validation, then the write
    // would clobber that edit based on the stale validation.
    //
    // Holding locks across validate + write closes the window without
    // sacrificing the "validate-all-before-write-any" atomicity
    // invariant (asserted by the scope='all' compound-undo test —
    // partial writes must not occur even when a later file is stale).
    //
    // For multi-file entries (e.g. CSS Modules scope='all'), locks are
    // acquired in sorted path order so concurrent undo/redo operations
    // on overlapping file sets serialize rather than deadlock.
    const sortedChanges = [...entry.changes].sort((a, b) => a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0)
    const filePaths = sortedChanges.map(c => c.filePath)
    let stale = false
    let writeErr: unknown = null
    const writtenUndo: Array<{ filePath: string; rollbackContent: string; requiresHmr: boolean }> = []

    try {
      await this.withMultiFileLocks(filePaths, async () => {
        // Phase 1: validate all files. No disk writes yet.
        if (this.readFile) {
          const current = this.undoStack!.peekUndo()
          if (!current || current.id !== entry.id) { stale = true; return }
          for (const change of sortedChanges) {
            const fileContent = await this.readFile(change.filePath)
            if (fileContent !== change.currentContent) { stale = true; return }
          }
        }
        // Phase 2: write all files. Locks still held from Phase 1 so
        // no external write can land between validation and write for
        // any file in the set.
        //
        // H-R3-1 (Round 3): rollback-on-write-failure runs INSIDE this
        // lock scope so the same TOCTOU closure applies to recovery.
        // The prior design released all locks before calling a separate
        // rollback helper, opening a window where a concurrent forward
        // edit could land and then be clobbered by the rollback's
        // stale currentContent. With rollback inline, locks are held
        // continuously from validate through recovery — the same
        // invariant as the happy path.
        for (const change of sortedChanges) {
          try {
            await this.writeFile({ kind: 'undo', suppressHmr: !change.requiresHmr, filePath: change.filePath, content: change.previousContent })
          } catch (err) {
            writeErr = err
            for (const w of [...writtenUndo].reverse()) {
              try {
                await this.writeFile({ kind: 'undo', suppressHmr: !w.requiresHmr, filePath: w.filePath, content: w.rollbackContent })
              } catch (rollbackErr) {
                console.error('[cortex] Undo rollback failed for %s:', w.filePath, rollbackErr)
              }
            }
            return
          }
          writtenUndo.push({ filePath: change.filePath, rollbackContent: change.currentContent, requiresHmr: change.requiresHmr })
        }
      })
    } catch (err) {
      // readFile failure (ENOENT, EACCES) surfaced out of the lock
      // callback. File state unknown, treat as stale.
      console.error('[cortex] Undo validation read failed:', err)
      stale = true
    }

    if (stale) {
      this.undoStack!.removeStaleEntry(entry.id)
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: 'File was modified outside cortex. Undo not available for this change.', reason_code: 'stale' })
      return
    }
    if (writeErr) {
      // Rollback already ran inside the lock scope above. Only the
      // status dispatch remains — no disk ops.
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: `Write failed during undo: ${sanitizeErrorForClient(writeErr)}`, reason_code: 'write_failed' })
      return
    }

    this.undoStack!.undo()
    this.channel.send({ type: 'undo_sync_status', status: 'done' })
  }

  /** Acquire per-file locks for all filePaths in sorted order, then run
   *  fn while holding all of them. Locks are released when fn returns
   *  (or throws). Sorting prevents deadlock between concurrent
   *  multi-file operations that touch overlapping file sets.
   *
   *  M-R3-1 (Round 3): codepoint order (JS default `.sort()`) — MUST
   *  match the sort strategy used in _doUndo/_doRedo. Any locale-
   *  sensitive comparator (`.localeCompare`) would diverge under
   *  case-insensitive locales, causing two concurrent compound
   *  operations to acquire locks in DIFFERENT orders for the same
   *  file set — re-opening the deadlock vector this sort is meant
   *  to close. Do NOT change to localeCompare. */
  private async withMultiFileLocks<T>(filePaths: readonly string[], fn: () => Promise<T>): Promise<T> {
    const sorted = [...new Set(filePaths)].sort()
    const acquire = async (idx: number): Promise<T> => {
      const next = sorted[idx]
      if (next === undefined) return await fn()
      let result!: T
      await this.withFileLock(next, async () => {
        result = await acquire(idx + 1)
      })
      return result
    }
    return acquire(0)
  }

  async handleRedo(): Promise<void> {
    if (this.disposed || !this.undoStack) return
    this.undoLock = this.undoLock.then(
      () => this._doRedo(),
      (err) => { console.error('[cortex] Prior redo error:', err); return this._doRedo() },
    )
    try {
      await this.undoLock
    } catch (err) {
      console.error('[cortex] Redo failed:', err)
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: sanitizeErrorForClient(err) })
    }
  }

  private async _doRedo(): Promise<void> {
    const entry = this.undoStack!.peekRedo()
    if (!entry) {
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: 'Nothing to redo.', reason_code: 'empty_stack' })
      return
    }

    for (const change of entry.changes) {
      for (const [key] of this.lastValues) {
        if (key.startsWith(change.filePath + ':')) {
          this.lastValues.delete(key)
        }
      }
      const cancelledIds = this.deferredWriter?.cancelForFile(change.filePath) ?? []
      this.sendDeferredStatus(cancelledIds, 'cancelled', 'Cancelled by redo')
    }

    // H-R2-4 (Round 2): same validate-all + write-all under one lock
    // set as _doUndo. See _doUndo for the full rationale. Redo
    // staleness clears the full stack (matches original behavior).
    const sortedChanges = [...entry.changes].sort((a, b) => a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0)
    const filePaths = sortedChanges.map(c => c.filePath)
    let stale = false
    let writeErr: unknown = null
    const writtenRedo: Array<{ filePath: string; rollbackContent: string; requiresHmr: boolean }> = []

    try {
      await this.withMultiFileLocks(filePaths, async () => {
        if (this.readFile) {
          for (const change of sortedChanges) {
            const fileContent = await this.readFile(change.filePath)
            if (fileContent !== change.previousContent) { stale = true; return }
          }
        }
        // H-R3-1 (Round 3): rollback-on-write-failure runs INSIDE the
        // lock scope — see _doUndo for full rationale.
        for (const change of sortedChanges) {
          try {
            await this.writeFile({ kind: 'redo', suppressHmr: !change.requiresHmr, filePath: change.filePath, content: change.currentContent })
          } catch (err) {
            writeErr = err
            for (const w of [...writtenRedo].reverse()) {
              try {
                await this.writeFile({ kind: 'redo', suppressHmr: !w.requiresHmr, filePath: w.filePath, content: w.rollbackContent })
              } catch (rollbackErr) {
                console.error('[cortex] Redo rollback failed for %s:', w.filePath, rollbackErr)
              }
            }
            return
          }
          writtenRedo.push({ filePath: change.filePath, rollbackContent: change.previousContent, requiresHmr: change.requiresHmr })
        }
      })
    } catch (err) {
      console.error('[cortex] Redo validation read failed:', err)
      stale = true
    }

    if (stale) {
      this.undoStack!.clear()
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: 'File was modified outside cortex. Redo not available.', reason_code: 'stale' })
      return
    }
    if (writeErr) {
      // Rollback already ran inside the lock scope above.
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: `Write failed during redo: ${sanitizeErrorForClient(writeErr)}`, reason_code: 'write_failed' })
      return
    }

    this.undoStack!.redo()
    this.channel.send({ type: 'redo_sync_status', status: 'done' })
  }

  clearUndoStack(): void {
    // Acquire the undo lock to avoid racing in-flight undo/redo operations.
    // Without this, a clear_server_undo arriving between an undo's file validation
    // and file write would empty the stack mid-operation.
    this.undoLock = this.undoLock.then(
      () => { this.undoStack?.clear() },
      () => { this.undoStack?.clear() },
    )
  }

  private isInsideProjectRoot(filePath: string): boolean {
    let real: string
    try {
      real = realpathSync(filePath)
    } catch {
      // File may not exist yet (e.g., source path in CSS Modules edits).
      // Fall back to string-based check against the resolved project root.
      const resolved = resolve(filePath)
      return resolved === this.projectRoot || resolved.startsWith(this.projectRoot + sep)
    }
    return real === this.projectRoot || real.startsWith(this.projectRoot + sep)
  }

  /** AI write with file lock — used at Points A and C (not already locked). */
  private async commitAIWrite(
    edit: EditRequest, resolvedPath: string, line: number, col: number, failureReason: string,
  ): Promise<void> {
    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
    await this.withFileLock(resolvedPath, async () => {
      await this.executeAIWrite(edit, resolvedPath, line, col, failureReason)
    })
  }

  /**
   * Handle a compound edit: classOp + inlineSets + inlineRemoves applied
   * to the same JSX element in ONE read-mutate-write cycle (ZF0-1215 C2).
   *
   * Why one cycle: the browser sent a SINGLE WebSocket message for one
   * user gesture (e.g., unlink-text-component = class removal + preserve
   * font-size/weight/etc as inline styles). Processing this as N+1
   * separate edits would produce N+1 UndoFileChange entries, making
   * Ctrl+Z restore only one piece of the gesture. Consolidating to ONE
   * UndoFileChange makes undo atomic.
   *
   * Sequence (all inside withFileLock):
   *   1. Read file → oldContent
   *   2. createJsxTransaction(resolvedPath, oldContent)
   *   3. rewriter.rewriteClassListInTransaction(txn, classOp)
   *   4. inlineStyleRewriter.setAndRemoveInTransaction(txn, {sets, removes})
   *   5. newContent = txn.getCurrentContent()
   *   6. atomicWrite — ONE disk write
   *   7. undoStack.push with ONE UndoFileChange (requiresHmr: true)
   *
   * Failure modes (any step): no write occurs, no undo push, specific
   * reason_code sent. This preserves the all-or-nothing invariant: disk
   * is either fully updated or untouched. NO AI fallback for compound
   * edits — AI could only handle the class portion; a partial compound
   * would leak the very stale-state bug Option A exists to prevent.
   */
  private async handleCompoundEdit(
    edit: EditRequest,
    resolvedPath: string,
    line: number,
    col: number,
  ): Promise<void> {
    if (!edit.classOp) return // defensive — handleEdit guards this

    // Inline-ops require the InlineStyleRewriter dep. Without it we
    // can't apply the compound; fail with a clear reason rather than
    // silently degrading to classOp-only (which would produce the
    // exact partial-undo bug C2 exists to close).
    if (!this.inlineStyleRewriter) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'Compound edit requires inline-style rewriter dependency',
        reason_code: 'parse_failed',
      })
      return
    }
    if (!this.readFile) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'Compound edit requires readFile dependency',
        reason_code: 'parse_failed',
      })
      return
    }

    const op = edit.classOp
    const sets = edit.inlineSets ?? []
    const removes = edit.inlineRemoves ?? []

    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    await this.withFileLock(resolvedPath, async () => {
      // Step 1: read file under the lock (single source of truth for
      // this compound edit's previousContent).
      let oldContent: string
      try {
        oldContent = await this.readFile!(resolvedPath)
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Cannot read file: ${sanitizeErrorForClient(err)}`,
          reason_code: 'parse_failed',
        })
        return
      }

      // Step 2: create in-memory transaction seeded with oldContent.
      let txn
      try {
        txn = await createJsxTransaction(resolvedPath, oldContent)
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Transaction init failed: ${sanitizeErrorForClient(err)}`,
          reason_code: 'parse_failed',
        })
        return
      }

      // Step 3: apply classOp. No AI fallback here — compound must be
      // all-or-nothing at the deterministic layer.
      const classResult = this.rewriter.rewriteClassListInTransaction(txn, {
        line, col, remove: op.remove, add: op.add,
      })
      if (!classResult.success) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Compound classOp failed: ${classResult.reason}`,
          reason_code: 'parse_failed',
        })
        return
      }

      // Step 4: apply inline sets + removes on the SAME transaction.
      const inlineResult = this.inlineStyleRewriter!.setAndRemoveInTransaction(txn, {
        line, col, sets, removes,
      })
      if (!inlineResult.success) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Compound inline ops failed: ${inlineResult.reason}`,
          reason_code: 'parse_failed',
        })
        return
      }

      const newContent = txn.getCurrentContent()

      // If the compound is semantically a no-op (e.g., classOp idempotent
      // + inlineSets match existing values + inlineRemoves target absent
      // properties), skip the write and undo push. Reporting 'done'
      // without a push keeps the undo stack clean.
      if (newContent === oldContent) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done' })
        return
      }

      // Step 5: ONE write. suppressHmr:false because the compound
      // includes a className change (browser has no override for it).
      try {
        await this.writeFile({
          kind: 'immediate',
          suppressHmr: false,
          filePath: resolvedPath,
          content: newContent,
        })
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Write failed: ${sanitizeErrorForClient(err)}`,
          reason_code: classifyWriteError(err),
        })
        return
      }

      // Step 6: ONE compound UndoFileChange. requiresHmr:true because
      // the compound mutated the className; undo must fire HMR so the
      // DOM re-renders with the previous className + previous inline
      // styles atomically.
      if (this.undoStack) {
        this.undoStack.push({
          changes: [{
            filePath: resolvedPath,
            previousContent: oldContent,
            currentContent: newContent,
            requiresHmr: true,
          }],
        })
      }

      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done' })
    })
  }

  /**
   * classOp (className mutation) branch. Mirrors the property-keyed path's
   * guarantees: captures oldContent before the write for undo, falls back
   * to the AI writer when the deterministic rewriter can't handle the JSX
   * shape, serializes concurrent ops on the same file via withFileLock.
   */
  private async handleClassOp(
    edit: EditRequest,
    resolvedPath: string,
    line: number,
    col: number,
  ): Promise<void> {
    if (!edit.classOp) return // defensive — handleEdit already guards this
    const op = edit.classOp // narrowed; no ! needed below

    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    await this.withFileLock(resolvedPath, async () => {
      // Capture oldContent BEFORE the rewrite so the undo entry restores
      // what the user actually had. Skip silently if we can't read — the
      // write still proceeds, undo just won't have a revert target.
      let oldContent: string | null = null
      if (this.undoStack && this.readFile) {
        try {
          oldContent = await this.readFile(resolvedPath)
        } catch {
          oldContent = null
        }
      }

      const result = await this.rewriter.rewriteClassList({
        filePath: resolvedPath,
        line,
        col,
        remove: op.remove,
        add: op.add,
      })

      if (!result.success) {
        // AI fallback — describe the class mutation as an instruction for the
        // AI writer. This covers template literals and conditional objects.
        if (this.aiWriter) {
          const instruction = this.describeClassOpForAI(op, resolvedPath, line, col)
          const reason = `Could not rewrite className deterministically (${result.reason}). Routing to AI writer.`
          await this.executeAIWrite(
            { ...edit, property: '__class__', value: instruction },
            resolvedPath,
            line,
            col,
            reason,
          )
          return
        }
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: result.reason ?? 'Could not rewrite className for this element.',
        })
        return
      }

      try {
        // classOp must NOT suppress HMR: there is no browser-side override
        // layer for class mutations (unlike property edits which paint via
        // !important overrides before HMR lands). If we suppress HMR here,
        // the component never re-renders with the new className, the Panel's
        // `typographyClassName` memo stays stale, bundle detection returns
        // the previous bundle, and the next pick sends another accumulating
        // classOp against the same stale state.
        await this.writeFile({
          kind: 'immediate',
          suppressHmr: false,
          filePath: resolvedPath,
          content: result.newContent,
        })
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Write failed: ${sanitizeErrorForClient(err)}`,
          reason_code: classifyWriteError(err),
        })
        return
      }

      if (this.undoStack && oldContent !== null) {
        // requiresHmr=true: className mutations have no browser-side override
        // layer; undo must fire HMR so React re-renders the element with the
        // previous className. Otherwise disk reverts but DOM stays stale.
        this.undoStack.push({
          changes: [
            {
              filePath: resolvedPath,
              previousContent: oldContent,
              currentContent: result.newContent,
              requiresHmr: true,
            },
          ],
        })
      }

      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done' })
    })
  }

  /** Build a plain-English instruction describing a classOp for the AI writer. */
  private describeClassOpForAI(
    op: { remove?: string; add?: string },
    filePath: string,
    line: number,
    col: number,
  ): string {
    const parts: string[] = []
    if (op.remove) parts.push(`remove the class "${op.remove}"`)
    if (op.add) parts.push(`add the class "${op.add}"`)
    return `On the JSX element at ${filePath}:${line}:${col}, ${parts.join(' and ')} in the className attribute. Preserve all other classes, ordering, and JSX structure.`
  }

  /** AI write without lock — used at Point B (already inside withFileLock). */
  private async executeAIWrite(
    edit: EditRequest, resolvedPath: string, line: number, col: number, failureReason: string,
  ): Promise<void> {
    if (!this.aiWriter) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'AI writer is not configured.' })
      return
    }

    const result = await this.aiWriter.write({
      filePath: resolvedPath,
      line,
      col,
      property: edit.property,
      value: edit.value,
      failureReason,
    })

    if (!result.success) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: result.reason,
      })
      return
    }

    // Write file FIRST — side effects only after successful write
    try {
      await this.writeFile({ kind: 'deferred', filePath: resolvedPath, content: result.newContent })
    } catch (err) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: `Write failed: ${sanitizeErrorForClient(err)}`,
        reason_code: classifyWriteError(err),
      })
      return
    }

    if (this.undoStack) {
      // requiresHmr=true: deferred/AI writes can restructure JSX. Undo must
      // re-render the user's component to reflect the old source.
      this.undoStack.push({ changes: [{ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: true }] })
    }

    this.verifier.trackEdit({
      editId: edit.editId,
      filePath: resolvedPath,
      expectedValue: edit.value,
      property: edit.property,
      kind: 'deferred',
    })

    this.channel.send({
      type: 'edit_status',
      editId: edit.editId,
      status: 'done',
      strategy: 'deferred',
    })
  }

  private async commitCSSModulesRewrite(edit: EditRequest, resolvedCssPath: string, selector: string): Promise<void> {
    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    // Accumulate changes for a single compound undo push — one logical edit = one entry.
    // Keeps server undo stack in sync with browser's override undo stack.
    const undoChanges: UndoFileChange[] = []

    // CSS rewrite inside CSS file lock only
    let cssSuccess = false
    await this.withFileLock(resolvedCssPath, async () => {
      const result = await this.cssModulesRewriter!.rewrite({
        cssFilePath: resolvedCssPath,
        selector,
        property: edit.property,
        newValue: edit.value,
        elementSelector: edit.elementSelector,
      })
      if (!result.success) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: result.reason })
        return
      }
      try {
        await this.writeFile({ kind: 'immediate', filePath: resolvedCssPath, content: result.newContent })
      } catch (err) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: `Write failed: ${sanitizeErrorForClient(err)}`, reason_code: classifyWriteError(err) })
        return
      }
      // requiresHmr=false: the CSS Module edit is paired with a browser-side
      // override. HMR would cause a flicker between the override value and
      // the stylesheet reload; suppressed by design.
      undoChanges.push({ filePath: resolvedCssPath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: false })
      cssSuccess = true
    })

    // Clean up conflicting inline styles on ALL shared elements when scope='all'.
    // Groups sources by file path → batch removeProperties per file (single AST pass).
    // Eliminates line-shift race when multiple elements share the same JSX file.
    if (cssSuccess && edit.scope === 'all' && this.inlineStyleRewriter) {
      const sources = edit.instanceSources?.length ? edit.instanceSources : [edit.source]

      // Group by resolved file path — one batch per file.
      // Dedup by line:col within each file (browser payload may contain duplicates).
      const byFile = new Map<string, Array<{ line: number; col: number }>>()
      const seen = new Set<string>()
      for (const source of sources) {
        if (seen.has(source)) continue
        seen.add(source)
        const parsed = this.parseSource(source)
        if (!parsed.ok) {
          console.warn('[cortex] Skipping inline cleanup for source %s: %s', source, parsed.reason)
          continue
        }
        let targets = byFile.get(parsed.resolvedPath)
        if (!targets) {
          targets = []
          byFile.set(parsed.resolvedPath, targets)
        }
        targets.push({ line: parsed.line, col: parsed.col })
      }

      for (const [filePath, targets] of byFile) {
        try {
          await this.withFileLock(filePath, async () => {
            const cleanup = await this.inlineStyleRewriter!.removeProperties({
              filePath,
              targets: targets.map(t => ({ ...t, property: edit.property })),
            })
            if (!cleanup.success) {
              console.warn('[cortex] Inline style cleanup failed for %s: %s', filePath, cleanup.reason)
              return
            }
            if (cleanup.newContent !== cleanup.oldContent) {
              // Suppress HMR for the cleanup write to match the CSS write.
              // Both writes must suppress HMR to avoid a race: if cleanup HMR
              // fired while CSS HMR is suppressed, React would re-render without
              // inline styles before the CSS Module value reaches the browser.
              // The CSS override (!important) provides the correct preview.
              // Allowing CSS HMR causes flicker (style recalc) and breaks undo
              // (CSS value in browser can't be rolled back when undo suppresses HMR).
              await this.writeFile({ kind: 'jsx-immediate', suppressHmr: true, filePath, content: cleanup.newContent })
              // requiresHmr=false matches the forward write's suppressHmr=true.
              // The cleanup removes inline styles whose visual is supplied by
              // the browser-side CSS override; undo restores those inline
              // styles, but the override is still present at undo time so
              // HMR would flicker. When the override eventually clears, the
              // inline style takes over on the next natural render.
              undoChanges.push({ filePath, previousContent: cleanup.oldContent, currentContent: cleanup.newContent, requiresHmr: false })
              // No verifier.trackEdit — intentional. The override persists
              // (redundant but harmless once CSS HMR delivers the matching value).
              // Tracking would send hmr_verified, risking premature override
              // removal if CSS and JSX HMR arrive in separate batches.
            }
          })
        } catch (err) {
          // Cleanup failure is non-fatal — CSS edit already succeeded.
          // But log it so disk errors, ts-morph crashes, etc. are visible.
          console.warn('[cortex] Inline style cleanup error for %s (edit %s):', filePath, edit.editId, err instanceof Error ? err.message : err)
        }
      }
    }

    // Push compound undo entry AFTER all writes complete.
    // For scope='all': contains CSS file change + JSX cleanup change(s).
    // For scope='instance': contains only the CSS file change.
    // One compound push = one browser undo entry = stacks stay in sync.
    if (cssSuccess && this.undoStack && undoChanges.length > 0) {
      this.undoStack.push({ changes: undoChanges })
    }

    // Send edit_status:done AFTER compound push so the browser commits
    // its undo snapshot at the same time the server pushes its entry.
    if (cssSuccess) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done', strategy: 'immediate' })
    }
  }

  /**
   * Attempt inline style rewrite inside file lock, then write if successful.
   * Returns true if the rewrite succeeded (edit handled), false if it bailed (caller should fall through).
   * The rewrite is performed INSIDE the lock to prevent TOCTOU races — the file read, AST manipulation,
   * and write are all serialized per-file.
   */
  private async tryInlineStyleWrite(
    edit: EditRequest,
    resolvedPath: string,
    line: number,
    col: number,
  ): Promise<boolean> {
    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
    let handled = false
    await this.withFileLock(resolvedPath, async () => {
      const result = await this.inlineStyleRewriter!.rewrite({
        filePath: resolvedPath, line, col, property: edit.property, value: edit.value,
      })
      if (!result.success) return // handled stays false — caller falls through

      // Use 'jsx-immediate' — allows HMR (unlike 'immediate' which suppresses it)
      try {
        await this.writeFile({ kind: 'jsx-immediate', filePath: resolvedPath, content: result.newContent })
      } catch (err) {
        this.channel.send({
          type: 'edit_status', editId: edit.editId, status: 'failed',
          reason: `Write failed: ${sanitizeErrorForClient(err)}`,
          reason_code: classifyWriteError(err),
        })
        handled = true // error handled — don't fall through to AI
        return
      }
      if (this.undoStack) {
        // requiresHmr=true symmetric with forward kind='jsx-immediate': AI may
        // restructure JSX, so undo must re-render the user's component.
        this.undoStack.push({ changes: [{ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: true }] })
      }
      // Track for HMR verification — jsx-immediate allows HMR, so the verifier
      // can confirm the update and clean up the browser CSS override.
      this.verifier.trackEdit({
        editId: edit.editId,
        filePath: resolvedPath,
        expectedValue: edit.value,
        property: edit.property,
        kind: 'jsx-immediate',
      })
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done', strategy: 'immediate' })
      handled = true
    })
    return handled
  }

  /** Execute a deferred batch: acquire lock, read file, call AI, validate, write, push undo, send status.
   *  Called by DeferredWriter's writeFn — must be public for external wiring. */
  async executeDeferredBatch(batch: BatchedWriteRequest): Promise<{ success: boolean; reason?: string }> {
    try {
      return await this._executeDeferredBatchInner(batch)
    } catch (err) {
      // Last-resort safety net: if the inner logic throws unexpectedly,
      // ensure editIds always get a terminal status (never stuck in "writing")
      const reason = `Unexpected error: ${sanitizeErrorForClient(err)}`
      this.sendDeferredStatus(batch.editIds, 'failed', reason)
      return { success: false, reason }
    }
  }

  private async _executeDeferredBatchInner(batch: BatchedWriteRequest): Promise<{ success: boolean; reason?: string }> {
    // Defense-in-depth: re-validate path even though handleEdit already checked.
    // executeDeferredBatch is public and the path traversed DeferredWriter in between.
    if (!this.isInsideProjectRoot(batch.filePath)) {
      this.sendDeferredStatus(batch.editIds, 'failed', 'File path outside project root')
      return { success: false, reason: 'File path outside project root' }
    }

    // Check abort before starting
    if (batch.signal.aborted) {
      // Coalescing supersede: silent — the newer batch handles these properties.
      // User-initiated cancel (undo/redo): send explicit status via cancelForFile path.
      if (batch.signal.reason !== 'superseded' && batch.signal.reason !== 'user-cancel') {
        this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
      }
      return { success: false, reason: 'aborted' }
    }

    if (!this.aiWriter) {
      this.sendDeferredStatus(batch.editIds, 'failed', 'AI writer is not configured.')
      return { success: false, reason: 'AI writer is not configured.' }
    }

    return this.withFileLockResult(batch.filePath, async () => {
      // Check abort after lock acquisition (may have waited)
      if (batch.signal.aborted) {
        if (batch.signal.reason !== 'superseded' && batch.signal.reason !== 'user-cancel') {
          this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
        }
        return { success: false, reason: 'aborted' }
      }

      // Read current file content inside lock
      let fileContent: string
      try {
        if (!this.readFile) throw new Error('readFile is not configured')
        fileContent = await this.readFile(batch.filePath)
      } catch (err) {
        const reason = `Failed to read file: ${sanitizeErrorForClient(err)}`
        this.sendDeferredStatus(batch.editIds, 'failed', reason)
        return { success: false, reason }
      }

      // Check abort after file read
      if (batch.signal.aborted) {
        if (batch.signal.reason !== 'superseded' && batch.signal.reason !== 'user-cancel') {
          this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
        }
        return { success: false, reason: 'aborted' }
      }

      // Call AI with content + signal
      const result = await this.aiWriter!.write({
        filePath: batch.filePath,
        line: batch.line,
        col: batch.col,
        property: batch.changes[0]!.property,
        value: batch.changes[0]!.value,
        changes: batch.changes,
        failureReason: batch.failureReason,
      }, { fileContent, signal: batch.signal })

      if (!result.success) {
        // Abort during AI call: the signal fired while fetch was in-flight.
        // Treat as cancellation, not failure — a newer edit superseded this one.
        if (batch.signal.aborted) {
          if (batch.signal.reason !== 'superseded' && batch.signal.reason !== 'user-cancel') {
            this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
          }
          return { success: false, reason: 'aborted' }
        }
        // "No changes" means the file already has the desired content — this happens
        // when a previous coalesced batch already wrote the same changes. The file is
        // correct, so treat as success rather than confusing the user with an error.
        if (result.reason.includes('no changes')) {
          this.sendDeferredStatus(batch.editIds, 'done')
          return { success: true }
        }
        this.sendDeferredStatus(batch.editIds, 'failed', result.reason)
        return { success: false, reason: result.reason }
      }

      // Check abort before writing (AI may have returned after supersede)
      if (batch.signal.aborted) {
        if (batch.signal.reason !== 'superseded' && batch.signal.reason !== 'user-cancel') {
          this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
        }
        return { success: false, reason: 'aborted' }
      }

      // Write file FIRST — side effects only after successful write
      try {
        await this.writeFile({ kind: 'deferred', filePath: batch.filePath, content: result.newContent })
      } catch (err) {
        const reason = `Write failed: ${sanitizeErrorForClient(err)}`
        this.sendDeferredStatus(batch.editIds, 'failed', reason, classifyWriteError(err))
        return { success: false, reason }
      }

      // Push undo (only after successful write).
      // requiresHmr=true: deferred batch writes via AI can restructure JSX;
      // undo must re-render to reflect the pre-batch source.
      if (this.undoStack) {
        this.undoStack.push({ changes: [{ filePath: batch.filePath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: true }] })
      }

      // Track HMR for ALL changes in the batch, not just the last.
      // Each change carries the latest editId for that property (last-write-wins
      // in DeferredWriter's coalescing Map). This ensures the verifier sends
      // hmr_verified for the editId the browser is actually tracking.
      for (const change of batch.changes) {
        this.verifier.trackEdit({
          editId: change.editId,
          filePath: batch.filePath,
          expectedValue: change.value,
          property: change.property,
          kind: 'deferred',
        })
      }

      // Send done for all coalesced editIds
      this.sendDeferredStatus(batch.editIds, 'done')

      return { success: true }
    })
  }

  private sendDeferredStatus(editIds: string[], status: 'done' | 'failed' | 'cancelled', reason?: string, reason_code?: 'external_revert' | 'invalid_class_token' | 'write_failed' | 'rewriter_failed' | 'parse_failed'): void {
    for (const editId of editIds) {
      this.channel.send({
        type: 'edit_status',
        editId,
        status,
        strategy: 'deferred',
        ...(reason ? { reason } : {}),
        ...(reason_code ? { reason_code } : {}),
      })
    }
  }

  private async withFileLockResult<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.fileLocks.get(filePath) ?? Promise.resolve()
    let result!: T
    const next = prev.then(async () => { result = await fn() }, async () => { result = await fn() })
    this.fileLocks.set(filePath, next)
    try {
      await next
    } finally {
      if (this.fileLocks.get(filePath) === next) {
        this.fileLocks.delete(filePath)
      }
    }
    return result
  }

  private async withFileLock(filePath: string, fn: () => Promise<void>): Promise<void> {
    await this.withFileLockResult(filePath, fn)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.lastValues.clear()
    this.fileLocks.clear()
    this.deferredWriter?.dispose()
    this.inlineStyleRewriter?.dispose()
    this.aiWriter?.dispose()
  }
}
