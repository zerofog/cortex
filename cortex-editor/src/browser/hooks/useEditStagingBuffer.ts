import { useCallback, useLayoutEffect, useRef } from 'preact/hooks'
import { cortexStorage } from '../persistence.js'
import { stripLineCol } from '../selection-metadata.js'

export interface PendingEdit {
  intentId: string
  source: string                          // file:line:col
  property: string
  value: string
  previousValue: string                   // captured at first touch
  pseudo?: '::before' | '::after'
  /** Maps to server CortexEdit.scope. 'instance' = this element only; 'all' = all sharing this class. */
  scope?: 'instance' | 'all'
  instanceSources?: string[]
  timestamp: number
}

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

export interface StagingBufferHandle {
  append: (edit: PendingEdit) => void     // last-write-wins by (source\0property\0pseudo)
  remove: (intentIds: string[]) => void
  list: () => PendingEdit[]
  clear: () => void
  size: () => number
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
  // Source format guard (file:line:col). Rejects `"` in the path so that even
  // if CSS.escape were ever bypassed, a malformed source can't smuggle a
  // closing quote into the attribute selector.
  if (!SOURCE_SHAPE.test(o.source)) return false
  // Optional fields: validate ONLY when present. The whole point of the
  // validator is to short-circuit corrupted localStorage to the [] fallback
  // before bad data flows into Apply. Accepting `pseudo: 'invalid'`,
  // `scope: 42`, or `instanceSources: 'oops'` would defeat that.
  if (o.pseudo !== undefined && o.pseudo !== '::before' && o.pseudo !== '::after') return false
  if (o.scope !== undefined && o.scope !== 'instance' && o.scope !== 'all') return false
  if (
    o.instanceSources !== undefined &&
    (!Array.isArray(o.instanceSources) || !o.instanceSources.every(s => typeof s === 'string'))
  ) {
    return false
  }
  return true
}

/** Type guard for an array of PendingEdit */
export function isPendingEditArray(v: unknown): v is PendingEdit[] {
  return Array.isArray(v) && v.every(isPendingEdit)
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
 * - stable handle: method identities never change across re-renders
 */
export default function useEditStagingBuffer(): StagingBufferHandle {
  const bufferRef = useRef<Map<string, PendingEdit>>(new Map())
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initRef = useRef(false)

  // Initialize from localStorage on first call (before useEffect so list() works immediately)
  if (!initRef.current) {
    initRef.current = true
    const stored = cortexStorage.get(STORAGE_KEY, [], isPendingEditArray)
    for (const edit of stored) {
      bufferRef.current.set(compositeKey(edit), edit)
    }
  }

  const persistNow = useCallback(() => {
    cortexStorage.set(STORAGE_KEY, Array.from(bufferRef.current.values()))
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
    if (bufferRef.current.size > MAX_ENTRIES) {
      const firstKey = bufferRef.current.keys().next().value!
      const evicted = bufferRef.current.get(firstKey)!
      bufferRef.current.delete(firstKey)
      console.warn(
        '[cortex] Staging buffer evicted oldest intent (max 500):',
        evicted.source,
        evicted.property,
      )
    }

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

    schedulePersist()
  }, [schedulePersist])

  const list = useCallback((): PendingEdit[] => {
    return Array.from(bufferRef.current.values())
  }, [])

  const clear = useCallback(() => {
    bufferRef.current.clear()
    schedulePersist()
  }, [schedulePersist])

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
        for (const el of document.querySelectorAll('[data-cortex-source]')) {
          const s = el.getAttribute('data-cortex-source')
          if (s !== null) elBySource.set(s, el)
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
  const handleRef = useRef<StagingBufferHandle>({
    append,
    remove,
    list,
    clear,
    size,
    reconcile,
  })

  return handleRef.current
}

export { useEditStagingBuffer }
