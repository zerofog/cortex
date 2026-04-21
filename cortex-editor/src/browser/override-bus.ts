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
const bus = new EventTarget()

export function emitOverrideChange(): void {
  bus.dispatchEvent(new Event('change'))
}

export function onOverrideChange(cb: () => void): () => void {
  bus.addEventListener('change', cb)
  return () => bus.removeEventListener('change', cb)
}

export interface OverrideDivergence {
  source: string
  property: string
  expected: string
  actual: string
  pseudo?: '::before' | '::after'
}

export function emitDivergence(detail: OverrideDivergence): void {
  bus.dispatchEvent(new CustomEvent('divergence', { detail }))
}

export function onDivergence(cb: (detail: OverrideDivergence) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<OverrideDivergence>).detail)
  bus.addEventListener('divergence', handler)
  return () => bus.removeEventListener('divergence', handler)
}
