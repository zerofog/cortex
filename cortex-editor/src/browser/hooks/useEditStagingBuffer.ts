import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { cortexStorage } from '../persistence.js'
import { stripLineCol, deepQuerySelectorAll } from '../selection-metadata.js'
import { isPreviewSource } from '../../shared/preview-source.js'
import type { CortexChannel, PendingEdit } from '../../adapters/types.js'

// Re-export for backward compatibility — existing test imports rely on this.
export type { PendingEdit }

/**
 * Reads the source-of-truth value for a pending edit, bypassing any active
 * cortex CSS overrides. Production HMR wiring MUST pass an implementation that
 * temporarily detaches the override stylesheet (see
 * `CSSOverrideManager.readUnderlyingValue`) — otherwise getComputedStyle will
 * return cortex's own `!important` override value rather than the source value
 * that HMR re-applied, producing a 100% false-positive divergence rate during
 * active edits.
 */
export type ReadSourceValue = (
  el: Element,
  property: string,
  pseudo: '::before' | '::after' | null,
) => string

/**
 * Optional sync emitter passed to useEditStagingBuffer to mirror every
 * mutation to the server-side StagedEditsCache (Process 2). When undefined,
 * the hook operates as purely browser-canonical — backward-compat for tests
 * and scenarios without channel access.
 *
 * Wire-up in Panel.tsx is out of scope for T1; T2 will pass an implementation
 * that delegates to channel.send.
 */
export interface SyncEmitter {
  syncAdd(edit: PendingEdit): void
  syncRemove(intentIds: readonly string[]): void
  syncClear(): void
  syncFullState(edits: readonly PendingEdit[]): void
}

export interface StagingBufferHandle {
  append: (edit: PendingEdit) => void     // last-write-wins by (source\0property\0pseudo)
  remove: (intentIds: string[]) => void
  list: () => PendingEdit[]
  clear: () => void
  size: () => number
  /**
   * Monotonic mutation counter. Increments on every append/remove/clear.
   * Consumers (e.g. Panel.tsx drift reconcile useEffect) can add this to
   * their dep array to re-run when the buffer mutates — without subscribing
   * to unstable method references that change every render.
   */
  version: number
  /**
   * Re-evaluate previousValue against the live DOM for intents whose file is
   * in `changedFiles`. Returns intents whose resolved current value no longer
   * matches `previousValue.trim()`, plus intents whose element no longer
   * exists in DOM (file deleted/refactored).
   *
   * IMPORTANT: When the cortex CSSOverrideManager has active overrides on the
   * page, getComputedStyle() returns the override value, not the source
   * value. Production HMR wiring MUST pass a `readSourceValue` callback that
   * bypasses the override layer (e.g. delegating to
   * `CSSOverrideManager.readUnderlyingValue`). The default reader (used by
   * unit tests where no override layer is active) prefers
   * `element.style.getPropertyValue(prop)` (skipped for pseudo-element edits)
   * and falls back to `getComputedStyle(el, pseudo)`.
   *
   * Hook does NOT auto-subscribe to HMR. Wiring HMR → reconcile is deferred.
   */
  reconcile: (
    changedFiles: string[],
    readSourceValue?: ReadSourceValue,
  ) => { divergent: PendingEdit[] }
}

const MAX_ENTRIES = 500
const DEBOUNCE_MS = 150
const STORAGE_KEY = 'staging-buffer'

/** `path:line:col` shape — line/col must be digits, path must not contain a `"`
 *  (defense-in-depth alongside CSS.escape at the querySelector callsite). */
