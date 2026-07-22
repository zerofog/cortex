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
/** One-shot guard so the no-transport diagnostic never spams across re-renders. */
let warnedNoTransport = false

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

  // Detect adapter type and create appropriate channel.
  if (typeof window.__cortex_send__ === 'function') {
    activeChannel = createViteChannel()
  } else {
    // WebSocket transport. This is the INTENDED path for the Next/webpack
    // adapter (which injects __cortex_ws_port__ and never defines
    // __cortex_send__) — so it must be SILENT there, not warn on every render
    // with Vite-specific advice. Only note the genuinely-broken state (no
    // bridge AND no port), at debug level, once, in adapter-neutral terms.
    if (typeof window.__cortex_ws_port__ !== 'number' && !warnedNoTransport) {
      warnedNoTransport = true
      console.debug(
        '[cortex] No editor transport found (neither __cortex_send__ nor ' +
        '__cortex_ws_port__). The dev-server bridge may not have injected — ' +
        'check that withCortex() / the cortex plugin is active.',
      )
    }
    activeChannel = createWebSocketChannel()
  }

  // Init signal is sent from CortexApp's useEffect AFTER it subscribes to onMessage.
  // This enforces listen-first ordering: the server's hello response is async, so we
  // must guarantee a handler is attached before signaling readiness. Emitting init
  // here would create a race where hello arrives before the subscriber exists.

  // Initial active state — two sources with explicit precedence (?? not ||):
  //  1. window.__cortex_pending_set_active__ — the user's NEWER, explicit
  //     intent from a pre-bootstrap keyboard press. Takes precedence when
  //     present, whether true OR false.
  //  2. data-cortex-active on <html> — the documented escape hatch for
  //     E2E tests (helpers/bridge.ts:230 uses this to pre-activate Cortex
  //     before page.goto, since e2e specs have no server). Used only when
  //     no pending request is present.
  // ?? (nullish coalescing) is intentional: an explicit pending {active:false}
  // would be lost under ||, which treats false as absent. Codex P2 finding.
  const initialActive =
    window.__cortex_pending_set_active__?.active
      ?? document.documentElement.hasAttribute('data-cortex-active')

  // Render Preact app into shadow root
  render(
    <CortexApp channel={activeChannel} shadowRoot={shadowRoot} initialActive={initialActive} />,
    rootElement,
  )

  // Clean up pending toggle flag (consumed by initialActive)
  if (window.__cortex_pending_toggle__) {
    delete window.__cortex_pending_toggle__
  }

  // Pillar 1: drain any cortex/set-active queued before the channel was ready.
  if (window.__cortex_pending_set_active__) {
    const pending = window.__cortex_pending_set_active__
    delete window.__cortex_pending_set_active__
    if (typeof window.__cortex_send__ === 'function') {
      window.__cortex_send__(pending)
    }
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
  warnedNoTransport = false
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
