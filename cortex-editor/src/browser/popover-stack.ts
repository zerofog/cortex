/**
 * LIFO stack of open popover dismissers.
 *
 * Why this exists: CortexApp's Escape cascade (CortexApp.tsx) runs in
 * window-capture phase and calls `preventDefault()` before popover-internal
 * Escape listeners can react. Result: Escape with a chip picker open would
 * skip the picker and deselect the element (collapsing the Panel) — one
 * keypress destroys two layers of UI state. The stack lets the cascade
 * defer to the topmost open popover instead.
 *
 * Contract:
 *   - Popover mounts → push its dismiss callback. Receive an unregister fn.
 *   - Popover unmounts → call the unregister fn (removes that specific entry,
 *     not the top — unmount order isn't guaranteed to be LIFO if React
 *     unmounts parents first).
 *   - CortexApp's Escape handler calls `dismissTopmostPopover()` before its
 *     own cascade steps, bailing out if any popover was dismissed.
 *
 * Not a context/prop because popovers can be rendered anywhere in the tree
 * and the alternative (bus through Preact context) would force every
 * popover-aware consumer to subscribe. A module-level stack is the minimal
 * shape — one producer per mount, one consumer per Escape press.
 */

const stack: Array<() => void> = []

/** Register a popover's dismiss callback. Returns an unregister fn that
 *  removes the specific entry (safe even if other popovers opened/closed
 *  in between). */
export function registerPopoverDismiss(dismiss: () => void): () => void {
  stack.push(dismiss)
  return () => {
    const idx = stack.lastIndexOf(dismiss)
    if (idx >= 0) stack.splice(idx, 1)
  }
}

/** Dismiss the topmost open popover, if any. Returns true if something was
 *  dismissed — callers use this to decide whether to preventDefault and
 *  stop the rest of their Escape cascade. */
export function dismissTopmostPopover(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  // Pop BEFORE calling — dismiss will typically unmount the popover, which
  // runs the unregister fn and splices the same entry. Popping first keeps
  // the stack consistent if unregister and dismiss race.
  stack.pop()
  top()
  return true
}

/** True when at least one popover is open. Exposed for test inspection. */
export function hasOpenPopover(): boolean {
  return stack.length > 0
}

/** Test-only reset. Never call in production — would orphan mounted popovers. */
export function _resetPopoverStackForTesting(): void {
  stack.length = 0
}
