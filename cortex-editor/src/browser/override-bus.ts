/**
 * Private event bus for CSS override rebuild notifications.
 *
 * Module-scoped EventTarget — inaccessible to host-page scripts.
 * Fired after CSSOverrideManager.rebuild() writes new CSS rules,
 * so SelectionOverlay can wake its idle RAF loop and re-read geometry.
 */
const bus = new EventTarget()

export function emitOverrideChange(): void {
  bus.dispatchEvent(new Event('change'))
}

export function onOverrideChange(cb: () => void): () => void {
  bus.addEventListener('change', cb)
  return () => bus.removeEventListener('change', cb)
}
