import { resolve, relative, sep } from 'path'
import { realpathSync } from 'fs'
import type { ServerChannel } from '../adapters/types.js'
import type { TailwindResolver } from './tailwind-resolver.js'
import type { TailwindRewriter } from './rewriter/tailwind.js'
import type { HMRVerifier } from './hmr-verifier.js'
import type { CSSModulesRewriter } from './rewriter/css-modules.js'
import type { RuntimeCSSResolver } from './rewriter/runtime-resolver.js'
import type { UndoStack } from './session/undo-stack.js'
import type { AIWriter } from './ai-writer.js'
import type { DeferredWriter, BatchedWriteRequest } from './deferred-writer.js'
import type { InlineStyleRewriter } from './rewriter/inline-style.js'
import { classifyEdit } from './edit-strategy.js'

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
}

export interface WriteIntent {
  kind: 'immediate' | 'jsx-immediate' | 'deferred' | 'undo' | 'redo'
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
          // InlineStyleRewriter unavailable or failed — fall through to deferred/AI below
        } else {
          await this.commitCSSModulesRewrite(edit, resolved.cssFilePath, resolved.selector)
          return
        }
      }
      // CSS Modules-only project → don't fall through to Tailwind
      if (!this.detector.hasTailwind) {
        // Layer 3.5: Inline style rewriter — deterministic fallback
        // Skip if we already tried InlineStyleRewriter for instance scope (avoids double call)
        if (this.inlineStyleRewriter && edit.scope !== 'instance') {
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
    // First edit for a source:property pair has no previousValue — this is the
    // baseline "seed" establishing the current state. Skip silently; the CSS
    // override already shows the preview. File write starts on the next edit.
    // Seed-skip: first edit establishes the baseline for Tailwind (oldToken = null without it).
    // InlineStyleRewriter doesn't need a baseline (uses property+value directly),
    // so bypass seed-skip only when InlineStyleRewriter can handle this edit.
    const canHandleWithoutBaseline = this.inlineStyleRewriter && !this.detector?.hasTailwind
    if (!previousValue && !this.deferredWriter && !canHandleWithoutBaseline) return

    const newToken = this.resolver.findClass(edit.property, edit.value)
    const oldToken = previousValue ? this.resolver.findClass(edit.property, previousValue) : null

    if (!newToken || !oldToken) {
      // Layer 3.5: Inline style rewriter — only for non-Tailwind projects
      // (Tailwind projects should not accumulate inline styles)
      if (this.inlineStyleRewriter && !this.detector?.hasTailwind) {
        const handled = await this.tryInlineStyleWrite(edit, resolvedPath, line, col)
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
        })
        return
      }

      // Push to undo stack only after successful write
      if (this.undoStack) {
        this.undoStack.push({ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent })
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
      this.channel.send({ type: 'undo_status', status: 'failed', restoredFile: '', reason: err instanceof Error ? err.message : 'Undo failed' })
    }
  }

  private async _doUndo(): Promise<void> {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
    // Clear stale lastValues for the file being undone — the baseline
    // is no longer valid after undo restores previous content.
    const undoEntry = this.undoStack!.peekUndo()
    if (undoEntry) {
      for (const [key] of this.lastValues) {
        if (key.startsWith(undoEntry.filePath + ':')) {
          this.lastValues.delete(key)
        }
      }
    }

    const entry = this.undoStack!.peekUndo()
    if (!entry) {
      this.channel.send({ type: 'undo_status', status: 'failed', restoredFile: '', reason: 'Nothing to undo.' })
      return
    }

    // Cancel any pending/in-flight deferred writes for this file
    const cancelledIds = this.deferredWriter?.cancelForFile(entry.filePath) ?? []
    this.sendDeferredStatus(cancelledIds, 'cancelled', 'Cancelled by undo')

    await this.withFileLock(entry.filePath, async () => {
      const current = this.undoStack!.peekUndo()
      if (!current || current.id !== entry.id) return

      if (this.readFile) {
        const fileContent = await this.readFile(current.filePath)
        if (fileContent !== current.currentContent) {
          this.undoStack!.removeStaleEntry(current.id)
          this.channel.send({ type: 'undo_status', status: 'failed', restoredFile: relative(this.projectRoot, current.filePath), reason: 'File was modified outside cortex. Undo not available for this change.' })
          return
        }
      }

      await this.writeFile({ kind: 'undo', filePath: current.filePath, content: current.previousContent })
      this.undoStack!.undo()
      this.channel.send({ type: 'undo_status', status: 'done', restoredFile: relative(this.projectRoot, current.filePath) })
    })
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
      this.channel.send({ type: 'redo_status', status: 'failed', restoredFile: '', reason: err instanceof Error ? err.message : 'Redo failed' })
    }
  }

  private async _doRedo(): Promise<void> {
    // Clear stale lastValues for the file being redone
    const redoEntry = this.undoStack!.peekRedo()
    if (redoEntry) {
      for (const [key] of this.lastValues) {
        if (key.startsWith(redoEntry.filePath + ':')) {
          this.lastValues.delete(key)
        }
      }
    }

    const entry = this.undoStack!.peekRedo()
    if (!entry) {
      this.channel.send({ type: 'redo_status', status: 'failed', restoredFile: '', reason: 'Nothing to redo.' })
      return
    }

    // Cancel any pending/in-flight deferred writes for this file
    const cancelledIds = this.deferredWriter?.cancelForFile(entry.filePath) ?? []
    this.sendDeferredStatus(cancelledIds, 'cancelled', 'Cancelled by redo')

    await this.withFileLock(entry.filePath, async () => {
      if (this.readFile) {
        const fileContent = await this.readFile(entry.filePath)
        if (fileContent !== entry.previousContent) {
          this.undoStack!.clear()
          this.channel.send({ type: 'redo_status', status: 'failed', restoredFile: relative(this.projectRoot, entry.filePath), reason: 'File was modified outside cortex. Redo not available.' })
          return
        }
      }

      const result = this.undoStack!.redo()
      if (!result) return
      await this.writeFile({ kind: 'redo', filePath: result.filePath, content: result.content })
      this.channel.send({ type: 'redo_status', status: 'done', restoredFile: relative(this.projectRoot, result.filePath) })
    })
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
      })
      return
    }

    if (this.undoStack) {
      this.undoStack.push({ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent })
    }

    this.verifier.trackEdit({
      editId: edit.editId,
      filePath: resolvedPath,
      expectedValue: edit.value,
      property: edit.property,
      kind: 'immediate',
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
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: `Write failed: ${err instanceof Error ? err.message : String(err)}` })
        return
      }
      if (this.undoStack) {
        this.undoStack.push({ filePath: resolvedCssPath, previousContent: result.oldContent, currentContent: result.newContent })
      }
      cssSuccess = true
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done', strategy: 'immediate' })
    })

    // Clean up conflicting inline styles on ALL shared elements when scope='all'.
    // Runs OUTSIDE the CSS lock — each JSX file acquires its own lock to prevent TOCTOU.
    // Uses instanceSources (all shared element locations) instead of just edit.source.
    if (cssSuccess && edit.scope === 'all' && this.inlineStyleRewriter) {
      const sources = edit.instanceSources?.length ? edit.instanceSources : [edit.source]
      for (const source of sources) {
        const parsed = this.parseSource(source)
        if (!parsed.ok) continue
        try {
          await this.withFileLock(parsed.resolvedPath, async () => {
            const cleanup = await this.inlineStyleRewriter!.removeProperty({
              filePath: parsed.resolvedPath, line: parsed.line, col: parsed.col, property: edit.property,
            })
            if (cleanup.success && cleanup.newContent !== cleanup.oldContent) {
              await this.writeFile({ kind: 'jsx-immediate', filePath: parsed.resolvedPath, content: cleanup.newContent })
              if (this.undoStack) {
                this.undoStack.push({ filePath: parsed.resolvedPath, previousContent: cleanup.oldContent, currentContent: cleanup.newContent })
              }
            }
          })
        } catch { /* cleanup failure is non-fatal — CSS edit already succeeded */ }
      }
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
        })
        handled = true // error handled — don't fall through to AI
        return
      }
      if (this.undoStack) {
        this.undoStack.push({ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent })
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
      if (batch.signal.reason !== 'superseded') {
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
        if (batch.signal.reason !== 'superseded') {
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
        if (batch.signal.reason !== 'superseded') {
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
          if (batch.signal.reason !== 'superseded') {
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
        if (batch.signal.reason !== 'superseded') {
          this.sendDeferredStatus(batch.editIds, 'cancelled', 'Cancelled')
        }
        return { success: false, reason: 'aborted' }
      }

      // Write file FIRST — side effects only after successful write
      try {
        await this.writeFile({ kind: 'deferred', filePath: batch.filePath, content: result.newContent })
      } catch (err) {
        const reason = `Write failed: ${err instanceof Error ? err.message : String(err)}`
        this.sendDeferredStatus(batch.editIds, 'failed', reason)
        return { success: false, reason }
      }

      // Push undo (only after successful write)
      if (this.undoStack) {
        this.undoStack.push({ filePath: batch.filePath, previousContent: result.oldContent, currentContent: result.newContent })
      }

      // Track HMR — use last change's property/value for verification.
      // editId must be the last one to correlate with lastChange (not the first).
      const lastChange = batch.changes[batch.changes.length - 1]!
      this.verifier.trackEdit({
        editId: batch.editIds[batch.editIds.length - 1]!,
        filePath: batch.filePath,
        expectedValue: lastChange.value,
        property: lastChange.property,
        kind: 'deferred',
      })

      // Send done for all coalesced editIds
      this.sendDeferredStatus(batch.editIds, 'done')

      return { success: true }
    })
  }

  private sendDeferredStatus(editIds: string[], status: 'done' | 'failed' | 'cancelled', reason?: string): void {
    for (const editId of editIds) {
      this.channel.send({
        type: 'edit_status',
        editId,
        status,
        strategy: 'deferred',
        ...(reason ? { reason } : {}),
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
