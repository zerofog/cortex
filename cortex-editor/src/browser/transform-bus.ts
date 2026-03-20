/**
 * Private event bus for canvas transform updates.
 *
 * Module-scoped EventTarget — inaccessible to host-page scripts.
 * Only internal Cortex modules can import and use it.
 */
const bus = new EventTarget()

export function emitTransformUpdate(): void {
  bus.dispatchEvent(new Event('update'))
}

export function onTransformUpdate(cb: () => void): () => void {
  bus.addEventListener('update', cb)
  return () => bus.removeEventListener('update', cb)
}
