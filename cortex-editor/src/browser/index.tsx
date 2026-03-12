import { render } from 'preact'
import type { CortexChannel } from '../adapters/types.js'
import { CortexApp } from './components/CortexApp.js'
import { createViteChannel, createWebSocketChannel } from './channel.js'

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
  if (hostElement) return // Already bootstrapped

  // Create host element — fixed overlay, pointer-events:none, max z-index
  hostElement = document.createElement('div')
  hostElement.setAttribute('data-cortex-host', '')
  hostElement.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'
  document.documentElement.appendChild(hostElement)

  // Attach Shadow DOM (open for devtools inspection)
  shadowRoot = hostElement.attachShadow({ mode: 'open' })

  // Inject isolated CSS
  const style = document.createElement('style')
  style.textContent = cortexStyles
  shadowRoot.appendChild(style)

  // Create render target
  rootElement = document.createElement('div')
  rootElement.setAttribute('data-cortex-root', '')
  shadowRoot.appendChild(rootElement)

  // Detect adapter type and create appropriate channel
  activeChannel = typeof window.__cortex_send__ === 'function'
    ? createViteChannel()
    : createWebSocketChannel()

  // Render Preact app into shadow root
  render(<CortexApp channel={activeChannel} shadowRoot={shadowRoot} />, rootElement)
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
}

// Auto-activate on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
