import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock CSS import (tsup's text loader won't be available in vitest)
vi.mock('../../src/browser/styles.css', () => ({
  default: '.cortex-hover-overlay { pointer-events: none; }',
}))

// Mock WebSocket to prevent real connections
class MockWebSocket {
  static readonly OPEN = 1
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()
  readyState = 0

  constructor(url: string) {
    this.url = url
  }
}

describe('bootstrap', () => {
  beforeEach(() => {
    // @ts-expect-error — mock WebSocket
    globalThis.WebSocket = MockWebSocket
    // Clean up any existing cortex host
    document.querySelectorAll('[data-cortex-host]').forEach(el => el.remove())
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
  })

  afterEach(async () => {
    // Dynamic import so we can reset between tests
    const mod = await import('../../src/browser/index.js')
    mod._resetForTesting()
    // Clean up
    document.querySelectorAll('[data-cortex-host]').forEach(el => el.remove())
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
  })

  it('creates <div data-cortex-host> on documentElement', async () => {
    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.documentElement.querySelector('[data-cortex-host]')
    expect(host).not.toBeNull()
    expect(host?.tagName).toBe('DIV')
  })

  it('host has position:fixed;inset:0;z-index:2147483646;pointer-events:none', async () => {
    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.documentElement.querySelector('[data-cortex-host]') as HTMLElement
    // Check via cssText since happy-dom may not parse shorthand 'inset' back
    const css = host.style.cssText
    expect(css).toContain('position: fixed')
    expect(css).toContain('inset: 0')
    expect(css).toContain('z-index: 2147483646')
    expect(css).toContain('pointer-events: none')
  })

  it('detects Vite channel when __cortex_send__ is present', async () => {
    window.__cortex_send__ = vi.fn()

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    // Verify __cortex_channel__ was set up (Vite channel registers handleServerMessage)
    expect(typeof window.__cortex_channel__?.handleServerMessage).toBe('function')

    delete window.__cortex_send__
    delete window.__cortex_channel__
  })

  it('is SILENT on the WS fallback when __cortex_ws_port__ is present (Next adapter, P2-1)', async () => {
    // The Next/webpack adapter injects __cortex_ws_port__ and never defines
    // __cortex_send__ — WS is the intended transport there, so bootstrap must
    // NOT warn (the old Vite-specific "remove <script> tags" warning fired on
    // every Next page load). No __cortex_send__.
    window.__cortex_ws_port__ = 5173
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    try {
      const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
      _resetForTesting()
      bootstrap()
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('__cortex_send__ not found'))
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('index.html'))
      expect(debug).not.toHaveBeenCalled() // ws port present → not even the debug line
    } finally {
      warn.mockRestore()
      debug.mockRestore()
      delete window.__cortex_ws_port__
      delete window.__cortex_channel__
    }
  })

  it('debug-logs ONCE (not warn) when there is no transport at all (P2-1)', async () => {
    // Neither __cortex_send__ nor __cortex_ws_port__ — the genuinely-broken
    // state. One adapter-neutral debug line, never a warn.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    try {
      const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
      _resetForTesting()
      bootstrap()
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('index.html'))
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('No editor transport'))
    } finally {
      warn.mockRestore()
      debug.mockRestore()
      delete window.__cortex_channel__
    }
  })

  it('_resetForTesting unmounts and removes host', async () => {
    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    expect(document.documentElement.querySelector('[data-cortex-host]')).not.toBeNull()

    _resetForTesting()

    expect(document.documentElement.querySelector('[data-cortex-host]')).toBeNull()
  })

  it('bootstrap is idempotent (calling twice does not duplicate host)', async () => {
    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()
    bootstrap()

    const hosts = document.documentElement.querySelectorAll('[data-cortex-host]')
    expect(hosts).toHaveLength(1)
  })
})

