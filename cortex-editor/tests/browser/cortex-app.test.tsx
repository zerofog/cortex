import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import { CortexApp } from '../../src/browser/components/CortexApp.js'
import { createShadowHost, createMockChannel, mockGetBoundingClientRect, dispatchKeyboardEvent, cleanDocumentHead } from './helpers.js'
import * as focusUtils from '../../src/browser/focus-utils.js'
import { _resetBusForTesting } from '../../src/browser/override-bus.js'
import { _resetPopoverStackForTesting } from '../../src/browser/popover-stack.js'

// Mock the selection module to verify it's called correctly.
// _resetCallbacks nulls the module-scope hoverCb/selectCb closure so a prior
// test's unmounted-component callbacks cannot be returned by _getCallbacks
// under async timing — call from beforeEach (ZF0-1297 test-hygiene fix).
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
    _resetCallbacks: () => { hoverCb = null; selectCb = null },
    _cleanup: cleanupFn,
  }
})

// Import the mocked module to access internals
import { initSelection } from '../../src/browser/selection.js'

describe('CortexApp', () => {
  let root: HTMLDivElement
  let shadow: ShadowRoot
  let cleanupHost: (() => void) | null = null
  const orphans: HTMLElement[] = []

  afterEach(async () => {
    if (root) render(null, root)
    cleanupHost?.()
    cleanupHost = null
    for (const el of orphans) el.remove()
    orphans.length = 0
    // Sweep any data-cortex-source elements that leaked out of `orphans`
    // tracking (e.g., from a test that threw before push). Without this,
    // stale elements survive into the next test and pollute document-level
    // queries in selection-metadata helpers, producing intermittent failures.
    for (const el of document.querySelectorAll('[data-cortex-source]')) el.remove()
    // Clear data-cortex-active on documentElement — CortexApp.tsx:723-725 sets
    // this while active=true; if a test unmounts while active, the attribute
    // persists across tests and can affect selectors in subsequent tests.
    document.documentElement.removeAttribute('data-cortex-active')
    // Clear window debug flags — the try/finally in the ZF0-1293 integration
    // test only protects if the setup block completes; a throw before the flag
    // is set leaks it forever without this safety net.
    delete (window as any).__CORTEX_TEST__
    delete (window as any).__CORTEX_DEBUG_OVERRIDES__
    // Reset cross-test state that persists despite vi.clearAllMocks:
    // module-scope selection-mock closures + override-bus listeners +
    // popover stack + document.head style tags + canary div.
    // See ZF0-1297 Step 12 hygiene fix; extended in ZF0-1332.
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    _resetPopoverStackForTesting()
    cleanDocumentHead()
    // Defensive real-timer reset — several tests use vi.useFakeTimers() in a
    // try/finally; if the try body throws before the finally runs
    // vi.useRealTimers(), fake timers leak and break subsequent tests.
    vi.useRealTimers()
    // restoreAllMocks (not clearAllMocks) fully uninstalls spies so a
    // spy-wrapping-a-spy can't accumulate across tests. Must be last so the
    // restored original method isn't around while a detached cleanup still fires.
    vi.restoreAllMocks()
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
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })

    // Trigger hover
    hoverCb(target)
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-hover-overlay')).not.toBeNull()
    }, { timeout: 500 })
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
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(target)

    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-selection-overlay')).not.toBeNull()
    }, { timeout: 500 })
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
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith(expect.any(Function))
    }, { timeout: 500 })
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
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalled()
    }, { timeout: 500 })
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
    orphans.push(elA)
    mockGetBoundingClientRect(elA, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(elA)
    // Verify CSSOverrideManager style element exists
    const styleEl = await vi.waitFor(() => {
      const el = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(el).not.toBeNull()
      return el
    }, { timeout: 500 })

    // Inject state override content to make the assertion falsifiable.
    // clearStateOverrides() calls rebuild() which regenerates from the internal maps.
    // If clearStateOverrides is NOT called on element switch, this content persists.
    styleEl.textContent = '[data-cortex-source="Hero.tsx:5:3"] { color: red !important; }'
    expect(styleEl.textContent).not.toBe('')

    // Select element B — clearStateOverrides → rebuild() should clear the style tag
    const elB = document.createElement('div')
    elB.setAttribute('data-cortex-source', 'Card.tsx:10:1')
    document.body.appendChild(elB)
    orphans.push(elB)
    mockGetBoundingClientRect(elB, { top: 150, left: 50, width: 100, height: 40 })

    selectCb(elB)

    // Wait for clearStateOverrides → rebuild() effect to fire. A fixed
    // setTimeout(10) flaked under CI load on GitHub Linux runners; vi.waitFor
    // polls until the assertion holds, bounded by the timeout.
    await vi.waitFor(() => {
      expect(styleEl.textContent).toBe('')
    }, { timeout: 500 })
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
    await vi.waitFor(() => {
      expect(_cleanup).toHaveBeenCalled()
      // CSSOverrideManager should be disposed (style element removed)
      expect(document.head.querySelector('[data-cortex-override]')).toBeNull()
    }, { timeout: 500 })
  })

  it('renders toolbar even without selection', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 20))
    await activateEditor(channel)
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: 500 })
  })

  it('tracks activity count from edit_status done messages', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)
    channel._simulateMessage({ type: 'edit_status', editId: 'e1', status: 'done' })
    await vi.waitFor(() => {
      const badge = root.querySelector('.cortex-toolbar__badge')
      expect(badge).not.toBeNull()
      expect(badge!.textContent).toContain('1')
    }, { timeout: 1500 })
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
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: 500 })
  })

  it('ignores duplicate cortex message when already active', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    channel._simulateMessage({ type: 'cortex' } as any)
    channel._simulateMessage({ type: 'cortex' } as any)
    // Wait for the first (and only) toolbar to render, then assert uniqueness.
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: 500 })
    // Should still have exactly one toolbar
    const toolbars = root.querySelectorAll('.cortex-toolbar')
    expect(toolbars.length).toBe(1)
  })

  it('Escape with no selection and no comment mode does nothing (no close)', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Activate — wait for toolbar to appear before proceeding (avoids 10ms
    // settle flake under serial-loop load where Preact scheduling takes >10ms)
    channel._simulateMessage({ type: 'cortex' } as any)
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: 1500 })

    // Escape with no selection, no comment mode — should NOT close
    vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    await new Promise(r => setTimeout(r, 10))

    // Should NOT send cortex-closed
    expect(channel._lastSent).not.toContainEqual({ type: 'cortex-closed' })
    // Editor should still be active (toolbar visible)
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
  })

  it('annotation-created message renders pin dot for pinned annotation', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Create a DOM element the pin can find
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 100, left: 100, width: 200, height: 50 })

    const annotation = {
      id: 'ann-1',
      status: 'pending' as const,
      elementSource: 'Hero.tsx:5:3',
      text: 'Make this bigger',
      pinPosition: { x: 0.5, y: 0.5 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thread: [],
    }
    channel._simulateMessage({ type: 'annotation-created', annotation })

    // Wait for Preact render cycle to commit the pin dot. Fixed timeout
    // flaked under CI load on Node 20 Linux runners.
    const pinDot = await vi.waitFor(() => {
      const el = root.querySelector('.cortex-pin')
      expect(el).not.toBeNull()
      return el
    }, { timeout: 500 })
    expect(pinDot).not.toBeNull()
  })

  it('annotation-updated replaces existing annotation state', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Create target element
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 100, left: 100, width: 200, height: 50 })

    const annotation = {
      id: 'ann-1',
      status: 'pending' as const,
      elementSource: 'Hero.tsx:5:3',
      text: 'Make this bigger',
      pinPosition: { x: 0.5, y: 0.5 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thread: [],
    }
    channel._simulateMessage({ type: 'annotation-created', annotation })
    // Click pin to open thread
    const pinDot = await vi.waitFor(() => {
      const el = root.querySelector('.cortex-pin') as HTMLDivElement
      expect(el).not.toBeNull()
      return el
    }, { timeout: 500 })
    pinDot.click()
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-thread__status--pending')).not.toBeNull()
    }, { timeout: 500 })

    // Update annotation to resolved
    const updated = {
      ...annotation,
      status: 'resolved' as const,
      resolution: { summary: 'Increased font-size to xl' },
      updatedAt: Date.now() + 1000,
    }
    channel._simulateMessage({ type: 'annotation-updated', annotation: updated })
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-thread__status--resolved')).not.toBeNull()
      expect(root.textContent).toContain('Increased font-size to xl')
    }, { timeout: 500 })
  })

  it('agent-status connected=false disables comment input in panel', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Select an element to show the panel (which contains CommentInput)
    const { _getCallbacks } = await import('../../src/browser/selection.js') as any
    const { selectCb } = _getCallbacks()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb(target)
    await new Promise(r => setTimeout(r, 50))

    // Panel should be visible with CommentInput
    const commentInput = root.querySelector('.cortex-comment-input__field') as HTMLInputElement
    expect(commentInput).not.toBeNull()

    // Agent disconnected — input should be disabled
    channel._simulateMessage({ type: 'agent-status', connected: false })
    await vi.waitFor(() => {
      expect(commentInput.disabled).toBe(true)
      expect(commentInput.placeholder).toContain('Waiting for agent')
    }, { timeout: 500 })

    // Agent connected — input should be enabled
    channel._simulateMessage({ type: 'agent-status', connected: true })
    await vi.waitFor(() => {
      expect(commentInput.disabled).toBe(false)
    }, { timeout: 500 })
  })

  it('activity-entry increments badge count', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    const entry = {
      id: 'act-1',
      type: 'comment' as const,
      timestamp: Date.now(),
      description: 'User commented on Hero',
    }
    channel._simulateMessage({ type: 'activity-entry', entry })
    await vi.waitFor(() => {
      // activity-entry also increments activityCount, so badge should update
      const badge = root.querySelector('.cortex-toolbar__badge')
      expect(badge).not.toBeNull()
      expect(badge!.textContent).toContain('1')
    }, { timeout: 500 })
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
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb(target)
    await new Promise(r => setTimeout(r, 10))

    // Escape deselects, not exits (mock isRealEvent for cascading handler)
    vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    await new Promise(r => setTimeout(r, 10))

    expect(root.querySelector('.cortex-toolbar')).not.toBeNull() // still active
    expect(root.querySelector('.cortex-selection-overlay')).toBeNull() // deselected
    expect(channel._lastSent).not.toContainEqual({ type: 'cortex-closed' })
  })

  it('thread reply sends comment-reply with annotationId, not a new comment', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Create target element with pin
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 100, left: 100, width: 200, height: 50 })

    const annotation = {
      id: 'ann-reply-test',
      status: 'pending' as const,
      elementSource: 'Hero.tsx:5:3',
      text: 'Make this bigger',
      pinPosition: { x: 0.5, y: 0.5 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thread: [],
    }
    channel._simulateMessage({ type: 'annotation-created', annotation })
    await new Promise(r => setTimeout(r, 50))

    // Click pin to open thread
    const pinDot = root.querySelector('.cortex-pin') as HTMLDivElement
    expect(pinDot).not.toBeNull()
    pinDot.click()
    await new Promise(r => setTimeout(r, 10))

    // Type reply in thread input
    const replyInput = root.querySelector('.cortex-thread__reply') as HTMLInputElement
    expect(replyInput).not.toBeNull()
    replyInput.value = 'How much bigger?'
    replyInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))

    // Clear sent messages to isolate the reply
    channel._lastSent.length = 0

    // Press Enter to submit reply
    replyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => {
      // Verify it sends comment-reply, NOT comment
      expect(channel._lastSent).toHaveLength(1)
      const msg = channel._lastSent[0] as any
      expect(msg.type).toBe('comment-reply')
      expect(msg.annotationId).toBe('ann-reply-test')
      expect(msg.text).toBe('How much bigger?')
      // Should NOT have elementSource (that's the old comment pattern)
      expect(msg.elementSource).toBeUndefined()
    }, { timeout: 500 })
  })

  it('comment input shows spinner until annotation is acknowledged', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    // Connect agent so input is enabled
    channel._simulateMessage({ type: 'agent-status', connected: true })
    await new Promise(r => setTimeout(r, 10))

    // Select an element to show the panel
    const { _getCallbacks } = await import('../../src/browser/selection.js') as any
    const { selectCb } = _getCallbacks()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb(target)
    await new Promise(r => setTimeout(r, 50))

    // Type and submit a comment
    const input = root.querySelector('.cortex-comment-input__field') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'Make this blue'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => {
      // Spinner should be visible
      expect(root.querySelector('.cortex-comment-input__spinner')).not.toBeNull()
      expect(input.disabled).toBe(true)
    }, { timeout: 500 })

    // Simulate server creating the annotation
    const annotation = {
      id: 'ann-1',
      status: 'pending' as const,
      elementSource: 'Hero.tsx:5:3',
      text: 'Make this blue',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thread: [],
    }
    channel._simulateMessage({ type: 'annotation-created', annotation })
    await vi.waitFor(() => {
      // Spinner should be gone — comment resolves on annotation-created (not on acknowledge)
      expect(root.querySelector('.cortex-comment-input__spinner')).toBeNull()
      expect(input.disabled).toBe(false)
    }, { timeout: 500 })
  })

  describe('server undo sync failure', () => {
    it('sends clear_server_undo when undo sync fails', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      // Clear any messages sent during activation
      channel._lastSent.length = 0

      channel._simulateMessage({ type: 'undo_sync_status', status: 'failed', reason: 'stale file', reason_code: 'stale' })
      await vi.waitFor(() => {
        expect(channel._lastSent).toContainEqual({ type: 'clear_server_undo' })
      }, { timeout: 500 })
    })

    it('sends clear_server_undo when redo sync fails', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      channel._lastSent.length = 0

      channel._simulateMessage({ type: 'redo_sync_status', status: 'failed', reason: 'stale file', reason_code: 'stale' })
      await vi.waitFor(() => {
        expect(channel._lastSent).toContainEqual({ type: 'clear_server_undo' })
      }, { timeout: 500 })
    })

    it('does not send clear_server_undo on sync success', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      channel._lastSent.length = 0

      channel._simulateMessage({ type: 'undo_sync_status', status: 'done' })
      channel._simulateMessage({ type: 'redo_sync_status', status: 'done' })
      await new Promise(r => setTimeout(r, 10))

      expect(channel._lastSent).not.toContainEqual({ type: 'clear_server_undo' })
    })

    it('does not send clear_server_undo for empty_stack failures', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      channel._lastSent.length = 0

      // empty_stack is expected — browser stack leads, server may be shorter.
      // Should NOT trigger a server stack reset.
      channel._simulateMessage({ type: 'undo_sync_status', status: 'failed', reason: 'Nothing to undo.', reason_code: 'empty_stack' })
      channel._simulateMessage({ type: 'redo_sync_status', status: 'failed', reason: 'Nothing to redo.', reason_code: 'empty_stack' })
      await new Promise(r => setTimeout(r, 10))

      expect(channel._lastSent).not.toContainEqual({ type: 'clear_server_undo' })
    })
  })

  describe('error tracking', () => {
    /** Helper: mount CortexApp, activate, select element, return refs. */
    async function setupWithSelectedElement(channel: ReturnType<typeof createMockChannel>) {
      const { _getCallbacks } = await import('../../src/browser/selection.js') as any
      const { selectCb } = _getCallbacks()

      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
      document.body.appendChild(target)
      orphans.push(target)
      mockGetBoundingClientRect(target, { top: 50, left: 50, width: 200, height: 100 })

      // Wait for Panel + sections to mount
      selectCb(target)
      await new Promise(r => setTimeout(r, 50))

      return target
    }

    /**
     * Trigger a property edit through the Layout section's Display SegmentedControl.
     * Clicks a non-active segment to trigger applyOverride(property, value, true),
     * which calls onEditDispatch and channel.send({type:'edit', editId, ...}).
     * Returns the editId from the sent message.
     */
    async function triggerEditViaUI(): Promise<string> {
      // Find the Layout section's Display SegmentedControl
      const layoutSection = root.querySelector('[data-section-id="layout"]')
      expect(layoutSection).not.toBeNull()

      // Find a non-active segment option by data-value attribute
      let targetSegment = layoutSection!.querySelector(
        '.cortex-segmented__option[data-value="flex"]:not(.cortex-segmented__option--active)',
      ) as HTMLButtonElement | null

      // If flex is already active, try grid
      if (!targetSegment) {
        targetSegment = layoutSection!.querySelector(
          '.cortex-segmented__option[data-value="grid"]:not(.cortex-segmented__option--active)',
        ) as HTMLButtonElement | null
      }
      // Last resort: any non-active segment
      if (!targetSegment) {
        targetSegment = layoutSection!.querySelector(
          '.cortex-segmented__option:not(.cortex-segmented__option--active)',
        ) as HTMLButtonElement | null
      }
      expect(targetSegment).not.toBeNull()
      targetSegment!.click()

      // Wait for microtask commit + Preact re-render
      let editId!: string
      await vi.waitFor(() => {
        const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
        expect(editMsg).toBeDefined()
        expect(editMsg.editId).toBeDefined()
        editId = editMsg.editId
      }, { timeout: 500 })
      return editId
    }

    // Shared channel reference for triggerEditViaUI
    let channel: ReturnType<typeof createMockChannel>

    it('edit_status:failed for untracked editId logs console.warn', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        channel._simulateMessage({ type: 'edit_status', editId: 'untracked-123', status: 'failed', reason: 'File not found' })
        await vi.waitFor(() => {
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('untracked editId untracked-123'),
            // Not asserting exact string — just that editId and reason are mentioned
          )
        }, { timeout: 500 })
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('edit_status:failed populates editErrors and renders error card', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement(channel)
      const editId = await triggerEditViaUI()

      // Simulate server failure for this edit
      channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'CSS parse error' })
      await vi.waitFor(() => {
        // Error card should be visible
        const errorCard = root.querySelector('.cortex-error-card')
        expect(errorCard).not.toBeNull()
        expect(errorCard!.textContent).toContain('edit failed')
        expect(errorCard!.textContent).toContain('CSS parse error')
      }, { timeout: 500 })
    })

    it('edit_status:done clears error for the same source+property', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement(channel)
      // Trigger first edit — will fail
      const editId1 = await triggerEditViaUI()
      channel._simulateMessage({ type: 'edit_status', editId: editId1, status: 'failed', reason: 'Write error' })
      await vi.waitFor(() => {
        // Error card should be visible
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()
      }, { timeout: 500 })

      // Clear sent messages and trigger a second edit on the same property
      channel._lastSent.length = 0
      const editId2 = await triggerEditViaUI()

      // Second edit succeeds — should clear the error for this source+property
      channel._simulateMessage({ type: 'edit_status', editId: editId2, status: 'done' })
      await vi.waitFor(() => {
        // Error card should be gone
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      }, { timeout: 500 })
    })

    it('annotation-updated with resolved fix-request clears error card', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement(channel)
      const editId = await triggerEditViaUI()

      // Extract the property from the sent edit message
      const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
      const editProperty = editMsg.property

      // Simulate failure
      channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'Merge conflict' })
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()
      }, { timeout: 500 })

      // Simulate annotation-updated with resolved fix-request that matches
      channel._simulateMessage({
        type: 'annotation-updated',
        annotation: {
          id: 'fix-ann-1',
          kind: 'fix-request',
          status: 'resolved',
          elementSource: 'Hero.tsx:5:3',
          fixMeta: { property: editProperty, value: 'flex', reason: 'Merge conflict' },
          text: `${editProperty} edit failed`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          resolution: { summary: 'Applied display: flex' },
          thread: [],
        },
      })
      await vi.waitFor(() => {
        // Error card should be cleared
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      }, { timeout: 500 })
    })

    it('annotation-updated with dismissed fix-request also clears error card', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement(channel)
      const editId = await triggerEditViaUI()
      const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
      const editProperty = editMsg.property

      // Simulate failure
      channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'Unknown error' })
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()
      }, { timeout: 500 })

      // Simulate dismissed fix-request
      channel._simulateMessage({
        type: 'annotation-updated',
        annotation: {
          id: 'fix-ann-2',
          kind: 'fix-request',
          status: 'dismissed',
          elementSource: 'Hero.tsx:5:3',
          fixMeta: { property: editProperty, value: 'flex', reason: 'Unknown error' },
          text: `${editProperty} edit failed`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          dismissReason: 'User dismissed',
          thread: [],
        },
      })
      await vi.waitFor(() => {
        // Error card should be cleared
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      }, { timeout: 500 })
    })

    it('ZF0-1293: divergence with diagnostics flows end-to-end to Debug disclosure', async () => {
      // Integration test for the diagnostics wiring: if CortexApp.tsx drops
      // the `diagnostics: d.diagnostics` pass-through on the EditError, the
      // Debug disclosure in EditErrorCard would silently stop receiving data
      // in production. Each unit test layer (override.ts emits, EditErrorCard
      // renders) would still pass. This test closes that gap by driving the
      // full path: emitDivergence → CortexApp handler → EditError map →
      // EditErrorCard filter → DebugDisclosure render.
      ;(window as unknown as { __CORTEX_DEBUG_OVERRIDES__: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement(channel)
      const { emitDivergence } = await import('../../src/browser/override-bus.js')

      emitDivergence({
        source: 'Hero.tsx:5:3', // matches setupWithSelectedElement's source
        property: 'padding-bottom',
        expected: '16px',
        actual: '30px',
        diagnostics: {
          actualReadFrom: 'inline-style',
          kindUsed: 'jsx-immediate',
          priorValues: ['24px', '30px', '16px'],
          retryDurationMs: 812,
        },
      })
      await vi.waitFor(() => {
        const card = root.querySelector('.cortex-error-card')
        expect(card).not.toBeNull()
        const debug = card!.querySelector('.cortex-error-card__debug')
        expect(debug).not.toBeNull()
        // Falsifiability: assertions below fail if the pass-through in
        // CortexApp.tsx is removed (err.diagnostics becomes undefined →
        // DebugDisclosure is not rendered). We test that the DATA reached
        // the disclosure, not the FORMATTING (that's edit-error-card.test's
        // job — asserting the arrow separator here would couple this
        // integration test to a presentation detail).
        expect(debug!.textContent).toContain('inline-style')
        expect(debug!.textContent).toContain('jsx-immediate')
        expect(debug!.textContent).toContain('24px')
        expect(debug!.textContent).toContain('30px')
        expect(debug!.textContent).toContain('16px')
        expect(debug!.textContent).toContain('812') // retry duration number
      }, { timeout: 500 })
    })
  })

  describe('connection status', () => {
    it('clears reconnected timer if connection drops again', async () => {
      vi.useFakeTimers()
      try {
        setup()
        const channel = createMockChannel()
        render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
        await vi.advanceTimersByTimeAsync(10)

        // Simulate: reconnecting → connected (starts 2s timer) → reconnecting (should cancel timer)
        channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
        await vi.advanceTimersByTimeAsync(10)

        channel._simulateConnectionChange({ status: 'connected' })
        await vi.advanceTimersByTimeAsync(10)

        // Connection drops again before the 2s timer fires
        channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 2, maxRetries: 5 })
        await vi.advanceTimersByTimeAsync(10)

        // Advance past original 2s window — should NOT auto-dismiss to connected
        // because the timer was cancelled on re-disconnect
        await vi.advanceTimersByTimeAsync(2000)

        const footer = root.querySelector('.cortex-connection-status')
        expect(footer).not.toBeNull()
        expect(footer!.classList.contains('cortex-connection-status--reconnecting')).toBe(true)
        expect(footer!.textContent).toContain('Reconnecting')
      } finally {
        vi.useRealTimers()
      }
    })

    it('reconnected footer auto-dismisses after 2s timer fires', async () => {
      // Covers the FIRES branch of the reconnected timer: CortexApp's 2s
      // setTimeout callback must flip connectionStatus from 'reconnected' →
      // 'connected', which hides the footer. The sibling 'clears reconnected
      // timer...' test covers the CANCEL branch; this one covers the fire path.
      //
      // Uses real timers during setup (waits for useEffect to subscribe
      // onConnectionChange and for Preact to commit the reconnecting render),
      // then switches to fake timers to drive the 2s auto-dismiss deterministically.
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Reconnecting → marks wasDisconnected=true internally. Wait for
      // Preact commit so Panel is mounted before we trigger the flash.
      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
      await vi.waitFor(() => {
        const el = root.querySelector('.cortex-connection-status')
        expect(el).not.toBeNull()
        expect(el!.textContent).toContain('Reconnecting')
      }, { timeout: 500 })

      vi.useFakeTimers()
      try {
        // Connected + wasDisconnected → CortexApp flips status to 'reconnected'
        // and starts the 2s auto-dismiss timer.
        channel._simulateConnectionChange({ status: 'connected' })
        await vi.advanceTimersByTimeAsync(50)

        const reconnectedFooter = root.querySelector('.cortex-connection-status')
        expect(reconnectedFooter).not.toBeNull()
        expect(reconnectedFooter!.textContent).toContain('Reconnected')
        expect(reconnectedFooter!.classList.contains('cortex-connection-status--reconnected')).toBe(true)

        // Fire the 2s timer — callback must setConnectionStatus('connected'),
        // which hides the footer (empty aria-live container + --hidden class).
        await vi.advanceTimersByTimeAsync(2000)

        const dismissed = root.querySelector('.cortex-connection-status')
        expect(dismissed).not.toBeNull()
        expect(dismissed!.classList.contains('cortex-connection-status--hidden')).toBe(true)
        expect(dismissed!.textContent?.trim()).toBe('')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe('CortexApp — HMR-driven selection re-resolution (ZF0-1292)', () => {
  // Track elements by attribute prefix so we can sweep any stragglers at
  // end-of-test even if a prior run's cleanup missed them. This defends
  // against the cross-test state leak patterns that produce intermittent
  // failures in the combined-run scenario.
  let root: HTMLDivElement
  let shadow: ShadowRoot
  let cleanupHost: (() => void) | null = null
  const orphans: HTMLElement[] = []

  afterEach(async () => {
    if (root) render(null, root)
    cleanupHost?.()
    cleanupHost = null
    for (const el of orphans) el.remove()
    orphans.length = 0
    // Sweep any data-cortex-source elements that leaked out of `orphans`
    // tracking (e.g., from a test that threw before push). Without this,
    // stale elements survive into the next test and pollute document-level
    // queries in selection-metadata helpers, producing intermittent failures.
    for (const el of document.querySelectorAll('[data-cortex-source]')) el.remove()
    document.documentElement.removeAttribute('data-cortex-active')
    delete (window as any).__CORTEX_TEST__
    delete (window as any).__CORTEX_DEBUG_OVERRIDES__
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    _resetPopoverStackForTesting()
    cleanDocumentHead()
    vi.useRealTimers()
    // restoreAllMocks rather than clearAllMocks to fully uninstall any
    // spies (getComputedStyle, etc.) a failed test may have left behind.
    vi.restoreAllMocks()
  })

  async function setupAndSelect(
    sourceValue: string,
    tag: string,
  ): Promise<{ channel: ReturnType<typeof createMockChannel>; el: HTMLElement }> {
    const sh = createShadowHost()
    root = sh.root
    shadow = sh.shadow
    cleanupHost = sh.cleanup
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Activate editor.
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))

    // Select an element.
    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (el: HTMLElement | null) => void }
    }
    const { selectCb } = _getCallbacks()

    const el = document.createElement(tag)
    el.setAttribute('data-cortex-source', sourceValue)
    document.body.appendChild(el)
    orphans.push(el)
    mockGetBoundingClientRect(el, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(el)
    await new Promise(r => setTimeout(r, 20))

    return { channel, el }
  }

  // Cascade-only: exercises rAF/setTimeout retry fan-out in CortexApp.tsx:367-371.
  // No pure-function equivalent — retry logic is bound to the effect.
  it('retries re-resolution via double-rAF when Fast Refresh commit is deferred', async () => {
    // Simulate framework-commit latency: element is STILL connected at the
    // sync-handler tick (Fast Refresh hasn't run yet). The sync pass in the
    // HMR handler early-returns (isConnected === true). Then we defer the
    // actual swap to land between the two rAFs. The async pass should
    // re-check and resolve to the replacement.
    const SOURCE = 'src/deferred.tsx:8:3'
    const { channel, el } = await setupAndSelect(SOURCE, 'p')
    expect(el.isConnected).toBe(true)

    // Fire hmr-applied while the element is still connected.
    channel._simulateMessage({ type: 'hmr-applied' })

    // Between sync pass and double-rAF: defer swap by one microtask so the
    // sync handler has already returned. Then use an rAF to detach+insert
    // the replacement before the retry fires.
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        el.remove()
        const replacement = document.createElement('p')
        replacement.setAttribute('data-cortex-source', SOURCE)
        replacement.textContent = 'Original'
        document.body.appendChild(replacement)
        orphans.push(replacement)
        mockGetBoundingClientRect(replacement, { top: 50, left: 50, width: 100, height: 40 })
        resolve()
      })
    })

    // Wait for the second rAF + Preact commit.
    await vi.waitFor(() => {
      // Falsifiable observable: the Panel stays populated. If the async
      // (double-rAF) pass didn't re-resolve, `selectedElement` would be
      // null (the original <p> was removed), and the Panel would render
      // its empty-state prompt. The tag swap from <p> to <span> via the
      // replacement node is observable through the header label too, but
      // the empty-state guard is the tightest assertion for "async
      // retry actually happened."
      expect(root.textContent).not.toContain('Click any element to start editing')
    }, { timeout: 500 })
  })

  // Cascade-only: isConnected early-return + styleVersion bump in CortexApp effect;
  // getComputedStyle re-read is bound to the Preact render cycle, not a pure function.
  it('leaves selection untouched and re-reads computed styles when the selected element is still connected after HMR', async () => {
    // Stylesheet-only HMR case: the element stays in place, but the Panel
    // must still receive the version bump so computed styles re-read.
    // This test guards against both:
    //  (1) An over-eager re-resolver that would clear selection on every HMR cycle.
    //  (2) A silent-no-op where the hmr-applied handler doesn't actually bump
    //      styleVersion (the assertion on (1) alone would still pass).
    const SOURCE = 'src/stable-el.tsx:3:1'

    // Count getComputedStyle invocations as a falsifiable proxy for the re-read.
    // If the bump path is broken, the count stays flat after hmr-applied.
    const gcsSpy = vi.spyOn(window, 'getComputedStyle')

    const { channel, el } = await setupAndSelect(SOURCE, 'div')

    expect(root.textContent).toContain('<div>')
    expect(el.isConnected).toBe(true)
    const gcsBefore = gcsSpy.mock.calls.length
    expect(gcsBefore).toBeGreaterThan(0) // sanity: Panel already read styles on mount

    channel._simulateMessage({ type: 'hmr-applied' })
    await vi.waitFor(() => {
      // (1) Selection preserved — still showing the same element.
      expect(root.textContent).toContain('<div>')
      expect(root.textContent).not.toContain('Click any element to start editing')
      // (2) Panel re-read computed styles — proves the version-bump path fired
      // and propagated through to Panel's computedStyles useMemo invalidation.
      expect(gcsSpy.mock.calls.length).toBeGreaterThan(gcsBefore)
    }, { timeout: 500 })

    gcsSpy.mockRestore()
  })
})

