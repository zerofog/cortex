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

  it('attaches closed shadow DOM (internals not externally accessible)', async () => {
    // Shadow DOM internals (styles, render target) are verified by component tests
    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    const host = document.documentElement.querySelector('[data-cortex-host]') as HTMLElement
    // Closed shadow root: host.shadowRoot returns null to external code
    expect(host.shadowRoot).toBeNull()
  })

  it('detects Vite channel when __cortex_send__ is present', async () => {
    window.__cortex_send__ = vi.fn()

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    // Verify __cortex_channel__ was set up (Vite channel registers handleServerMessage)
    expect(window.__cortex_channel__).toBeDefined()
    expect(typeof window.__cortex_channel__?.handleServerMessage).toBe('function')

    delete window.__cortex_send__
    delete window.__cortex_channel__
  })

  it('falls back to WebSocket when __cortex_send__ is not present', async () => {
    delete window.__cortex_send__

    const { bootstrap, _resetForTesting } = await import('../../src/browser/index.js')
    _resetForTesting()
    bootstrap()

    // WebSocket channel should not set __cortex_channel__
    expect(window.__cortex_channel__).toBeUndefined()
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
