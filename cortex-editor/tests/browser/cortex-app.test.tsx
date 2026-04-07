import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import { CortexApp } from '../../src/browser/components/CortexApp.js'
import { createShadowHost, createMockChannel, mockGetBoundingClientRect, dispatchKeyboardEvent } from './helpers.js'
import * as focusUtils from '../../src/browser/focus-utils.js'

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

    // Inject state override content to make the assertion falsifiable.
    // clearStateOverrides() calls rebuild() which regenerates from the internal maps.
    // If clearStateOverrides is NOT called on element switch, this content persists.
    styleEl.textContent = '[data-cortex-source="Hero.tsx:5:3"] { color: red !important; }'
    expect(styleEl.textContent).not.toBe('')

    // Select element B — clearStateOverrides → rebuild() should clear the style tag
    const elB = document.createElement('div')
    elB.setAttribute('data-cortex-source', 'Card.tsx:10:1')
    document.body.appendChild(elB)
    mockGetBoundingClientRect(elB, { top: 150, left: 50, width: 100, height: 40 })

    selectCb(elB)
    await new Promise(r => setTimeout(r, 10))

    // rebuild() regenerates from the (now empty) override maps — manual content is gone
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
    await new Promise(r => setTimeout(r, 20))
    await activateEditor(channel)
    await new Promise(r => setTimeout(r, 10))
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

  it('Escape with no selection and no comment mode does nothing (no close)', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    // Activate
    channel._simulateMessage({ type: 'cortex' } as any)
    await new Promise(r => setTimeout(r, 10))

    // Escape with no selection, no comment mode — should NOT close
    vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    await new Promise(r => setTimeout(r, 10))

    // Should NOT send cortex-closed
    expect(channel._lastSent).not.toContainEqual({ type: 'cortex-closed' })
    // Editor should still be active (toolbar visible)
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    vi.restoreAllMocks()
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
    await new Promise(r => setTimeout(r, 50))

    // Pin dot should render
    const pinDot = root.querySelector('.cortex-pin')
    expect(pinDot).not.toBeNull()

    target.remove()
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
    await new Promise(r => setTimeout(r, 50))

    // Click pin to open thread
    const pinDot = root.querySelector('.cortex-pin') as HTMLDivElement
    expect(pinDot).not.toBeNull()
    pinDot.click()
    await new Promise(r => setTimeout(r, 10))

    // Thread should show pending status
    expect(root.querySelector('.cortex-thread__status--pending')).not.toBeNull()

    // Update annotation to resolved
    const updated = {
      ...annotation,
      status: 'resolved' as const,
      resolution: { summary: 'Increased font-size to xl' },
      updatedAt: Date.now() + 1000,
    }
    channel._simulateMessage({ type: 'annotation-updated', annotation: updated })
    await new Promise(r => setTimeout(r, 10))

    // Thread should now show resolved status
    expect(root.querySelector('.cortex-thread__status--resolved')).not.toBeNull()
    expect(root.textContent).toContain('Increased font-size to xl')

    target.remove()
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
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb(target)
    await new Promise(r => setTimeout(r, 50))

    // Panel should be visible with CommentInput
    const commentInput = root.querySelector('.cortex-comment-input__field') as HTMLInputElement
    expect(commentInput).not.toBeNull()

    // Agent disconnected — input should be disabled
    channel._simulateMessage({ type: 'agent-status', connected: false })
    await new Promise(r => setTimeout(r, 10))
    expect(commentInput.disabled).toBe(true)
    expect(commentInput.placeholder).toContain('Waiting for agent')

    // Agent connected — input should be enabled
    channel._simulateMessage({ type: 'agent-status', connected: true })
    await new Promise(r => setTimeout(r, 10))
    expect(commentInput.disabled).toBe(false)

    target.remove()
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
    await new Promise(r => setTimeout(r, 10))

    // activity-entry also increments activityCount, so badge should update
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge?.textContent).toContain('1')
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

    // Escape deselects, not exits (mock isRealEvent for cascading handler)
    vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    await new Promise(r => setTimeout(r, 10))

    expect(root.querySelector('.cortex-toolbar')).not.toBeNull() // still active
    expect(root.querySelector('.cortex-selection-overlay')).toBeNull() // deselected
    expect(channel._lastSent).not.toContainEqual({ type: 'cortex-closed' })

    vi.restoreAllMocks()
    target.remove()
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
    await new Promise(r => setTimeout(r, 10))

    // Verify it sends comment-reply, NOT comment
    expect(channel._lastSent).toHaveLength(1)
    const msg = channel._lastSent[0] as any
    expect(msg.type).toBe('comment-reply')
    expect(msg.annotationId).toBe('ann-reply-test')
    expect(msg.text).toBe('How much bigger?')
    // Should NOT have elementSource (that's the old comment pattern)
    expect(msg.elementSource).toBeUndefined()

    target.remove()
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
    await new Promise(r => setTimeout(r, 10))

    // Spinner should be visible
    expect(root.querySelector('.cortex-comment-input__spinner')).not.toBeNull()
    expect(input.disabled).toBe(true)

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
    await new Promise(r => setTimeout(r, 10))

    // Spinner should still be visible (waiting for acknowledge)
    expect(root.querySelector('.cortex-comment-input__spinner')).not.toBeNull()

    // Simulate agent acknowledging
    channel._simulateMessage({
      type: 'annotation-updated',
      annotation: { ...annotation, status: 'acknowledged' as const, updatedAt: Date.now() },
    })
    await new Promise(r => setTimeout(r, 10))

    // Spinner should be gone, input re-enabled
    expect(root.querySelector('.cortex-comment-input__spinner')).toBeNull()
    expect(input.disabled).toBe(false)

    target.remove()
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
      await new Promise(r => setTimeout(r, 10))

      expect(channel._lastSent).toContainEqual({ type: 'clear_server_undo' })
    })

    it('sends clear_server_undo when redo sync fails', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      channel._lastSent.length = 0

      channel._simulateMessage({ type: 'redo_sync_status', status: 'failed', reason: 'stale file', reason_code: 'stale' })
      await new Promise(r => setTimeout(r, 10))

      expect(channel._lastSent).toContainEqual({ type: 'clear_server_undo' })
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

  describe('connection status', () => {
    it('starts with connected status and renders without error', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Baseline: component renders, toolbar visible, no crash
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    })

    it('updates to reconnecting when channel fires reconnecting', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Fire reconnecting — component should handle it without crashing
      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
      await new Promise(r => setTimeout(r, 10))

      // Component still renders (no crash from state update)
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    })

    it('shows reconnected then auto-dismisses after 2s', async () => {
      vi.useFakeTimers()
      try {
        setup()
        const channel = createMockChannel()
        render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
        await vi.advanceTimersByTimeAsync(10)

        // Simulate disconnect then reconnect to trigger "reconnected" flash
        channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
        await vi.advanceTimersByTimeAsync(10)

        channel._simulateConnectionChange({ status: 'connected' })
        await vi.advanceTimersByTimeAsync(10)

        // Component still renders (reconnected state)
        expect(root.querySelector('.cortex-toolbar')).not.toBeNull()

        // Advance past the 2s auto-dismiss timer
        await vi.advanceTimersByTimeAsync(2000)

        // Component still renders (back to connected)
        expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

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
        // because we're now in reconnecting state
        await vi.advanceTimersByTimeAsync(2000)

        // Component still renders (no crash, still in reconnecting state)
        expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('renders reconnecting footer with retry count', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 2, maxRetries: 5 })
      await new Promise(r => setTimeout(r, 10))

      const footer = root.querySelector('.cortex-connection-status')
      expect(footer).not.toBeNull()
      expect(footer!.getAttribute('role')).toBe('status')
      expect(footer!.textContent).toContain('Reconnecting')
      expect(footer!.textContent).toContain('2/5')
      expect(footer!.classList.contains('cortex-connection-status--reconnecting')).toBe(true)
    })

    it('renders disconnected footer with warning message', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateConnectionChange({ status: 'disconnected' })
      await new Promise(r => setTimeout(r, 10))

      const footer = root.querySelector('.cortex-connection-status')
      expect(footer).not.toBeNull()
      expect(footer!.textContent).toContain('Disconnected')
      expect(footer!.textContent).toContain('won\u2019t save')
      expect(footer!.classList.contains('cortex-connection-status--disconnected')).toBe(true)
    })

    it('does not render footer when connected', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Default state is connected — no footer
      const footer = root.querySelector('.cortex-connection-status')
      expect(footer).toBeNull()
    })

    it('renders reconnected footer then auto-dismisses', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Simulate reconnecting then connected to trigger "reconnected" flash
      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
      await new Promise(r => setTimeout(r, 10))

      // Verify reconnecting footer first
      expect(root.querySelector('.cortex-connection-status')).not.toBeNull()
      expect(root.querySelector('.cortex-connection-status')!.textContent).toContain('Reconnecting')

      vi.useFakeTimers()
      try {
        channel._simulateConnectionChange({ status: 'connected' })
        await vi.advanceTimersByTimeAsync(50)

        // Should show "Reconnected" footer
        const footer = root.querySelector('.cortex-connection-status')
        expect(footer).not.toBeNull()
        expect(footer!.textContent).toContain('Reconnected')
        expect(footer!.classList.contains('cortex-connection-status--reconnected')).toBe(true)

        // After 2s auto-dismiss, footer should be gone
        await vi.advanceTimersByTimeAsync(2000)
        expect(root.querySelector('.cortex-connection-status')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