const SOURCE_SHAPE = /^[^"]+:\d+:\d+$/

/** Type guard for a single PendingEdit */
function isPendingEdit(v: unknown): v is PendingEdit {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (
    typeof o.intentId !== 'string' ||
    typeof o.source !== 'string' ||
    typeof o.property !== 'string' ||
    typeof o.value !== 'string' ||
    typeof o.previousValue !== 'string' ||
    typeof o.timestamp !== 'number'
  ) {
    return false
  }
  // Source format guard. Direct edits use file:line:col; unannotated preview
  // edits use a cortex-preview source key so Apply can route them to agent
  // resolution instead of dropping them during localStorage rehydration.
  if (!SOURCE_SHAPE.test(o.source) && !isPreviewSource(o.source)) return false
  // Optional fields: validate ONLY when present. The whole point of the
  // validator is to short-circuit corrupted localStorage to the [] fallback
  // before bad data flows into Apply. Accepting `pseudo: 'invalid'`,
  // `scope: 42`, or `instanceSources: 'oops'` would defeat that.
  if (o.pseudo !== undefined && o.pseudo !== '::before' && o.pseudo !== '::after') return false
  if (o.scope !== undefined && o.scope !== 'instance' && o.scope !== 'all') return false
  if (o.applyMode !== undefined && o.applyMode !== 'direct' && o.applyMode !== 'agent-resolve') return false
  if (o.sourceResolutionHint !== undefined) {
    if (typeof o.sourceResolutionHint !== 'object' || o.sourceResolutionHint === null) return false
    const hint = o.sourceResolutionHint as Record<string, unknown>
    if (
      typeof hint.tagName !== 'string' ||
      typeof hint.textPreview !== 'string' ||
      typeof hint.domSelector !== 'string'
    ) {
      return false
    }
    if (hint.className !== undefined && typeof hint.className !== 'string') return false
    if (hint.id !== undefined && typeof hint.id !== 'string') return false
  }
  if (
    o.instanceSources !== undefined &&
    (!Array.isArray(o.instanceSources) || !o.instanceSources.every(s => typeof s === 'string'))
  ) {
    return false
  }
  return true
}

/** Type guard for an array of PendingEdit (all-or-nothing — exported for tests
 *  that need to round-trip a known-valid buffer). The hook itself uses
 *  `isUnknownArray` + per-entry filtering on rehydration so one bad entry
 *  can't drop the whole buffer. */
export function isPendingEditArray(v: unknown): v is PendingEdit[] {
  return Array.isArray(v) && v.every(isPendingEdit)
}

/** Permissive array guard — used by hook rehydration. */
function isUnknownArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

/** Composite key for last-write-wins deduplication. */
function compositeKey(edit: PendingEdit): string {
  return `${edit.source}\0${edit.property}\0${edit.pseudo ?? ''}`
}

/** Default reader used when no `readSourceValue` callback is provided.
 *  Inline-style first (skipped for pseudo-elements, which have none), then
 *  getComputedStyle with the pseudo argument so pseudo-element edits query
 *  the pseudo's box rather than the host element. NOTE: this default does
 *  NOT bypass the cortex override layer — production callers must pass a
 *  reader that delegates to CSSOverrideManager.readUnderlyingValue. */
function defaultReadSourceValue(
  el: Element,
  property: string,
  pseudo: '::before' | '::after' | null,
): string {
  const inlineValue = pseudo
    ? ''
    : (el as HTMLElement).style?.getPropertyValue(property).trim() ?? ''
  if (inlineValue !== '') return inlineValue
  return getComputedStyle(el, pseudo ?? undefined).getPropertyValue(property).trim()
}

/**
 * useEditStagingBuffer — accumulates PendingEdit entries browser-side.
 *
 * - last-write-wins by (source\0property\0pseudo) composite key
 * - persisted to localStorage via cortexStorage, debounced ~150ms
 * - bounded at 500 entries (oldest evicted)
 * - stable method identities: append/remove/list/clear/size/reconcile are
 *   held in a useRef and never change across re-renders. The returned wrapper
 *   object itself is memoized via `useMemo([version])`, so its identity changes
 *   ONLY when the buffer mutates (version bumps) — not on every render. This
 *   lets consumer dep arrays like `useEffect(..., [buffer])` re-run only on
 *   real buffer changes. Methods destructured from the handle remain
 *   reference-stable across all renders.
 * - optional SyncEmitter: when provided, every mutation emits a sync message
 *   to the server-side StagedEditsCache (T1). Wire-up in Panel.tsx is T2.
 */
export default function useEditStagingBuffer(emitter?: SyncEmitter): StagingBufferHandle {
  const bufferRef = useRef<Map<string, PendingEdit>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initRef = useRef(false)
  // Stable ref to the emitter — avoids stale-closure issues inside useCallback.
  const emitterRef = useRef<SyncEmitter | undefined>(emitter)
  emitterRef.current = emitter
  // ZF0-1453 (post-Step-9.5): bump on every mutation so consumers reading
  // size()/list() in render re-evaluate after staged-edits-discard arrives.
  // Without this, bufferRef mutations (server-driven discards) don't cause
  // Panel to re-render and the Apply button stays at "Apply (N)" after the
  // buffer is server-side empty.
  // ZF0-1477: version is now exposed on StagingBufferHandle so Panel.tsx's
  // drift-reconcile useEffect can add it to the dep array and re-run when
  // the buffer mutates (not just when an HMR event fires).
  const [version, bumpVersion] = useState(0)
  const bumpRef = useRef(() => bumpVersion(v => v + 1))

  // Initialize from localStorage on first call (before useEffect so list() works immediately).
  // Per-entry filtering: a single corrupted entry can't nuke 499 valid ones.
  //
  // STRICT-MODE INVARIANT: `initRef.current = true` must be set BEFORE the
  // syncFullState emission below so React/Preact strict-mode's double-
  // invocation of the function body cannot re-enter this block and double-
  // emit. Do NOT move the assignment below the emission — that would break
  // the "exactly one full-sync per mount" contract that the server-side
  // StagedEditsCache.mergeFullSync relies on (a duplicate mergeFullSync
  // would be idempotent under newer-timestamp-wins, but the invariant is
  // the contract, not the cache's tolerance).
  if (!initRef.current) {
    initRef.current = true
    const stored = cortexStorage.get(STORAGE_KEY, [], isUnknownArray)
    let dropped = 0
    for (const entry of stored) {
      if (isPendingEdit(entry)) {
        bufferRef.current.set(compositeKey(entry), entry)
      } else {
        dropped++
      }
    }
    if (dropped > 0) {
      console.warn(
        `[cortex] Staging buffer rehydrated with ${bufferRef.current.size} valid entries; ${dropped} dropped (schema mismatch)`,
      )
    }
    // Full-sync on Panel mount: if there are rehydrated entries and an emitter
    // is provided, fire syncFullState once so the server cache catches up.
    if (bufferRef.current.size > 0 && emitter) {
      emitter.syncFullState(Array.from(bufferRef.current.values()))
    }
  }

  // Tracks whether we've already warned about a persistence failure this session.
  // cortexStorage.set returns false on quota / private-mode failure; we surface
  // the first failure but suppress repeats to avoid log spam on every debounce.
  const persistFailedRef = useRef(false)

  const persistNow = useCallback(() => {
    const ok = cortexStorage.set(STORAGE_KEY, Array.from(bufferRef.current.values()))
    if (!ok && !persistFailedRef.current) {
      persistFailedRef.current = true
      console.warn(
        '[cortex] Staging buffer persistence failed (localStorage quota or private mode); pending edits live only in memory and will be lost on reload.',
      )
    } else if (ok && persistFailedRef.current) {
      // Recovered — clear the flag so a future failure surfaces again.
      persistFailedRef.current = false
    }
  }, [])

  const schedulePersist = useCallback(() => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      persistNow()
    }, DEBOUNCE_MS)
  }, [persistNow])

  const flush = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      persistNow()
    }
  }, [persistNow])

  // Cleanup on unmount: flush pending write + clear timer.
  // useLayoutEffect runs synchronously during unmount (before useEffect cleanups),
  // ensuring we don't lose the last append even in test environments where Preact's
  // act() may not flush useEffect cleanups synchronously.
  useLayoutEffect(() => {
    return () => {
      flush()
    }
  }, [flush])

  const append = useCallback((edit: PendingEdit) => {
    const key = compositeKey(edit)
    if (bufferRef.current.has(key)) {
      // Update in-place (last-write-wins) — remove and re-insert to keep insertion order.
      bufferRef.current.delete(key)
    }

    bufferRef.current.set(key, edit)

    // Evict oldest entry if over limit. Surface so a future Apply UI can
    // render a "buffer full — older edits dropped" notice; the warning is
    // intentionally low-key because the buffer continues to function.
    let evictedIntentId: string | null = null
    if (bufferRef.current.size > MAX_ENTRIES) {
      const oldest = bufferRef.current.entries().next()
      if (!oldest.done) {
        const [firstKey, evicted] = oldest.value
        bufferRef.current.delete(firstKey)
        evictedIntentId = evicted.intentId
        console.warn(
          '[cortex] Staging buffer evicted oldest intent (max 500):',
          evicted.source,
          evicted.property,
        )
      }
    }

    // Emit sync AFTER in-memory map updated, BEFORE localStorage persist.
    // Eviction IS a mutation: emit syncRemove so the server cache stays in
    // lockstep with the bounded browser buffer. Without this, the server
    // cache grows unbounded on long sessions while the browser caps at 500.
    emitterRef.current?.syncAdd(edit)
    if (evictedIntentId !== null) {
      emitterRef.current?.syncRemove([evictedIntentId])
    }

    bumpRef.current()
    schedulePersist()
  }, [schedulePersist])

  const remove = useCallback((intentIds: string[]) => {
    const idSet = new Set(intentIds)
    const toDeleteKeys: string[] = []

    for (const [key, edit] of bufferRef.current.entries()) {
      if (idSet.has(edit.intentId)) toDeleteKeys.push(key)
    }

    for (const key of toDeleteKeys) {
      bufferRef.current.delete(key)
    }

    // Emit sync AFTER in-memory map updated, BEFORE localStorage persist.
    emitterRef.current?.syncRemove(intentIds)

    if (toDeleteKeys.length > 0) bumpRef.current()
    schedulePersist()
  }, [schedulePersist])

  const list = useCallback((): PendingEdit[] => {
    return Array.from(bufferRef.current.values())
  }, [])

  const clear = useCallback(() => {
    bufferRef.current.clear()
    // Synchronous persist — Apply (ZF0-1452) calls clear() after a successful
    // flush; a 150ms debounce window means a reload-within-window resurrects
    // the cleared entries. Cancel any pending debounced write first.
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    // Emit sync AFTER in-memory map updated (clear()), BEFORE persist.
    emitterRef.current?.syncClear()

    bumpRef.current()
    persistNow()
  }, [persistNow])

  const size = useCallback((): number => {
    return bufferRef.current.size
  }, [])

  const reconcile = useCallback((
    changedFiles: string[],
    readSourceValue: ReadSourceValue = defaultReadSourceValue,
  ): { divergent: PendingEdit[] } => {
    if (changedFiles.length === 0) return { divergent: [] }

    const changedSet = new Set(changedFiles)
    const divergent: PendingEdit[] = []

    // Single tree-walk to build a source→element index, then O(1) lookup per
    // intent. Avoids O(intents × DOM) querySelector fan-out when an HMR event
    // touches a hot file referenced by hundreds of intents.
    let elBySource: Map<string, Element> | null = null

    for (const edit of bufferRef.current.values()) {
      if (!changedSet.has(stripLineCol(edit.source))) continue

      if (elBySource === null) {
        elBySource = new Map()
        // Use deepQuerySelectorAll (not document.querySelectorAll) so reconcile
        // sees elements inside open shadow roots — web-component apps (Lit,
        // Stencil, Shoelace) place data-cortex-source inside shadow trees.
        // Bare flat queries miss them and falsely flag them as "element
        // deleted" (file deleted/refactored), producing user-hostile divergence
        // cards. Mirrors the existing selection-resolution shadow-pierce path.
        // First-seen wins on duplicate sources. With `set` semantics, two
        // mounted instances sharing a `data-cortex-source` (legitimate when
        // scope='all' targets sibling instances; or accidental during HMR
        // re-render where old + new trees coexist for a tick) would have
        // the LAST element clobber the first, and `last` is non-deterministic
        // in document/insertion order across browsers and shadow trees.
        // First-seen + traversal order produces stable behavior.
        for (const el of deepQuerySelectorAll('[data-cortex-source]')) {
          const s = el.getAttribute('data-cortex-source')
          if (s !== null && !elBySource.has(s)) elBySource.set(s, el)
        }
      }

      const el = elBySource.get(edit.source)
      if (!el) {
        // Element does not exist — file deleted/refactored
        divergent.push(edit)
        continue
      }

      const pseudo = edit.pseudo ?? null
      const currentValue = readSourceValue(el, edit.property, pseudo).trim()

      if (currentValue !== edit.previousValue.trim()) {
        divergent.push(edit)
      }
    }

    return { divergent }
  }, [])

  // Stable handle — every method is `useCallback([...])` over stable refs, so
  // their identities never change after first render. The ref initializer fires
  // once; no per-render reassignment needed.
  // NOTE: `version` is NOT stored in handleRef because it is a reactive value
  // from useState — it must come from the current render's closure so that dep
  // arrays in consumers (e.g. Panel.tsx drift reconcile useEffect) see the
  // latest value.
  const handleRef = useRef<Omit<StagingBufferHandle, 'version'>>({
    append,
    remove,
    list,
    clear,
    size,
    reconcile,
  })

  // Memoize the return wrapper on `version` so consumers using the FULL handle
  // in dep arrays (e.g. `useEffect(..., [channel, buffer])` in Panel.tsx:320,
  // 347, 708) only re-run when the buffer actually mutates — not on every
  // render. Without this useMemo, the spread allocates a new object every
  // render, breaking memoization on every consumer of the handle.
  return useMemo(() => ({ ...handleRef.current, version }), [version])
}

