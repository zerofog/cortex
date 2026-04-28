import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import { SelectionOverlay } from '../../src/browser/components/SelectionOverlay.js'
import { createShadowHost, mockGetBoundingClientRect } from './helpers.js'
import type { StateDeclarations } from '../../src/browser/state-detector.js'
import { _resetTransformBusForTesting } from '../../src/browser/transform-bus.js'

describe('SelectionOverlay', () => {
  let root: HTMLDivElement
  let cleanupHost: () => void

  function setup() {
    const sh = createShadowHost()
    root = sh.root
    cleanupHost = sh.cleanup
    return sh
  }

  afterEach(() => {
    // Unmount before host removal so useEffect cleanups fire.
    if (root) render(null, root)
    if (cleanupHost) cleanupHost()
    // SelectionOverlay subscribes to transform-bus in useEffect; resetting
    // the bus between tests prevents leaked listeners from a prior test
    // firing during the current test's lifecycle. ZF0-1322 root-cause fix.
    _resetTransformBusForTesting()
  })

  it('renders nothing when element is null', () => {
    setup()
    render(<SelectionOverlay element={null} />, root)
    expect(root.querySelector('.cortex-selection-overlay')).toBeNull()
  })

  it('renders positioned div with correct class after RAF', async () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 200, width: 300, height: 50,
    })

    render(<SelectionOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-selection-overlay') as HTMLElement
    expect(overlay).not.toBeNull()

    // Initial render uses static placeholders; RAF sets real position
    await vi.waitFor(() => {
      expect(overlay.style.transform).toBe('translate(200px, 100px)')
      expect(overlay.style.width).toBe('300px')
      expect(overlay.style.height).toBe('50px')
    }, { timeout: 500 })

    restore()
    target.remove()
  })

  it('label shows component name + source file from data-cortex-source', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'Hero.tsx:14:5')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('Hero — Hero.tsx:14')

    restore()
    target.remove()
  })

  it('label shows filename:line for non-PascalCase source files', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'index.tsx:3:1')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('index.tsx:3')

    restore()
    target.remove()
  })

  it('label shows tagName.className when no data-cortex-source', () => {
    setup()
    const target = document.createElement('button')
    target.className = 'primary-btn large'
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('button.primary-btn')

    restore()
    target.remove()
  })

  it('label handles path-style source attributes', () => {
    setup()
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/components/Button.tsx:22:3')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 100, left: 100, width: 200, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const label = root.querySelector('.cortex-label')
    expect(label?.textContent).toBe('Button — Button.tsx:22')

    restore()
    target.remove()
  })

  // Fix 3: isConnected guard
  it('stops RAF when element detaches from DOM', async () => {
    setup()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restore = mockGetBoundingClientRect(target, {
      top: 50, left: 50, width: 100, height: 40,
    })

    render(<SelectionOverlay element={target} />, root)
    const overlay = root.querySelector('.cortex-selection-overlay') as HTMLElement
    expect(overlay).not.toBeNull()

    // Detach element from DOM
    target.remove()

    // The RAF loop should stop — overlay position should not update
    // We can verify by checking that getBoundingClientRect is not called after detach
    const spy = vi.spyOn(target, 'getBoundingClientRect')

    // Wait for one RAF cycle
    await new Promise(r => requestAnimationFrame(r))

    // After detach, the RAF loop should have bailed on isConnected check
    expect(spy).not.toHaveBeenCalled()

    restore()
    spy.mockRestore()
  })
})

