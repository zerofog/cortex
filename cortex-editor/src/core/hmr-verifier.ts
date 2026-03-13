import type { ServerChannel } from '../adapters/types.js'

export interface PendingEdit {
  editId: string
  filePath: string
  expectedValue: string
  property: string
}

/**
 * Tracks pending edits and matches them against HMR update events.
 *
 * When the edit pipeline writes a file, it registers a pending edit here.
 * When the adapter's onHMRUpdate fires, this verifier checks if any pending
 * edits match the updated files and sends hmr_verified to the browser.
 *
 * The browser then reads the computed value and decides whether to remove
 * the CSS override (match) or keep it (mismatch).
 */
export class HMRVerifier {
  private pending = new Map<string, PendingEdit>()
  private channel: ServerChannel

  constructor(channel: ServerChannel) {
    this.channel = channel
  }

  /** Register an edit that's waiting for HMR confirmation. */
  trackEdit(edit: PendingEdit): void {
    const key = `${edit.filePath}:${edit.property}`
    this.pending.set(key, edit)
  }

  /** Called when HMR fires. Checks if any pending edits match. */
  onHMRUpdate(updatedFiles: string[]): void {
    const fileSet = new Set(updatedFiles)

    for (const [key, edit] of this.pending) {
      if (fileSet.has(edit.filePath)) {
        this.channel.send({
          type: 'hmr_verified',
          editId: edit.editId,
          match: true,
          expected: edit.expectedValue,
        })
        this.pending.delete(key)
      }
    }
  }

  dispose(): void {
    this.pending.clear()
  }
}
