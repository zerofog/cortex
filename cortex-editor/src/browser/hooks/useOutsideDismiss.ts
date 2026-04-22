import { useEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'
import { registerPopoverDismiss } from '../popover-stack.js'

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
 * Trigger-aware bypass (`triggerRefs`): when a popover is opened by a
 * button outside the popover itself (e.g. a T-icon toggle next to a
 * font-family dropdown), a click on that button must NOT be treated as
 * "outside." Without a bypass, mousedown fires first and dismisses the
 * popover, then the button's click handler re-opens it — the user sees
 * the popover stay open. Any ref passed in `triggerRefs` is treated as
 * an extension of the popover's dismiss boundary; the button's own
 * onClick decides whether to toggle or re-open.
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
  triggerRefs?: ReadonlyArray<RefObject<Element>>,
): void {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  // Trigger refs captured via ref so listener identity stays stable even
  // if the caller passes a new array literal each render. The array length
  // and the individual ref identities are stable for the popover's lifetime,
  // so reading .current at event time is correct.
  const triggerRefsBox = useRef(triggerRefs)
  useEffect(() => {
    triggerRefsBox.current = triggerRefs
  }, [triggerRefs])

  // Register with the popover stack so CortexApp's Escape cascade can
  // defer to the topmost open popover. Without this, a picker-open +
  // Escape collapses the Panel because CortexApp's window-capture listener
  // reaches "deselect element" before our document-bubble Escape listener
  // fires. The registry is per-popover, not per-render; this effect
  // registers once, and the registered callback reads `onDismissRef.current`
  // so it always invokes the latest `onDismiss` without re-registering.
  useEffect(() => {
    return registerPopoverDismiss(() => onDismissRef.current())
  }, [])

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

    // Popover's own root — the ShadowRoot (or document) that directly
    // contains `ref.current`. At this level composedPath() is honest about
    // inside-shadow nodes, so `path.includes(current)` alone decides
    // whether the click was inside the popover.
    const ownRoot = roots[0]

    const handleMousedown = (e: Event): void => {
      const current = ref.current
      if (!current) return
      const path = e.composedPath()
      // Inside the popover, as seen at THIS listener's scope.
      if (path.includes(current)) return
      // At OUTER listeners (a document or parent shadow root above
      // ours), a click inside our shadow retargets to the host we
      // recorded — composedPath here is truncated at the closed-shadow
      // boundary and won't contain `current`. Bail when we see the host
      // in the path, otherwise we'd misclassify every inside-popover
      // click as "outside" once it bubbles past the shadow boundary.
      // Critically, this check is skipped at the popover's OWN root —
      // there, the host is always in the path for every shadow-internal
      // click, so applying this check would block every legitimate
      // outside-popover dismiss. (currentTarget is the listener's own
      // root; comparing against `ownRoot` isolates the inner listener.)
      if (e.currentTarget !== ownRoot) {
        for (const h of hosts) {
          if (path.includes(h)) return
        }
      }
      // Trigger-aware bypass: if the click originated on a registered
      // trigger element (the button that toggles this popover), let the
      // trigger's own onClick handle the state. Without this, the trigger
      // click would dismiss the popover AND re-open it in the same gesture.
      const triggers = triggerRefsBox.current
      if (triggers) {
        for (const t of triggers) {
          const el = t.current
          if (el && path.includes(el)) return
        }
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