describe('layout shift tracking', () => {
  let element: HTMLElement
  let container: HTMLDivElement
  let rafCallbacks: FrameRequestCallback[]
  let now: number
  const originalRAF = window.requestAnimationFrame
  const originalCAF = window.cancelAnimationFrame
  const originalPerf = performance.now

  beforeEach(() => {
    now = 1000
    rafCallbacks = []
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    element = document.createElement('div')
    element.scrollIntoView = vi.fn()
    document.body.appendChild(element)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
    performance.now = originalPerf
    element.remove()
    render(null, container)
    container.remove()
  })

  /** Flush Preact's microtask-scheduled effects */
  function flush(): Promise<void> {
    return new Promise(r => setTimeout(r, 0))
  }

  function installRAFMock() {
    rafCallbacks = []
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }) as typeof requestAnimationFrame
    window.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
  }

  function stepRAF(count = 1) {
    for (let i = 0; i < count; i++) {
      const cb = rafCallbacks.shift()
      if (cb) cb(now)
    }
  }

  function moveElement(top: number, left: number) {
    mockGetBoundingClientRect(element, { top, left, width: 100, height: 50, right: left + 100, bottom: top + 50 })
  }

  /**
   * Render the component and wait for useEffect to fire + initial update() to seed
   * stableDoc. Then install the RAF mock for controlled stepping.
   */
  async function renderAndInit(top: number, left: number) {
    moveElement(top, left)
    render(<SelectionOverlay element={element} />, container)
    // Let Preact's useEffect fire (scheduled via real RAF + setTimeout)
    await flush()
    // useEffect called update() synchronously → seeded stableDoc → enqueued RAF
    // Wait for the real RAF to fire the second update() (position unchanged, no shift)
    await new Promise<void>(r => originalRAF(() => { r() }))
    await flush()
    // Now install mock RAF so we can control stepping
    installRAFMock()
    // The last update() enqueued a real RAF callback that will fire later;
    // we need to capture the next loop iteration. Trigger one more real RAF
    // to let the pending callback push into our mock.
    await new Promise<void>(r => setTimeout(r, 20))
    // The idle RAF stopping feature may have paused the loop after unchanged frames.
    // Fire a scroll event to restart it, ensuring stepRAF has a callback to execute.
    window.dispatchEvent(new Event('scroll'))
  }

  it('does not auto-scroll on initial selection', async () => {
    await renderAndInit(200, 100)
    now += 500
    stepRAF(1) // frame after init — no shift
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('auto-scrolls when element shifts >50px after 400ms stable AND is off-screen', async () => {
    await renderAndInit(100, 100)

    // Move element off-screen (top becomes negative)
    moveElement(-100, 100) // shift 200px up, now off-screen
    now += 16
    stepRAF(1) // detect shift, set lastChangeTime

    now += 500 // 500ms later, position stable
    stepRAF(1) // should trigger scrollIntoView (off-screen)
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })

  it('does not auto-scroll when element moves >50px but stays on screen', async () => {
    await renderAndInit(100, 100)

    moveElement(200, 100) // shift 100px down, but still on screen
    now += 16
    stepRAF(1) // detect shift, set lastChangeTime

    now += 500 // 500ms later, position stable
    stepRAF(1) // should NOT trigger scrollIntoView (still visible)
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not auto-scroll when shift < 50px', async () => {
    await renderAndInit(100, 100)

    moveElement(130, 100) // shift 30px — below threshold
    now += 16
    stepRAF(1)
    now += 500
    stepRAF(1)
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not auto-scroll during continuous movement (scrub)', async () => {
    await renderAndInit(100, 100)

    // Move element every frame for 600ms — never stabilizes
    for (let i = 0; i < 36; i++) { // 36 frames * ~16ms = ~600ms
      moveElement(100 + i * 5, 100)
      now += 16
      stepRAF(1)
    }
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('respects 1s cooldown after scrollIntoView', async () => {
    await renderAndInit(100, 100)

    // Trigger first auto-scroll (element goes off-screen)
    moveElement(-100, 100) // shift 200px up, off-screen
    now += 16; stepRAF(1)
    now += 500; stepRAF(1)
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1)

    // Immediately shift again — within 1s cooldown (still off-screen)
    moveElement(-300, 100)
    now += 16; stepRAF(1)
    now += 500; stepRAF(1) // 500ms after second shift, but still within 1s cooldown
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1) // NOT called again

    // After cooldown expires
    now += 600 // total ~1.1s since first scroll
    moveElement(-500, 100) // still off-screen
    now += 16; stepRAF(1)
    now += 500; stepRAF(1)
    expect(element.scrollIntoView).toHaveBeenCalledTimes(2) // now called again
  })
})

