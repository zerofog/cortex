import type { PendingEdit } from '../adapters/types.js'

/** Composite key for last-write-wins deduplication — matches browser hook semantics. */
function compositeKey(edit: PendingEdit): string {
  return `${edit.source}\0${edit.property}\0${edit.pseudo ?? ''}`
}

/** Defensive snapshot of a PendingEdit — callers mutating the returned object
 *  cannot affect the cache's internal state. */
function snapshot(edit: PendingEdit): PendingEdit {
  const copy: PendingEdit = { ...edit }
  if (edit.instanceSources !== undefined) {
    copy.instanceSources = [...edit.instanceSources]
  }
  return copy
}

/**
 * StagedEditsCache — server-side (Process 2) mirror of the browser's
 * useEditStagingBuffer. Receives one-way sync messages from the browser and
 * is read by MCP tool calls in T2.
 *
 * - last-write-wins by composite key `${source}\0${property}\0${pseudo ?? ''}`
 * - insertion order preserved (Map iteration order)
 * - defensive-copy on every read (snapshot helper)
 */
export class StagedEditsCache {
  private readonly store = new Map<string, PendingEdit>()

  /**
   * Append or update an edit using last-write-wins semantics.
   * Re-inserts to the end of the Map when the key already exists,
   * matching browser hook behavior.
   */
  append(edit: PendingEdit): void {
    const key = compositeKey(edit)
    if (this.store.has(key)) {
      this.store.delete(key)
    }
    this.store.set(key, snapshot(edit))
  }

  /**
   * Remove entries by intentId. Iterates the store to find all entries
   * with a matching intentId (there should be exactly one per intentId,
   * since intentIds are UUIDs). Idempotent — re-removing a gone id is a no-op.
   */
  remove(intentIds: readonly string[]): void {
    if (intentIds.length === 0) return
    const idSet = new Set(intentIds)
    const toDelete: string[] = []
    for (const [key, edit] of this.store.entries()) {
      if (idSet.has(edit.intentId)) toDelete.push(key)
    }
    for (const key of toDelete) this.store.delete(key)
  }

  /**
   * Replace the entire cache with a new list of edits. Used for full-sync
   * on Panel mount so the server cache catches up with browser-canonical state.
   * Last-write-wins semantics apply within the provided list.
   */
  replaceAll(edits: readonly PendingEdit[]): void {
    this.store.clear()
    for (const edit of edits) {
      const key = compositeKey(edit)
      // Last-write-wins: if the input list has duplicates, last one wins.
      if (this.store.has(key)) this.store.delete(key)
      this.store.set(key, snapshot(edit))
    }
  }

  /** Empty the cache. */
  clear(): void {
    this.store.clear()
  }

  /** Return all entries in insertion order. Defensive copy — safe to mutate. */
  list(): PendingEdit[] {
    return Array.from(this.store.values()).map(snapshot)
  }

  /** Return a single entry by intentId, or null if not found. */
  getById(intentId: string): PendingEdit | null {
    for (const edit of this.store.values()) {
      if (edit.intentId === intentId) return snapshot(edit)
    }
    return null
  }

  /** Current number of entries. */
  size(): number {
    return this.store.size
  }
}
