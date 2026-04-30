import type { PendingEdit } from '../adapters/types.js'

/** Defensive cap on mergeFullSync input size — 2× browser MAX_ENTRIES (500).
 *  Token-gated upstream, so this is defense-in-depth against a misbehaving
 *  panel-mount loop or compromised browser script that might send a 100MB
 *  sync message and block the Node event loop. Generous enough to never
 *  reject legitimate traffic, narrow enough to bound the worst case. Not a
 *  protocol contract — purely a server-side safety bound. */
const MAX_FULL_SYNC_SIZE = 1000

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
   * Merge a full-state sync from a browser canonical buffer into the
   * server-side cache. On composite-key conflict, keep whichever entry has
   * the higher (or equal) `timestamp` field. Empty input is a no-op (does
   * NOT wipe the cache).
   *
   * Multi-tab safety rationale: pre-merge semantics ("clear + set") wiped
   * the cache on every Panel mount, which silently corrupted state when
   * multiple tabs were open. Concrete failure: Tab A has 5 fresh staged
   * edits in the server cache; Tab B (3 OLDER edits in localStorage) opens
   * and mounts Panel → fires syncFullState([3-old]) → old replaceAll wiped
   * Tab A's 5 and installed Tab B's 3. Merge with timestamp preference is
   * the minimum viable fix: Tab B's stale localStorage cannot clobber Tab
   * A's newer edits, and an empty rehydration is a no-op. Reviewed in
   * ZF0-1452 Step 4 (3-of-3 reviewer convergence).
   *
   * Within `edits`, duplicate composite keys keep the last-seen entry
   * (Map.set overwrites — matches the browser hook's last-write-wins).
   * The browser staging buffer dedupes upstream, so duplicates within a
   * single payload are not expected in practice.
   *
   * Inputs exceeding MAX_FULL_SYNC_SIZE are rejected with a console.error;
   * cache state is left unchanged so a malformed message can't wipe a
   * healthy cache. Severity is `error` (not `warn`) because the browser-side
   * cap is 2× MAX_ENTRIES — an oversize payload arriving here means client
   * misbehavior or compromise, and the server cache is now silently divergent
   * from browser canonical until the next legitimate sync.
   */
  mergeFullSync(edits: readonly PendingEdit[]): void {
    if (edits.length > MAX_FULL_SYNC_SIZE) {
      console.error(
        `[cortex] StagedEditsCache.mergeFullSync rejected: ${edits.length} entries exceeds defensive cap ${MAX_FULL_SYNC_SIZE} — possible client misbehavior or compromise`,
      )
      return
    }
    for (const edit of edits) {
      const key = compositeKey(edit)
      const existing = this.store.get(key)
      // Keep the newer entry on conflict; ties go to the incoming entry
      // (matches the browser hook's "re-insert at end on append" semantics
      // for sub-millisecond edit replays).
      if (!existing || edit.timestamp >= existing.timestamp) {
        if (existing) this.store.delete(key)
        this.store.set(key, snapshot(edit))
      }
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
// isValidPendingEdit — server-side WS trust-boundary validation
//
// Bounds caps for shape + size validation. Defense-in-depth: TypeScript
// narrowing doesn't survive JSON-over-WS, and Zod runs only at the MCP
// boundary (handleRPC has a parallel WS entry). A compromised browser script
// with a valid token can otherwise OOM the dev server with a single 100MB
// `intent.value`. Caps are generous (legitimate edits are ~100 bytes); the
// goal is to bound worst-case allocation, not police normal traffic.
// ---------------------------------------------------------------------------

const MAX_INTENT_VALUE_BYTES = 4096
const MAX_INTENT_SOURCE_BYTES = 1024
const MAX_INTENT_ID_BYTES = 256
const MAX_INTENT_PROPERTY_BYTES = 256
const MAX_INTENT_INSTANCE_SOURCES = 100

/** Validate a PendingEdit at the WebSocket trust boundary. Both shape and
 *  per-field bounds. Returns false (does NOT throw) on any deviation; callers
 *  drop the message and log a warning. */
export function isValidPendingEdit(value: unknown): value is PendingEdit {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.intentId !== 'string' || v.intentId.length === 0 || v.intentId.length > MAX_INTENT_ID_BYTES) return false
  if (typeof v.source !== 'string' || v.source.length === 0 || v.source.length > MAX_INTENT_SOURCE_BYTES) return false
  if (typeof v.property !== 'string' || v.property.length === 0 || v.property.length > MAX_INTENT_PROPERTY_BYTES) return false
  if (typeof v.value !== 'string' || v.value.length > MAX_INTENT_VALUE_BYTES) return false
  if (typeof v.previousValue !== 'string' || v.previousValue.length > MAX_INTENT_VALUE_BYTES) return false
  // pseudo: optional, must be one of two literals if present. `null` is
  // explicitly rejected (some browser code paths send pseudo: null instead of
  // omitting the field — protocol contract is "omit if not pseudo").
  if (v.pseudo !== undefined && v.pseudo !== '::before' && v.pseudo !== '::after') return false
  if (v.scope !== undefined && v.scope !== 'instance' && v.scope !== 'all') return false
  if (v.instanceSources !== undefined) {
    if (!Array.isArray(v.instanceSources)) return false
    if (v.instanceSources.length > MAX_INTENT_INSTANCE_SOURCES) return false
    if (!v.instanceSources.every(s => typeof s === 'string' && s.length <= MAX_INTENT_SOURCE_BYTES)) return false
  }
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return false
  return true
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

// ---------------------------------------------------------------------------
// getIntentContext helpers — pure slicer + size guard, used by vite.ts
// handleRPC.getIntentContext.
//
// Extracted so the production contract (line ranges, clamp boundaries,
// size-cap error format) is unit-testable in isolation without mounting an
// MCP test rig. The vite.ts integration test that exercises these helpers
// makes envelope-only assertions (intentId echo, target line non-empty)
// because the slice contents and error format are pinned here.
// ---------------------------------------------------------------------------

/** Max file size readable by cortex_get_intent_context (2MB). Synchronous
 *  fs.readFileSync blocks the Vite Node event loop; capping at ~10× a
 *  generous source-file size keeps the read non-blocking even when a
 *  project has large generated artefacts (lockfiles, asset bundles, db
 *  dumps) under projectRoot. Files exceeding this are rejected before the
 *  read. Exported so the size-cap test can pin the exact threshold. */
export const MAX_INTENT_FILE_BYTES = 2 * 1024 * 1024

/** Pure slicer for getIntentContext: given file content and a 1-based line
 *  number, return ~10 lines before + target + ~10 lines after. Clamps to
 *  file boundaries so neither index can underflow or overflow. The returned
 *  `currentValue` is the target line text — AST-based property-value
 *  extraction would let currentValue distinguish the actual property value
 *  from surrounding JSX, but the line-text fallback is sufficient for the
 *  divergence-detection use case (criterion 8) and avoids pulling in a
 *  parser dependency. */
export function sliceIntentContext(
  fileContent: string,
  line: number,
): { before: string[]; target: string; after: string[]; currentValue: string } {
  const lines = fileContent.split('\n')
  const targetIdx = line - 1
  const beforeStart = Math.max(0, targetIdx - 10)
  const afterEnd = Math.min(lines.length - 1, targetIdx + 10)
  const targetLine = lines[targetIdx] ?? ''
  return {
    before: lines.slice(beforeStart, targetIdx),
    target: targetLine,
    after: lines.slice(targetIdx + 1, afterEnd + 1),
    currentValue: targetLine,
  }
}

/** Defensive size guard for getIntentContext file reads. Returns the
 *  structured rejection envelope when the file exceeds the cap; returns
 *  null when the read should proceed. Centralizes the error format so
 *  tests pin it without shadow-copying the message string. */
export function checkIntentFileSize(
  filePath: string,
  sizeBytes: number,
): { error: string } | null {
  if (sizeBytes > MAX_INTENT_FILE_BYTES) {
    return {
      error: `File too large for intent context: ${filePath} (${sizeBytes} bytes, max ${MAX_INTENT_FILE_BYTES})`,
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// parseIntentSource — `file:line:col` parser for PendingEdit.source
//
// Extracted from handleRPC.getIntentContext to make line-component validation
// directly unit-testable. isValidPendingEdit caps source length but does not
// parse format, so a value like `bogus:abc:1` can pass the WS gate and be
// cached. Callers must reject malformed sources before path resolution or
// fs access — `parseInt('abc', 10) → NaN`, and a NaN line index produces
// garbage slices in sliceIntentContext (Copilot review on PR #90).
// ---------------------------------------------------------------------------

export type ParseIntentSourceResult =
  | { ok: true; filePath: string; line: number }
  | { ok: false; error: string }

/** Parse `PendingEdit.source` (format `file:line:col`).
 *
 *  Splits on the LAST two colons so file paths with embedded colons (Windows
 *  drive letters, URL schemes) parse correctly. Validates that line is a
 *  positive integer; rejects NaN, 0, negative, and decimal values. column is
 *  not parsed because no current consumer reads it — adding it would be
 *  speculative scope. */
export function parseIntentSource(source: string): ParseIntentSourceResult {
  const lastColon = source.lastIndexOf(':')
  const secondLastColon = source.lastIndexOf(':', lastColon - 1)
  if (lastColon < 0 || secondLastColon < 0) {
    return { ok: false, error: `Malformed source: ${source}` }
  }
  const filePath = source.slice(0, secondLastColon)
  const line = parseInt(source.slice(secondLastColon + 1, lastColon), 10)
  if (!Number.isInteger(line) || line < 1) {
    return { ok: false, error: `Invalid line in source: ${source}` }
  }
  return { ok: true, filePath, line }
}
