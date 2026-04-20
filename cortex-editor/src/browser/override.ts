import type { EditKind } from '../adapters/types.js'
import { VALID_PROPERTY, VALID_VALUE, REJECT_URL, REJECT_COMMENT } from './css-validation.js'
import { emitOverrideChange, emitDivergence } from './override-bus.js'

/** Client-side TTL for pending edits — slightly longer than server's 30s to account for transit */
const PENDING_EDIT_TTL_MS = 35_000

/** Diagnostic trace — gated by window.__CORTEX_DEBUG_OVERRIDES__. Set it to true in
 *  devtools to log every step of the override lifecycle. Intentionally lightweight —
 *  no allocation when disabled. Used to diagnose ZF0-1235 and similar HMR/preview races. */
const trace = (event: string, payload?: unknown): void => {
  if (typeof window === 'undefined') return
  if (!(window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__) return
  const t = performance.now().toFixed(1)

  console.log(`[cortex:trace ${t}ms] ${event}`, payload ?? '')
}

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
    trace('set', { source, property, value, pseudo })
    this.scheduleRebuild()
  }

  /** Remove an override. If property omitted, removes all overrides for source(+pseudo).
   *  Pass `pseudo` to target a pseudo-element override. */
  remove(source: string, property?: string, pseudo?: '::before' | '::after'): void {
    const key = `${source}${pseudo ?? ''}`
    trace('remove', { source, property, pseudo, caller: new Error().stack?.split('\n')[2]?.trim() })
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

  /** Schedule a verified override removal after the framework has committed the HMR
   *  update to DOM. Uses double-rAF — one frame for React's scheduler, one for layout.
   *  This replaces the former `deferRemoval`/`awaitInlineStyleThenRemove` pair, which
   *  relied on a MutationObserver + 1s safety timeout and could revert previews when
   *  the MO didn't fire for a given render. */
  private scheduleVerifyAndRemove(
    source: string,
    property: string,
    expectedValue: string,
    pseudo?: '::before' | '::after',
    kind?: EditKind,
  ): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.verifyAndRemove(source, property, expectedValue, pseudo, kind)
      })
    })
  }

  /** Bounded window for re-verification when the double-rAF tick is too early for
   *  the framework to have committed the new value. Covers React Fast Refresh
   *  (20-600ms inline-style commits) and Tailwind JIT regeneration
   *  (50-500ms stylesheet-rule generation on cold starts).
   *  `static` so tests can shrink it without mocking setTimeout. */
  static VERIFY_RETRY_WINDOW_MS = 750
  /** Poll cadence inside the retry window. MutationObserver covers element-attribute
   *  changes (style/class); this poll catches stylesheet-scoped changes (Tailwind JIT,
   *  CSS Module rewrite) that aren't mutations of the selected element itself. */
  static VERIFY_POLL_INTERVAL_MS = 100

  /** Active retry handles keyed by source+property so rapid re-edits supersede
   *  in-flight retries. `dispose` tears down the observer + interval + timeout atomically. */
  private verifyRetryObservers = new Map<string, { dispose: () => void }>()

  /** After the HMR-triggered render has committed, check that the element's actual
   *  value reflects the committed edit. If it does, remove the override (redundant).
   *  If it doesn't, arm a bounded retry (MutationObserver + poll + timeout) so slow
   *  frameworks (React Fast Refresh, Tailwind JIT) have time to catch up. If the
   *  retry window elapses without a match, emit a divergence event and keep the
   *  override — never silently reverts. */
  private verifyAndRemove(
    source: string,
    property: string,
    expectedValue: string,
    pseudo?: '::before' | '::after',
    kind?: EditKind,
  ): void {
    const el = document.querySelector(`[data-cortex-source="${CSS.escape(source)}"]`)
    if (!el) {
      // Element gone (unmounted). Nothing left to preview — drop the override.
      trace('verify:no-element', { source, property })
      this.remove(source, property, pseudo)
      return
    }

    // Guard: if the override has been superseded by a newer edit to the same
    // source+property, leave the newer value intact and skip this removal.
    const currentOverride = this.get(source, property, pseudo)
    if (currentOverride !== undefined && currentOverride !== expectedValue) {
      trace('verify:superseded', { source, property, currentOverride, expectedValue })
      return
    }

    const actual = this.readUnderlyingValue(el, property, pseudo, kind)
    if (this.valuesMatch(actual, expectedValue, property)) {
      trace('verify:match', { source, property, expectedValue })
      this.remove(source, property, pseudo)
      return
    }

    // First-pass mismatch. Arm a retry loop — the framework may still be committing.
    trace('verify:retry-arm', { source, property, expectedValue, actual, kind })
    this.armVerifyRetry(el, source, property, expectedValue, pseudo, kind)
  }

  /** Arm a bounded retry for verification. Three triggers converge on a single
   *  verify-or-declare-divergence decision:
   *  - MutationObserver on `style` + `class` attributes — fastest signal when the
   *    framework mutates the element directly (React updating inline style or className).
   *  - Polling interval — catches stylesheet-scoped changes (Tailwind JIT regenerating,
   *    CSS Module hot swap) that don't mutate the element's attributes.
   *  - Final timeout — declares divergence if neither of the above matched in time.
   *  All three funnel through the same `tryVerify` closure, which is exception-safe
   *  (throws are logged and terminate the retry rather than silently looping). */
  private armVerifyRetry(
    el: Element,
    source: string,
    property: string,
    expectedValue: string,
    pseudo: '::before' | '::after' | undefined,
    kind: EditKind | undefined,
  ): void {
    const key = `${source}:${property}${pseudo ?? ''}`
    this.verifyRetryObservers.get(key)?.dispose()

    let disposed = false
    let observer: MutationObserver | null = null
    let pollId: number | null = null
    let timeoutId: number | null = null

    const dispose = (): void => {
      if (disposed) return
      disposed = true
      observer?.disconnect()
      if (pollId !== null) clearInterval(pollId)
      if (timeoutId !== null) clearTimeout(timeoutId)
      this.verifyRetryObservers.delete(key)
    }

    const tryVerify = (isFinal: boolean): void => {
      if (disposed) return
      try {
        // Supersede guard — a newer edit may have replaced this override value.
        const currentOverride = this.get(source, property, pseudo)
        if (currentOverride !== undefined && currentOverride !== expectedValue) {
          trace('verify:retry-superseded', { source, property })
          dispose()
          return
        }
        const actual = this.readUnderlyingValue(el, property, pseudo, kind)
        if (this.valuesMatch(actual, expectedValue, property)) {
          trace('verify:match-after-retry', { source, property, expectedValue })
          dispose()
          this.remove(source, property, pseudo)
          return
        }
        if (isFinal) {
          trace('verify:retry-timeout', { source, property, expectedValue, actual })
          dispose()
          emitDivergence({ source, property, expected: expectedValue, actual, pseudo })
        }
      } catch (err) {
        // Throwing inside a MutationObserver callback is silently swallowed by
        // the browser — catch explicitly so retries terminate rather than spin.
        // Still emit divergence so the user sees SOMETHING in the Panel rather
        // than an indefinitely-stuck preview with no signal.
        console.warn('[cortex] override verify retry error:', err)
        trace('verify:retry-error', { source, property })
        dispose()
        emitDivergence({ source, property, expected: expectedValue, actual: '', pseudo })
      }
    }

    observer = new MutationObserver(() => tryVerify(false))
    observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] })

    pollId = window.setInterval(() => tryVerify(false), CSSOverrideManager.VERIFY_POLL_INTERVAL_MS)

    timeoutId = window.setTimeout(() => tryVerify(true), CSSOverrideManager.VERIFY_RETRY_WINDOW_MS)

    this.verifyRetryObservers.set(key, { dispose })
  }

  private disposeVerifyRetryObservers(): void {
    for (const { dispose } of this.verifyRetryObservers.values()) {
      dispose()
    }
    this.verifyRetryObservers.clear()
  }

  /** Read the element's underlying value for the given property, excluding our own
   *  override. For jsx-immediate writes (inline style rewriter) the inline style IS
   *  the underlying value — a cheap direct read. For stylesheet-scoped edits (classOp,
   *  CSS Modules, deferred) we briefly detach the override `<style>` so getComputedStyle
   *  reports the real source value. The detach happens at most once per verified edit,
   *  not on every HMR cycle as the former sweep did. */
  private readUnderlyingValue(
    el: Element,
    property: string,
    pseudo: '::before' | '::after' | undefined,
    kind: EditKind | undefined,
  ): string {
    if (kind === 'jsx-immediate') {
      return (el as HTMLElement).style.getPropertyValue(property).trim()
    }
    const parent = this.styleEl.parentNode
    const nextSibling = this.styleEl.nextSibling
    if (parent) parent.removeChild(this.styleEl)
    try {
      return getComputedStyle(el, pseudo || undefined).getPropertyValue(property).trim()
    } catch (err) {
      // Unexpected: getComputedStyle should not throw for any attached element
      // + valid property combo. Log so the failure reaches a developer; the
      // empty-string return will trip divergence with actual='' so the user
      // is notified too (no silent revert).
      console.warn('[cortex] readUnderlyingValue failed for', property, err)
      return ''
    } finally {
      if (parent) {
        try {
          if (nextSibling && nextSibling.parentNode === parent) {
            parent.insertBefore(this.styleEl, nextSibling)
          } else {
            parent.appendChild(this.styleEl)
          }
        } catch (err) {
          // Parent was removed mid-read (host-page rearrangement during HMR).
          // Falling back to document.head is safer than leaving the style
          // detached, but worth noting — it can alter cascade ordering.
          console.warn('[cortex] override styleEl reparented to document.head after detach:', err)
          document.head.appendChild(this.styleEl)
        }
      }
    }
  }

  /** Normalized equality for computed-vs-expected comparison. Handles common CSS
   *  serialization differences: whitespace, rounded pixel values, and canonical
   *  color forms. Deliberately tolerant rather than strict — a verified-and-removed
   *  override that the browser represents slightly differently should not leak as
   *  a divergence. */
  private valuesMatch(actual: string, expected: string, property?: string): boolean {
    const a = actual.trim()
    const b = expected.trim()
    if (a === b) return true
    if (!a || !b) return false
    const aNum = parseFloat(a)
    const bNum = parseFloat(b)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      const aUnit = a.replace(/^-?[0-9.]+/, '').trim()
      const bUnit = b.replace(/^-?[0-9.]+/, '').trim()
      const unitsAgree = aUnit === bUnit || (aUnit === '' && bUnit === 'px') || (aUnit === 'px' && bUnit === '')
      // Tight tolerance — only absorbs sub-pixel rounding (e.g. `15.9999px` vs
      // `16px`). A 0.5px window was too loose — it would match `1px` to `0.5px`,
      // masking real divergences on thin borders and small radii.
      if (unitsAgree && Math.abs(aNum - bNum) < 0.1) return true
    }
    // Canonical CSS value comparison — normalize both sides via the browser's
    // own CSS parser. Without this step, `color: #fff` (expected) never matches
    // `color: rgb(255, 255, 255)` (computed) and every color/background edit
    // would emit a bogus divergence card.
    if (property) {
      const canonA = this.canonicalizeCssValue(a, property)
      const canonB = this.canonicalizeCssValue(b, property)
      if (canonA && canonA === canonB) return true
    }
    return false
  }

  /** Reusable off-screen element for canonicalizing CSS value serialization.
   *  Allocated on first use, retained for the manager's lifetime, released in dispose. */
  private canaryEl: HTMLDivElement | null = null

  private canonicalizeCssValue(value: string, property: string): string {
    if (!this.canaryEl) {
      this.canaryEl = document.createElement('div')
      this.canaryEl.setAttribute('data-cortex-canary', '')
      this.canaryEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;visibility:hidden'
      document.body.appendChild(this.canaryEl)
    }
    try {
      this.canaryEl.style.removeProperty(property)
      this.canaryEl.style.setProperty(property, value)
      // getComputedStyle forces resolution to the browser's canonical form
      // (colors → rgb()/rgba(), keywords → pixels, etc.) regardless of input shape.
      return getComputedStyle(this.canaryEl).getPropertyValue(property).trim()
    } catch {
      return ''
    }
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
    trace('trackPendingEdit', { editId, sources: sourceArray, property, value, pseudo, prevHmrAppliedInCycle: this.hmrAppliedInCycle })
    // A fresh edit starts a new HMR cycle from the browser's perspective.
    this.hmrAppliedInCycle = false
    // Supersede any prior pending edit for overlapping targets
    for (const [existingId, entry] of this.pendingEdits) {
      if (entry.property === property && entry.pseudo === pseudo &&
          entry.sources.some(s => sourceArray.includes(s))) {
        this.pendingEdits.delete(existingId)
      }
    }
    // Drop queued removals that this new edit supersedes. Without this, a queued
    // removal for the old value could drain when `onHMRApplied` later fires for
    // a different cycle, targeting the wrong expectedValue and either removing
    // the newer override or emitting a stale divergence.
    if (this.pendingRemovals.length > 0) {
      this.pendingRemovals = this.pendingRemovals.filter(r =>
        r.property !== property || r.pseudo !== pseudo || !sourceArray.includes(r.source)
      )
    }
    this.pendingEdits.set(editId, { sources: sourceArray, property, value, pseudo, timestamp: Date.now() })
  }

  /** Queued verifications waiting for the next onHMRApplied tick. Populated by
   *  handleHMRVerified when the verified signal beats the HMR-applied signal;
   *  drained in onHMRApplied once the browser has processed the HMR update. */
  private pendingRemovals: Array<{ editId: string; source: string; property: string; pseudo?: '::before' | '::after'; value: string; kind?: EditKind }> = []
  private pendingClearAll = false
  /** True once onHMRApplied has fired for the current HMR cycle. Reset by
   *  trackPendingEdit when a new edit is dispatched — that edit's verified
   *  signal will trigger a new cycle. */
  private hmrAppliedInCycle = false

  /** Called when the server confirms an edit landed via HMR. If the browser has
   *  already seen vite:afterUpdate for this cycle, schedule verification immediately
   *  (one double-rAF tick); otherwise queue for the next onHMRApplied drain. */
  handleHMRVerified(editId: string, match: boolean, kind?: EditKind): void {
    this.evictStalePendingEdits()
    const pending = this.pendingEdits.get(editId)
    trace('handleHMRVerified', { editId, match, kind, hasPending: !!pending, hmrAppliedInCycle: this.hmrAppliedInCycle })
    if (!pending) return
    this.pendingEdits.delete(editId)
    if (!match) {
      // Server said "I wrote the file, but the HMR-applied value doesn't match
      // the expected value" — typically a TTL-eviction (30s with no HMR) or a
      // reader divergence. Surface this immediately: the override stays, but the
      // Panel gets a divergence card so the user learns something went wrong.
      // Without this, a failed-verify edit would be indistinguishable from a
      // successful one until the user noticed the preview wasn't reflected.
      for (const source of pending.sources) {
        emitDivergence({ source, property: pending.property, expected: pending.value, actual: '', pseudo: pending.pseudo })
      }
      return
    }

    // Per-source guard: if the user made a newer edit to the same property on a
    // specific source, skip verification for THAT source only — the newer override
    // has its own pending edit awaiting verification.
    const mode = this.hmrAppliedInCycle ? 'schedule-immediate' : 'queue'
    trace(`handleHMRVerified:${mode}`, { editId })
    for (const source of pending.sources) {
      const currentValue = this.get(source, pending.property, pending.pseudo)
      if (currentValue !== undefined && currentValue !== pending.value) {
        trace('handleHMRVerified:skip-stale', { source, property: pending.property, currentValue, expected: pending.value })
        continue
      }
      if (this.hmrAppliedInCycle) {
        this.scheduleVerifyAndRemove(source, pending.property, pending.value, pending.pseudo, kind)
      } else {
        this.pendingRemovals.push({ editId, source, property: pending.property, pseudo: pending.pseudo, value: pending.value, kind })
      }
    }
  }

  /** Queue a clearAll to run when the next HMR update lands in the browser. */
  queueClearAll(): void {
    this.pendingClearAll = true
  }

  /** Called when the browser confirms HMR stylesheet update has been applied
   *  (vite:afterUpdate). Drains queued verifications. No more heuristic sweeping —
   *  every override has an explicit tracked owner and removes only after verification. */
  onHMRApplied(): void {
    trace('onHMRApplied:enter', {
      pendingClearAll: this.pendingClearAll,
      pendingRemovalsLen: this.pendingRemovals.length,
      hmrAppliedInCycle: this.hmrAppliedInCycle,
      activeOverrideCount: this.overrides.size,
    })
    if (this.pendingClearAll) {
      this.pendingClearAll = false
      this.pendingRemovals.length = 0
      this.hmrAppliedInCycle = false
      this.clearAll()
      return
    }
    if (this.pendingRemovals.length > 0) {
      const removals = this.pendingRemovals.splice(0)
      for (const r of removals) {
        trace('onHMRApplied:drain', { editId: r.editId, source: r.source, property: r.property, kind: r.kind })
        this.scheduleVerifyAndRemove(r.source, r.property, r.value, r.pseudo, r.kind)
      }
    }
    this.hmrAppliedInCycle = true
  }

  private evictStalePendingEdits(): void {
    const now = Date.now()
    for (const [id, entry] of this.pendingEdits) {
      if (now - entry.timestamp > PENDING_EDIT_TTL_MS) {
        this.pendingEdits.delete(id)
      }
    }
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
    this.hmrAppliedInCycle = false
    this.disposeVerifyRetryObservers()
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.pendingRemovals.length = 0
    this.hmrAppliedInCycle = false
    this.disposeVerifyRetryObservers()
    this.cancelPendingRebuild()
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.styleEl.remove()
    if (this.canaryEl) {
      this.canaryEl.remove()
      this.canaryEl = null
    }
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