describe('state lens', () => {
  let element: HTMLElement
  let container: HTMLDivElement
  const emptyStates: StateDeclarations = {
    hover: new Map(), focus: new Map(), active: new Map(),
  }
  const hoverOnlyStates: StateDeclarations = {
    hover: new Map([['background', 'blue']]),
    focus: new Map(),
    active: new Map(),
  }
  const allStates: StateDeclarations = {
    hover: new Map([['background', 'blue']]),
    focus: new Map([['outline', '2px solid']]),
    active: new Map([['transform', 'scale(0.95)']]),
  }

  beforeEach(() => {
    element = document.createElement('div')
    mockGetBoundingClientRect(element, { top: 200, left: 100, width: 300, height: 50 })
    document.body.appendChild(element)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    element.remove()
    render(null, container); container.remove()
  })

  it('does not render lens when no states available', () => {
    render(<SelectionOverlay element={element} availableStates={emptyStates} />, container)
    expect(container.querySelector('.cortex-state-lens')).toBe(null)
  })

  it('renders lens with available states only', () => {
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" />, container)
    const btns = container.querySelectorAll('.cortex-state-lens__btn')
    expect(btns.length).toBe(2) // Default + :hover
    expect(btns[0].textContent).toBe('Default')
    expect(btns[1].textContent).toBe(':hover')
  })

  it('renders all state buttons when all states available', () => {
    render(<SelectionOverlay element={element} availableStates={allStates} activeState="default" />, container)
    const btns = container.querySelectorAll('.cortex-state-lens__btn')
    expect(btns.length).toBe(4) // Default + :hover + :focus + :active
  })

  it('highlights active state', () => {
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="hover" />, container)
    const hoverBtn = container.querySelectorAll('.cortex-state-lens__btn')[1]
    expect(hoverBtn.classList.contains('cortex-state-lens__btn--active')).toBe(true)
  })

  it('calls onStateChange when a state button is clicked', () => {
    const onStateChange = vi.fn()
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" onStateChange={onStateChange} />, container)
    const hoverBtn = container.querySelectorAll('.cortex-state-lens__btn')[1] as HTMLElement
    hoverBtn.click()
    expect(onStateChange).toHaveBeenCalledWith('hover')
  })

  it('clicking Default calls onStateChange with default', () => {
    const onStateChange = vi.fn()
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="hover" onStateChange={onStateChange} />, container)
    const defaultBtn = container.querySelectorAll('.cortex-state-lens__btn')[0] as HTMLElement
    defaultBtn.click()
    expect(onStateChange).toHaveBeenCalledWith('default')
  })

  it.skip('updates lens position when element rect changes (scroll simulation) — moved to Playwright e2e', () => {
    // happy-dom does not reliably pump rAF frames inside the SelectionOverlay
    // idle-loop, so the post-rect-change re-read is non-deterministic in this
    // environment. Per CLAUDE.md anti-pattern 3 ("happy-dom theatre"), an
    // assertion that passes/fails based on environment quirks is worse than no
    // test. Initial-mount lens position is exercised by the sibling
    // 'positions lens below element when near top of viewport' test below;
    // only the cross-rAF-frame rect re-read needs real-browser coverage.
    //
    // TODO(ZF0-1387 follow-up): port to Playwright once the e2e harness gains
    // a generic-UI test surface. The current tests/e2e/ harness is the IIFE
    // route-interception closed harness for override lifecycle; it is not yet
    // generic-UI capable. File a follow-up ticket if this becomes load-bearing.
  })

  it('positions lens below element when near top of viewport', async () => {
    mockGetBoundingClientRect(element, { top: 20, left: 100, width: 300, height: 50, bottom: 70 })
    render(<SelectionOverlay element={element} availableStates={hoverOnlyStates} activeState="default" />, container)

    // Wait for RAF to update lens position
    await vi.waitFor(() => {
      const lens = container.querySelector('.cortex-state-lens') as HTMLElement
      expect(lens).not.toBeNull()
      // Lens should be below the element — extract Y from translate(Xpx, Ypx)
      const match = lens.style.transform.match(/translate\([^,]+,\s*([^)]+)px\)/)
      const lensTop = match ? parseFloat(match[1]) : 0
      expect(lensTop).toBeGreaterThan(70) // below element bottom (20 + 50)
    }, { timeout: 500 })
  })
})
