/**
 * Private event bus for canvas transform updates.
 *
 * Module-scoped EventTarget — inaccessible to host-page scripts.
 * Only internal Cortex modules can import and use it.
 */
let bus = new EventTarget()

export function emitTransformUpdate(): void {
  bus.dispatchEvent(new Event('update'))
}

export function onTransformUpdate(cb: () => void): () => void {
  bus.addEventListener('update', cb)
  return () => bus.removeEventListener('update', cb)
}

/**
 * Test-only: replace the module-scope EventTarget with a fresh one so any
 * listeners from a prior test are garbage-collected with the old bus.
 *
 * Mirrors `_resetBusForTesting` in override-bus.ts — the same intra-file
 * leak class applies here. SelectionOverlay/HoverOverlay subscribe in
 * useEffect; if a test throws before unmount, or if Preact's effect cleanup
 * is delayed, the listener stays bound. The next test's emitTransformUpdate
 * then fires stale callbacks that call forceRender on unmounted components,
 * which can interfere with subsequent geometry/state assertions
 * (ZF0-1297 → ZF0-1322 → ZF0-1360 root-cause fix — closes test-flake epidemic
 * on positive vi.waitFor assertions in cortex-app, panel, hover-overlay,
 * selection-overlay).
 */
export function _resetTransformBusForTesting(): void {
  bus = new EventTarget()
}