describe('theme detection', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    // @ts-expect-error — mock WebSocket
    globalThis.WebSocket = MockWebSocket
    originalMatchMedia = window.matchMedia
    document.querySelectorAll('[data-cortex-host]').forEach(el => el.remove())
    document.documentElement.removeAttribute('class')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mode')
  })

  afterEach(async () => {
    window.matchMedia = originalMatchMedia
    const mod = await import('../../src/browser/index.js')
    mod._resetForTesting()
    document.querySelectorAll('[data-cortex-host]').forEach(el => el.remove())
    document.documentElement.removeAttribute('class')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mode')
    try { localStorage.removeItem('cortex-theme-preference') } catch { /* ignore */ }
  })

  function mockMatchMedia(darkMode: boolean) {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? darkMode : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }

  it('sets data-theme="blueprint" when prefers-color-scheme: dark', async () => {
    mockMatchMedia(true)

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.getAttribute('data-theme')).toBe('blueprint')
  })

  it('does not set data-theme when light mode (default)', async () => {
    mockMatchMedia(false)

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.hasAttribute('data-theme')).toBe(false)
  })

  it('sets data-theme="blueprint" when html has class="dark"', async () => {
    mockMatchMedia(false)
    document.documentElement.classList.add('dark')

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.getAttribute('data-theme')).toBe('blueprint')
  })

  it.each(['data-theme', 'data-mode'])(
    'sets blueprint when html has %s="dark"',
    async (attr) => {
      mockMatchMedia(false)
      document.documentElement.setAttribute(attr, 'dark')

      const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
      _resetForTesting()
      bootstrap()

      const host = document.querySelector('[data-cortex-host]') as HTMLElement
      expect(host.getAttribute('data-theme')).toBe('blueprint')
    },
  )

  it('updates theme when matchMedia fires a change event', async () => {
    mockMatchMedia(false)

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.hasAttribute('data-theme')).toBe(false)

    // Find the MediaQueryList that had addEventListener('change', ...) called on it
    const matchMediaMock = window.matchMedia as ReturnType<typeof vi.fn>
    const mql = matchMediaMock.mock.results
      .map((r: { type: string; value: unknown }) => r.value as Record<string, ReturnType<typeof vi.fn>>)
      .find((v) => v.addEventListener.mock.calls.some((c: unknown[]) => c[0] === 'change'))
    expect(mql).toBeDefined()

    const changeHandler = mql!.addEventListener.mock.calls.find(
      (c: unknown[]) => c[0] === 'change'
    )![1] as (e: { matches: boolean }) => void

    // Simulate OS switching to dark mode
    mockMatchMedia(true)
    changeHandler({ matches: true })

    expect(host.getAttribute('data-theme')).toBe('blueprint')
  })

  it('_resetForTesting cleans up theme watchers', async () => {
    mockMatchMedia(false)

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    // Find the MediaQueryList that had addEventListener('change', ...) called on it
    const matchMediaMock = window.matchMedia as ReturnType<typeof vi.fn>
    const mql = matchMediaMock.mock.results
      .map((r: { type: string; value: unknown }) => r.value as Record<string, ReturnType<typeof vi.fn>>)
      .find((v) => v.addEventListener.mock.calls.some((c: unknown[]) => c[0] === 'change'))
    expect(mql).toBeDefined()

    _resetForTesting()

    const removeCalls = mql!.removeEventListener.mock.calls.filter(
      (c: unknown[]) => c[0] === 'change'
    )
    expect(removeCalls.length).toBeGreaterThan(0)
  })

  it('respects light preference override (ignores OS dark mode)', async () => {
    mockMatchMedia(true) // OS says dark

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    // Set preference AFTER _resetForTesting (which clears localStorage)
    localStorage.setItem('cortex-theme-preference', 'light')
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.hasAttribute('data-theme')).toBe(false) // light override wins
  })

  it('respects dark preference override (ignores OS light mode)', async () => {
    mockMatchMedia(false) // OS says light

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    // Set preference AFTER _resetForTesting (which clears localStorage)
    localStorage.setItem('cortex-theme-preference', 'dark')
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.getAttribute('data-theme')).toBe('blueprint')
  })

  it('system preference uses auto-detection', async () => {
    mockMatchMedia(true) // OS says dark

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    // Set preference AFTER _resetForTesting (which clears localStorage)
    localStorage.setItem('cortex-theme-preference', 'system')
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.getAttribute('data-theme')).toBe('blueprint') // system → auto → dark
  })

  it.each([
    [undefined, 'system'],
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', 'system'],
    ['invalid-value', 'system'],
  ])('getThemePreference(%s) → %s', async (stored, expected) => {
    if (stored !== undefined) {
      localStorage.setItem('cortex-theme-preference', stored)
    } else {
      localStorage.removeItem('cortex-theme-preference')
    }

    const { getThemePreference } = await import('../../src/browser/index.js')
    expect(getThemePreference()).toBe(expected)
  })

  it('setThemePreference persists to localStorage and re-applies theme', async () => {
    mockMatchMedia(false)

    const { bootstrap, setThemePreference, getThemePreference, _resetForTesting } =
      await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.querySelector('[data-cortex-host]') as HTMLElement
    expect(host.hasAttribute('data-theme')).toBe(false) // starts light

    setThemePreference('dark')
    expect(getThemePreference()).toBe('dark')
    expect(host.getAttribute('data-theme')).toBe('blueprint') // now dark

    setThemePreference('light')
    expect(getThemePreference()).toBe('light')
    expect(host.hasAttribute('data-theme')).toBe(false) // back to light
  })

  it('_resetForTesting clears theme preference from localStorage', async () => {
    localStorage.setItem('cortex-theme-preference', 'dark')

    const { _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()

    expect(localStorage.getItem('cortex-theme-preference')).toBeNull()
  })
})
