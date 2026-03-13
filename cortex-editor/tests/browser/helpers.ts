import { render, type ComponentChild } from 'preact'
import { vi } from 'vitest'
import type { CortexChannel } from '../../src/adapters/types.js'
import type { ServerToBrowser } from '../../src/adapters/types.js'

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
export function createShadowHost(): {
  host: HTMLDivElement
  shadow: ShadowRoot
  root: HTMLDivElement
  cleanup: () => void
} {
  const host = document.createElement('div')
  host.setAttribute('data-cortex-host', '')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const root = document.createElement('div')
  root.setAttribute('data-cortex-root', '')
  shadow.appendChild(root)
  return {
    host,
    shadow,
    root,
    cleanup: () => { host.remove() },
  }
}

/**
 * Create a mock CortexChannel for testing components.
 * _simulateMessage() delivers a server message to all registered handlers.
 */
export function createMockChannel(): CortexChannel & {
  _simulateMessage(msg: ServerToBrowser): void
  _lastSent: unknown[]
} {
  const handlers: Array<(msg: ServerToBrowser) => void> = []
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
    _simulateMessage(msg) { handlers.forEach(h => h(msg)) },
    _lastSent: sent,
  }
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
