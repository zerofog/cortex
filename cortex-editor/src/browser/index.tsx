import { render } from 'preact'
import type { CortexChannel } from '../adapters/types.js'
import { CortexApp } from './components/CortexApp.js'
import { createViteChannel, createWebSocketChannel } from './channel.js'
import { _setCortexHost } from './focus-utils.js'

// tsup's text loader imports CSS as a string
import cortexStyles from './styles.css'

let hostElement: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null
let rootElement: HTMLDivElement | null = null
let activeChannel: CortexChannel | null = null

/**
 * Create the Shadow DOM host, detect channel type, and render CortexApp.
 * Exported for testability — auto-activation is handled by the IIFE wrapper below.
 */
export function bootstrap(): void {
  if (hostElement) return // Already bootstrapped (same script instance)
  if (document.querySelector('[data-cortex-host]')) return // Already bootstrapped (another script instance)

  // Create host element — fixed overlay, pointer-events:none, max z-index
  hostElement = document.createElement('div')
  hostElement.setAttribute('data-cortex-host', '')
  hostElement.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;will-change:transform'
  document.documentElement.appendChild(hostElement)

  // Attach closed Shadow DOM — prevents host-page scripts from accessing editor internals
  shadowRoot = hostElement.attachShadow({ mode: 'closed' })
  _setCortexHost(hostElement, shadowRoot)

  // Inject isolated CSS
  const style = document.createElement('style')
  style.textContent = cortexStyles
  shadowRoot.appendChild(style)

  // Create render target
  rootElement = document.createElement('div')
  rootElement.setAttribute('data-cortex-root', '')
  shadowRoot.appendChild(rootElement)

  // Detect adapter type and create appropriate channel
  if (typeof window.__cortex_send__ === 'function') {
    activeChannel = createViteChannel()
  } else {
    console.warn('[cortex] __cortex_send__ not found — using WebSocket fallback. If you are using the Vite plugin, remove any manual <script> tags for cortex-browser.js from your index.html.')
    activeChannel = createWebSocketChannel()
  }

  // Trigger server handshake — server responds with hello + swatches
  activeChannel.send({ type: 'init' })

  // Read initial active state from DOM attribute (set by toggle shortcut before bootstrap)
  const initialActive = document.documentElement.hasAttribute('data-cortex-active')

  // Render Preact app into shadow root
  render(
    <CortexApp channel={activeChannel} shadowRoot={shadowRoot} initialActive={initialActive} />,
    rootElement,
  )

  // Clean up pending toggle flag (consumed by initialActive)
  if (window.__cortex_pending_toggle__) {
    delete window.__cortex_pending_toggle__
  }
}

/**
 * Unmount and remove host element. For testing only.
 */
export function _resetForTesting(): void {
  if (rootElement) {
    render(null, rootElement)
  }
  activeChannel?.dispose?.()
  activeChannel = null
  hostElement?.remove()
  hostElement = null
  shadowRoot = null
  rootElement = null
  _setCortexHost(null, null)
}

// Auto-activate on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
