import { useEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

/**
 * Dismiss a popover-like element on outside click or Escape. Shadow-DOM-aware.
 *
 * Why this is non-trivial: the cortex panel renders inside a closed
 * ShadowRoot, and `document.addEventListener('mousedown', ...)` sees only
 * the shadow host as `event.target` for clicks that originate inside the
 * shadow (closed-shadow retargeting). The naive
 * `ref.current.contains(event.target)` check therefore misclassifies every
 * click inside the popover as an outside click.
 *
 * The correct pattern walks every shadow boundary between `ref.current`
 * and `document`, registering the mousedown listener on each root. At each
 * listener, `composedPath()` is honest about nodes up to (but not beyond)
 * that boundary. Taking `composedPath().includes(ref.current)` across the
 * union of listeners catches shadow-internal clicks regardless of depth.
 *
 * Two additional correctness properties worth documenting:
 *   - `onDismiss` is captured via a ref so listener identity stays stable
 *     across parent re-renders. A parent passing an inline arrow would
 *     otherwise cause the effect to tear down and re-register every render,
 *     opening a microtask hole where a click lands between removal and
 *     re-addition.
 *   - The `ref` parameter's container is stable for a component's lifetime,
 *     so it is NOT in the effect deps; depending on it would be a no-op at
 *     best and misleading at worst. The effect re-runs only when the
 *     component unmounts or the ref reassigns (never in practice).
 *
 * Escape is registered on `document` because keyboard events propagate
 * across shadow boundaries as composed events — `document` sees them
 * regardless of focus location.
 */
export function useOutsideDismiss(
  ref: RefObject<Element>,
  onDismiss: () => void,
): void {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Build the chain of roots from node up to document. Each root hosts a
    // mousedown listener so we can catch clicks at every scope level.
    // Also record the shadow *hosts* in the chain — at outer listeners,
    // `composedPath()` for a click inside a closed inner shadow is
    // truncated and does NOT include `ref.current`, but it DOES include
    // the host element that owns the inner shadow (retargeting). Checking
    // for any of our recorded hosts in the path lets the outer listeners
    // correctly recognize "this click originated somewhere inside our
    // popover's shadow ancestry" and bail out.
    const roots: Array<Document | ShadowRoot> = []
    const hosts: Element[] = []
    let cursor: Node = node
    while (true) {
      const root = cursor.getRootNode()
      if (!(root instanceof ShadowRoot)) {
        roots.push(document)
        break
      }
      roots.push(root)
      hosts.push(root.host)
      cursor = root.host
    }

    const handleMousedown = (e: Event): void => {
      const current = ref.current
      if (!current) return
      const path = e.composedPath()
      // Inside the popover, as seen at THIS listener's scope.
      if (path.includes(current)) return
      // At outer scopes (higher shadow root or document), inside-shadow
      // clicks retarget to a host we recorded. Bail for those too.
      for (const h of hosts) {
        if (path.includes(h)) return
      }
      onDismissRef.current()
    }

    const handleKeydown = (e: KeyboardEvent): void => {
      // Respect upstream handlers that already claimed the keystroke.
      // Without this, a nested <dialog> or the CortexApp root Escape
      // cascade (which preventDefaults when it handles Escape) would
      // still trigger the popover's dismiss — two actions per keypress.
      if (e.key === 'Escape' && !e.defaultPrevented) onDismissRef.current()
    }

    for (const r of roots) r.addEventListener('mousedown', handleMousedown)
    document.addEventListener('keydown', handleKeydown)
    return () => {
      for (const r of roots) r.removeEventListener('mousedown', handleMousedown)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [ref])
}
