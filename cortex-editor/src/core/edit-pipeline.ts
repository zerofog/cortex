import { resolve } from 'path'
import type { ServerChannel } from '../adapters/types.js'
import type { TailwindResolver } from './tailwind-resolver.js'
import type { TailwindRewriter } from './rewriter/tailwind.js'
import type { HMRVerifier } from './hmr-verifier.js'

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
  private readonly channel: ServerChannel
  private readonly resolver: TailwindResolver
  private readonly rewriter: TailwindRewriter
  private readonly verifier: HMRVerifier
  private readonly writeFile: (path: string, content: string) => Promise<void>
  private readonly projectRoot: string
  private readonly debounceMs: number
  private disposed = false

  constructor(options: EditPipelineOptions) {
    this.channel = options.channel
    this.resolver = options.resolver
    this.rewriter = options.rewriter
    this.verifier = options.verifier
    this.writeFile = options.writeFile
    this.projectRoot = resolve(options.projectRoot)
    this.debounceMs = options.debounceMs ?? 400
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
          console.warn('[cortex] Edit pipeline error:', err instanceof Error ? err.message : err)
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

    // Prevent path traversal — resolved file must be within project root
    const resolvedPath = resolve(filePath)
    if (!resolvedPath.startsWith(this.projectRoot)) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'File path outside project root',
      })
      return
    }

    this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'writing' })

    const newToken = this.resolver.findClass(edit.property, edit.value)
    const oldToken = previousValue ? this.resolver.findClass(edit.property, previousValue) : null

    if (!newToken || !oldToken) {
      this.channel.send({
        type: 'edit_status',
        editId: edit.editId,
        status: 'failed',
        reason: 'Cannot resolve Tailwind class — AI path required',
      })
      return
    }

    const result = await this.rewriter.rewrite({
      filePath: resolvedPath,
      line: parseInt(lineStr, 10),
      col: parseInt(colStr, 10),
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

    await this.writeFile(resolvedPath, result.newContent)

    this.verifier.trackEdit({
      editId: edit.editId,
      filePath: resolvedPath,
      expectedValue: edit.value,
      property: edit.property,
    })

    this.channel.send({
      type: 'edit_status',
      editId: edit.editId,
      status: 'done',
      newToken,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.lastValues.clear()
  }
}
