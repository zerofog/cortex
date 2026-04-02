import type { EditKind, ServerChannel } from '../adapters/types.js'

export interface PendingEdit {
  editId: string
  filePath: string
  expectedValue: string
  property: string
  kind?: EditKind
}

interface PendingEntry extends PendingEdit {
  timestamp: number
}

const PENDING_TTL_MS = 30_000

/**
 * Tracks pending edits and matches them against HMR update events.
 *
 * When the edit pipeline writes a file, it registers a pending edit here.
 * When the adapter's onHMRUpdate fires, this verifier checks if any pending
 * edits match the updated files and sends hmr_verified to the browser.
 *
 * The browser then reads the computed value and decides whether to remove
 * the CSS override (match) or keep it (mismatch).
 *
 * Pending entries expire after 30s to prevent memory accumulation from
 * edits where HMR never fires (e.g., dev server disconnects).
 */
export class HMRVerifier {
  private pending = new Map<string, PendingEntry>()
  private channel: ServerChannel
  private disposed = false

  constructor(channel: ServerChannel) {
    this.channel = channel
  }

  /** Register an edit that's waiting for HMR confirmation. */
  trackEdit(edit: PendingEdit): void {
    if (this.disposed) return
    this.evictStale()
    const key = `${edit.filePath}:${edit.property}`
    this.pending.set(key, { ...edit, timestamp: Date.now() })
  }

  /** Called when HMR fires. Checks if any pending edits match. */
  onHMRUpdate(updatedFiles: string[]): void {
    if (this.disposed) return
    this.evictStale()
    const fileSet = new Set(updatedFiles)

    for (const [key, edit] of this.pending) {
      if (fileSet.has(edit.filePath)) {
        this.channel.send({
          type: 'hmr_verified',
          editId: edit.editId,
          match: true,
          expected: edit.expectedValue,
          kind: edit.kind,
        })
        this.pending.delete(key)
      }
    }
  }

  private evictStale(): void {
    const now = Date.now()
    for (const [key, entry] of this.pending) {
      if (now - entry.timestamp > PENDING_TTL_MS) {
        this.channel.send({
          type: 'hmr_verified',
          editId: entry.editId,
          match: false,
          expected: entry.expectedValue,
          kind: entry.kind,
        })
        this.pending.delete(key)
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pending.clear()
  }
}
