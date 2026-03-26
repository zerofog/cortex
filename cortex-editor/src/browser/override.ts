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
  private static readonly MAX_UNDO_DEPTH = 50
  private styleEl: HTMLStyleElement
  private overrides = new Map<string, Map<string, string>>()
  private stateOverrides = new Map<string, Map<string, string>>()
  private pendingEdits = new Map<string, { source: string; property: string; pseudo?: '::before' | '::after'; timestamp: number }>()

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

  /** Track a pending edit so handleHMRVerified can clear the right override. */
  trackPendingEdit(editId: string, source: string, property: string, pseudo?: '::before' | '::after'): void {
    this.evictStalePendingEdits()
    // Supersede any prior pending edit for the same target
    for (const [existingId, entry] of this.pendingEdits) {
      if (entry.source === source && entry.property === property && entry.pseudo === pseudo) {
        this.pendingEdits.delete(existingId)
        break
      }
    }
    this.pendingEdits.set(editId, { source, property, pseudo, timestamp: Date.now() })
  }

  private pendingRemovals: Array<{ source: string; property: string; pseudo?: '::before' | '::after' }> = []
  private pendingClearAll = false

  /** Called when the server confirms an edit landed via HMR. Queues the override
   *  for removal — actual clearing happens in onHMRApplied() after the browser
   *  has applied the HMR stylesheet update. */
  handleHMRVerified(editId: string, match: boolean): void {
    this.evictStalePendingEdits()
    const pending = this.pendingEdits.get(editId)
    if (!pending) return
    this.pendingEdits.delete(editId)
    if (match) {
      this.pendingRemovals.push({ source: pending.source, property: pending.property, pseudo: pending.pseudo })
    }
  }

  /** Queue a clearAll to run when the next HMR update lands in the browser. */
  queueClearAll(): void {
    this.pendingClearAll = true
  }

  /** Called when the browser confirms HMR stylesheet update has been applied.
   *  Now safe to remove overrides without flicker. */
  onHMRApplied(): void {
    if (this.pendingClearAll) {
      this.pendingClearAll = false
      this.pendingRemovals.length = 0
      this.clearAll()
      return
    }
    if (this.pendingRemovals.length > 0) {
      const removals = this.pendingRemovals.splice(0)
      for (const r of removals) {
        this.remove(r.source, r.property, r.pseudo)
      }
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

  private overrideUndoStack: Map<string, Map<string, string>>[] = []
  private overrideRedoStack: Map<string, Map<string, string>>[] = []

  private preEditSnapshot: Map<string, Map<string, string>> | null = null

  /** Mark the start of a new edit gesture (scrub or direct commit).
   *  Takes a snapshot of the current state BEFORE any set() calls for this edit. */
  beginEdit(): void {
    if (!this.preEditSnapshot) {
      this.preEditSnapshot = this.cloneOverrides()
    }
  }

  /** Cancel the current edit — clears pre-edit snapshot without creating an undo entry.
   *  Called on edit_status:failed/cancelled. */
  cancelEdit(): void {
    this.preEditSnapshot = null
  }

  /** Commit the current edit — pushes the pre-edit snapshot to the undo stack. */
  commitEdit(): void {
    if (this.preEditSnapshot) {
      this.overrideUndoStack.push(this.preEditSnapshot)
      this.preEditSnapshot = null
      this.overrideRedoStack.length = 0
      // Evict oldest entries beyond max depth (matches server's UndoStack.maxDepth)
      while (this.overrideUndoStack.length > CSSOverrideManager.MAX_UNDO_DEPTH) {
        this.overrideUndoStack.shift()
      }
    }
  }

  /** Undo: restore previous override state (one edit back). */
  undoOverride(): void {
    if (this.overrideUndoStack.length === 0) return
    this.overrideRedoStack.push(this.cloneOverrides())
    this.overrides = this.overrideUndoStack.pop()!
    this.pendingEdits.clear()
    this.pendingRemovals.length = 0
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Redo: restore next override state (one edit forward). */
  redoOverride(): void {
    if (this.overrideRedoStack.length === 0) return
    this.overrideUndoStack.push(this.cloneOverrides())
    this.overrides = this.overrideRedoStack.pop()!
    this.pendingEdits.clear()
    this.pendingRemovals.length = 0
    this.cancelPendingRebuild()
    this.rebuild()
  }

  private cloneOverrides(): Map<string, Map<string, string>> {
    const clone = new Map<string, Map<string, string>>()
    for (const [k, v] of this.overrides) clone.set(k, new Map(v))
    return clone
  }

  /** Clear all overrides (e.g. on SPA navigation) */
  clearAll(): void {
    this.preEditSnapshot = null
    this.overrideUndoStack.length = 0
    this.overrideRedoStack.length = 0
    this.pendingRemovals.length = 0
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.preEditSnapshot = null
    this.overrideUndoStack.length = 0
    this.overrideRedoStack.length = 0
    this.pendingRemovals.length = 0
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
