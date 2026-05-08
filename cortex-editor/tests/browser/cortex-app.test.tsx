import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { CortexApp } from '../../src/browser/components/CortexApp.js'
import { createShadowHost, createMockChannel, mockGetBoundingClientRect, dispatchKeyboardEvent, cleanDocumentHead } from './helpers.js'
import * as focusUtils from '../../src/browser/focus-utils.js'
import { _resetBusForTesting } from '../../src/browser/override-bus.js'
import { _resetTransformBusForTesting } from '../../src/browser/transform-bus.js'
import { _resetPopoverStackForTesting } from '../../src/browser/popover-stack.js'
import { cortexStorage } from '../../src/browser/persistence.js'

const WAIT_FOR_COMMIT_MS = 2000

// Mock the selection module to verify it's called correctly.
// _resetCallbacks nulls the module-scope hoverCb/selectCb closure so a prior
// test's unmounted-component callbacks cannot be returned by _getCallbacks
// under async timing — call from afterEach (ZF0-1297 test-hygiene fix).
//
// selectCb now receives (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle').
// Tests that need to select a single element use: selectCb([target], 'replace')
// Tests that need to clear selection use: selectCb([], 'replace')
// For back-compat with existing tests, a selectOne(el) helper is also exported.
vi.mock('../../src/browser/selection.js', () => {
  const cleanupFn = vi.fn()
  const setDesignModeFn = vi.fn()
  const setInterceptClicksFn = vi.fn()
  let hoverCb: ((el: HTMLElement | null) => void) | null = null
  let selectCb: ((elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void) | null = null

  return {
    initSelection: vi.fn((_shadow: ShadowRoot, onHover: (el: HTMLElement | null) => void, onSelect: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void) => {
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
    _resetTransformBusForTesting()
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
    // Sentinel `data-cortex-source` element — keeps NoAnnotationsBanner's
    // initial `hasAnnotation()` check returning true, so the banner never
    // mounts visible and never attaches a MutationObserver. Without this,
    // every test that adds annotated fixtures via createEditableDiv() or
    // setAttribute('data-cortex-source', ...) triggers the banner's observer,
    // which calls setHidden(true), causing CortexApp's transform-wrapper to
    // shift mid-test. The shift races test assertions and produces flaky
    // "expected null not to be null" failures across this file. Idempotent —
    // safe to call multiple times per test session.
    if (!document.querySelector('[data-cortex-source="__cortex-app-test-sentinel__"]')) {
      const sentinel = document.createElement('div')
      sentinel.setAttribute('data-cortex-source', '__cortex-app-test-sentinel__')
      sentinel.style.display = 'none'
      document.body.appendChild(sentinel)
    }
    const sh = createShadowHost()
    root = sh.root
    shadow = sh.shadow
    cleanupHost = sh.cleanup
    return sh
  }

  async function activateEditor(channel: ReturnType<typeof createMockChannel>) {
    await vi.waitFor(() => {
      expect(channel._handlerCount()).toBeGreaterThan(0)
    }, { timeout: WAIT_FOR_COMMIT_MS })
    await act(async () => {
      channel._simulateMessage({ type: 'cortex' } as any)
    })
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('select callback updates SelectionOverlay', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void }
    }
    const { selectCb } = _getCallbacks()

    const target = document.createElement('div')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })

    selectCb([target], 'replace')

    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-selection-overlay')).not.toBeNull()
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('creates CSSOverrideManager on mount', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))

    await vi.waitFor(() => {
      const styleEl = document.head.querySelector('[data-cortex-override]')
      expect(styleEl).not.toBeNull()
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('subscribes to channel.onMessage', async () => {
    setup()
    const channel = createMockChannel()
    const spy = vi.spyOn(channel, 'onMessage')
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith(expect.any(Function))
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('cleanup calls onMessage unsubscribe', async () => {
    setup()
    const channel = createMockChannel()
    const unsubscribe = vi.fn()
    const onMessageSpy = vi.spyOn(channel, 'onMessage').mockReturnValue(unsubscribe)
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await vi.waitFor(() => {
      expect(onMessageSpy).toHaveBeenCalledWith(expect.any(Function))
    }, { timeout: WAIT_FOR_COMMIT_MS })

    // Unmount to trigger cleanup
    render(null, root)
    await vi.waitFor(() => {
      expect(unsubscribe).toHaveBeenCalled()
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('switching elements clears state overrides', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 10))
    await activateEditor(channel)

    const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
      _getCallbacks: () => { selectCb: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void }
    }
    const { selectCb } = _getCallbacks()

    // Select element A
    const elA = document.createElement('div')
    elA.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
    document.body.appendChild(elA)
    orphans.push(elA)
    mockGetBoundingClientRect(elA, { top: 50, left: 50, width: 100, height: 40 })

    selectCb([elA], 'replace')
    // Verify CSSOverrideManager style element exists
    const styleEl = await vi.waitFor(() => {
      const el = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(el).not.toBeNull()
      return el
    }, { timeout: WAIT_FOR_COMMIT_MS })

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

    selectCb([elB], 'replace')

    // Wait for clearStateOverrides → rebuild() effect to fire. A fixed
    // setTimeout(10) flaked under CI load on GitHub Linux runners; vi.waitFor
    // polls until the assertion holds, bounded by the timeout.
    await vi.waitFor(() => {
      expect(styleEl.textContent).toBe('')
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  it('renders toolbar even without selection', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await new Promise(r => setTimeout(r, 20))
    await activateEditor(channel)
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
    expect(pinDot).not.toBeNull()
  })

  it('Escape with selection deselects but does not exit', async () => {
    setup()
    const channel = createMockChannel()
    render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
    await activateEditor(channel)

    // Simulate element selection
    const { _getCallbacks } = await import('../../src/browser/selection.js') as any
    const { selectCb } = _getCallbacks()
    expect(selectCb).toBeTypeOf('function')
    const target = document.createElement('div')
    document.body.appendChild(target)
    orphans.push(target)
    mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40 })
    selectCb([target], 'replace')
    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-selection-overlay')).not.toBeNull()
    }, { timeout: WAIT_FOR_COMMIT_MS })

    // Escape deselects, not exits (mock isRealEvent for cascading handler)
    vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })

    await vi.waitFor(() => {
      expect(root.querySelector('.cortex-toolbar')).not.toBeNull() // still active
      expect(root.querySelector('.cortex-selection-overlay')).toBeNull() // deselected
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    selectCb([target], 'replace')
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
    }, { timeout: WAIT_FOR_COMMIT_MS })

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
    }, { timeout: WAIT_FOR_COMMIT_MS })
  })

  describe('error tracking', () => {
    /** Helper: mount CortexApp, activate, select element, return refs. */
    async function setupWithSelectedElement() {
      const { _getCallbacks } = await import('../../src/browser/selection.js') as any
      const { selectCb } = _getCallbacks()

      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
      document.body.appendChild(target)
      orphans.push(target)
      mockGetBoundingClientRect(target, { top: 50, left: 50, width: 200, height: 100 })

      // Error cards are scoped to the selected element source, so wait for
      // the selected Panel commit before injecting edit_status messages.
      await act(async () => {
        selectCb([target], 'replace')
      })
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-panel')).not.toBeNull()
      }, { timeout: WAIT_FOR_COMMIT_MS })

      return target
    }

    it('edit_status:failed populates editErrors and renders error card', async () => {
      // Decoupled from scrub UI path (ZF0-1451): scrub commits now go to staging buffer,
      // not channel.send. Seed editDispatchRef directly via the test bridge.
      ;(window as any).__CORTEX_DEBUG_OVERRIDES__ = true
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement()

      // Synthetic edit dispatch — simulates what the Apply gesture will eventually do.
      const editId = 'test-edit-failed-1'
      const testBridge = (window as any).__CORTEX_TEST__ as { handleEditDispatch: (id: string, src: string, prop: string, val: string) => void }
      await act(async () => {
        testBridge.handleEditDispatch(editId, 'Hero.tsx:5:3', 'padding-bottom', '16px')
        // Simulate server failure for this edit
        channel._simulateMessage({ type: 'edit_status', editId, status: 'failed', reason: 'CSS parse error' })
      })
      await vi.waitFor(() => {
        // Error card should be visible
        const errorCard = root.querySelector('.cortex-error-card')
        expect(errorCard).not.toBeNull()
        expect(errorCard!.textContent).toContain('edit failed')
        expect(errorCard!.textContent).toContain('CSS parse error')
      }, { timeout: WAIT_FOR_COMMIT_MS })
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
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      await setupWithSelectedElement()
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
      }, { timeout: WAIT_FOR_COMMIT_MS })
    })
  })

  describe('C1 regression: close→reopen cycle (ZF0-1363)', () => {
    // This test would fail without the C1 fix. The bug: cortex-close left
    // reducerStateRef.active===true while React active===false, so a subsequent
    // {type:'cortex'} hit the idempotent short-circuit and never re-opened.
    it('editor re-opens after being closed via cortex-close message', async () => {
      setup()
      const channel = createMockChannel()
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Step 1: Activate — toolbar visible
      channel._simulateMessage({ type: 'cortex' } as any)
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
      }, { timeout: WAIT_FOR_COMMIT_MS })

      // Step 2: Close via cortex-close — toolbar hidden
      channel._simulateMessage({ type: 'cortex-close' } as any)
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-toolbar')).toBeNull()
      }, { timeout: WAIT_FOR_COMMIT_MS })

      // Step 3: Re-open — without the C1 fix, the reducer sees active===true in
      // its ref and short-circuits, so the toolbar never re-appears.
      channel._simulateMessage({ type: 'cortex' } as any)
      await vi.waitFor(() => {
        expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
      }, { timeout: WAIT_FOR_COMMIT_MS })
    })
  })

  describe('I1 regression: skip-path wiring (ZF0-1363)', () => {
    it('edit_status:writing does not throw and does not consume dispatch entry', async () => {
      // Decoupled from scrub UI path (ZF0-1451): scrub commits now go to staging buffer,
      // not channel.send. Seed editDispatchRef directly via the test bridge.
      ;(window as any).__CORTEX_DEBUG_OVERRIDES__ = true
      setup()
      const channel = createMockChannel()
      const warnSpy = vi.spyOn(console, 'warn')
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      // Select an element so the Panel renders and error cards are visible.
      // Source 'Hero.tsx:5:3' must match the handleEditDispatch source below
      // (EditErrorCard filters errors by elementSource).
      const { _getCallbacks: _getCb1 } = await import('../../src/browser/selection.js') as any
      const { selectCb: selectCb1 } = _getCb1()
      const target1 = document.createElement('div')
      target1.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
      document.body.appendChild(target1)
      orphans.push(target1)
      mockGetBoundingClientRect(target1, { top: 50, left: 50, width: 100, height: 40 })
      selectCb1([target1], 'replace')
      await new Promise(r => setTimeout(r, 50))

      // Synthetic edit dispatch — simulates what the Apply gesture will eventually do.
      // Source must match the selected element's data-cortex-source ('Hero.tsx:5:3').
      const trackedEditId = 'test-edit-writing-1'
      const testBridge = (window as any).__CORTEX_TEST__ as { handleEditDispatch: (id: string, src: string, prop: string, val: string) => void }
      testBridge.handleEditDispatch(trackedEditId, 'Hero.tsx:5:3', 'display', 'flex')

      // Send writing — must be silently skipped (no dispatch entry consumed, no throw)
      channel._simulateMessage({ type: 'edit_status', editId: trackedEditId, status: 'writing' } as any)
      await new Promise(r => setTimeout(r, 10))

      // No reducer-exhaustive throw should surface as console.warn
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled cortex-app-reducer'))

      // Entry survived — a subsequent failed status should produce an error card
      channel._simulateMessage({ type: 'edit_status', editId: trackedEditId, status: 'failed', reason: 'post-writing-fail' } as any)
      await vi.waitFor(() => {
        const card = root.querySelector('.cortex-error-card')
        expect(card).not.toBeNull()
        expect(card!.textContent).toContain('post-writing-fail')
      }, { timeout: WAIT_FOR_COMMIT_MS })
    })

    it('edit_status:cancelled does not throw and does not consume dispatch entry', async () => {
      // Decoupled from scrub UI path (ZF0-1451): scrub commits now go to staging buffer,
      // not channel.send. Seed editDispatchRef directly via the test bridge.
      ;(window as any).__CORTEX_DEBUG_OVERRIDES__ = true
      setup()
      const channel = createMockChannel()
      const warnSpy = vi.spyOn(console, 'warn')
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))
      await activateEditor(channel)

      // Select an element so the Panel renders and error cards are visible.
      // Source 'Hero.tsx:5:3' must match the handleEditDispatch source below
      // (EditErrorCard filters errors by elementSource).
      const { _getCallbacks: _getCb2 } = await import('../../src/browser/selection.js') as any
      const { selectCb: selectCb2 } = _getCb2()
      const target2 = document.createElement('div')
      target2.setAttribute('data-cortex-source', 'Hero.tsx:5:3')
      document.body.appendChild(target2)
      orphans.push(target2)
      mockGetBoundingClientRect(target2, { top: 50, left: 50, width: 100, height: 40 })
      selectCb2([target2], 'replace')
      await new Promise(r => setTimeout(r, 50))

      // Synthetic edit dispatch — simulates what the Apply gesture will eventually do.
      // Source must match the selected element's data-cortex-source ('Hero.tsx:5:3').
      const trackedEditId = 'test-edit-cancelled-1'
      const testBridge = (window as any).__CORTEX_TEST__ as { handleEditDispatch: (id: string, src: string, prop: string, val: string) => void }
      testBridge.handleEditDispatch(trackedEditId, 'Hero.tsx:5:3', 'display', 'grid')

      // Send cancelled — must be silently skipped
      channel._simulateMessage({ type: 'edit_status', editId: trackedEditId, status: 'cancelled' } as any)
      await new Promise(r => setTimeout(r, 10))

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled cortex-app-reducer'))

      // Entry survived — proven by sending failed after cancelled and asserting
      // the error card surfaces with the dispatch entry's reason. (Without the
      // dispatch entry, failed would only emit a log_warning, not an error card.)
      channel._simulateMessage({ type: 'edit_status', editId: trackedEditId, status: 'failed', reason: 'post-cancelled-fail' } as any)
      await vi.waitFor(() => {
        const card = root.querySelector('.cortex-error-card')
        expect(card).not.toBeNull()
        expect(card!.textContent).toContain('post-cancelled-fail')
      }, { timeout: WAIT_FOR_COMMIT_MS })
    })

    it('error channel message does not throw and does not reach reducer', async () => {
      setup()
      const channel = createMockChannel()
      const warnSpy = vi.spyOn(console, 'warn')
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))

      // Send an error message — should be silently dropped before reaching the reducer
      channel._simulateMessage({ type: 'error', code: 'AUTH_FAILED', message: 'test error' } as any)
      await new Promise(r => setTimeout(r, 10))

      // The reducer's exhaustive throw would surface as a thrown error — not a
      // console.warn. We verify nothing unexpected was warned either way.
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled cortex-app-reducer'))
    })

    it('staged-edits-discard channel message does not throw and does not reach reducer', async () => {
      // Pins the early-return at CortexApp.tsx — Panel.tsx owns this message
      // (mirrors the discard into the canonical buffer). If the early-return
      // is removed, the reducer's exhaustive throw at cortex-app-reducer.ts
      // would fire on every cortex_discard_edits call, surfacing as a
      // console.warn from channel.ts:46. The error pattern guard is a
      // load-bearing assertion: a regression that drops the guard would
      // emit "Unhandled cortex-app-reducer action: staged-edits-discard".
      setup()
      const channel = createMockChannel()
      const warnSpy = vi.spyOn(console, 'warn')
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateMessage({ type: 'staged-edits-discard', intentIds: ['some-id'] } as any)
      await new Promise(r => setTimeout(r, 10))

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled cortex-app-reducer'))
    })

    it('staged-edits-acked channel message does not throw and does not reach reducer', async () => {
      // Pins the early-return at CortexApp.tsx for ZF0-1469's new ack variant.
      // The ack is consumed by channel.sendAndAck's one-shot listener — it
      // resolves the pending Apply Promise via requestId correlation. If the
      // early-return is removed, the reducer's exhaustive throw at
      // cortex-app-reducer.ts would fire on every Apply, surfacing as a
      // console.warn from channel.ts:46.
      setup()
      const channel = createMockChannel()
      const warnSpy = vi.spyOn(console, 'warn')
      render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
      await new Promise(r => setTimeout(r, 10))

      channel._simulateMessage({ type: 'staged-edits-acked', requestId: 'test-req-id' } as any)
      await new Promise(r => setTimeout(r, 10))

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled cortex-app-reducer'))
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
      // Uses fake timers throughout to drive Preact's macrotask-based render
      // batching deterministically. The earlier real-timers + waitFor variant
      // produced an intermittent CI flake where the reconnecting render hadn't
      // committed by the time waitFor first polled (line 795 null assertion);
      // act() + vi.advanceTimersByTimeAsync replaces the polling race per the
      // ZF0-1387 lineage of flake fixes.
      vi.useFakeTimers()
      try {
        setup()
        const channel = createMockChannel()
        await act(() => {
          render(<CortexApp channel={channel} shadowRoot={shadow} initialActive={true} />, root)
        })
        await vi.advanceTimersByTimeAsync(10)

        // Reconnecting → marks wasDisconnected=true internally. act() flushes
        // the Preact render synchronously so the footer is visible before
        // we proceed.
        await act(() => {
          channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
        })
        await vi.advanceTimersByTimeAsync(10)

        const reconnecting = root.querySelector('.cortex-connection-status')
        expect(reconnecting).not.toBeNull()
        expect(reconnecting!.textContent).toContain('Reconnecting')

        // Connected + wasDisconnected → CortexApp flips status to 'reconnected'
        // and starts the 2s auto-dismiss timer.
        await act(() => {
          channel._simulateConnectionChange({ status: 'connected' })
        })
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
    _resetTransformBusForTesting()
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
      _getCallbacks: () => { selectCb: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void }
    }
    const { selectCb } = _getCallbacks()

    const el = document.createElement(tag)
    el.setAttribute('data-cortex-source', sourceValue)
    document.body.appendChild(el)
    orphans.push(el)
    mockGetBoundingClientRect(el, { top: 50, left: 50, width: 100, height: 40 })

    selectCb([el], 'replace')
    await new Promise(r => setTimeout(r, 20))

    return { channel, el }
  }

  // Cascade-only: exercises rAF/setTimeout retry fan-out inside CortexApp.tsx attemptReResolve.
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
    }, { timeout: WAIT_FOR_COMMIT_MS })
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
    }, { timeout: WAIT_FOR_COMMIT_MS })

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
    _resetTransformBusForTesting()
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
      _getCallbacks: () => { selectCb: (elements: HTMLElement[], action: 'replace' | 'add' | 'toggle') => void }
    }
    const { selectCb } = _getCallbacks()

    const element = document.createElement('div')
    element.setAttribute('data-cortex-source', source)
    element.appendChild(document.createTextNode('target'))
    document.body.appendChild(element)
    orphans.push(element)
    mockGetBoundingClientRect(element, { top: 50, left: 50, width: 100, height: 40 })

    selectCb([element], 'replace')
    // Wait for Panel to fully settle (initial getComputedStyle calls complete)
    // before installing the spy. Under serial-loop load 20ms wasn't enough —
    // ambient effects continued into the 200ms observation window and inflated
    // gcs.mock.calls.length before the hmr-applied message was even sent.
    await new Promise(r => setTimeout(r, 50))

    // Install spy AFTER selection so the baseline count is post-mount.
    const gcs = vi.spyOn(window, 'getComputedStyle')
    await new Promise(r => setTimeout(r, 150))
    gcs.mockClear()
    return { channel, gcs, element }
  }

  it('skips Panel refresh when hmr files are fully unrelated to the selection', async () => {
    const { channel, gcs } = await setup('src/foo.tsx:10:5')
    const before = gcs.mock.calls.length
    channel._simulateMessage({ type: 'hmr-applied', files: ['src/bar.tsx', 'src/baz.tsx'] })
    // Negative assertion: the shouldRefresh gate short-circuits the version
    // bump AND the attemptReResolve fan-out, so with the gate in place nothing
    // fires regardless of wait length. We wait 200ms as an empirical upper
    // bound on happy-dom's Preact-scheduler + override-bus ambient effects
    // under CI fork-pool load. vi.waitFor cannot help here — you can't poll
    // for a thing NOT happening.
    await new Promise(r => setTimeout(r, 200))
    // No CSS in list, no ancestor match, no own-file match → gate returns
    // false → neither the version bump nor the re-resolve fan-out fires.
    expect(gcs.mock.calls.length).toBe(before)
    gcs.mockRestore()
  })

  // ZF0-1470 (T4 fix-up, IMPORTANT 1): hmrEventVersion always-bumps, even when
  // shouldRefreshOnHMR returns false (unrelated files). The Panel still receives
  // hmrChangedFiles so buffer.reconcile() can check non-selected element sources.
  // Observable: hmrChangedFiles prop contains the unrelated files (not empty) even
  // when the DOM refresh was skipped.
  //
  // Falsifiability fix (ZF0-1480 #6): the previous test only checked absence of
  // side-effects (no crash, no extra gcs call). That assertion passes even if
  // setHmrChangedFiles regressed to setHmrChangedFiles([]) — because with an empty
  // buffer there is nothing to reconcile either way. We now pre-seed a staged intent
  // for a file that IS in the incoming changedFiles list, but whose DOM element does
  // NOT exist → reconcile marks it divergent → intentDriftCount rises to 1 →
  // StagingDriftBanner renders. The banner ONLY renders when hmrChangedFiles is
  // propagated non-empty; if the regression collapses it to [], the early-return
  // branch fires (setIntentDriftCount(0)) and the banner stays hidden.
  it('hmr-applied with unrelated files still propagates hmrChangedFiles for buffer reconcile', async () => {
    // Seed the staging buffer before mount so it is loaded by useEditStagingBuffer on
    // Panel mount. The intent targets src/Sidebar.tsx — one of the files that the
    // hmr-applied message will carry — but no DOM element with that data-cortex-source
    // is present, so reconcile treats it as divergent (element deleted/refactored).
    localStorage.clear()
    cortexStorage.set('staging-buffer', [{
      intentId: 'test-sidebar-intent',
      source: 'src/Sidebar.tsx:1:1',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }])

    const { channel, gcs } = await setup('src/foo.tsx:10:5')
    const before = gcs.mock.calls.length

    // Fire hmr-applied with files that include src/Sidebar.tsx — shouldRefreshOnHMR
    // returns false (src/foo.tsx:10:5 is selected, Sidebar.tsx is unrelated),
    // hmrAppliedVersion stays flat, but hmrEventVersion MUST bump and
    // hmrChangedFiles MUST be updated with the incoming files so buffer.reconcile()
    // can find the staged intent and report intentDriftCount = 1.
    expect(() => {
      channel._simulateMessage({ type: 'hmr-applied', files: ['src/Sidebar.tsx', 'src/Other.tsx'] })
    }).not.toThrow()

    // DOM refresh skipped (no new getComputedStyle calls) — confirms gate worked
    await new Promise(r => setTimeout(r, 200))
    expect(gcs.mock.calls.length).toBe(before)

    // Falsifiable: the drift banner must appear, proving hmrChangedFiles was propagated
    // non-empty. If setHmrChangedFiles regressed to setHmrChangedFiles([]), the Panel
    // reconcile effect takes the early-return path (intentDriftCount stays 0) and the
    // banner does not render.
    await vi.waitFor(() => {
      expect(root.textContent).toContain('staged edit(s) may be affected')
    }, { timeout: WAIT_FOR_COMMIT_MS })

    gcs.mockRestore()
    localStorage.clear()
  })

})
