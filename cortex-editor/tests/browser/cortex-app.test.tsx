import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import { CortexApp } from '../../src/browser/components/CortexApp.js'
import { createShadowHost, createMockChannel, mockGetBoundingClientRect, dispatchKeyboardEvent, cleanDocumentHead } from './helpers.js'
import * as focusUtils from '../../src/browser/focus-utils.js'
import { _resetBusForTesting } from '../../src/browser/override-bus.js'

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
  let cleanupHost: () => void

  afterEach(async () => {
    if (root) render(null, root)
    if (cleanupHost) cleanupHost()
    // Reset cross-test state that persists despite vi.clearAllMocks:
    // module-scope selection-mock closures + override-bus listeners +
    // document.head style tags. See ZF0-1297 Step 12 hygiene fix.
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    cleanDocumentHead()
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

    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-selection-overlay')).not.toBeNull()
    }, { timeout: 500 })

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

    // Wait for clearStateOverrides → rebuild() effect to fire. A fixed
    // setTimeout(10) flaked under CI load on GitHub Linux runners; vi.waitFor
    // polls until the assertion holds, bounded by the timeout.
    await vi.waitFor(() => {
      expect(styleEl.textContent).toBe('')
    }, { timeout: 500 })

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

    // Wait for Preact render cycle to commit the pin dot. Fixed timeout
    // flaked under CI load on Node 20 Linux runners.
    const pinDot = await vi.waitFor(() => {
      const el = root.querySelector('.cortex-pin')
      expect(el).not.toBeNull()
      return el
    }, { timeout: 500 })
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

    // Spinner should be gone — comment resolves on annotation-created (not on acknowledge)
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

  describe('error tracking', () => {
    /** Helper: mount CortexApp, activate, select element, return refs. */
    async function setupWithSelectedElement(channel: ReturnType<typeof createMockChannel>) {
      const { _getCallbacks } = await import('../../src/browser/selection.js') as any
      const { selectCb } = _getCallbacks()

      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
      document.body.appendChild(target)
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
      await new Promise(r => setTimeout(r, 50))

      // Extract editId from the sent 'edit' message
      const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
      expect(editMsg).toBeDefined()
      expect(editMsg.editId).toBeDefined()
      return editMsg.editId
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
        await new Promise(r => setTimeout(r, 10))

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('untracked editId untracked-123'),
          // Not asserting exact string — just that editId and reason are mentioned
        )
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

      const target = await setupWithSelectedElement(channel)
      try {
        const editId = await triggerEditViaUI()

        // Simulate server failure for this edit
        channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'CSS parse error' })
        await new Promise(r => setTimeout(r, 50))

        // Error card should be visible
        const errorCard = root.querySelector('.cortex-error-card')
        expect(errorCard).not.toBeNull()
        expect(errorCard!.textContent).toContain('edit failed')
        expect(errorCard!.textContent).toContain('CSS parse error')
      } finally {
        target.remove()
      }
    })

    it('edit_status:done clears error for the same source+property', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      const target = await setupWithSelectedElement(channel)
      try {
        // Trigger first edit — will fail
        const editId1 = await triggerEditViaUI()
        channel._simulateMessage({ type: 'edit_status', editId: editId1, status: 'failed', reason: 'Write error' })
        await new Promise(r => setTimeout(r, 50))

        // Error card should be visible
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()

        // Clear sent messages and trigger a second edit on the same property
        channel._lastSent.length = 0
        const editId2 = await triggerEditViaUI()

        // Second edit succeeds — should clear the error for this source+property
        channel._simulateMessage({ type: 'edit_status', editId: editId2, status: 'done' })
        await new Promise(r => setTimeout(r, 50))

        // Error card should be gone
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      } finally {
        target.remove()
      }
    })

    it('annotation-updated with resolved fix-request clears error card', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      const target = await setupWithSelectedElement(channel)
      try {
        const editId = await triggerEditViaUI()

        // Extract the property from the sent edit message
        const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
        const editProperty = editMsg.property

        // Simulate failure
        channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'Merge conflict' })
        await new Promise(r => setTimeout(r, 50))
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()

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
        await new Promise(r => setTimeout(r, 50))

        // Error card should be cleared
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      } finally {
        target.remove()
      }
    })

    it('annotation-updated with dismissed fix-request also clears error card', async () => {
      setup()
      channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      const target = await setupWithSelectedElement(channel)
      try {
        const editId = await triggerEditViaUI()
        const editMsg = channel._lastSent.find((m: any) => m.type === 'edit') as any
        const editProperty = editMsg.property

        // Simulate failure
        channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'Unknown error' })
        await new Promise(r => setTimeout(r, 50))
        expect(root.querySelector('.cortex-error-card')).not.toBeNull()

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
        await new Promise(r => setTimeout(r, 50))

        // Error card should be cleared
        expect(root.querySelector('.cortex-error-card')).toBeNull()
      } finally {
        target.remove()
      }
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

      const target = await setupWithSelectedElement(channel)
      try {
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
        await new Promise(r => setTimeout(r, 50))

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
      } finally {
        target.remove()
        delete (window as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__
      }
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

    it('renders reconnecting footer with retry count', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 2, maxRetries: 5 })
      // Poll for Preact batch render to commit. Fixed 50ms flaked under CI load.
      const footer = await vi.waitFor(() => {
        const el = root.querySelector('.cortex-connection-status')
        expect(el).not.toBeNull()
        return el!
      }, { timeout: 500 })
      expect(footer.getAttribute('role')).toBe('status')
      expect(footer.textContent).toContain('Reconnecting')
      expect(footer.textContent).toContain('2/5')
      expect(footer.classList.contains('cortex-connection-status--reconnecting')).toBe(true)
    })

    it('renders disconnected footer with warning message', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateConnectionChange({ status: 'disconnected' })
      const footer = await vi.waitFor(() => {
        const el = root.querySelector('.cortex-connection-status')
        expect(el).not.toBeNull()
        return el!
      }, { timeout: 500 })
      expect(footer.textContent).toContain('Disconnected')
      expect(footer!.textContent).toContain('won\u2019t save')
      expect(footer!.classList.contains('cortex-connection-status--disconnected')).toBe(true)
    })

    it('hides footer when connected (aria-live container present but empty)', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Force Panel to mount by triggering a state change (overrideRef is set
      // in useEffect but doesn't cause a re-render on its own)
      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
      await new Promise(r => setTimeout(r, 50))

      // Transition to connected (skipping wasDisconnected flash by going
      // reconnecting→connected without a prior disconnected state)
      vi.useFakeTimers()
      try {
        channel._simulateConnectionChange({ status: 'connected' })
        // Advance past the 2s reconnected flash timer
        await vi.advanceTimersByTimeAsync(2100)

        // Footer container exists (for aria-live) but is visually hidden with no text
        const footer = root.querySelector('.cortex-connection-status')
        expect(footer).not.toBeNull()
        expect(footer!.classList.contains('cortex-connection-status--hidden')).toBe(true)
        expect(footer!.textContent?.trim()).toBe('')
      } finally {
        vi.useRealTimers()
      }
    })

    it('renders reconnected footer then auto-dismisses', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Simulate reconnecting then connected to trigger "reconnected" flash
      channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })

      // Wait for reconnecting footer to render before proceeding.
      await vi.waitFor(() => {
        const el = root.querySelector('.cortex-connection-status')
        expect(el).not.toBeNull()
        expect(el!.textContent).toContain('Reconnecting')
      }, { timeout: 500 })

      vi.useFakeTimers()
      try {
        channel._simulateConnectionChange({ status: 'connected' })
        await vi.advanceTimersByTimeAsync(50)

        // Should show "Reconnected" footer
        const footer = root.querySelector('.cortex-connection-status')
        expect(footer).not.toBeNull()
        expect(footer!.textContent).toContain('Reconnected')
        expect(footer!.classList.contains('cortex-connection-status--reconnected')).toBe(true)

        // After 2s auto-dismiss, footer should be visually hidden with no text
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
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    cleanDocumentHead()
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

  it('re-resolves selectedElement via data-cortex-source when HMR replaces the DOM node', async () => {
    // Lowercase filename → parseCortexSource leaves componentName null →
    // PanelHeader falls back to `<tagName>`, which is what lets us
    // distinguish elA (div) from elB (span) in the rendered header text.
    const SOURCE = 'src/page.tsx:10:5'
    const { channel, el: elA } = await setupAndSelect(SOURCE, 'div')

    // Sanity: Panel header shows `<div>` for elA.
    expect(root.textContent).toContain('<div>')
    expect(root.textContent).not.toContain('<span>')

    // Simulate React Fast Refresh: detach elA, insert elB with SAME source
    // but a different tag so we can distinguish in the Panel header.
    elA.remove()
    const elB = document.createElement('span')
    elB.setAttribute('data-cortex-source', SOURCE)
    document.body.appendChild(elB)
    orphans.push(elB)
    mockGetBoundingClientRect(elB, { top: 100, left: 50, width: 100, height: 40 })

    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 30))

    // Panel header now reflects elB's tag — proving the selection was
    // re-resolved to the new DOM node.
    expect(root.textContent).toContain('<span>')
  })

  /** Helper: select the nth element among siblings sharing a source value.
   *  Builds a full list first so selection metadata captures the correct
   *  nth-index, then routes selection through the mocked selection module's
   *  selectCb (which is the `selectWithMeta` wrapper in CortexApp). */
  async function setupListAndSelect(
    source: string,
    items: Array<{ tag: string; content: string }>,
    selectIndex: number,
  ): Promise<{
    channel: ReturnType<typeof createMockChannel>
    elements: HTMLElement[]
    selected: HTMLElement
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

    const elements: HTMLElement[] = []
    items.forEach(({ tag, content }, i) => {
      const el = document.createElement(tag)
      el.setAttribute('data-cortex-source', source)
      el.appendChild(document.createTextNode(content))
      document.body.appendChild(el)
      orphans.push(el)
      mockGetBoundingClientRect(el, { top: 50 + i * 50, left: 50, width: 100, height: 40 })
      elements.push(el)
    })

    const selected = elements[selectIndex]!
    selectCb(selected)
    await new Promise(r => setTimeout(r, 20))

    return { channel, elements, selected }
  }

  /** Swap the list in-place, keeping the same source value. Returns the new
   *  elements in rendered order. Simulates a React Fast Refresh that replaces
   *  DOM nodes. */
  function swapListInPlace(
    oldElements: HTMLElement[],
    newItems: Array<{ tag: string; content: string }>,
    source: string,
  ): HTMLElement[] {
    for (const el of oldElements) el.remove()
    const next: HTMLElement[] = []
    newItems.forEach(({ tag, content }, i) => {
      const el = document.createElement(tag)
      el.setAttribute('data-cortex-source', source)
      el.appendChild(document.createTextNode(content))
      document.body.appendChild(el)
      orphans.push(el)
      mockGetBoundingClientRect(el, { top: 50 + i * 50, left: 50, width: 100, height: 40 })
      next.push(el)
    })
    return next
  }

  it('preserves selection at same index when HMR leaves multiple matches (nth-index)', async () => {
    // Array of 2 siblings; select index 0. Post-HMR, both nodes replaced
    // (different content). Smart fallback: content-hash mismatches, search
    // for old content fails — fall through to "preserve at saved index".
    // Net: selection is new-index-0.
    const SOURCE = 'src/items.tsx:20:3'
    const { channel, elements, selected } = await setupListAndSelect(
      SOURCE,
      [{ tag: 'li', content: 'Item A' }, { tag: 'li', content: 'Item B' }],
      0,
    )
    expect(selected.textContent).toBe('Item A')

    const next = swapListInPlace(
      elements,
      [{ tag: 'li', content: 'New First' }, { tag: 'li', content: 'New Second' }],
      SOURCE,
    )

    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 50))

    // Selection preserved at index 0 — but now points to the new DOM node
    // whose content has changed (treated as in-place content edit).
    expect(root.textContent).not.toContain('Click any element to start editing')
    expect(next[0]!.isConnected).toBe(true)
  })

  it('preserves selection at same index when content is unchanged', async () => {
    // Select index 1 with content "Item B". Swap list but keep the same
    // items at the same positions — content-hash matches, position stable.
    const SOURCE = 'src/items.tsx:20:3'
    const { channel, elements } = await setupListAndSelect(
      SOURCE,
      [{ tag: 'li', content: 'Item A' }, { tag: 'li', content: 'Item B' }],
      1,
    )
    const next = swapListInPlace(
      elements,
      [{ tag: 'li', content: 'Item A' }, { tag: 'li', content: 'Item B' }],
      SOURCE,
    )
    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 50))
    expect(next[1]!.isConnected).toBe(true)
    expect(root.textContent).not.toContain('Click any element to start editing')
  })

  it('switches selection to element carrying original content when list is reordered', async () => {
    // Select "Item A" at index 0. Post-HMR, swap order so "Item A" is at
    // index 1. Smart fallback: index-0 now has "Item B" (mismatch); search
    // finds "Item A" at index 1 — selection follows content there.
    const SOURCE = 'src/items.tsx:20:3'
    const { channel, elements, selected } = await setupListAndSelect(
      SOURCE,
      [{ tag: 'li', content: 'Item A' }, { tag: 'li', content: 'Item B' }],
      0,
    )
    expect(selected.textContent).toBe('Item A')

    const next = swapListInPlace(
      elements,
      [{ tag: 'li', content: 'Item B' }, { tag: 'li', content: 'Item A' }],
      SOURCE,
    )
    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 50))

    // "Item A" is now at new index 1; selection should have followed it.
    expect(next[1]!.textContent).toBe('Item A')
    expect(next[1]!.isConnected).toBe(true)
    expect(root.textContent).not.toContain('Click any element to start editing')
  })

  it('clears selection when HMR shrinks the list below the saved index', async () => {
    // Select index 2 of 3. Post-HMR, only 2 elements remain — index 2 is
    // out of bounds. Smart fallback returns null; selection clears.
    const SOURCE = 'src/items.tsx:20:3'
    const { channel, elements } = await setupListAndSelect(
      SOURCE,
      [{ tag: 'li', content: 'A' }, { tag: 'li', content: 'B' }, { tag: 'li', content: 'C' }],
      2,
    )
    swapListInPlace(
      elements,
      [{ tag: 'li', content: 'A' }, { tag: 'li', content: 'B' }],
      SOURCE,
    )
    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 50))

    expect(root.textContent).toContain('Click any element to start editing')
  })

  it('re-resolves across Shadow DOM via deep-query fallback', async () => {
    // Host an open shadow root containing an annotated element. Select it,
    // then swap the shadow-contained node. The flat top-level query returns
    // 0 matches (shadow is opaque to document.querySelectorAll), so the
    // re-resolver's `inShadowRoot` flag triggers the deep-query fallback.
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

    // Create a custom-element-style host with an open shadow root, place an
    // annotated span inside it.
    const SOURCE = 'src/shadow-child.tsx:12:5'
    const shadowHost = document.createElement('div')
    shadowHost.className = 'shadow-host'
    document.body.appendChild(shadowHost)
    orphans.push(shadowHost)
    const hostShadow = shadowHost.attachShadow({ mode: 'open' })
    const shadowChild = document.createElement('span')
    shadowChild.setAttribute('data-cortex-source', SOURCE)
    shadowChild.textContent = 'Shadow child'
    hostShadow.appendChild(shadowChild)
    mockGetBoundingClientRect(shadowChild, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(shadowChild)
    await new Promise(r => setTimeout(r, 20))

    // Detach the original and insert a replacement inside the same shadow.
    shadowChild.remove()
    const replacement = document.createElement('span')
    replacement.setAttribute('data-cortex-source', SOURCE)
    replacement.textContent = 'Shadow child'
    hostShadow.appendChild(replacement)
    mockGetBoundingClientRect(replacement, { top: 50, left: 50, width: 100, height: 40 })

    // Sanity check the trust model: a document-level query can't see into
    // the open shadow — that's why we need the deep-query fallback.
    expect(document.querySelectorAll(`[data-cortex-source="${SOURCE}"]`).length).toBe(0)

    channel._simulateMessage({ type: 'hmr-applied' })
    await new Promise(r => setTimeout(r, 50))

    expect(replacement.isConnected).toBe(true)
    expect(root.textContent).not.toContain('Click any element to start editing')
  })

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
    await new Promise(r => setTimeout(r, 50))

    // Falsifiable observable: the Panel stays populated. If the async
    // (double-rAF) pass didn't re-resolve, `selectedElement` would be
    // null (the original <p> was removed), and the Panel would render
    // its empty-state prompt. The tag swap from <p> to <span> via the
    // replacement node is observable through the header label too, but
    // the empty-state guard is the tightest assertion for "async
    // retry actually happened."
    expect(root.textContent).not.toContain('Click any element to start editing')
  })

  it('clears selection when HMR removes the selected element entirely', async () => {
    const SOURCE = 'src/removed.tsx:7:1'
    const { channel, el } = await setupAndSelect(SOURCE, 'p')

    // Element is gone from the DOM; no replacement.
    el.remove()

    channel._simulateMessage({ type: 'hmr-applied' })
    await vi.waitFor(() => {
      expect(root.textContent).toContain('Click any element to start editing')
    }, { timeout: 500 })
  })

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
    await new Promise(r => setTimeout(r, 30))

    // (1) Selection preserved — still showing the same element.
    expect(root.textContent).toContain('<div>')
    expect(root.textContent).not.toContain('Click any element to start editing')
    // (2) Panel re-read computed styles — proves the version-bump path fired
    // and propagated through to Panel's computedStyles useMemo invalidation.
    expect(gcsSpy.mock.calls.length).toBeGreaterThan(gcsBefore)

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
    const mod = await import('../../src/browser/selection.js') as unknown as { _resetCallbacks?: () => void }
    mod._resetCallbacks?.()
    _resetBusForTesting()
    cleanDocumentHead()
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
    await new Promise(r => setTimeout(r, 20))

    // Install spy AFTER selection so the baseline count is post-mount.
    const gcs = vi.spyOn(window, 'getComputedStyle')
    return { channel, gcs, element }
  }

  // Negative case "skips Panel refresh when hmr files are fully unrelated" —
  // removed (ZF0-1298 pipeline). The branch is proven by two richer, faster,
  // more deterministic tests:
  //   1. hmrFilesAffectElement(['src/other.tsx','src/unrelated.tsx'], el) → false
  //      (tests/browser/selection-metadata.test.ts — pure unit test of the gate).
  //   2. The positive it.each + ancestor-match tests below (which DO fire refresh)
  //      prove the wiring hmr-applied → gate → setHmrAppliedVersion is intact.
  // The removed test observed an indirect signal (getComputedStyle count)
  // polluted by attemptReResolve's independent DOM work — flaky under CI
  // fork-pool load even after fake-timer hardening. Per CLAUDE.md "No
  // subsumption": if test B asserts everything A does plus more, delete A.

  // All positive "files ∈ refresh branch" cases share the same setup and
  // observable (gcs call count bumps). Parameterizing by the files payload
  // keeps the branch coverage explicit and collapses four near-identical
  // tests into one. Negative case + ancestor-match remain separate (unique
  // DOM setup / inverted assertion).
  it.each<{ label: string; files: string[] | undefined }>([
    { label: 'CSS file in list', files: ['src/bar.tsx', 'src/app.css'] },
    { label: "selected element's own source file", files: ['src/foo.tsx'] },
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
    }, { timeout: 500 })
    gcs.mockRestore()
  })

  it('triggers Panel refresh when hmr files include an ancestor\'s source file', async () => {
    // Build a parent element with a source, child element inside. Select the
    // child. Dispatch hmr-applied with parent's source file in the list.
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

    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', 'src/parent.tsx:1:1')
    document.body.appendChild(parent)
    orphans.push(parent)
    const child = document.createElement('div')
    child.setAttribute('data-cortex-source', 'src/child.tsx:2:2')
    parent.appendChild(child)
    mockGetBoundingClientRect(child, { top: 50, left: 50, width: 100, height: 40 })

    selectCb(child)
    await new Promise(r => setTimeout(r, 20))

    const gcs = vi.spyOn(window, 'getComputedStyle')
    const before = gcs.mock.calls.length
    channel._simulateMessage({ type: 'hmr-applied', files: ['src/parent.tsx'] })
    // Positive assertion: poll for call-count increment. Same rationale as
    // the it.each variants above.
    await vi.waitFor(() => {
      expect(gcs.mock.calls.length).toBeGreaterThan(before)
    }, { timeout: 500 })
    gcs.mockRestore()
  })

})
