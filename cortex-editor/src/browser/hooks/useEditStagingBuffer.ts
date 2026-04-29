import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { cortexStorage } from '../persistence.js'

export interface PendingEdit {
  intentId: string
  source: string                          // file:line:col
  property: string
  value: string
  previousValue: string                   // captured at first touch
  pseudo?: '::before' | '::after'
  scope?: 'one' | 'all'
  instanceSources?: string[]
  timestamp: number
}

export interface StagingBufferHandle {
  append: (edit: PendingEdit) => void     // last-write-wins by (source\0property\0pseudo)
  remove: (intentIds: string[]) => void
  list: () => PendingEdit[]
  clear: () => void
  size: () => number
  /**
   * Re-evaluate previousValue against current source for affected files.
   *
   * Browser-side has no direct file-source access, so this uses the live DOM.
   * For each PendingEdit whose file (source before the first ':') is in
   * `changedFiles`, we query `document.querySelector('[data-cortex-source="<source>"]')`.
   *
   * Divergence check: prefer `element.style.getPropertyValue(prop)` (inline style)
   * before falling back to `getComputedStyle(el).getPropertyValue(prop)` (cascade).
   * Inline style is more correct because HMR-reapplied styles show up there first,
   * and it is more testable in happy-dom where getComputedStyle returns '' for
   * dynamically set inline styles.
   *
   * An intent is divergent when:
   *   - The element does not exist in DOM (file deleted/refactored), OR
   *   - element.style.getPropertyValue(property).trim() !== previousValue.trim() AND
   *     the inline style is non-empty (meaning HMR reapplied a value that differs)
   *
   * Hook does NOT auto-subscribe to HMR. Wiring HMR → reconcile is deferred.
   */
  reconcile: (changedFiles: string[]) => { divergent: PendingEdit[] }
}

const MAX_ENTRIES = 500
const DEBOUNCE_MS = 150

/** Type guard for a single PendingEdit */
function isPendingEdit(v: unknown): v is PendingEdit {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.intentId === 'string' &&
    typeof o.source === 'string' &&
    typeof o.property === 'string' &&
    typeof o.value === 'string' &&
    typeof o.previousValue === 'string' &&
    typeof o.timestamp === 'number'
  )
}

/** Type guard for an array of PendingEdit */
export function isPendingEditArray(v: unknown): v is PendingEdit[] {
  return Array.isArray(v) && v.every(isPendingEdit)
}

/** Composite key for last-write-wins deduplication. */
function compositeKey(edit: PendingEdit): string {
  return `${edit.source}\0${edit.property}\0${edit.pseudo ?? ''}`
}

/** Extract file path from source (everything before the first ':'). */
function filePathFromSource(source: string): string {
  const idx = source.indexOf(':')
  return idx === -1 ? source : source.slice(0, idx)
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
  // Insertion-order map: composite key → PendingEdit
  const bufferRef = useRef<Map<string, PendingEdit>>(new Map())
  // File-path index: filePath → Set<intentId>
  const fileIndexRef = useRef<Map<string, Set<string>>>(new Map())
  // Debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track whether we've mounted (read from storage)
  const initRef = useRef(false)

  // Initialize from localStorage on first call (before useEffect so list() works immediately)
  if (!initRef.current) {
    initRef.current = true
    const stored = cortexStorage.get('staging-buffer', [], isPendingEditArray)
    for (const edit of stored) {
      const key = compositeKey(edit)
      bufferRef.current.set(key, edit)
      const fp = filePathFromSource(edit.source)
      const ids = fileIndexRef.current.get(fp) ?? new Set()
      ids.add(edit.intentId)
      fileIndexRef.current.set(fp, ids)
    }
  }

  const schedulePersist = useCallback(() => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      cortexStorage.set('staging-buffer', Array.from(bufferRef.current.values()))
    }, DEBOUNCE_MS)
  }, [])

  const flush = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      cortexStorage.set('staging-buffer', Array.from(bufferRef.current.values()))
    }
  }, [])

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
    const existing = bufferRef.current.get(key)

    if (existing) {
      // Update in-place (last-write-wins) — remove and re-insert to keep insertion order
      bufferRef.current.delete(key)
      // Remove old intentId from file index
      const fp = filePathFromSource(existing.source)
      const ids = fileIndexRef.current.get(fp)
      if (ids) {
        ids.delete(existing.intentId)
        if (ids.size === 0) fileIndexRef.current.delete(fp)
      }
    }

    bufferRef.current.set(key, edit)

    // Update file index
    const fp = filePathFromSource(edit.source)
    const ids = fileIndexRef.current.get(fp) ?? new Set()
    ids.add(edit.intentId)
    fileIndexRef.current.set(fp, ids)

    // Evict oldest entries if over limit
    if (bufferRef.current.size > MAX_ENTRIES) {
      const firstKey = bufferRef.current.keys().next().value!
      const evicted = bufferRef.current.get(firstKey)!
      bufferRef.current.delete(firstKey)
      const evictedFp = filePathFromSource(evicted.source)
      const evictedIds = fileIndexRef.current.get(evictedFp)
      if (evictedIds) {
        evictedIds.delete(evicted.intentId)
        if (evictedIds.size === 0) fileIndexRef.current.delete(evictedFp)
      }
    }

    schedulePersist()
  }, [schedulePersist])

  const remove = useCallback((intentIds: string[]) => {
    const idSet = new Set(intentIds)
    const toDeleteKeys: string[] = []

    for (const [key, edit] of bufferRef.current.entries()) {
      if (idSet.has(edit.intentId)) {
        toDeleteKeys.push(key)
        // Update file index
        const fp = filePathFromSource(edit.source)
        const ids = fileIndexRef.current.get(fp)
        if (ids) {
          ids.delete(edit.intentId)
          if (ids.size === 0) fileIndexRef.current.delete(fp)
        }
      }
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
    fileIndexRef.current.clear()
    schedulePersist()
  }, [schedulePersist])

  const size = useCallback((): number => {
    return bufferRef.current.size
  }, [])

  const reconcile = useCallback((changedFiles: string[]): { divergent: PendingEdit[] } => {
    if (changedFiles.length === 0) return { divergent: [] }

    const changedSet = new Set(changedFiles)
    const divergent: PendingEdit[] = []

    for (const edit of bufferRef.current.values()) {
      const fp = filePathFromSource(edit.source)
      if (!changedSet.has(fp)) continue

      const el = document.querySelector(`[data-cortex-source="${edit.source}"]`)
      if (!el) {
        // Element does not exist — file deleted/refactored
        divergent.push(edit)
        continue
      }

      // Prefer inline style (more testable in happy-dom, reflects HMR reapplication)
      const inlineValue = (el as HTMLElement).style?.getPropertyValue(edit.property).trim() ?? ''
      const currentValue = inlineValue !== ''
        ? inlineValue
        : getComputedStyle(el).getPropertyValue(edit.property).trim()

      if (currentValue !== edit.previousValue.trim()) {
        divergent.push(edit)
      }
    }

    return { divergent }
  }, [])

  // useMemo([]) alternative: return a stable object via ref
  const handleRef = useRef<StagingBufferHandle>({
    append,
    remove,
    list,
    clear,
    size,
    reconcile,
  })

  // Keep the handle's methods current (they're already stable from useCallback([]))
  handleRef.current.append = append
  handleRef.current.remove = remove
  handleRef.current.list = list
  handleRef.current.clear = clear
  handleRef.current.size = size
  handleRef.current.reconcile = reconcile

  return handleRef.current
}

export { useEditStagingBuffer }
