import type { EditKind } from '../adapters/types.js'
import { VALID_PROPERTY, VALID_VALUE, REJECT_URL, REJECT_COMMENT } from './css-validation.js'
import { emitOverrideChange } from './override-bus.js'

/** Client-side TTL for pending edits — slightly longer than server's 30s to account for transit */
const PENDING_EDIT_TTL_MS = 35_000

/**
 * Manages a <style> tag in document.head for CSS override previews.
 * Uses [data-cortex-source] selectors (stable across HMR) with !important.
 *
 * Two separate override maps:
 * - `overrides`: user edits — keyed by composite key (source or source+pseudo)
 * - `stateOverrides`: forced state declarations — keyed by raw source (no pseudo)
 *
 * During rebuild(), both maps merge per-source. User edits win over state overrides.
 */
export class CSSOverrideManager {
  private styleEl: HTMLStyleElement
  private overrides = new Map<string, Map<string, string>>()
  private stateOverrides = new Map<string, Map<string, string>>()
  private pendingEdits = new Map<string, { sources: string[]; property: string; value: string; pseudo?: '::before' | '::after'; timestamp: number }>()

  constructor() {
    this.styleEl = document.createElement('style')
    this.styleEl.setAttribute('data-cortex-override', '')
    document.head.appendChild(this.styleEl)
  }

  private rafId: number | null = null

