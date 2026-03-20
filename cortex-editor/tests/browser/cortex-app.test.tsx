import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { CortexApp } from '../../src/browser/components/CortexApp.js'
import { createShadowHost, createMockChannel, mockGetBoundingClientRect } from './helpers.js'

// Mock the selection module to verify it's called correctly
vi.mock('../../src/browser/selection.js', () => {
  const cleanupFn = vi.fn()
  const setDesignModeFn = vi.fn()
  const setInterceptClicksFn = vi.fn()
  let hoverCb: ((el: HTMLElement | null) => void) | null = null
  let selectCb: ((el: HTMLElement | null) => void) | null = null

  return {
    initSelection: vi.fn((_shadow: ShadowRoot, onHover: (el: HTMLElement | null) => void, onSelect: (el: HTMLElement | null) => void) => {
      hoverCb = onHover
      selectCb = onSelect
      return { cleanup: cleanupFn, setDesignMode: setDesignModeFn, setInterceptClicks: setInterceptClicksFn }
    }),
    _getCallbacks: () => ({ hoverCb, selectCb }),
    _cleanup: cleanupFn,
  }
})

// Import the mocked module to access internals
import { initSelection } from '../../src/browser/selection.js'

describe('CortexApp', () => {
  let root: HTMLDivElement
  let shadow: ShadowRoot
  let cleanupHost: () => void

  afterEach(() => {
    if (root) render(null, root)
    if (cleanupHost) cleanupHost()
    vi.clearAllMocks()
  })

  function setup() {
    const sh = createShadowHost()
    root = sh.root
    shadow = sh.shadow
    cleanupHost = sh.cleanup
    return sh
  }

  async function activateEditor(channel: ReturnType<typeof createMockChannel>) {
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))
  }

  it('renders without crash', () => {
    setup()
    const channel = createMockChannel()
    expect(() => {
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    }).not.toThrow()
  })

  it('calls initSelection on mount with shadow root', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)

    // Wait for useEffect to fire
    await new Promise(r => setTimeout(r, 10))

    expect(initSelection).toHaveBeenCalledWith(
      shadow,
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('hover callback updates HoverOverlay', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Get the hover callback passed to initSelection
    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { hoverCb: (el: HTMLElement | null) => void }
    }
    const { hoverCb } = _getCallbacks()

    // Create a target element with mocked rect
    const target = document.createElement('div')
    target.className = 'test-target'
    document.body.appendChild(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })

    // Trigger hover
    hoverCb(target)
    // Preact re-renders synchronously
    await new Promise(r => setTimeout(r, 0))

    const overlay = root.querySelector('.cortex-hover-overlay')
    expect(overlay).not.toBeNull()

    target.remove()
  })

  it('select callback updates SelectionOverlay', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (el: HTMLElement | null) => void }
    }
    const { selectCb } = _getCallbacks()

    const target = document.createElement('div')
    document.body.appendChild(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(target)
    await new Promise(r => setTimeout(r, 0))

    const overlay = root.querySelector('.cortex-selection-overlay')
    expect(overlay).not.toBeNull()

    target.remove()
  })

  it('creates CSSOverrideManager on mount', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    const styleEl = document.head.querySelector('[data-cortex-override]')
    expect(styleEl).not.toBeNull()
  })

  it('subscribes to channel.onMessage', async () => {
    setup()
    const channel = createMockChannel()
    const spy = vi.spyOn(channel, 'onMessage')
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    expect(spy).toHaveBeenCalledWith(expect.any(Function))
  })

  it('cleanup calls onMessage unsubscribe', async () => {
    setup()
    const channel = createMockChannel()
    const unsubscribe = vi.fn()
    vi.spyOn(channel, 'onMessage').mockReturnValue(unsubscribe)
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Unmount to trigger cleanup
    render(null, root)
    await new Promise(r => setTimeout(r, 10))

    expect(unsubscribe).toHaveBeenCalled()
  })

  it('switching elements clears state overrides', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (el: HTMLElement | null) => void }
    }
    const { selectCb } = _getCallbacks()

    // Select element A
    const elA = document.createElement('div')
    elA.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(elA)
    mockGetBoundingClientRect(elA, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(elA)
    await new Promise(r => setTimeout(r, 10))

    // Verify CSSOverrideManager style element exists
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl).not.toBeNull()

    // Select element B — state overrides from A should be cleared
    const elB = document.createElement('div')
    elB.setAttribute('data-cortex-source', 'Card.tsx:10:1')
    document.body.appendChild(elB)
    mockGetBoundingClientRect(elB, { top: 150, left: 50, width: 100, height: 40 })

    selectCb(elB)
    await new Promise(r => setTimeout(r, 10))

    // Style tag should not contain stale state overrides from element A
    // (clearStateOverrides was called unconditionally on selection change)
    expect(styleEl.textContent).toBe('')

    elA.remove()
    elB.remove()
  })

  it('cleans up on unmount', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    const { _cleanup } = await import('../../src/browser/selection.js') as unknown as {
      _cleanup: ReturnType<typeof vi.fn>
    }

    // Unmount
    render(null, root)
    await new Promise(r => setTimeout(r, 10))

    expect(_cleanup).toHaveBeenCalled()

    // CSSOverrideManager should be disposed (style element removed)
    const styleEl = document.head.querySelector('[data-cortex-override]')
    expect(styleEl).toBeNull()
  })

  it('renders toolbar even without selection', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)
    const toolbar = root.querySelector('.cortex-toolbar')
    expect(toolbar).not.toBeNull()
  })

  it('tracks activity count from edit_status done messages', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)
    channel._simulateMessage({ type: 'edit_status', editId: 'e1', status: 'done' })
    await new Promise(r => setTimeout(r, 10))
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge?.textContent).toContain('1')
  })

  it('starts inactive — no toolbar or overlays rendered', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    expect(root.querySelector('.cortex-toolbar')).toBeNull()
  })

  it('activates when receiving cortex message', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
  })

  it('ignores duplicate cortex message when already active', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    channel._simulateMessage({ type: 'cortex' } as any)
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))
    // Should still have exactly one toolbar
    const toolbars = root.querySelectorAll('.cortex-toolbar')
    expect(toolbars.length).toBe(1)
  })

  it('sends cortex-closed when user exits via Escape', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Activate
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))

    // Exit via Escape (no element selected)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))

    expect(channel._lastSent).toContainEqual({ type: 'cortex-closed' })
    expect(root.querySelector('.cortex-toolbar')).toBeNull()
  })

  it('Escape with selection deselects but does not exit', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Activate
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))

    // Simulate element selection
    const { _getCallbacks } = await import('../../src/browser/selection.js') as any
    const { selectCb } = _getCallbacks()
    const target = document.createElement('div')
    document.body.appendChild(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb(target)
    await new Promise(r => setTimeout(r, 10))

    // Escape deselects, not exits
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 10))

    expect(root.querySelector('.cortex-toolbar')).not.toBeNull() // still active
    expect(root.querySelector('.cortex-selection-overlay')).toBeNull() // deselected
    expect(channel._lastSent).not.toContainEqual({ type: 'cortex-closed' })

    target.remove()
  })
})
