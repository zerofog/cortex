/**
 * Private event bus for CSS override rebuild + divergence notifications.
 *
 * Module-scoped EventTarget — inaccessible to host-page scripts.
 * `change` fires after CSSOverrideManager.rebuild() writes new CSS rules,
 * so SelectionOverlay can wake its idle RAF loop and re-read geometry.
 * `divergence` fires when the override-lifecycle verifier discovers that a
 * committed edit did not propagate to the DOM (source reports success, but
 * the element's actual value doesn't match expected). Panel subscribes to
 * surface the mismatch as an edit error, preserving the override preview
 * rather than reverting silently.
 */
import type { EditKind } from '../adapters/types.js'

let bus = new EventTarget()

export function emitOverrideChange(): void {
  bus.dispatchEvent(new Event('change'))
}

export function onOverrideChange(cb: () => void): () => void {
  bus.addEventListener('change', cb)
  return () => bus.removeEventListener('change', cb)
}

/**
 * Test-only: replace the module-scope EventTarget with a fresh one so that
 * any listeners from a prior test are garbage-collected with the old bus.
 * The Panel / CortexApp effects reference `bus` by closure through the
 * emit/subscribe helpers, so the next call picks up the new instance. Call
 * from `beforeEach` in any test that mounts components which subscribe to
 * this bus — otherwise leaked listeners from the previous test fire on the
 * current test's emissions and contaminate assertions (ZF0-1297 test-hygiene
 * fix; supersedes retry:2 workaround from ZF0-1322).
 */
export function _resetBusForTesting(): void {
  bus = new EventTarget()
}

/** Where `actual` was read from — disambiguates bug classes:
 *  - 'inline-style': `el.style.getPropertyValue(property)` (jsx-immediate kind)
 *  - 'computed-style': `getComputedStyle(el)` after detaching the override <style>
 *  - 'server-mismatch': server reported match=false (no DOM read happened) */
export type DivergenceSource = 'inline-style' | 'computed-style' | 'server-mismatch'

export interface OverrideDivergence {
  source: string
  property: string
  expected: string
  actual: string
  pseudo?: '::before' | '::after'
  /** Diagnostic enrichment — required on every emission. The type is
   *  internal (not a public SDK surface), so making this required enforces
   *  the contract at compile time rather than relying on `?.` chains in
   *  every consumer. All three emit sites in `override.ts` populate this. */
  diagnostics: OverrideDivergenceDiagnostics
}

/** ZF0-1293: diagnostic context that makes a mystery divergence self-diagnosing.
 *  Reason for each field: H1 (prior-edit stale inline style) → `priorValues`
 *  plus `actualReadFrom='inline-style'` proves it. H2 (shorthand clobber) →
 *  `kindUsed='jsx-immediate'` + `actualReadFrom='inline-style'` + a specific
 *  `actual` that matches a shorthand parent's value. `retryDurationMs` tells
 *  us whether the window was exhausted or we short-circuited. */
export interface OverrideDivergenceDiagnostics {
  /** Which DOM read path produced `actual`. */
  actualReadFrom: DivergenceSource
  /** The EditKind carried through the verify pipeline, if any. Typed as
   *  `EditKind` (not `string`) so new kinds added to the union are enforced
   *  at compile time at every consumer — the debug disclosure and any
   *  future telemetry consumer must handle each variant explicitly. */
  kindUsed?: EditKind
  /** Bounded ring buffer (most recent last, capped at 5) of values passed to
   *  `CSSOverrideManager.set()` for this source+property+pseudo during the
   *  session. Helps identify "was `actual` something we set earlier?" */
  priorValues: readonly string[]
  /** Milliseconds from `armVerifyRetry` to the emit moment. `undefined` when
   *  divergence was emitted without a retry cycle (e.g., server-mismatch). */
  retryDurationMs?: number
  /** Non-empty when the divergence came from the retry-error catch path — the
   *  verifier threw while reading the DOM. Without this, a card from "the
   *  read threw" is indistinguishable from "React committed a stale value".
   *  Populated with `String(err)` so the Debug disclosure can surface it. */
  errorMessage?: string
}

export function emitDivergence(detail: OverrideDivergence): void {
  bus.dispatchEvent(new CustomEvent('divergence', { detail }))
}

export function onDivergence(cb: (detail: OverrideDivergence) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<OverrideDivergence>).detail)
  bus.addEventListener('divergence', handler)
  return () => bus.removeEventListener('divergence', handler)
}