  private scheduleRebuild(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.rebuild()
    })
  }

  private cancelPendingRebuild(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /** Force any pending RAF rebuild to execute synchronously. */
  flush(): void {
    if (this.rafId !== null) {
      this.cancelPendingRebuild()
      this.rebuild()
    }
  }

  /** Apply an override (instant preview). Rejects invalid property names or values.
   *  Pass `pseudo` ('::before' | '::after') to target a pseudo-element. */
  set(source: string, property: string, value: string, pseudo?: '::before' | '::after'): void {
    if (!VALID_PROPERTY.test(property)) {
      console.warn('[cortex] Override rejected: invalid property name:', property)
      return
    }
    if (!VALID_VALUE.test(value) || REJECT_URL.test(value) || REJECT_COMMENT.test(value)) {
      console.warn('[cortex] Override rejected: invalid value for', property, ':', value)
      return
    }

    const key = `${source}${pseudo ?? ''}`
    let props = this.overrides.get(key)
    if (!props) {
      props = new Map()
      this.overrides.set(key, props)
    }
    props.set(property, value)
    this.scheduleRebuild()
  }

  /** Remove an override. If property omitted, removes all overrides for source(+pseudo).
   *  Pass `pseudo` to target a pseudo-element override. */
  remove(source: string, property?: string, pseudo?: '::before' | '::after'): void {
    const key = `${source}${pseudo ?? ''}`
    if (property) {
      this.overrides.get(key)?.delete(property)
      // Clean up empty source entries
      if (this.overrides.get(key)?.size === 0) {
        this.overrides.delete(key)
      }
    } else {
      this.overrides.delete(key)
    }
    // Synchronous rebuild — prevents one-frame flicker when HMR clears overrides.
    // RAF batching would show the old override for one extra frame before removal.
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove override after framework re-render completes.
   *  For jsx-immediate: waits for MutationObserver on the element's style
   *  attribute (proof that React re-rendered with the new inline style).
   *  For deferred/AI: uses double-rAF (framework re-renders during HMR). */
  private deferRemoval(source: string, property: string, pseudo?: '::before' | '::after', kind?: EditKind): void {
    if (kind === 'jsx-immediate') {
      this.awaitInlineStyleThenRemove(source, property, pseudo)
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.remove(source, property, pseudo)
        })
      })
    }
  }

  /** Wait for the element's inline style to change (React re-rendered), then remove the override.
   *  Uses MutationObserver on the style attribute — fires when React applies the new inline style
   *  prop to the DOM element. Safety timeout prevents infinite wait if HMR/render fails.
   *  Tracked in activeStyleObservers so clearAll/dispose can clean up, and rapid edits
   *  for the same source+property supersede the previous observer. */
  private awaitInlineStyleThenRemove(source: string, property: string, pseudo?: '::before' | '::after'): void {
    const el = document.querySelector(`[data-cortex-source="${CSS.escape(source)}"]`)
    if (!el) {
      this.remove(source, property, pseudo)
      return
    }

    const key = `${source}:${property}${pseudo ?? ''}`

    // Supersede any previous observer for the same source+property
    const prev = this.activeStyleObservers.get(key)
    if (prev) {
      prev.observer.disconnect()
      clearTimeout(prev.timeout)
    }

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      observer.disconnect()
      clearTimeout(timeout)
      this.activeStyleObservers.delete(key)
      this.remove(source, property, pseudo)
    }

    const observer = new MutationObserver(cleanup)
    observer.observe(el, { attributes: true, attributeFilter: ['style'] })

    // Safety: if React doesn't re-render within 1s, remove override anyway
    const timeout = setTimeout(cleanup, 1000)

    this.activeStyleObservers.set(key, { observer, timeout })
  }

  /** Disconnect all active style observers (called from clearAll/dispose). */
  private disconnectStyleObservers(): void {
    for (const { observer, timeout } of this.activeStyleObservers.values()) {
      observer.disconnect()
      clearTimeout(timeout)
    }
    this.activeStyleObservers.clear()
  }

  /**
   * Apply state-forced declarations (e.g. from :hover CSSOM inspection).
   * Validates each entry against VALID_PROPERTY/VALID_VALUE/REJECT_URL/REJECT_COMMENT.
   * State overrides are keyed by raw source (no pseudo suffix) — they only
   * merge with element-level rules, not pseudo-element rules.
   */
  setStateOverrides(source: string, declarations: Map<string, string>): void {
    const validated = new Map<string, string>()
    for (const [prop, val] of declarations) {
      if (!VALID_PROPERTY.test(prop)) continue
      if (!VALID_VALUE.test(val) || REJECT_URL.test(val) || REJECT_COMMENT.test(val)) continue
      validated.set(prop, val)
    }
    if (validated.size > 0) {
      this.stateOverrides.set(source, validated)
    } else {
      if (declarations.size > 0) {
        console.warn(`[cortex] setStateOverrides: all ${declarations.size} declarations rejected for source "${source}"`)
      }
      this.stateOverrides.delete(source)
    }
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /**
   * Clear all state-forced overrides. Rebuilds synchronously (not via RAF)
   * to ensure the <style> tag is updated before the next getComputedStyle read.
   */
  clearStateOverrides(): void {
    this.stateOverrides.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Track a pending edit so handleHMRVerified can clear the right override.
   *  For scope='all' edits, pass all shared element sources so all overrides are cleared. */
  trackPendingEdit(editId: string, sources: string | string[], property: string, value: string, pseudo?: '::before' | '::after'): void {
    const sourceArray = Array.isArray(sources) ? sources : [sources]
    this.evictStalePendingEdits()
    this.hmrAppliedPending = false
    // Supersede any prior pending edit for overlapping targets
    for (const [existingId, entry] of this.pendingEdits) {
      if (entry.property === property && entry.pseudo === pseudo &&
          entry.sources.some(s => sourceArray.includes(s))) {
        this.pendingEdits.delete(existingId)
      }
    }
    this.pendingEdits.set(editId, { sources: sourceArray, property, value, pseudo, timestamp: Date.now() })
  }

  private pendingRemovals: Array<{ editId: string; source: string; property: string; pseudo?: '::before' | '::after'; kind?: EditKind }> = []
  /** Active MutationObservers waiting for inline style changes (jsx-immediate).
   *  Keyed by source+property so rapid edits supersede previous observers.
   *  Cleaned up in clearAll()/dispose(). */
  private activeStyleObservers = new Map<string, { observer: MutationObserver; timeout: ReturnType<typeof setTimeout> }>()
  private pendingClearAll = false
  /** EditIds whose override removal should use double-rAF deferral (AI/deferred edits).
   *  Populated by markDeferred(editId). Checked at drain time in onHMRApplied and at
   *  late-arrival time in handleHMRVerified. */
  private deferredEditIds = new Set<string>()
  /** True when onHMRApplied fired but pendingRemovals was empty (nothing to drain).
   *  handleHMRVerified checks this flag to process the removal immediately instead
   *  of queueing it for a future onHMRApplied that may never come. */
  private hmrAppliedPending = false

  /** Called when the server confirms an edit landed via HMR. Queues the override
   *  for removal in onHMRApplied(). If onHMRApplied already fired for this HMR cycle
   *  (hmrAppliedPending flag), processes immediately — the HMR stylesheet is already
   *  applied so the removal is safe. */
  handleHMRVerified(editId: string, match: boolean, kind?: EditKind): void {
    this.evictStalePendingEdits()
    const pending = this.pendingEdits.get(editId)
    if (!pending) return
    this.pendingEdits.delete(editId)
    if (match) {
      // Guard: if the user made a newer edit to the same property, the current
      // override value won't match the committed value. Skip removal — the newer
      // edit's HMR cycle will handle its own cleanup.
      const primarySource = pending.sources[0]
      if (primarySource) {
        const currentValue = this.get(primarySource, pending.property, pending.pseudo)
        if (currentValue !== undefined && currentValue !== pending.value) return
      }

      if (this.hmrAppliedPending) {
        const deferred = this.consumeDeferralSignal(editId, kind)
        for (const source of pending.sources) {
          if (deferred) {
            this.deferRemoval(source, pending.property, pending.pseudo, kind)
          } else {
            this.remove(source, pending.property, pending.pseudo)
          }
        }
      } else {
        for (const source of pending.sources) {
          this.pendingRemovals.push({ editId, source, property: pending.property, pseudo: pending.pseudo, kind })
        }
      }
    }
  }

  /** Decide whether an override removal should use non-synchronous removal.
   *  Returns true for jsx-immediate (MutationObserver) and deferred (double-rAF).
   *  Checks both the legacy deferredEditIds set and the kind field.
   *  Consumes the deferredEditIds entry if present (side-effecting). */
  private consumeDeferralSignal(editId: string, kind?: EditKind): boolean {
    const fromLegacy = this.deferredEditIds.has(editId)
    if (fromLegacy) this.deferredEditIds.delete(editId)
    return fromLegacy || kind === 'jsx-immediate' || kind === 'deferred'
  }

  /** Queue a clearAll to run when the next HMR update lands in the browser. */
  queueClearAll(): void {
    this.pendingClearAll = true
  }

  /** Called when the browser confirms HMR stylesheet update has been applied
   *  (vite:afterUpdate). Drains queued removals. If nothing to drain, sets
   *  hmrAppliedPending so a late-arriving handleHMRVerified can process immediately. */
  onHMRApplied(): void {
    if (this.pendingClearAll) {
      this.pendingClearAll = false
      this.pendingRemovals.length = 0
      this.hmrAppliedPending = false
      this.clearAll()
      return
    }
    if (this.pendingRemovals.length > 0) {
      const removals = this.pendingRemovals.splice(0)
      for (const r of removals) {
        if (this.consumeDeferralSignal(r.editId, r.kind)) {
          this.deferRemoval(r.source, r.property, r.pseudo, r.kind)
        } else {
          this.remove(r.source, r.property, r.pseudo)
        }
      }
    }
    this.hmrAppliedPending = true

    // Sweep stale overrides: remove any where value matches computed style.
    // This prevents accumulation of no-op !important rules after undo + HMR cycles.
    this.sweepStaleOverrides()
  }

  /** Remove overrides where the value matches the element's computed style (no-op rules).
   *  Called after HMR applies new styles — catches stale overrides from undo cycles.
   *
   *  Temporarily detaches the override <style> element so getComputedStyle reads
   *  the underlying stylesheet values, not the override's own !important rules.
   *  Without this, every active override would self-match and be incorrectly swept. */
  private sweepStaleOverrides(): void {
    // Detach override <style> so computed styles reflect underlying CSS only
    const parent = this.styleEl.parentNode
    const nextSibling = this.styleEl.nextSibling
    if (parent) parent.removeChild(this.styleEl)

    let changed = false
    try {
      for (const [compositeKey, props] of this.overrides) {
        const pseudoSuffix = compositeKey.endsWith('::before') ? '::before'
                           : compositeKey.endsWith('::after') ? '::after'
                           : ''
        const rawSource = pseudoSuffix ? compositeKey.slice(0, -pseudoSuffix.length) : compositeKey
        const el = document.querySelector(`[data-cortex-source="${CSS.escape(rawSource)}"]`)
        if (!el) continue
        let computed: CSSStyleDeclaration
        try {
          computed = getComputedStyle(el, pseudoSuffix || undefined)
        } catch (err) {
          console.warn('[cortex] sweepStaleOverrides: getComputedStyle failed for', rawSource, err)
          continue
        }
        const staleProps: string[] = []
        for (const [prop, val] of props) {
          try {
            const computedVal = computed.getPropertyValue(prop).trim()
            if (computedVal && computedVal === val.trim()) {
              staleProps.push(prop)
            }
          } catch (err) {
            console.warn('[cortex] sweepStaleOverrides: getPropertyValue failed for', prop, err)
          }
        }
        for (const prop of staleProps) {
          props.delete(prop)
          changed = true
        }
        if (props.size === 0) this.overrides.delete(compositeKey)
      }
    } finally {
      // Re-attach override <style> in its original position.
      // Guard against nextSibling removal during sweep (e.g., framework cleanup during HMR).
      if (parent) {
        try {
          if (nextSibling && nextSibling.parentNode === parent) {
            parent.insertBefore(this.styleEl, nextSibling)
          } else {
            parent.appendChild(this.styleEl)
          }
        } catch {
          // parent itself may have been removed — fall back to document.head
          document.head.appendChild(this.styleEl)
        }
      }
    }

    if (changed) {
      this.cancelPendingRebuild()
      this.rebuild()
    }
  }

  private evictStalePendingEdits(): void {
    const now = Date.now()
    for (const [id, entry] of this.pendingEdits) {
      if (now - entry.timestamp > PENDING_EDIT_TTL_MS) {
        this.pendingEdits.delete(id)
      }
    }
  }

  /** Mark a specific edit ID as deferred so override removal uses double-rAF.
   *  Called from CortexApp when edit_status reports strategy === 'deferred'. */
  markDeferred(editId: string): void {
    this.deferredEditIds.add(editId)
  }

  /** Read the current override value for a source+property. Returns undefined if no override exists.
   *  Used by command creation to capture previousValue before applying a new edit. */
  get(source: string, property: string, pseudo?: '::before' | '::after'): string | undefined {
    const key = `${source}${pseudo ?? ''}`
    return this.overrides.get(key)?.get(property)
  }

  /** Clear all overrides (e.g. on SPA navigation) */
  clearAll(): void {
    this.pendingRemovals.length = 0
    this.deferredEditIds.clear()
    this.disconnectStyleObservers()
    this.hmrAppliedPending = false
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.pendingRemovals.length = 0
    this.deferredEditIds.clear()
    this.disconnectStyleObservers()
    this.hmrAppliedPending = false
    this.cancelPendingRebuild()
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.styleEl.remove()
  }

  private rebuild(): void {
    const allKeys = new Set([...this.overrides.keys(), ...this.stateOverrides.keys()])
    const rules: string[] = []

    for (const compositeKey of allKeys) {
      // Split pseudo suffix from the composite key
      const pseudoSuffix = compositeKey.endsWith('::before') ? '::before'
                         : compositeKey.endsWith('::after') ? '::after'
                         : ''
      const rawSource = pseudoSuffix ? compositeKey.slice(0, -pseudoSuffix.length) : compositeKey

      const userProps = this.overrides.get(compositeKey)
      // State overrides are always keyed by raw source (no pseudo suffix) —
      // they only merge with element-level rules, not pseudo rules
      const stateProps = pseudoSuffix ? undefined : this.stateOverrides.get(rawSource)

      // Merge: user edits win over state overrides (user intent > forced state)
      const merged = new Map<string, string>()
      if (stateProps) for (const [p, v] of stateProps) merged.set(p, v)
      if (userProps) for (const [p, v] of userProps) merged.set(p, v)
      if (merged.size === 0) continue

      const declarations = Array.from(merged.entries())
        .map(([prop, val]) => `${prop}: ${val} !important`)
        .join('; ')
      // CSS.escape only the source part; pseudo suffix appended outside the attribute selector
      const selector = `[data-cortex-source="${CSS.escape(rawSource)}"]${pseudoSuffix}`
      rules.push(`${selector} { ${declarations}; }`)
    }
    // Skip no-op writes — CSSOM teardown/rebuild can trigger host-app CSS
    // transitions even when the final computed value is identical.
    const newContent = rules.join('\n')
    if (this.styleEl.textContent !== newContent) {
      this.styleEl.textContent = newContent
      emitOverrideChange()
    }
  }
}
