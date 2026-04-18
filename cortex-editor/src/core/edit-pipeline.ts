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

/** Classify a write-time error into a reason_code for edit_status.failed.
 *  ExternalRevertError → `'external_revert'`; everything else → `'write_failed'`. */
function classifyWriteError(err: unknown): 'external_revert' | 'write_failed' {
  return err instanceof ExternalRevertError ? 'external_revert' : 'write_failed'
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
}

export interface WriteIntent {
  kind: 'immediate' | 'jsx-immediate' | 'deferred' | 'undo' | 'redo'
  /** Override HMR suppression. When set, takes precedence over kind-based default.
   *  false = allow HMR (file not added to recentEditWrites).
   *  true = suppress HMR (file added to recentEditWrites).
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
      this.handleClassOp(edit, parsed.resolvedPath, parsed.line, parsed.col).catch((err) => {
        console.error('[cortex] classOp pipeline error for editId=%s:', edit.editId, err)
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'Unknown error',
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
            reason: err instanceof Error ? err.message : 'Unknown error',
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

      // Immediate writes have HMR suppressed (recentEditWrites in vite.ts),
      // so don't track for HMR verification — it would never resolve.

      // Write file FIRST — side effects only after successful write
      try {
        await this.writeFile({ kind: 'immediate', filePath: resolvedPath, content: result.newContent })
      } catch (err) {
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
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
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: err instanceof Error ? err.message : 'Undo failed' })
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

    // Validate all files before writing any — partial undo would leave
    // the codebase in an inconsistent state.
    // NOTE: `stale` is set inside the async lock callback and read after the await.
    // This is safe because the for-loop is sequential (not Promise.all).
    for (const change of entry.changes) {
      if (!this.readFile) continue
      let stale = false
      try {
        await this.withFileLock(change.filePath, async () => {
          const current = this.undoStack!.peekUndo()
          if (!current || current.id !== entry.id) { stale = true; return }
          const fileContent = await this.readFile!(change.filePath)
          if (fileContent !== change.currentContent) { stale = true }
        })
      } catch (err) {
        // readFile failure (ENOENT, EACCES) — file state unknown, treat as stale.
        console.error('[cortex] Undo validation read failed for %s:', change.filePath, err)
        stale = true
      }
      if (stale) {
        this.undoStack!.removeStaleEntry(entry.id)
        this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: 'File was modified outside cortex. Undo not available for this change.', reason_code: 'stale' })
        return
      }
    }

    // Write all files. Staleness already verified above.
    // On failure, roll back already-written files so the entry remains valid for retry.
    const writtenUndo: Array<{ filePath: string; rollbackContent: string; requiresHmr: boolean }> = []
    try {
      for (const change of entry.changes) {
        await this.withFileLock(change.filePath, async () => {
          // Per-change HMR policy: className/JSX rewrites need a framework
          // re-render to update the DOM; inline-style edits do not. Threading
          // requiresHmr through UndoFileChange keeps the undo semantic honest
          // to the forward write's semantic.
          await this.writeFile({ kind: 'undo', suppressHmr: !change.requiresHmr, filePath: change.filePath, content: change.previousContent })
        })
        writtenUndo.push({ filePath: change.filePath, rollbackContent: change.currentContent, requiresHmr: change.requiresHmr })
      }
    } catch (err) {
      // Roll back already-written files so disk matches entry.currentContent again.
      for (const w of writtenUndo) {
        try {
          await this.withFileLock(w.filePath, async () => {
            await this.writeFile({ kind: 'undo', suppressHmr: !w.requiresHmr, filePath: w.filePath, content: w.rollbackContent })
          })
        } catch (rollbackErr) {
          console.error('[cortex] Undo rollback failed for %s:', w.filePath, rollbackErr)
        }
      }
      this.channel.send({ type: 'undo_sync_status', status: 'failed', reason: `Write failed during undo: ${err instanceof Error ? err.message : String(err)}`, reason_code: 'write_failed' })
      return
    }

    this.undoStack!.undo()
    this.channel.send({ type: 'undo_sync_status', status: 'done' })
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
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: err instanceof Error ? err.message : 'Redo failed' })
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

    // Validate all files before writing — redo staleness clears the full stack
    // (matches original single-file behavior).
    // NOTE: `stale` is set inside the async lock callback and read after the await.
    // This is safe because the for-loop is sequential (not Promise.all).
    for (const change of entry.changes) {
      if (!this.readFile) continue
      let stale = false
      try {
        await this.withFileLock(change.filePath, async () => {
          const fileContent = await this.readFile!(change.filePath)
          if (fileContent !== change.previousContent) { stale = true }
        })
      } catch (err) {
        // readFile failure (ENOENT, EACCES) — file state unknown, treat as stale.
        console.error('[cortex] Redo validation read failed for %s:', change.filePath, err)
        stale = true
      }
      if (stale) {
        this.undoStack!.clear()
        this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: 'File was modified outside cortex. Redo not available.', reason_code: 'stale' })
        return
      }
    }

    // Write all files, THEN pop the entry.
    // redo() is called AFTER writes succeed to prevent stack/disk divergence.
    // On failure, roll back already-written files so the entry remains valid for retry.
    const writtenRedo: Array<{ filePath: string; rollbackContent: string; requiresHmr: boolean }> = []
    try {
      for (const change of entry.changes) {
        await this.withFileLock(change.filePath, async () => {
          await this.writeFile({ kind: 'redo', suppressHmr: !change.requiresHmr, filePath: change.filePath, content: change.currentContent })
        })
        writtenRedo.push({ filePath: change.filePath, rollbackContent: change.previousContent, requiresHmr: change.requiresHmr })
      }
    } catch (err) {
      for (const w of writtenRedo) {
        try {
          await this.withFileLock(w.filePath, async () => {
            await this.writeFile({ kind: 'redo', suppressHmr: !w.requiresHmr, filePath: w.filePath, content: w.rollbackContent })
          })
        } catch (rollbackErr) {
          console.error('[cortex] Redo rollback failed for %s:', w.filePath, rollbackErr)
        }
      }
      this.channel.send({ type: 'redo_sync_status', status: 'failed', reason: `Write failed during redo: ${err instanceof Error ? err.message : String(err)}`, reason_code: 'write_failed' })
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
          reason: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
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
        reason: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
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
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: `Write failed: ${err instanceof Error ? err.message : String(err)}`, reason_code: classifyWriteError(err) })
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
          reason: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
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
      const reason = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
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
        const reason = `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
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
        const reason = `Write failed: ${err instanceof Error ? err.message : String(err)}`
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
