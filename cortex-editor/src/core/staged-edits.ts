import type { PendingEdit } from '../adapters/types.js'

/** Defensive cap on replaceAll input size — 2× browser MAX_ENTRIES (500).
 *  Token-gated upstream, so this is defense-in-depth against a misbehaving
 *  panel-mount loop or compromised browser script that might send a 100MB
 *  sync message and block the Node event loop. Generous enough to never
 *  reject legitimate traffic, narrow enough to bound the worst case. Not a
 *  protocol contract — purely a server-side safety bound. */
const MAX_REPLACE_ALL_SIZE = 1000

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
   * On duplicate composite keys within `edits`, the last duplicate's value
   * wins (Map.set overwrites). The browser-side staging buffer dedupes
   * upstream via the same composite key, so duplicates here are not expected
   * in practice.
   *
   * Inputs exceeding MAX_REPLACE_ALL_SIZE are rejected with a console.warn;
   * cache state is left unchanged so a malformed message can't wipe a
   * healthy cache.
   */
  replaceAll(edits: readonly PendingEdit[]): void {
    if (edits.length > MAX_REPLACE_ALL_SIZE) {
      console.warn(
        `[cortex] StagedEditsCache.replaceAll rejected: ${edits.length} entries exceeds defensive cap ${MAX_REPLACE_ALL_SIZE}`,
      )
      return
    }
    this.store.clear()
    for (const edit of edits) {
      this.store.set(compositeKey(edit), snapshot(edit))
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