export { useEditStagingBuffer }

/**
 * createPanelSyncEmitter — wires a SyncEmitter to a CortexChannel by
 * delegating each method to channel.send with the corresponding
 * BrowserToServer message shape.
 *
 * Token stamping: channel.send (both Vite and WebSocket variants) auto-stamps
 * the captured token via `{ ...msg, token: capturedToken }` (see
 * src/browser/channel.ts). The empty string passed here is overwritten — it
 * exists only to satisfy the BrowserToServer type union which marks `token`
 * as required on the staged-edit-* variants.
 *
 * Array conversion: BrowserToServer variants spec mutable arrays
 * (`string[]`, `PendingEdit[]`); the SyncEmitter interface uses `readonly`.
 * Spread the readonly inputs into fresh mutable arrays at the boundary.
 *
 * Extracted as a named export so its wiring shape is unit-testable without
 * mounting Panel.tsx — the test file imports this directly. */
export function createPanelSyncEmitter(channel: CortexChannel): SyncEmitter {
  return {
    syncAdd: (edit) => channel.send({ type: 'staged-edit-add', edit, token: '' }),
    syncRemove: (intentIds) => channel.send({ type: 'staged-edit-remove', intentIds: [...intentIds], token: '' }),
    syncClear: () => channel.send({ type: 'staged-edit-clear', token: '' }),
    syncFullState: (edits) => channel.send({ type: 'staged-edits-sync', edits: [...edits], token: '' }),
  }
}