describe('CortexApp — HMR file-list filter (ZF0-1292 follow-up)', () => {
  let root: HTMLDivElement
  let shadow: ShadowRoot
  let cleanupHost: (() => void) | null = null
  const orphans: HTMLElement[] = []

  afterEach(async () => {
    if (root) render(null, root)
    cleanupHost?.()
    cleanupHost = null
    for (const el of orphans) el.remove()
    orphans.length = 0
    for (const el of document.querySelectorAll('[data-cortex-source]')) el.remove()
    document.documentElement.removeAttribute('data-cortex-active')
    delete (window as any).__CORTEX_TEST__
    delete (window as any).__CORTEX_DEBUG_OVERRIDES__
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    _resetPopoverStackForTesting()
    cleanDocumentHead()
    vi.useRealTimers()
    // restoreAllMocks (not clearAllMocks) ensures the getComputedStyle spy
    // is fully uninstalled between tests — otherwise a failed test that
    // threw before reaching gcs.mockRestore() would leak the spy into
    // downstream tests (and other describe blocks).
    vi.restoreAllMocks()
  })

  /** Render CortexApp, activate, select an element with the given source,
   *  and return the mock channel + a `gcs` spy on getComputedStyle. The spy's
   *  call count is the observable signal for "Panel refreshed". */
  async function setup(source: string): Promise<{
    channel: ReturnType<typeof createMockChannel>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gcs: any
    element: HTMLElement
  }> {
    const sh = createShadowHost()
    root = sh.root
    shadow = sh.shadow
    cleanupHost = sh.cleanup
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))

    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (el: HTMLElement | null) => void }
    }
    const { selectCb } = _getCallbacks()

    const element = document.createElement('div')
    element.setAttribute('data-cortex-source', source)
    element.appendChild(document.createTextNode('target'))
    document.body.appendChild(element)
    orphans.push(element)
    mockGetBoundingClientRect(element, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(element)
    // Wait for Panel to fully settle (initial getComputedStyle calls complete)
    // before installing the spy. Under serial-loop load 20ms wasn't enough —
    // ambient effects continued into the 200ms observation window and inflated
    // gcs.mock.calls.length before the hmr-applied message was even sent.
    await new Promise(r => setTimeout(r, 50))

    // Install spy AFTER selection so the baseline count is post-mount.
    const gcs = vi.spyOn(window, 'getComputedStyle')
    return { channel, gcs, element }
  }

  // Cascade-only: negative gate path — shouldRefresh short-circuit prevents version bump
  // and re-resolve fan-out. No pure-function equivalent for the gate logic itself.
  it('skips Panel refresh when hmr files are fully unrelated to the selection', async () => {
    const { channel, gcs } = await setup('src/foo.tsx:10:5')
    const before = gcs.mock.calls.length
    channel._simulateMessage({ type: 'hmr-applied', files: ['src/bar.tsx', 'src/baz.tsx'] })
    // Negative assertion — documented coverage gap. The shouldRefresh gate
    // short-circuits the version bump AND the attemptReResolve fan-out
    // (ZF0-1298 root-cause fix), so with the gate in place nothing fires
    // regardless of wait length. We wait 200ms as an empirical upper bound
    // on happy-dom's Preact-scheduler + override-bus ambient effects under
    // CI fork-pool load — 300ms triggered ambient getComputedStyle calls on
    // Node 22 + v8 coverage instrumentation that are not scheduled by the
    // HMR handler. Known coverage gap: the handler's latest timer is
    // setTimeout(attemptReResolve, 250), so if a future regression reverts
    // the gate, the 250ms timer would fire AFTER this 200ms window and the
    // assertion would silent-pass. The regression is caught structurally
    // by the positive it.each tests below (they would fire as expected) +
    // hmrFilesAffectElement unit coverage + a dedicated future integration
    // test via vi.spyOn on reResolveSelection (tracked in ZF0-1322's sweep).
    // vi.waitFor cannot help here — you can't poll for a thing NOT happening.
    await new Promise(r => setTimeout(r, 200))
    // No CSS in list, no ancestor match, no own-file match → gate returns
    // false → neither the version bump nor the re-resolve fan-out fires.
    expect(gcs.mock.calls.length).toBe(before)
    gcs.mockRestore()
  })

  // Cascade-only: exercises the effect-level early-return (no files / empty files)
  // before hmrFilesAffectElement is called (CortexApp.tsx:288-292).
  it.each<{ label: string; files: string[] | undefined }>([
    { label: 'no files field (backward-compat with older server)', files: undefined },
    { label: 'empty files array (server signaled a cycle but could not enumerate files)', files: [] },
  ])('triggers Panel refresh when hmr-applied has $label', async ({ files }) => {
    const { channel, gcs } = await setup('src/foo.tsx:10:5')
    const before = gcs.mock.calls.length
    const msg = files === undefined
      ? { type: 'hmr-applied' as const }
      : { type: 'hmr-applied' as const, files }
    channel._simulateMessage(msg)
    // Positive assertion: poll until gcs call count increments. Fixed 50ms
    // timeout flaked under CI Linux load. vi.waitFor polls the condition.
    await vi.waitFor(() => {
      expect(gcs.mock.calls.length).toBeGreaterThan(before)
    }, { timeout: 1500 })
    gcs.mockRestore()
  })

})
