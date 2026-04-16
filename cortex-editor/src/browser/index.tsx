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
let themeMediaQuery: MediaQueryList | null = null
let themeObserver: MutationObserver | null = null
let currentTheme: 'blueprint' | null = null

export type { ThemePreference } from './theme.js'
export { getThemePreference, setThemePreference } from './theme.js'
import { getThemePreference, THEME_STORAGE_KEY, _registerPreferenceChangeHandler, _clearPreferenceChangeHandler } from './theme.js'

export function detectTheme(): 'blueprint' | null {
  const pref = getThemePreference()
  if (pref === 'light') return null
  if (pref === 'dark') return 'blueprint'

  // pref === 'system' — auto-detect
  // Explicit app signals first — app overrides OS preference
  const html = document.documentElement
  if (html.classList.contains('dark')) return 'blueprint'
  if (html.classList.contains('light')) return null
  const dataTheme = html.getAttribute('data-theme')
  if (dataTheme?.includes('dark')) return 'blueprint'
  if (dataTheme?.includes('light')) return null
  const dataMode = html.getAttribute('data-mode')
  if (dataMode?.includes('dark')) return 'blueprint'
  if (dataMode?.includes('light')) return null

  // OS preference as fallback (only when app has no explicit signal)
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'blueprint'

  // Luminance fallback: sample background color of the page
  if (!document.body) return null
  const bg = getComputedStyle(document.body).backgroundColor
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
  if (match) {
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1
    if (alpha < 0.01) return null // transparent — inconclusive
    const r = Number(match[1]) / 255
    const g = Number(match[2]) / 255
    const b = Number(match[3]) / 255
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (luminance < 0.4) return 'blueprint'
  }

  return null
}

function applyTheme(): void {
  if (!hostElement) return
  const theme = detectTheme()
  if (theme === currentTheme) return
  currentTheme = theme
  if (theme) {
    hostElement.setAttribute('data-theme', theme)
  } else {
    hostElement.removeAttribute('data-theme')
  }
}

/**
 * Create the Shadow DOM host, detect channel type, and render CortexApp.
 * Exported for testability — auto-activation is handled by the IIFE wrapper below.
 */
export function bootstrap(): void {
  // Load Geist fonts into document scope (font-face must be document-level for Shadow DOM).
  // Runs before bootstrap guards — idempotent, ensures fonts load even if another
  // script instance already created the host element.
  if (!document.querySelector('[data-cortex-fonts]')) {
    const fontLink = document.createElement('link')
    fontLink.setAttribute('data-cortex-fonts', '')
    fontLink.rel = 'stylesheet'
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap'
    document.head.appendChild(fontLink)
  }

  if (hostElement) return // Already bootstrapped (same script instance)
  if (document.querySelector('[data-cortex-host]')) return // Already bootstrapped (another script instance)

  // Create host element — fixed overlay, pointer-events:none, max z-index
  hostElement = document.createElement('div')
  hostElement.setAttribute('data-cortex-host', '')
  hostElement.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'
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

  applyTheme()
  _registerPreferenceChangeHandler(applyTheme)

  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  themeMediaQuery.addEventListener('change', applyTheme)

  themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-mode'],
  })

  // Detect adapter type and create appropriate channel
  if (typeof window.__cortex_send__ === 'function') {
    activeChannel = createViteChannel()
  } else {
    console.warn('[cortex] __cortex_send__ not found — using WebSocket fallback. If you are using the Vite plugin, remove any manual <script> tags for cortex-browser.js from your index.html.')
    activeChannel = createWebSocketChannel()
  }

  // Trigger server handshake — server responds with hello + swatches
  activeChannel.send({ type: 'init', sessionId: window.__CORTEX_SESSION_ID__ })

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
  themeMediaQuery?.removeEventListener('change', applyTheme)
  themeMediaQuery = null
  themeObserver?.disconnect()
  themeObserver = null
  currentTheme = null
  hostElement?.remove()
  hostElement = null
  shadowRoot = null
  rootElement = null
  _setCortexHost(null, null)
  document.querySelector('[data-cortex-fonts]')?.remove()
  _clearPreferenceChangeHandler()
  try { localStorage.removeItem(THEME_STORAGE_KEY) } catch { /* ignore */ }
}

// Auto-activate on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
