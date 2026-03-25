import { resolve, relative, sep } from 'path'
import type { ServerChannel } from '../adapters/types.js'
import type { TailwindResolver } from './tailwind-resolver.js'
import type { TailwindRewriter } from './rewriter/tailwind.js'
import type { HMRVerifier } from './hmr-verifier.js'
import type { CSSModulesRewriter } from './rewriter/css-modules.js'
import type { RuntimeCSSResolver } from './rewriter/runtime-resolver.js'
import type { UndoStack } from './session/undo-stack.js'

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
}

export interface EditPipelineOptions {
  channel: ServerChannel
  resolver: TailwindResolver
  rewriter: TailwindRewriter
  verifier: HMRVerifier
  /** Injected for testability. Default: fs.writeFile */
  writeFile: (path: string, content: string) => Promise<void>
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
}

const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%+*]+$/
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
  private tailwindFailNotified = false
  private readonly channel: ServerChannel
  private readonly resolver: TailwindResolver
  private readonly rewriter: TailwindRewriter
  private readonly verifier: HMRVerifier
  private readonly writeFile: (path: string, content: string) => Promise<void>
  private readonly projectRoot: string
  private readonly debounceMs: number
  private readonly cssModulesRewriter?: CSSModulesRewriter
  private readonly detector?: { hasCSSModules: boolean; hasTailwind: boolean }
  private readonly runtimeResolver?: RuntimeCSSResolver
  private readonly undoStack?: UndoStack
  private readonly readFile?: (path: string) => Promise<string>
  private undoLock = Promise.resolve()
  private disposed = false

  constructor(options: EditPipelineOptions) {
    this.channel = options.channel
    this.resolver = options.resolver
    this.rewriter = options.rewriter
    this.verifier = options.verifier
    this.writeFile = options.writeFile
    this.projectRoot = resolve(options.projectRoot)
    this.debounceMs = options.debounceMs ?? 400
    this.cssModulesRewriter = options.cssModulesRewriter
    this.detector = options.detector
    this.runtimeResolver = options.runtimeResolver
    this.undoStack = options.undoStack
    this.readFile = options.readFile
  }

  handleEdit(edit: EditRequest): void {
    if (this.disposed) return

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

  private async executeEdit(edit: EditRequest, previousValue: string | undefined): Promise<void> {
    // Parse source as "filePath:line:col" — parse from right to handle
    // Windows drive letters (e.g. "C:\Users\foo\App.tsx:2:10")
    const lastColon = edit.source.lastIndexOf(':')
    const secondLastColon = edit.source.lastIndexOf(':', lastColon - 1)
    if (lastColon === -1 || secondLastColon === -1 || secondLastColon === 0) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: `Invalid source format: ${edit.source}`,
      })
      return
    }

    const filePath = edit.source.slice(0, secondLastColon)
    const lineStr = edit.source.slice(secondLastColon + 1, lastColon)
    const colStr = edit.source.slice(lastColon + 1)

    const line = parseInt(lineStr, 10)
    const col = parseInt(colStr, 10)
    if (Number.isNaN(line) || Number.isNaN(col)) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: `Invalid line/col in source: ${edit.source}`,
      })
      return
    }

    const resolvedPath = resolve(this.projectRoot, filePath)
    if (!this.isInsideProjectRoot(resolvedPath)) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'File path outside project root',
      })
      return
    }

    // Server-side CSS property + value validation
    if (!isValidCSSProperty(edit.property)) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS property name' })
      return
    }
    if (!isValidCSSValue(edit.value)) {
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Invalid CSS value' })
      return
    }

    // Layer 1: CSS Modules routing via annotation
    if (edit.cssMapping && this.cssModulesRewriter) {
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

    // Layer 2: Runtime CSS resolver (fallback for unannotated elements when CSS Modules detected)
    if (!edit.cssMapping && this.detector?.hasCSSModules && this.runtimeResolver && this.cssModulesRewriter) {
      const resolved = await this.runtimeResolver.resolve(edit.source, this.projectRoot)
      if (resolved && this.isInsideProjectRoot(resolved.cssFilePath)) {
        await this.commitCSSModulesRewrite(edit, resolved.cssFilePath, resolved.selector)
        return
      }
      // CSS Modules-only project → don't fall through to Tailwind
      if (!this.detector.hasTailwind) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: 'Could not resolve CSS module mapping for this element. Connect Claude Code for AI-assisted editing.' })
        return
      }
    }

    // Layer 3: Tailwind path
    const newToken = this.resolver.findClass(edit.property, edit.value)
    const oldToken = previousValue ? this.resolver.findClass(edit.property, previousValue) : null

    if (!newToken || !oldToken) {
      // Only notify once per session to avoid error flood on every property change
      if (!this.tailwindFailNotified) {
        this.tailwindFailNotified = true
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: 'Tailwind class editing not available for this project. Connect Claude Code for AI-assisted editing.',
        })
      }
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
        this.channel.send({
          type: 'edit_status',
          editId: edit.editId,
          status: 'failed',
          reason: result.reason,
        })
        return
      }

      // Push to undo stack
      if (this.undoStack) {
        this.undoStack.push({ filePath: resolvedPath, previousContent: result.oldContent, currentContent: result.newContent })
      }

      // Track HMR BEFORE write — HMR may fire immediately after fs write
      this.verifier.trackEdit({
        editId: edit.editId,
        filePath: resolvedPath,
        expectedValue: edit.value,
        property: edit.property,
      })

      await this.writeFile(resolvedPath, result.newContent)

      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'done',
        newToken,
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

    const entry = this.undoStack!.peekUndo()
    if (!entry) return

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

      this.verifier.trackEdit({ editId: `undo-${current.id}`, filePath: current.filePath, expectedValue: '', property: '__undo__' })
      await this.writeFile(current.filePath, current.previousContent)
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
    const entry = this.undoStack!.peekRedo()
    if (!entry) return

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
      this.verifier.trackEdit({ editId: `redo-${entry.id}`, filePath: result.filePath, expectedValue: '', property: '__redo__' })
      await this.writeFile(result.filePath, result.content)
      this.channel.send({ type: 'redo_status', status: 'done', restoredFile: relative(this.projectRoot, result.filePath) })
    })
  }

  private isInsideProjectRoot(filePath: string): boolean {
    return filePath === this.projectRoot || filePath.startsWith(this.projectRoot + sep)
  }

  private async commitCSSModulesRewrite(edit: EditRequest, resolvedCssPath: string, selector: string): Promise<void> {
    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })
    await this.withFileLock(resolvedCssPath, async () => {
      const result = await this.cssModulesRewriter!.rewrite({
        cssFilePath: resolvedCssPath,
        selector,
        property: edit.property,
        newValue: edit.value,
      })
      if (!result.success) {
        this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'failed', reason: result.reason })
        return
      }
      if (this.undoStack) {
        this.undoStack.push({ filePath: resolvedCssPath, previousContent: result.oldContent, currentContent: result.newContent })
      }
      this.verifier.trackEdit({ editId: edit.editId, filePath: resolvedCssPath, expectedValue: edit.value, property: edit.property })
      await this.writeFile(resolvedCssPath, result.newContent)
      this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done' })
    })
  }

  private async withFileLock(filePath: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.fileLocks.get(filePath) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.fileLocks.set(filePath, next)
    try {
      await next
    } finally {
      if (this.fileLocks.get(filePath) === next) {
        this.fileLocks.delete(filePath)
      }
    }
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
  }
}
