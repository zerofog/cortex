import type { EditKind } from '../adapters/types.js'
import { VALID_PROPERTY, VALID_VALUE, REJECT_URL, REJECT_COMMENT } from './css-validation.js'
import { emitOverrideChange, emitDivergence } from './override-bus.js'

/** Client-side TTL for pending edits — slightly longer than server's 30s to account for transit */
const PENDING_EDIT_TTL_MS = 35_000

/** Diagnostic trace — gated by window.__CORTEX_DEBUG_OVERRIDES__. Set it to true in
 *  devtools to log every step of the override lifecycle. Intentionally lightweight —
 *  no allocation when disabled. Used to diagnose ZF0-1235 and similar HMR/preview races. */
const isTraceEnabled = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__

const trace = (event: string, payload?: unknown): void => {
  if (!isTraceEnabled()) return
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
    // Stack-trace capture is expensive; only build it when tracing is active.
    if (isTraceEnabled()) {
      trace('remove', { source, property, pseudo, caller: new Error().stack?.split('\n')[2]?.trim() })
    }
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
    // Guard: override already gone (via clearAll / dispose / explicit remove).
    // Without this, a pending double-rAF from a disposed manager could still
    // arm a retry observer and emit divergence for an override that no longer exists.
    const currentOverride = this.get(source, property, pseudo)
    if (currentOverride === undefined) {
      trace('verify:already-removed', { source, property })
      return
    }
    // Guard: if the override has been superseded by a newer edit to the same
    // source+property, leave the newer value intact and skip this removal.
    if (currentOverride !== expectedValue) {
      trace('verify:superseded', { source, property, currentOverride, expectedValue })
      return
    }

    const el = document.querySelector(`[data-cortex-source="${CSS.escape(source)}"]`)
    if (!el) {
      // Element gone (unmounted). Nothing left to preview — drop the override.
      trace('verify:no-element', { source, property })
      this.remove(source, property, pseudo)
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
        // Supersede / already-gone guard — skip if the override is missing or
        // has been replaced by a newer edit.
        const currentOverride = this.get(source, property, pseudo)
        if (currentOverride === undefined) {
          trace('verify:retry-removed', { source, property })
          dispose()
          return
        }
        if (currentOverride !== expectedValue) {
          trace('verify:retry-superseded', { source, property })
          dispose()
          return
        }
        // Re-query the element every attempt — the original `el` reference
        // may be stale if React unmounted/replaced the node during the retry
        // window. data-cortex-source is stable across HMR, so it re-resolves.
        const currentEl = document.querySelector(`[data-cortex-source="${CSS.escape(source)}"]`)
        if (!currentEl) {
          trace('verify:retry-no-element', { source, property })
          dispose()
          this.remove(source, property, pseudo)
          return
        }
        const actual = this.readUnderlyingValue(currentEl, property, pseudo, kind)
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

    // jsx-immediate commits land on the element itself (style or className) —
    // observe both. Stylesheet-scoped kinds (classOp, CSS Module, deferred)
    // never mutate element attributes when the value lands; observing 'class'
    // would flood the callback with unrelated Tailwind-JIT className churn
    // (hover/focus/etc) that can't possibly satisfy the expected value.
    // For those kinds we only observe 'style' (rare but possible if the host
    // toggles inline styles) and rely on polling for stylesheet changes.
    const attributeFilter = kind === 'jsx-immediate' ? ['style', 'class'] : ['style']
    observer = new MutationObserver(() => tryVerify(false))
    observer.observe(el, { attributes: true, attributeFilter })

    pollId = window.setInterval(() => tryVerify(false), CSSOverrideManager.VERIFY_POLL_INTERVAL_MS)

    // Final verify aligned to rAF — a raw setTimeout can fire between a style
    // commit and its paint, and `getComputedStyle` inside that gap may still
    // report the pre-commit value. One rAF ensures we're reading post-layout.
    timeoutId = window.setTimeout(() => {
      if (disposed) return
      requestAnimationFrame(() => tryVerify(true))
    }, CSSOverrideManager.VERIFY_RETRY_WINDOW_MS)

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
      // `all: initial` isolates the canary from the host page's cascade so
      // inherited properties (color, font-*, line-height, etc.) and universal
      // selectors (`* { ... }`) can't contaminate canonicalization results.
      // Without this, `getComputedStyle(canary).color` would pick up the host
      // app's body color and match against the user's edited color incorrectly.
      this.canaryEl.style.cssText = 'all:initial;position:fixed;top:-9999px;left:-9999px;visibility:hidden'
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
    trace('trackPendingEdit', { editId, sources: sourceArray, property, value, pseudo })
    // Supersede prior pending edits AND dispose matching in-flight retry observers.
    // Without the observer dispose, a stale retry from the superseded edit would
    // continue polling against the NEW expected value in its closure and could
    // emit a false divergence against the user's newer intent.
    for (const [existingId, entry] of this.pendingEdits) {
      if (entry.property === property && entry.pseudo === pseudo &&
          entry.sources.some(s => sourceArray.includes(s))) {
        this.pendingEdits.delete(existingId)
      }
    }
    for (const source of sourceArray) {
      const retryKey = `${source}:${property}${pseudo ?? ''}`
      this.verifyRetryObservers.get(retryKey)?.dispose()
    }
    this.pendingEdits.set(editId, { sources: sourceArray, property, value, pseudo, timestamp: Date.now() })
  }

  private pendingClearAll = false

  /** Recently-verified editIds — short-lived dedup cache for at-least-once delivery
   *  from the server. If the server reconnects and replays `hmr_verified` for an
   *  editId we've already handled, we want a silent no-op rather than an unknown-edit
   *  path that could reach into stale state. TTL matches the verifier's 30s. */
  private recentlyVerified = new Map<string, number>()
  private static readonly RECENTLY_VERIFIED_TTL_MS = 30_000

  /** Called when the server confirms an edit landed via HMR. Always schedules
   *  verification via double-rAF — the retry mechanism inside verifyAndRemove
   *  handles the timing race whether the browser's vite:afterUpdate lands before
   *  or after this verified signal. Eliminates the `hmrAppliedInCycle` flag that
   *  misfired across rapid consecutive edits (frontend C3 / distsys C3). */
  handleHMRVerified(editId: string, match: boolean, kind?: EditKind): void {
    this.evictStalePendingEdits()
    this.evictRecentlyVerified()
    // Dedup: server may replay hmr_verified across reconnects or TTL retries.
    if (this.recentlyVerified.has(editId)) {
      trace('handleHMRVerified:duplicate', { editId })
      return
    }
    const pending = this.pendingEdits.get(editId)
    trace('handleHMRVerified', { editId, match, kind, hasPending: !!pending })
    if (!pending) return
    this.pendingEdits.delete(editId)
    this.recentlyVerified.set(editId, Date.now())

    if (!match) {
      // Server said "I wrote the file, but the HMR-applied value doesn't match
      // the expected value" — typically a TTL-eviction (30s with no HMR) or a
      // reader divergence. Surface this immediately: the override stays, but the
      // Panel gets a divergence card so the user learns something went wrong.
      for (const source of pending.sources) {
        emitDivergence({ source, property: pending.property, expected: pending.value, actual: '', pseudo: pending.pseudo })
      }
      return
    }

    // Per-source guard: if the user made a newer edit to the same property on a
    // specific source, skip verification for THAT source only — the newer override
    // has its own pending edit awaiting verification.
    for (const source of pending.sources) {
      const currentValue = this.get(source, pending.property, pending.pseudo)
      if (currentValue !== undefined && currentValue !== pending.value) {
        trace('handleHMRVerified:skip-stale', { source, property: pending.property, currentValue, expected: pending.value })
        continue
      }
      this.scheduleVerifyAndRemove(source, pending.property, pending.value, pending.pseudo, kind)
    }
  }

  private evictRecentlyVerified(): void {
    const cutoff = Date.now() - CSSOverrideManager.RECENTLY_VERIFIED_TTL_MS
    for (const [id, ts] of this.recentlyVerified) {
      if (ts < cutoff) this.recentlyVerified.delete(id)
    }
  }

  /** Queue a clearAll to run when the next HMR update lands in the browser. */
  queueClearAll(): void {
    this.pendingClearAll = true
  }

  /** Called when the browser confirms HMR stylesheet update has been applied
   *  (vite:afterUpdate). Only responsibility now: drain a queued clearAll.
   *  Verifications are scheduled directly from handleHMRVerified — no queue to
   *  drain here, which eliminates the ordering race where vite:afterUpdate's
   *  double-fire and rapid consecutive edits could flip a shared boolean flag
   *  to the wrong value. The retry mechanism inside armVerifyRetry catches any
   *  framework-commit latency. */
  onHMRApplied(): void {
    trace('onHMRApplied:enter', {
      pendingClearAll: this.pendingClearAll,
      activeOverrideCount: this.overrides.size,
    })
    if (this.pendingClearAll) {
      this.pendingClearAll = false
      this.clearAll()
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

  /** Read the current override value for a source+property. Returns undefined if no override exists.
   *  Used by command creation to capture previousValue before applying a new edit. */
  get(source: string, property: string, pseudo?: '::before' | '::after'): string | undefined {
    const key = `${source}${pseudo ?? ''}`
    return this.overrides.get(key)?.get(property)
  }

  /** Clear all overrides (e.g. on SPA navigation) */
  clearAll(): void {
    this.disposeVerifyRetryObservers()
    this.recentlyVerified.clear()
    this.overrides.clear()
    this.stateOverrides.clear()
    this.pendingEdits.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.disposeVerifyRetryObservers()
    this.recentlyVerified.clear()
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
