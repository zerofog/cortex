/**
 * DeferredWriter — per-element coalescing + cancellation for CSS property edits.
 *
 * Business logic: When a user drags a slider or tweaks properties in the visual
 * editor, many rapid-fire changes hit the same element. Without coalescing, each
 * keystroke would trigger a separate AI source-rewrite call — expensive, slow,
 * and race-prone. DeferredWriter batches all property changes for a given element
 * (keyed by filePath:line:col) into a single write request after a coalescing
 * window, and aborts any superseded in-flight request so we never apply stale edits.
 */

export interface DeferredEdit {
  editId: string
  filePath: string
  line: number
  col: number
  property: string
  value: string
  failureReason: string
}

export interface BatchedWriteRequest {
  filePath: string
  line: number
  col: number
  changes: Array<{ property: string; value: string }>
  editIds: string[]
  failureReason: string
  signal: AbortSignal
}

export type WriteFn = (request: BatchedWriteRequest) => Promise<{ success: boolean; newContent?: string; reason?: string }>

export interface DeferredWriterOptions {
  coalescingMs: number
  writeFn: WriteFn
}

interface PendingEntry {
  filePath: string
  line: number
  col: number
  editIds: string[]
  failureReason: string
  /** property -> { property, value }. Last write wins via Map overwrite. */
  changes: Map<string, { property: string; value: string }>
  timer: ReturnType<typeof setTimeout>
}

/** Max distinct properties per element in a single batch. Prevents prompt overflow. */
const MAX_CHANGES_PER_BATCH = 20

/** Max concurrent AI calls. Prevents overwhelming the API with parallel requests. */
const MAX_CONCURRENT_AI_CALLS = 2

export class DeferredWriter {
  private readonly coalescingMs: number
  private readonly writeFn: WriteFn
  private readonly pending = new Map<string, PendingEntry>()
  private readonly inflight = new Map<string, AbortController>()
  private disposed = false

  constructor(opts: DeferredWriterOptions) {
    this.coalescingMs = opts.coalescingMs
    this.writeFn = opts.writeFn
  }

  /** Enqueue a property change. Coalesces with other pending changes for the same element. */
  enqueue(edit: DeferredEdit): void {
    if (this.disposed) return

    const key = `${edit.filePath}:${edit.line}:${edit.col}`

    // Abort any in-flight request for this element — new data supersedes it.
    // Use 'superseded' reason so executeDeferredBatch can distinguish from
    // user-initiated cancellation (undo/redo) and skip sending error status.
    const existingInflight = this.inflight.get(key)
    if (existingInflight) {
      existingInflight.abort('superseded')
      this.inflight.delete(key)
    }

    const existing = this.pending.get(key)
    if (existing) {
      // Reset the coalescing timer — we got more data, wait again
      clearTimeout(existing.timer)
      // Always allow updates to existing properties (last-write-wins);
      // only block genuinely new properties beyond the cap
      if (existing.changes.has(edit.property) || existing.changes.size < MAX_CHANGES_PER_BATCH) {
        existing.changes.set(edit.property, { property: edit.property, value: edit.value })
      }
      existing.editIds.push(edit.editId)
      existing.failureReason = edit.failureReason
      existing.timer = setTimeout(() => { this.flush(key) }, this.coalescingMs)
    } else {
      const changes = new Map<string, { property: string; value: string }>()
      changes.set(edit.property, { property: edit.property, value: edit.value })
      const timer = setTimeout(() => { this.flush(key) }, this.coalescingMs)
      this.pending.set(key, {
        filePath: edit.filePath,
        line: edit.line,
        col: edit.col,
        editIds: [edit.editId],
        failureReason: edit.failureReason,
        changes,
        timer,
      })
    }
  }

  /** Flush a pending entry: remove from pending, create AbortController, call writeFn. */
  private flush(key: string): void {
    if (this.disposed) return
    if (this.inflight.size >= MAX_CONCURRENT_AI_CALLS) {
      // Re-schedule — an inflight slot will free up soon
      const entry = this.pending.get(key)
      if (entry) {
        clearTimeout(entry.timer)
        entry.timer = setTimeout(() => this.flush(key), 100)
      }
      return
    }
    const entry = this.pending.get(key)
    if (!entry) return
    this.pending.delete(key)

    const ac = new AbortController()
    this.inflight.set(key, ac)

    const request: BatchedWriteRequest = {
      filePath: entry.filePath,
      line: entry.line,
      col: entry.col,
      changes: Array.from(entry.changes.values()),
      editIds: entry.editIds,
      failureReason: entry.failureReason,
      signal: ac.signal,
    }

    // Fire-and-forget — caller observes results via writeFn's side effects
    this.writeFn(request).then((result) => {
      if (!result.success && result.reason !== 'aborted') {
        console.error('[cortex] DeferredWriter writeFn returned failure for %s: %s', key, result.reason)
      }
    }).catch((err) => {
      console.error('[cortex] DeferredWriter flush threw for %s:', key, err instanceof Error ? err.message : err)
    }).finally(() => {
      // Only clean up if this is still the current controller for this key
      if (this.inflight.get(key) === ac) {
        this.inflight.delete(key)
      }
    })
  }

  /** Cancel all pending and in-flight operations for a given file path.
   *  Used by undo/redo to prevent deferred writes from overwriting restored content.
   *  Returns the editIds of all cancelled pending entries so callers can send status. */
  cancelForFile(filePath: string): string[] {
    const cancelledIds: string[] = []
    for (const [key, entry] of this.pending) {
      if (entry.filePath === filePath) {
        clearTimeout(entry.timer)
        cancelledIds.push(...entry.editIds)
        this.pending.delete(key)
      }
    }
    const prefix = filePath + ':'
    for (const [key, controller] of this.inflight) {
      if (key.startsWith(prefix)) {
        controller.abort()
        this.inflight.delete(key)
      }
    }
    return cancelledIds
  }

  /** Tear down: clear all pending timers, abort all in-flight requests. */
  dispose(): void {
    this.disposed = true
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
    }
    this.pending.clear()
    for (const ac of this.inflight.values()) {
      ac.abort()
    }
    this.inflight.clear()
  }
}
