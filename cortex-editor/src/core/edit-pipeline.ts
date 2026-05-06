import { resolve, sep } from 'path'
import { realpathSync } from 'fs'
import type { ServerChannel, ClassOp } from '../adapters/types.js'
import type { TailwindResolver } from './tailwind-resolver.js'
import type { TailwindRewriter } from './rewriter/tailwind.js'
import type { HMRVerifier } from './hmr-verifier.js'
import type { CSSModulesRewriter } from './rewriter/css-modules.js'
import type { RuntimeCSSResolver } from './rewriter/runtime-resolver.js'
import type { UndoStack, UndoFileChange } from './session/undo-stack.js'
import type { InlineStyleRewriter } from './rewriter/inline-style.js'
import { classifyEdit } from './edit-strategy.js'
import { ExternalRevertError } from '../adapters/atomic-write.js'
import { validateClassOpToken } from './class-op-validator.js'
import { validatePropertyName, rejectCommonInjectionPatterns } from './css-validation.js'
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

/** Shape-validate the compound-edit inline op arrays. Returns null on
 *  success or a specific rejection reason (for reason_code propagation).
 *  Values for sets must be non-empty — empty-string inline edits were
 *  the bug commit 11066da removed; the compound protocol inherits the
 *  same non-empty invariant.
 *
 *  Injection-shape rejection (url(), //, backslash for Unicode escape,
 *  /* for comment injection) is centralized in
 *  rejectCommonInjectionPatterns so the server has ONE source of truth
 *  for the attack-class blocklist — shared with validateClassOpToken. */
function validateInlineOps(
  sets: ReadonlyArray<{ property: string; value: string }> | undefined,
  removes: ReadonlyArray<{ property: string }> | undefined,
): string | null {
  for (const s of sets ?? []) {
    const nameErr = validatePropertyName(s.property, MAX_INLINE_PROP_NAME_LEN, 'inlineSets')
    if (nameErr) return nameErr
    if (typeof s.value !== 'string' || s.value.length === 0) {
      return 'inlineSets entry has empty value — use inlineRemoves instead'
    }
    if (s.value.length > MAX_INLINE_PROP_VALUE_LEN) {
      return `inlineSets value exceeds ${MAX_INLINE_PROP_VALUE_LEN} chars`
    }
    const injectErr = rejectCommonInjectionPatterns(s.value, 'inlineSets value')
    if (injectErr) return injectErr
  }
  for (const r of removes ?? []) {
    const nameErr = validatePropertyName(r.property, MAX_INLINE_PROP_NAME_LEN, 'inlineRemoves')
    if (nameErr) return nameErr
  }
  return null
}

/** Quoted-path pre-pass for sanitizer. Node.js fs
 *  errors follow the convention of wrapping absolute paths in single
 *  or double quotes: `ENOENT: ... open '/Users/John Doe/Hero.tsx'`.
 *  A regex that matches between quotes captures paths CONTAINING
 *  SPACES — which the unquoted-regex fallback cannot, because its
 *  character class stops at whitespace. This closes the macOS
 *  Display Name leak pattern (common on macOS home directories).
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
 *  Three concerns this helper defends against:
 *    - ExternalRevertError.message once embedded the absolute file
 *      path, propagating straight to the Panel's UI (now redacted at
 *      the error's own constructor; defense still applied here).
 *    - ts-morph / fs errors routinely include path fragments that
 *      would otherwise flow verbatim to the browser — truncated at
 *      MAX_CLIENT_ERROR_LEN.
 *    - Short fs errors (e.g. ENOENT ~65 chars) fit UNDER the 200-char
 *      truncation ceiling with the absolute path INTACT — handled
 *      via the path-stripping regexes (applied before truncation).
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
  // Pass 1: quoted absolute paths. Supports embedded
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

/** Internal result shape for EditPipeline operations. Distinct from the wire
 *  `edit_status` message: the wire collapses 'applied' and 'needs-source-edit'
 *  into 'done' (see emitTerminal) so the browser reducer at
 *  cortex-app-reducer.ts:216 keeps working unchanged. The MCP RPC handler
 *  (cortex_apply_edits) consumes this richer shape via registerApplyResolver
 *  to distinguish deterministic-apply success ('applied' + mechanism) from
 *  source-edit fallback ('needs-source-edit').
 *
 *  `newToken` is set on Tailwind successes (the new class string, e.g. 'pt-4')
 *  and forwarded to the wire so the browser's existing override-layer handoff
 *  keeps working — see edit-pipeline.test.ts 'sends writing then done status
 *  on successful edit'. */
