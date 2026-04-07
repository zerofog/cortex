import { render, type ComponentChild } from 'preact'
import { vi } from 'vitest'
import type { CortexChannel, ConnectionState, ServerToBrowser } from '../../src/adapters/types.js'

/**
 * Mock elementFromPoint — happy-dom returns null natively.
 * Returns a cleanup function that restores the original.
 */
export function mockElementFromPoint(target: Element | null): () => void {
  const original = document.elementFromPoint
  document.elementFromPoint = vi.fn().mockReturnValue(target)
  return () => { document.elementFromPoint = original }
}

/**
 * Mock getBoundingClientRect for a specific element.
 * Returns a cleanup function that restores the original.
 */
export function mockGetBoundingClientRect(
  el: Element,
  rect: Partial<DOMRect>,
): () => void {
  const original = el.getBoundingClientRect
  const full: DOMRect = {
    x: 0, y: 0, width: 0, height: 0,
    top: 0, right: 0, bottom: 0, left: 0,
    toJSON() { return this },
    ...rect,
  }
  el.getBoundingClientRect = () => full
  return () => { el.getBoundingClientRect = original }
}

/**
 * Dispatch a mouse event with sensible defaults.
 */
export function dispatchMouseEvent(
  target: EventTarget,
  type: string,
  opts?: Partial<MouseEventInit>,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...opts,
  })
  target.dispatchEvent(event)
  return event
}

/**
 * Create a Shadow DOM host similar to what Cortex bootstrap creates.
 */
export function createShadowHost(opts?: { mode?: 'open' | 'closed' }): {
  host: HTMLDivElement
  shadow: ShadowRoot
  root: HTMLDivElement
  cleanup: () => void
} {
  const host = document.createElement('div')
  host.setAttribute('data-cortex-host', '')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: opts?.mode ?? 'open' })
  const root = document.createElement('div')
  root.setAttribute('data-cortex-root', '')
  shadow.appendChild(root)
  return { host, shadow, root, cleanup: () => { host.remove() } }
}

/**
 * Create a mock CortexChannel for testing components.
 * _simulateMessage() delivers a server message to all registered handlers.
 */
export function createMockChannel(): CortexChannel & {
  _simulateMessage(msg: ServerToBrowser): void
  _simulateConnectionChange(state: ConnectionState): void
  _lastSent: unknown[]
} {
  const handlers: Array<(msg: ServerToBrowser) => void> = []
  const statusHandlers: Array<(state: ConnectionState) => void> = []
  const sent: unknown[] = []

  return {
    get connected() { return true },
    send(msg) { sent.push(msg) },
    onMessage(handler) {
      handlers.push(handler)
      return () => {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
    onConnectionChange(handler) {
      statusHandlers.push(handler)
      return () => {
        const idx = statusHandlers.indexOf(handler)
        if (idx >= 0) statusHandlers.splice(idx, 1)
      }
    },
    _simulateMessage(msg) { [...handlers].forEach(h => h(msg)) },
    _simulateConnectionChange(state) { [...statusHandlers].forEach(h => h(state)) },
    _lastSent: sent,
  }
}

/**
 * Mock getComputedStyle for a specific element.
 * Supports pseudo-element parameter — pass `pseudoStyles` to return different
 * values for `getComputedStyle(el, '::before')` / `getComputedStyle(el, '::after')`.
 * Returns a cleanup function that restores the original.
 */
export function mockGetComputedStyle(
  el: Element,
  styles: Record<string, string>,
  pseudoStyles?: Record<string, Record<string, string>>,
): () => void {
  const original = window.getComputedStyle
  window.getComputedStyle = ((target: Element, pseudo?: string | null) => {
    if (target === el) {
      if (pseudo && pseudoStyles?.[pseudo]) {
        const base = original.call(window, target) as CSSStyleDeclaration
        const merged = { ...base, ...pseudoStyles[pseudo] }
        // Support getPropertyValue for pseudo styles
        const result = new Proxy(merged, {
          get(obj, prop) {
            if (prop === 'getPropertyValue') {
              return (p: string) => {
                const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                return (obj as any)[camel] ?? (obj as any)[p] ?? ''
              }
            }
            return (obj as any)[prop]
          }
        })
        return result as unknown as CSSStyleDeclaration
      }
      return { ...original.call(window, target), ...styles } as CSSStyleDeclaration
    }
    return original.call(window, target, pseudo)
  }) as typeof window.getComputedStyle
  return () => { window.getComputedStyle = original }
}

/**
 * Mock IntersectionObserver for tab navigation tests.
 * Supports multiple observer instances (stores all callbacks).
 * Returns a trigger function to simulate intersection changes.
 */
export function mockIntersectionObserver(): {
  trigger: (entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio: number }>) => void
  cleanup: () => void
} {
  const callbacks: IntersectionObserverCallback[] = []
  const original = window.IntersectionObserver

  class MockIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      callbacks.push(cb)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

  return {
    trigger(entries) {
      for (const cb of callbacks) {
        cb(
          entries as unknown as IntersectionObserverEntry[],
          {} as IntersectionObserver,
        )
      }
    },
    cleanup() {
      window.IntersectionObserver = original
    },
  }
}

/**
 * Dispatch a pointer event with sensible defaults.
 */
export function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  opts?: Partial<PointerEventInit>,
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    ...opts,
  })
  target.dispatchEvent(event)
  return event
}

/**
 * Dispatch a keyboard event with sensible defaults.
 */
export function dispatchKeyboardEvent(
  target: EventTarget,
  type: string,
  opts?: Partial<KeyboardEventInit>,
): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...opts,
  })
  target.dispatchEvent(event)
  return event
}

/**
 * Render a Preact vnode into a shadow root for isolated component testing.
 * Returns the root element and a cleanup function.
 */
export function renderInShadow(vnode: ComponentChild): {
  root: HTMLDivElement
  shadow: ShadowRoot
  host: HTMLDivElement
  cleanup: () => void
} {
  const { host, shadow, root, cleanup: removeHost } = createShadowHost()
  render(vnode, root)
  return {
    root,
    shadow,
    host,
    cleanup: () => {
      render(null, root)
      removeHost()
    },
  }
}

/**
 * Mock document.fonts (FontFaceSet) for testing font detection.
 * happy-dom does not implement FontFaceSet as iterable.
 * Returns a cleanup function that restores the original.
 */
export function mockDocumentFonts(
  faces: Array<{ family: string; weight: string }>,
): () => void {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts')
  const mockFonts = {
    [Symbol.iterator]: function* () {
      for (const face of faces) yield face
    },
  }
  Object.defineProperty(document, 'fonts', {
    value: mockFonts,
    configurable: true,
  })
  return () => {
    if (original) {
      Object.defineProperty(document, 'fonts', original)
    } else {
      delete (document as any).fonts
    }
  }
}
