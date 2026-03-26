/** Module-scoped references to Cortex host + shadow root, set at bootstrap. */
let cortexHost: HTMLElement | null = null
let cortexShadowRoot: ShadowRoot | null = null

/** Set Cortex host + shadow root references. Called once from bootstrap(). */
export function _setCortexHost(host: HTMLElement | null, shadow: ShadowRoot | null): void {
  cortexHost = host
  cortexShadowRoot = shadow
}

/**
 * Get the actual focused element, traversing into shadow roots.
 * Handles closed shadow DOM by using stored cortexShadowRoot reference.
 */
export function getDeepActiveElement(): Element | null {
  let el: Element | null = document.activeElement
  // Special case: closed shadow root — use stored reference
  if (el === cortexHost && cortexShadowRoot?.activeElement) {
    el = cortexShadowRoot.activeElement
  }
  // Continue traversal for nested open shadow roots (e.g. vanilla-colorful)
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement
  }
  return el
}

/** Is the user currently typing in a text input? */
export function isInputFocused(): boolean {
  const el = getDeepActiveElement()
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return true
  if (el.isContentEditable) return true
  const role = el.getAttribute('role')
  if (role === 'textbox' || role === 'searchbox') return true
  return false
}

/** Is the focused element inside Cortex's Shadow DOM? Uses reference equality. */
export function isCortexUIFocused(): boolean {
  if (!cortexHost) return false
  const el = document.activeElement
  if (!el) return false
  if (el === cortexHost) return true
  let root: Node = el.getRootNode()
  while (root instanceof ShadowRoot) {
    if (root.host === cortexHost) return true
    root = root.host.getRootNode()
  }
  return false
}

/**
 * Check if a keyboard event is real (not synthetic).
 * Extracted to a function so tests can stub it via vi.spyOn.
 */
export function isRealEvent(e: Event): boolean {
  return e.isTrusted === true
}