export type EditResult =
  | {
      status: 'applied'
      mechanism: 'tailwind' | 'css-module' | 'inline-style'
      newToken?: string
    }
  | { status: 'needs-source-edit'; reason?: string }
  | {
      status: 'failed'
      reason: string
      reason_code?:
        | 'external_revert'
        | 'invalid_class_token'
        | 'write_failed'
        | 'rewriter_failed'
        | 'parse_failed'
        | 'read_failed'
        | 'apply_timeout'
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
  classOp?: ClassOp
  /** Inline property SETS applied as part of a compound
   *  edit. Only honored when `classOp` is also present. See
   *  handleCompoundEdit. */
  inlineSets?: ReadonlyArray<{ property: string; value: string }>
  /** Inline property REMOVES applied as part of a compound
   *  edit. Only honored when `classOp` is also present. */
  inlineRemoves?: ReadonlyArray<{ property: string }>
  /** Optional baseline value used as a fallback when `lastValues` (the
   *  debounce-time per-key cache) has nothing for this edit's debounce key.
   *  Set by MCP `cortex_apply_edits` callers — they have the `previousValue`
   *  on PendingEdit but bypass the debounce path that normally seeds
   *  `lastValues`. Without this, the Tailwind path's old-token resolution
   *  (which relies on `previousValue` when `currentClass` is absent) fails
   *  silently and the intent times out. */
  baselineValue?: string
  /** Deterministic-only mode set by MCP `cortex_apply_edits` callers. When
   *  set, branches that would fall through to terminal-failed instead emit
   *  `needs-source-edit` so the MCP caller (Claude) handles the change via
   *  the Edit tool. Only the deterministic rewriter paths (Tailwind / CSS
   *  Modules / InlineStyle) emit `'applied'` when this flag is set. */
  mcpMode?: boolean
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
 * 5. On failure: emit terminal failed (mcpMode → needs-source-edit for Claude)
 */
export class EditPipeline {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastValues = new Map<string, string>()
  private fileLocks = new Map<string, Promise<void>>()
  private pendingResolvers = new Map<string, {
    resolve: (r: EditResult) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
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
    this.inlineStyleRewriter = options.inlineStyleRewriter
  }

  registerApplyResolver(editId: string, timeoutMs = 10_000): Promise<EditResult> {
    return new Promise<EditResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolvers.delete(editId)
        resolve({ status: 'failed', reason: `apply timeout (${timeoutMs}ms)`, reason_code: 'apply_timeout' })
      }, timeoutMs)
      this.pendingResolvers.set(editId, { resolve, reject, timer })
    })
  }

  private emitTerminal(editId: string, result: EditResult): void {
    // Translate internal EditResult -> wire shape. Wire schema constrains
    // status to 'writing' | 'done' | 'failed' | 'cancelled' (see
    // cortex-editor/src/schemas/wire-format.ts:275). 'applied' and
    // 'needs-source-edit' are MCP-internal — the wire collapses both to
    // 'done' so the existing browser reducer at cortex-app-reducer.ts:216
    // keeps working unchanged. The `mechanism` field stays out of the wire
    // (browser does not consume it; the MCP RPC handler reads it from the
    // resolved Promise instead).
    if (result.status === 'applied') {
      this.channel.send({ type: 'edit_status', editId, status: 'done', strategy: 'immediate', newToken: result.newToken })
    } else if (result.status === 'needs-source-edit') {
      this.channel.send({ type: 'edit_status', editId, status: 'done', strategy: 'deferred', reason: result.reason })
    } else {
      // status === 'failed'
      this.channel.send({ type: 'edit_status', editId, status: 'failed', reason: result.reason, reason_code: result.reason_code })
    }
    // Timeout pre-deletes the Map entry (registerApplyResolver line above);
    // a late emitTerminal after timeout finds no pending and silently skips
    // the resolver while still sending the wire message. That's correct —
    // the browser is the source of truth for `done`, and the MCP caller
    // already received the timeout failure.
    const pending = this.pendingResolvers.get(editId)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingResolvers.delete(editId)
      pending.resolve(result)
    }
  }

  /** Deterministic-only gate for MCP-routed edits. When `edit.mcpMode` is set,
   *  branches that would otherwise emit terminal-failed instead emit
   *  `needs-source-edit` so the MCP caller (Claude) handles the change via
   *  the Edit tool. Returns true if the gate fired (caller should return); false
   *  to fall through to the terminal-failed path. Prevents the double-write
   *  hazard where cortex emits failed AND Claude then writes anyway. */
  private mcpFallbackFires(edit: EditRequest, reason: string): boolean {
    if (!edit.mcpMode) return false
    this.emitTerminal(edit.editId, { status: 'needs-source-edit', reason })
    return true
  }

  // ── Session-level in-flight intent tracking for MCP applyEditsCore ────────
  // Two concurrent cortex_apply_edits calls targeting the same intentId would
  // collide on the per-key debounce timer (`source:property`) inside
  // executeEdit — the second call's setTimeout cancels the first's, leaving
  // the first's registered resolver to time out. CodeRabbit caught this in
  // PR #97 review. Per-call UUID (added in staged-edits.ts) solves the
  // resolver-Map collision; this Set solves the debounce-slot collision by
  // refusing the second call before it dispatches.

  private applyInFlight = new Set<string>()

  /** Mark `intentId` as in-flight for an MCP apply. Returns true on success;
   *  false if another applyEditsCore call already holds this intentId — caller
   *  should return failed-already-in-flight without dispatching. */
  beginApply(intentId: string): boolean {
    if (this.applyInFlight.has(intentId)) return false
    this.applyInFlight.add(intentId)
    return true
  }

  /** Release the in-flight marker. Caller MUST call this in a finally block
   *  to avoid leaking entries on rejection / dispose / unexpected throws. */
  endApply(intentId: string): void {
    this.applyInFlight.delete(intentId)
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
      const classOp = edit.classOp
      const tokensToValidate: Array<{ field: 'remove' | 'add'; token: string }> = []
      if (classOp.kind === 'remove' || classOp.kind === 'swap') {
        tokensToValidate.push({ field: 'remove', token: classOp.remove })
      }
      if (classOp.kind === 'add' || classOp.kind === 'swap') {
        tokensToValidate.push({ field: 'add', token: classOp.add })
      }
      for (const { field, token } of tokensToValidate) {
        const result = validateClassOpToken(token)
        if (!result.ok) {
          this.emitTerminal(edit.editId, { status: 'failed', reason: `Invalid classOp.${field}: ${result.reason}`, reason_code: 'invalid_class_token' })
          return
        }
      }

      const parsed = this.parseSource(edit.source)
      if (!parsed.ok) {
        this.emitTerminal(edit.editId, { status: 'failed', reason: parsed.reason, reason_code: 'parse_failed' })
        return
      }

      // Compound routing. If the browser sent inline ops
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
          this.emitTerminal(edit.editId, { status: 'failed', reason: shapeError, reason_code: 'invalid_class_token' })
          return
        }
        this.handleCompoundEdit(edit, parsed.resolvedPath, parsed.line, parsed.col).catch((err) => {
          console.error('[cortex] compound-edit pipeline error for editId=%s:', edit.editId, err)
          this.emitTerminal(edit.editId, { status: 'failed', reason: sanitizeErrorForClient(err), reason_code: classifyWriteError(err) })
        })
        return
      }

      this.handleClassOp(edit, parsed.resolvedPath, parsed.line, parsed.col).catch((err) => {
        console.error('[cortex] classOp pipeline error for editId=%s:', edit.editId, err)
        this.emitTerminal(edit.editId, { status: 'failed', reason: sanitizeErrorForClient(err), reason_code: classifyWriteError(err) })
      })
      return
    }

    const debounceKey = `${edit.source}:${edit.property}`

    const existing = this.debounceTimers.get(debounceKey)
    if (existing) clearTimeout(existing)

    // baselineValue (set by MCP cortex_apply_edits — see EditRequest doc) is
    // the fallback when lastValues has no entry for this key. Browser-channel
    // path: lastValues populated by prior scrub edits → previousValue from
    // cache. MCP path: bypasses debounce → lastValues empty → baselineValue
    // from PendingEdit.previousValue.
    const previousValue = this.lastValues.get(debounceKey) ?? edit.baselineValue
    this.lastValues.set(debounceKey, edit.value)
    this.debounceTimers.set(
      debounceKey,
      setTimeout(() => {
        this.debounceTimers.delete(debounceKey)
        this.executeEdit(edit, previousValue).catch(err => {
          console.error('[cortex] Edit pipeline error for editId=%s source=%s:', edit.editId, edit.source, err)
          this.emitTerminal(edit.editId, { status: 'failed', reason: sanitizeErrorForClient(err) })
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

  private async executeEdit(edit: EditRequest, previousValue: string | undefined): Promise<void> {
    // Parse source as "filePath:line:col" — parse from right to handle
    // Windows drive letters (e.g. "C:\Users\foo\App.tsx:2:10")
    const parsed = this.parseSource(edit.source)
    if (!parsed.ok) {
      this.emitTerminal(edit.editId, { status: 'failed', reason: parsed.reason })
      return
    }
    const { resolvedPath, line, col } = parsed

    // Server-side CSS property + value validation
    if (!isValidCSSProperty(edit.property)) {
      this.emitTerminal(edit.editId, { status: 'failed', reason: 'Invalid CSS property name' })
      return
    }
    if (!isValidCSSValue(edit.value)) {
      this.emitTerminal(edit.editId, { status: 'failed', reason: 'Invalid CSS value' })
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
          } catch { /* treat throws as failed, fall through to terminal */ }
          if (handled) return
        }
        // InlineStyleRewriter unavailable or failed — emit terminal
        if (this.mcpFallbackFires(edit, 'Inline style rewrite unavailable for instance-scoped edit; deterministic-only mode')) return
        this.emitTerminal(edit.editId, { status: 'failed', reason: 'Instance-scoped editing requires InlineStyleRewriter. Use the Apply gesture to escalate to Claude.' })
        return
      }

      // scope === 'all' or undefined — existing CSSModulesRewriter path
      const mapping = parseCssMapping(edit.cssMapping)
      if (mapping) {
        const resolvedCssPath = resolve(this.projectRoot, mapping.cssFilePath)
        if (!this.isInsideProjectRoot(resolvedCssPath)) {
          this.emitTerminal(edit.editId, { status: 'failed', reason: 'CSS file path outside project root' })
          return
        }
        // Extension check
        if (!resolvedCssPath.endsWith('.module.css')) {
          if (resolvedCssPath.match(/\.module\.(scss|less|sass)$/)) {
            this.emitTerminal(edit.editId, { status: 'failed', reason: `${resolvedCssPath.match(/\.(scss|less|sass)$/)?.[0]} Modules editing not yet supported. Connect Claude Code for AI-assisted editing.` })
          } else {
            this.emitTerminal(edit.editId, { status: 'failed', reason: 'CSS mapping must target a CSS Module file' })
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
            aiAvailable: false,
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
            } catch { /* swallow — handled stays false → emit terminal below */ }
            if (handled) return
          }
          if (this.mcpFallbackFires(edit, 'Inline style rewrite unavailable for instance-scoped CSS Module element; deterministic-only mode')) return
          this.emitTerminal(edit.editId, { status: 'failed', reason: 'Instance-scoped editing requires InlineStyleRewriter. Use the Apply gesture to escalate to Claude.' })
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
          } catch { /* swallow — handled stays false → emit terminal below */ }
          if (handled) return
        }
        if (this.mcpFallbackFires(edit, 'CSS module mapping unresolved; deterministic-only mode')) return
        this.emitTerminal(edit.editId, { status: 'failed', reason: 'Could not resolve CSS module mapping for this element. Use the Apply gesture to escalate to Claude.' })
        return
      }
    }

    // Strategy-driven early exits (only when detection is available)
    // InlineStyleRewriter provides a fallback — don't bail when it's available
    if (strategy === 'unsupported' && !this.inlineStyleRewriter) {
      this.emitTerminal(edit.editId, { status: 'failed', reason: 'No supported editing strategy for this framework.' })
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
      if (!previousValue && !canHandleWithoutBaseline) return
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
        } catch { /* swallow — handled stays false → emit terminal below */ }
        if (handled) return
      }
      if (this.mcpFallbackFires(edit, 'Tailwind no-token path; deterministic-only mode')) return
      const noTokenReason = !newToken
        ? `Cannot resolve Tailwind class for ${edit.property}: ${edit.value}`
        : previousValue
          ? `Cannot resolve Tailwind class for ${edit.property}: ${previousValue}`
          : `No baseline value for Tailwind token on ${edit.property}`
      this.emitTerminal(edit.editId, { status: 'failed', reason: noTokenReason })
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
        if (this.mcpFallbackFires(edit, `Tailwind rewrite failed: ${result.reason}; deterministic-only mode`)) return
        this.emitTerminal(edit.editId, { status: 'failed', reason: result.reason })
        return
      }

      // Immediate writes have HMR suppressed (recentEditWriteTimers in vite.ts),
      // so don't track for HMR verification — it would never resolve.

      // Write file FIRST — side effects only after successful write
      try {
        await this.writeFile({ kind: 'immediate', filePath: resolvedPath, content: result.newContent })
      } catch (err) {
        this.emitTerminal(edit.editId, { status: 'failed', reason: `Write failed: ${sanitizeErrorForClient(err)}`, reason_code: classifyWriteError(err) })
        return
      }

      // Push to undo stack only after successful write.
      // requiresHmr=false: inline-style property edits are painted by the
      // browser-side !important override layer; HMR would only cause flicker.
      if (this.undoStack) {
        this.undoStack.push({ changes: [{ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent, requiresHmr: false }] })
      }

      this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'tailwind', newToken })
    })
  }

  async handleUndo(): Promise<void> { return this._handleUndoRedoPublic('undo') }
  async handleRedo(): Promise<void> { return this._handleUndoRedoPublic('redo') }

  /** Shared public-wrapper for handleUndo/handleRedo. Chains on undoLock
   *  so concurrent invocations serialize; catches + surfaces errors via
   *  the direction-appropriate sync-status channel message. */
  private async _handleUndoRedoPublic(direction: 'undo' | 'redo'): Promise<void> {
    if (this.disposed || !this.undoStack) return
    this.undoLock = this.undoLock.then(
      () => this._doUndoRedo(direction),
      (err) => { console.error('[cortex] Prior %s error:', direction, err); return this._doUndoRedo(direction) },
    )
    try {
      await this.undoLock
    } catch (err) {
      console.error('[cortex] %s failed:', direction, err)
      this.channel.send({ type: `${direction}_sync_status`, status: 'failed', reason: sanitizeErrorForClient(err) })
    }
  }

  /** Typed result from the lock-held phase-1+phase-2 execution.
   *  Replaces the prior pattern of outer-closure sentinel mutation
   *  (let stale = false; let writeErr: unknown = null) with an
   *  explicit return value whose shape the compiler can check. */
  private static readonly UNDO_REDO_DONE = { outcome: 'done' as const }
  private static readonly UNDO_REDO_STALE = { outcome: 'stale' as const }

  /** Unified undo/redo executor. Extracted from the former _doUndo +
   *  _doRedo pair which shared ~95% of their bodies. Direction-specific
   *  branches are isolated to the peek/write-content/stack-response
   *  selectors below; the bulk (debounce clear, multi-file-lock
   *  validate-all + write-all with inline rollback) is now written once.
   *
   *  Side effect: debounce timers are now cleared for BOTH undo and
   *  redo. Prior to extraction, only undo cleared them — a latent
   *  inconsistency the duplication hid. Clearing on redo is consistent
   *  with the undo semantic (the user-originated in-flight edit the
   *  debounce represents is about to be superseded by the redo write). */
  private async _doUndoRedo(direction: 'undo' | 'redo'): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()

    const statusType = `${direction}_sync_status` as const
    const entry = direction === 'undo' ? this.undoStack!.peekUndo() : this.undoStack!.peekRedo()
    if (!entry) {
      this.channel.send({ type: statusType, status: 'failed', reason: `Nothing to ${direction}.`, reason_code: 'empty_stack' })
      return
    }

    for (const change of entry.changes) {
      for (const [key] of this.lastValues) {
        if (key.startsWith(change.filePath + ':')) {
          this.lastValues.delete(key)
        }
      }
    }

    // Validate-all + write-all under ONE continuous set of file locks,
    // held for the duration of both phases. Closes the TOCTOU window
    // between per-file validate and write: a concurrent forward edit
    // cannot slip in and be clobbered by a stale-validation-based
    // write. Also preserves the "validate-all-before-write-any"
    // atomicity invariant (asserted by the scope='all' compound-undo
    // test — partial writes must not occur when a later file is stale).
    //
    // Rollback-on-write-failure runs INSIDE the same lock scope, so
    // the TOCTOU closure applies to the recovery path too.
    //
    // For multi-file entries (e.g. CSS Modules scope='all'), locks are
    // acquired in sorted path order so concurrent undo/redo operations
    // on overlapping file sets serialize rather than deadlock.
    const sortedChanges = [...entry.changes].sort((a, b) => a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0)
    const filePaths = sortedChanges.map(c => c.filePath)

    // Direction-specific selectors. Undo writes `previousContent`
    // and treats `currentContent` as validation target + rollback
    // target. Redo is the mirror.
    const validateContent = (c: UndoFileChange) => direction === 'undo' ? c.currentContent : c.previousContent
    const writeContent = (c: UndoFileChange) => direction === 'undo' ? c.previousContent : c.currentContent
    const rollbackContent = (c: UndoFileChange) => direction === 'undo' ? c.currentContent : c.previousContent

    const result = await this._runUndoRedoUnderLocks(
      filePaths,
      sortedChanges,
      direction,
      entry.id,
      validateContent,
      writeContent,
      rollbackContent,
    )

    if (result.outcome === 'stale') {
      if (direction === 'undo') this.undoStack!.removeStaleEntry(entry.id)
      else this.undoStack!.clear()
      const reason = direction === 'undo'
        ? 'File was modified outside cortex. Undo not available for this change.'
        : 'File was modified outside cortex. Redo not available.'
      this.channel.send({ type: statusType, status: 'failed', reason, reason_code: 'stale' })
      return
    }
    if (result.outcome === 'write_failed') {
      // Rollback already ran inside the lock scope. Only the status
      // dispatch remains — no disk ops.
      this.channel.send({
        type: statusType,
        status: 'failed',
        reason: `Write failed during ${direction}: ${sanitizeErrorForClient(result.err)}`,
        reason_code: 'write_failed',
      })
      return
    }

    // Commit the stack state transition AFTER the writes succeed.
    if (direction === 'undo') this.undoStack!.undo()
    else this.undoStack!.redo()
    this.channel.send({ type: statusType, status: 'done' })
  }

  /** Phase-1 validate + phase-2 write (with inline rollback on write
   *  failure) under a single continuous multi-file lock acquisition.
   *  Returns a typed Result so the caller's status dispatch is
   *  unambiguous without closure-sentinel tracing. */
  private async _runUndoRedoUnderLocks(
    filePaths: readonly string[],
    sortedChanges: readonly UndoFileChange[],
    direction: 'undo' | 'redo',
    entryId: number,
    validateContent: (c: UndoFileChange) => string,
    writeContent: (c: UndoFileChange) => string,
    rollbackContent: (c: UndoFileChange) => string,
  ): Promise<{ outcome: 'done' } | { outcome: 'stale' } | { outcome: 'write_failed'; err: unknown }> {
    let result: { outcome: 'done' } | { outcome: 'stale' } | { outcome: 'write_failed'; err: unknown } = EditPipeline.UNDO_REDO_DONE
    const committedWrites: Array<{ filePath: string; rollbackContent: string; requiresHmr: boolean }> = []

    try {
      await this.withMultiFileLocks(filePaths, async () => {
        // Phase 1: validate all files. No disk writes yet. Undo also
        // checks stack identity — guards against a concurrent
        // clearUndoStack mutating the stack between the outer peek
        // and lock acquisition.
        if (this.readFile) {
          if (direction === 'undo') {
            const current = this.undoStack!.peekUndo()
            if (!current || current.id !== entryId) { result = EditPipeline.UNDO_REDO_STALE; return }
          }
          for (const change of sortedChanges) {
            const fileContent = await this.readFile(change.filePath)
            if (fileContent !== validateContent(change)) { result = EditPipeline.UNDO_REDO_STALE; return }
          }
        }
        // Phase 2: write all files. Locks still held; no external
        // write can interleave. On failure, rollback in reverse order
        // while locks are still held.
        for (const change of sortedChanges) {
          try {
            await this.writeFile({ kind: direction, suppressHmr: !change.requiresHmr, filePath: change.filePath, content: writeContent(change) })
          } catch (err) {
            result = { outcome: 'write_failed', err }
            for (const w of [...committedWrites].reverse()) {
              try {
                await this.writeFile({ kind: direction, suppressHmr: !w.requiresHmr, filePath: w.filePath, content: w.rollbackContent })
              } catch (rollbackErr) {
                console.error('[cortex] %s rollback failed for %s:', direction, w.filePath, rollbackErr)
              }
            }
            return
          }
          committedWrites.push({ filePath: change.filePath, rollbackContent: rollbackContent(change), requiresHmr: change.requiresHmr })
        }
      })
    } catch (err) {
      // readFile failure (ENOENT, EACCES) surfaced out of the lock
      // callback. File state unknown, treat as stale.
      console.error('[cortex] %s validation read failed:', direction, err)
      return EditPipeline.UNDO_REDO_STALE
    }

    return result
  }

  /** Acquire per-file locks for all filePaths in sorted order, then run
   *  fn while holding all of them. Locks are released when fn returns
   *  (or throws). Sorting prevents deadlock between concurrent
   *  multi-file operations that touch overlapping file sets.
   *
   *  Codepoint order (JS default `.sort()`) — MUST match the sort
   *  strategy used in _doUndoRedo. Any locale-sensitive comparator
   *  (`.localeCompare`) would diverge under case-insensitive locales,
   *  causing two concurrent compound operations to acquire locks in
   *  DIFFERENT orders for the same file set — re-opening the deadlock
   *  vector this sort is meant to close. Do NOT change to localeCompare. */
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

  /**
   * Handle a compound edit: classOp + inlineSets + inlineRemoves applied
   * to the same JSX element in ONE read-mutate-write cycle.
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
   * is either fully updated or untouched. No AI fallback for compound
   * edits — partial writes would produce the exact stale-state bug
   * Option A exists to prevent. Use the Apply gesture to escalate.
   */
  private async handleCompoundEdit(
    edit: EditRequest,
    resolvedPath: string,
    line: number,
    col: number,
  ): Promise<void> {
    if (!edit.classOp) return // defensive — handleEdit guards this
    const classOpRemove = edit.classOp.kind !== 'add' ? edit.classOp.remove : undefined
    const classOpAdd = edit.classOp.kind !== 'remove' ? edit.classOp.add : undefined

    // Inline-ops require the InlineStyleRewriter dep. Without it we
    // can't apply the compound; fail with a clear reason rather than
    // silently degrading to classOp-only (which would produce the
    // exact partial-undo bug C2 exists to close).
    if (!this.inlineStyleRewriter) {
      // Server configuration error — the inline rewriter dependency wasn't
      // wired during plugin init. Classified as 'rewriter_failed' because
      // from the browser's perspective the rewriter step can't proceed —
      // same failure class as a rewriter that tried and returned success:false.
      this.emitTerminal(edit.editId, { status: 'failed', reason: 'Compound edit requires inline-style rewriter dependency', reason_code: 'rewriter_failed' })
      return
    }
    if (!this.readFile) {
      // Server configuration error — read capability is unavailable. Uses
      // 'read_failed' for parity with the runtime read-error path below;
      // both represent "the server could not read the source file."
      this.emitTerminal(edit.editId, { status: 'failed', reason: 'Compound edit requires readFile dependency', reason_code: 'read_failed' })
      return
    }

    const sets = edit.inlineSets ?? []
    const removes = edit.inlineRemoves ?? []

    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    await this.withFileLock(resolvedPath, async () => {
      // Step 1: read file under the lock (single source of truth for
      // Local failure helper — every step below dispatches the same
      // shape of edit_status:failed message, differing only in reason
      // and (sometimes) reason_code. Factoring to `fail()` reduces
      // visual nesting from 4 levels to 2 and makes the happy path
      // scan linearly. Returns nothing; caller must `return` after.
      type ReasonCode = 'external_revert' | 'invalid_class_token' | 'write_failed' | 'rewriter_failed' | 'parse_failed' | 'read_failed'
      const fail = (reason: string, reasonCode: ReasonCode = 'parse_failed'): void => {
        this.emitTerminal(edit.editId, { status: 'failed', reason, reason_code: reasonCode })
      }

      // Step 1: read source file.
      let oldContent: string
      try {
        oldContent = await this.readFile!(resolvedPath)
      } catch (err) {
        fail(`Cannot read file: ${sanitizeErrorForClient(err)}`, 'read_failed')
        return
      }

      // Step 2: create in-memory transaction seeded with oldContent.
      let txn
      try {
        txn = await createJsxTransaction(resolvedPath, oldContent)
      } catch (err) {
        fail(`Transaction init failed: ${sanitizeErrorForClient(err)}`)
        return
      }

      // Step 3: apply classOp. Compound must be all-or-nothing at the
      // deterministic layer; if the rewriter refuses, route MCP-mode edits
      // to the needs-source-edit handoff (Claude takes over via Edit tool)
      // and emit terminal-failed for browser-channel edits.
      const classResult = this.rewriter.rewriteClassListInTransaction(txn, {
        line, col, remove: classOpRemove, add: classOpAdd,
      })
      if (!classResult.success) {
        if (this.mcpFallbackFires(edit, `Compound classOp failed: ${classResult.reason}`)) return
        // The rewriter attempted the classOp and refused — same failure
        // class as the property-keyed rewrite path's 'rewriter_failed'
        // (not a parse failure; the JSX itself parsed fine).
        fail(`Compound classOp failed: ${classResult.reason}`, 'rewriter_failed')
        return
      }

      // Step 4: apply inline sets + removes on the SAME transaction.
      const inlineResult = this.inlineStyleRewriter!.setAndRemoveInTransaction(txn, {
        line, col, sets, removes,
      })
      if (!inlineResult.success) {
        if (this.mcpFallbackFires(edit, `Compound inline ops failed: ${inlineResult.reason}`)) return
        fail(`Compound inline ops failed: ${inlineResult.reason}`, 'rewriter_failed')
        return
      }

      const newContent = txn.getCurrentContent()

      // If the compound is semantically a no-op (e.g., classOp idempotent
      // + inlineSets match existing values + inlineRemoves target absent
      // properties), skip the write and undo push. Reporting 'done'
      // without a push keeps the undo stack clean.
      if (newContent === oldContent) {
        this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'inline-style' })
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
        fail(`Write failed: ${sanitizeErrorForClient(err)}`, classifyWriteError(err))
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

      this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'inline-style' })
    })
  }

  /**
   * classOp (className mutation) branch. Mirrors the property-keyed path's
   * guarantees: captures oldContent before the write for undo, emits terminal
   * failed when the deterministic rewriter can't handle the JSX shape,
   * serializes concurrent ops on the same file via withFileLock.
   */
  private async handleClassOp(
    edit: EditRequest,
    resolvedPath: string,
    line: number,
    col: number,
  ): Promise<void> {
    if (!edit.classOp) return // defensive — handleEdit already guards this
    const classOpRemove = edit.classOp.kind !== 'add' ? edit.classOp.remove : undefined
    const classOpAdd = edit.classOp.kind !== 'remove' ? edit.classOp.add : undefined

    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    await this.withFileLock(resolvedPath, async () => {
      // Capture oldContent BEFORE the rewrite so the undo entry restores
      // what the user actually had. If reading fails here, we fail fast:
      // proceeding would either succeed silently without undo (user's
      // Ctrl+Z becomes a mystery no-op — SF-H-1) or fail at writeFile
      // anyway with the same underlying fs error. Matches
      // handleCompoundEdit's read-fail policy for consistency.
      let oldContent: string | null = null
      if (this.undoStack && this.readFile) {
        try {
          oldContent = await this.readFile(resolvedPath)
        } catch (err) {
          this.emitTerminal(edit.editId, { status: 'failed', reason: `Cannot read file: ${sanitizeErrorForClient(err)}`, reason_code: 'read_failed' })
          return
        }
      }

      const result = await this.rewriter.rewriteClassList({
        filePath: resolvedPath,
        line,
        col,
        remove: classOpRemove,
        add: classOpAdd,
      })

      if (!result.success) {
        // Deterministic rewriter could not handle this className shape (e.g. template literals).
        // MCP-mode edits route to needs-source-edit so Claude can write via Edit tool;
        // browser-channel edits emit terminal-failed (user uses Apply gesture explicitly).
        const reason = result.reason ?? 'Could not rewrite className for this element.'
        if (this.mcpFallbackFires(edit, reason)) return
        this.emitTerminal(edit.editId, { status: 'failed', reason, reason_code: 'rewriter_failed' })
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
        this.emitTerminal(edit.editId, { status: 'failed', reason: `Write failed: ${sanitizeErrorForClient(err)}`, reason_code: classifyWriteError(err) })
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

      // Track the edit for HMR verification. Previously classOp was the one
      // edit path that skipped trackEdit — the browser relied on sweepStaleOverrides
      // to clean up the preview override, which fired on every HMR and caused
      // spurious reverts (ZF0-1235). Now classOp goes through the same verified
      // removal pipeline as every other kind. `kind: 'immediate'` signals that
      // the new value lives in a stylesheet rule (from the Tailwind class swap),
      // so the browser reads it via a single detach-and-read-computed pass.
      //
      // classOp's protocol-level `property`/`value` fields are empty strings —
      // the real change lives in the op's add/remove. We pass a stable marker
      // for `property` so logs and traces stay intelligible; the actual value
      // to verify comes from the browser's own trackPendingEdit (which knows
      // the intended per-property target value the Panel resolved pre-dispatch).
      this.verifier.trackEdit({
        editId: edit.editId,
        filePath: resolvedPath,
        expectedValue: '',
        property: '__class__',
        kind: 'immediate',
      })

      this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'tailwind' })
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
        this.emitTerminal(edit.editId, { status: 'failed', reason: result.reason })
        return
      }
      try {
        await this.writeFile({ kind: 'immediate', filePath: resolvedCssPath, content: result.newContent })
      } catch (err) {
        this.emitTerminal(edit.editId, { status: 'failed', reason: `Write failed: ${sanitizeErrorForClient(err)}`, reason_code: classifyWriteError(err) })
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
      this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'css-module' })
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
        this.emitTerminal(edit.editId, {
          status: 'failed',
          reason: `Write failed: ${sanitizeErrorForClient(err)}`,
          reason_code: classifyWriteError(err),
        })
        // Mark handled so the caller doesn't emit a SECOND terminal status.
        // `handled` is closed over from the outer function scope — the return
        // below exits the withFileLock callback, but the outer function still
        // returns this variable. Without this, callers see handled=false and
        // fall through to e.g. the no-Tailwind-token terminal, producing two
        // edit_status events for one edit.
        handled = true
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
      this.emitTerminal(edit.editId, { status: 'applied', mechanism: 'inline-style' })
      handled = true
    })
    return handled
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
    for (const pending of this.pendingResolvers.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('pipeline disposed'))
    }
    this.pendingResolvers.clear()
    this.disposed = true
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.lastValues.clear()
    this.fileLocks.clear()
    this.inlineStyleRewriter?.dispose()
  }
}
