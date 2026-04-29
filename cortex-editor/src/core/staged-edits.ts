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

// ---------------------------------------------------------------------------
// applyEditsCore — pure helper used by handleRPC.applyEdits in vite.ts.
//
// Lives here (not in vite.ts) because it's a cache-helper with zero
// adapter-specific dependencies — it operates on a structural `cache` shape
// and an array of intent IDs. Co-locating with StagedEditsCache keeps the
// layering clean (tests in `tests/cli/` import from `core/`, not `adapters/`).
// ---------------------------------------------------------------------------

/** Per-id result item produced by applyEditsCore. */
export type ApplyEditResult =
  | { intentId: string; status: 'needs-source-edit'; intent: PendingEdit; reason: string }
  | { intentId: string; status: 'failed'; error: string }

/** Build the per-id result list for cortex_apply_edits.
 *
 *  ZF0-1464 deferral: production routes ALL found intents to Claude's Edit tool
 *  via 'needs-source-edit' (no deterministic-apply path yet). Missing intents
 *  return failed-not-found. Input order is preserved.
 *
 *  Why no deterministic-apply path here: EditPipeline.handleEdit() returns
 *  void and communicates results back via channel.send({ type: 'edit_status',
 *  ... }) asynchronously. There is no synchronous return-value API for
 *  "applied vs needs-source-edit", so the RPC handler can't observe pipeline
 *  outcomes within a single response. ZF0-1464 tracks a promise-based
 *  EditPipeline API that returns { status: 'applied' | 'needs-source-edit'
 *  | 'failed' } directly, after which deterministic intents would route
 *  through it here.
 *
 *  Extracted as a pure function (cache passed in) so its contract can be
 *  unit-tested without booting a full CortexSession — the test file imports
 *  this directly rather than mocking the RPC handler. This avoids the
 *  shadow-copy hazard (cortex CLAUDE.md test rule #1) for criterion 3 of
 *  ZF0-1452. */
export function applyEditsCore(
  cache: { getById(id: string): PendingEdit | null },
  intentIds: readonly string[],
): ApplyEditResult[] {
  return intentIds.map((intentId) => {
    const intent = cache.getById(intentId)
    if (!intent) {
      return { intentId, status: 'failed', error: 'intent not found' }
    }
    return {
      intentId,
      status: 'needs-source-edit',
      intent,
      reason: 'Apply via source edit: use the Edit tool on the file at intent.source to set the property to intent.value',
    }
  })
}
