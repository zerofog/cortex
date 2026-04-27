import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { useCanvasZoom } from '../../../src/browser/hooks/useCanvasZoom.js'

function renderHook<T>(hookFn: () => T): { result: { current: T }; unmount: () => void; rerender: (newHookFn: () => T) => void } {
  const result = { current: null as T }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let currentFn = hookFn

  function Wrapper() {
    result.current = currentFn()
    return null
  }

  render(<Wrapper />, container)
  return {
    result,
    unmount: () => {
      render(null, container)
      container.remove()
    },
    rerender: (newHookFn: () => T) => {
      currentFn = newHookFn
      render(<Wrapper />, container)
    },
  }
}

describe('useCanvasZoom', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    document.body.style.transform = ''
    document.body.style.transformOrigin = ''
  })

  afterEach(() => {
    document.body.style.cursor = ''
  })

  // --- rAF mock infrastructure (matches selection-overlay.test.tsx pattern) ---
  let rafCallbacks: FrameRequestCallback[]
  let mockNow: number
  const originalRAF = window.requestAnimationFrame
  const originalCAF = window.cancelAnimationFrame
  const originalPerfNow = performance.now

  let rafIdMap: Map<number, FrameRequestCallback>
  let nextRafId: number

  function installRAFMock() {
    rafCallbacks = []
    rafIdMap = new Map()
    nextRafId = 1
    mockNow = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => mockNow)
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextRafId++
      rafCallbacks.push(cb)
      rafIdMap.set(id, cb)
      return id
    }) as typeof requestAnimationFrame
    window.cancelAnimationFrame = ((id: number) => {
      const cb = rafIdMap.get(id)
      if (cb) {
        const idx = rafCallbacks.indexOf(cb)
        if (idx !== -1) rafCallbacks.splice(idx, 1)
        rafIdMap.delete(id)
      }
    }) as typeof cancelAnimationFrame
  }

  function restoreRAFMock() {
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
    performance.now = originalPerfNow
  }

  function stepRAF(count = 1, dtMs = 16.667) {
    for (let i = 0; i < count; i++) {
      mockNow += dtMs
      const cb = rafCallbacks.shift()
      if (cb) cb(mockNow)
    }
  }

  it('does not apply transform when disabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(false))
    expect(document.body.style.transform).toBe('')
    unmount()
  })

  it('applies transform when enabled', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    expect(document.body.style.transformOrigin).toBe('50% 0')
    expect(result.current.scale).toBeGreaterThanOrEqual(0.75)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)
    unmount()
  })

  it('defaults to 0.85 scale', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(result.current.scale).toBe(0.85)
    unmount()
  })

  it('cleans up transform when disabled', async () => {
    const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    rerender(() => useCanvasZoom(false))
    await vi.waitFor(() => {
      expect(document.body.style.transform).toBe('')
    }, { timeout: 500 })
    unmount()
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    unmount()
    expect(document.body.style.transform).toBe('')
  })

  it('clamps scale between 0.5 and 1.0', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(result.current.scale).toBeGreaterThanOrEqual(0.75)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)

    unmount()
  })

  it('static canvas styles are applied when enabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transformOrigin).toBe('50% 0')
    expect(document.body.style.boxShadow).toContain('rgba(0,0,0,0.06)')
    expect(document.documentElement.style.overflow).toBe('hidden')
    // Artboard color is theme-adaptive (light or dark), not hardcoded
    expect(document.documentElement.style.backgroundColor).toMatch(/^#(e5e5e5|2a2a2a)$/)
    // body.backgroundColor is NOT touched — preserves app's theme
    unmount()
  })

  // Helper: happy-dom's WheelEvent may not propagate metaKey from init,
  // so we set it explicitly via Object.defineProperty
  function dispatchWheel(deltaY: number, metaKey: boolean, deltaX = 0, deltaMode = 0): void {
    const event = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'metaKey', { value: metaKey })
    if (deltaMode !== 0) Object.defineProperty(event, 'deltaMode', { value: deltaMode })
    window.dispatchEvent(event)
  }

  it('Cmd+scroll down decreases scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    const initialScale = result.current.scale
    dispatchWheel(100, true)
    await vi.waitFor(() => {
      rerender(() => useCanvasZoom(true))
      expect(result.current.scale).toBeLessThan(initialScale)
    }, { timeout: 500 })
    unmount()
  })

  it('Cmd+scroll up increases scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    dispatchWheel(100, true) // zoom out first
    let zoomedOut!: number
    await vi.waitFor(() => {
      rerender(() => useCanvasZoom(true))
      zoomedOut = result.current.scale
      expect(zoomedOut).toBeLessThan(1) // ensure zoom-out completed
    }, { timeout: 500 })
    dispatchWheel(-100, true) // zoom back in
    await vi.waitFor(() => {
      rerender(() => useCanvasZoom(true))
      expect(result.current.scale).toBeGreaterThan(zoomedOut)
    }, { timeout: 500 })
    unmount()
  })

  it('regular scroll without Cmd does not change scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    const initialScale = result.current.scale
    dispatchWheel(100, false)
    rerender(() => useCanvasZoom(true))
    await vi.waitFor(() => {
      expect(result.current.scale).toBe(initialScale)
    }, { timeout: 500 })
    unmount()
  })

  it('saves and restores original body.style.transform on disable', async () => {
    // Set a pre-existing transform (e.g. GSAP ScrollSmoother)
    document.body.style.transform = 'translateY(-100px)'
    document.body.style.transformOrigin = 'center center'

    const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
    // Canvas zoom should override
    expect(document.body.style.transform).toContain('scale(')

    // Disable — should restore originals
    rerender(() => useCanvasZoom(false))
    await vi.waitFor(() => {
      expect(document.body.style.transform).toBe('translateY(-100px)')
      expect(document.body.style.transformOrigin).toBe('center center')
    }, { timeout: 500 })

    unmount()
  })

  it('saves and restores original body.style.transform on unmount', () => {
    document.body.style.transform = 'rotate(5deg)'
    document.body.style.transformOrigin = '50% 50%'

    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')

    unmount()
    expect(document.body.style.transform).toBe('rotate(5deg)')
    expect(document.body.style.transformOrigin).toBe('50% 50%')
  })

  it('regular scroll pans vertically', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    const before = document.body.style.transform
    dispatchWheel(100, false)
    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
    await vi.waitFor(() => {
      const after = document.body.style.transform
      expect(after).not.toBe(before)
      // The y-offset in translate should have decreased (scrolled down → pan up)
      expect(getY(after)).toBeLessThan(getY(before))
    }, { timeout: 500 })
    unmount()
  })

  it('regular scroll pans horizontally', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    const before = document.body.style.transform
    dispatchWheel(0, false, 100)
    const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])
    await vi.waitFor(() => {
      const after = document.body.style.transform
      expect(after).not.toBe(before)
      // The x-offset in translate should have decreased (scrolled right → pan left)
      expect(getX(after)).toBeLessThan(getX(before))
    }, { timeout: 500 })
    unmount()
  })

  it('pan offset is clamped to prevent canvas from going off-screen', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))

    const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])

    // Try to pan 50000px to the right
    dispatchWheel(0, false, -50000)
    await vi.waitFor(() => {
      const x = getX(document.body.style.transform)
      // Dynamic bounds: maxX = (max(vpW, scaledBodyW) + vpW) / 2
      // With vpW=1440, this is at most a few thousand px, never 50000
      expect(Math.abs(x)).toBeLessThan(5000)
    }, { timeout: 500 })
    unmount()
  })

  it('Space hold shows grab cursor', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    // Dispatch inside vi.waitFor so if useEffect hasn't installed the handler
    // yet (possible under serial-loop load), we retry until it responds.
    // Load-bearing — positive assertion waits for state to settle.
    await vi.waitFor(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
      expect(document.body.style.cursor).toBe('grab')
    }, { timeout: 1000 })
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    unmount()
  })

  it('Space+drag shows grabbing cursor', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    // 10ms needed for useEffect to install window key/pointer handlers in happy-dom
    await new Promise<void>(r => setTimeout(r, 10))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }))
    expect(document.body.style.cursor).toBe('grabbing')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    unmount()
  })

  it('cursor restores on Space release', async () => {
    document.body.style.cursor = 'crosshair'
    const { unmount } = renderHook(() => useCanvasZoom(true))
    // Dispatch inside vi.waitFor so if useEffect hasn't installed the handler
    // yet (possible under serial-loop load), we retry until keydown responds.
    // Load-bearing — positive assertion waits for state to settle.
    await vi.waitFor(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
      expect(document.body.style.cursor).toBe('grab')
    }, { timeout: 1000 })
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(document.body.style.cursor).toBe('crosshair')
    unmount()
  })

  it('Space+drag pointer up returns to grab (not grabbing)', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    // 10ms needed for useEffect to install window key/pointer handlers in happy-dom
    await new Promise<void>(r => setTimeout(r, 10))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
    expect(document.body.style.cursor).toBe('grabbing')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    expect(document.body.style.cursor).toBe('grab')
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    unmount()
  })

  it('zooming preserves pan offset', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))

    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

    // Pan the canvas
    dispatchWheel(200, false)
    let panY!: number
    await vi.waitFor(() => {
      const t = document.body.style.transform
      panY = getY(t)
      expect(isNaN(panY)).toBe(false)
    }, { timeout: 500 })

    // Zoom — should preserve pan offset, not reset it
    dispatchWheel(100, true)
    await vi.waitFor(() => {
      rerender(() => useCanvasZoom(true))
      const zoomY = getY(document.body.style.transform)
      // The y-offset should reflect the pan, not be reset to the default margin
      expect(Math.abs(zoomY - panY)).toBeLessThan(50) // allows for margin recalc on scale change
    }, { timeout: 500 })
    unmount()
  })

  it('normalizes line-based deltaMode for Firefox mouse', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise<void>(r => setTimeout(r, 10))
    const before = document.body.style.transform
    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

    // Simulate Firefox mouse: deltaMode=1 (lines), deltaY=3
    // act() wraps the wheel dispatch so the wheel handler's setState + body-transform
    // effect drain synchronously. Replaces vi.waitFor polling race per ZF0-1361.
    await act(async () => {
      dispatchWheel(3, false, 0, 1) // deltaMode=1 (DOM_DELTA_LINE)
    })
    const after = document.body.style.transform
    // 3 lines * ~40px/line = ~120px of pan, not 3px
    const deltaY = getY(before) - getY(after)
    expect(deltaY).toBeGreaterThan(50)
    unmount()
  })

  it('space+drag does not start pan when event comes from Cortex shadow DOM', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))

    // Create Cortex shadow DOM host
    const cortexHost = document.createElement('div')
    cortexHost.setAttribute('data-cortex-host', '')
    document.body.appendChild(cortexHost)
    const shadow = cortexHost.attachShadow({ mode: 'open' })
    const panelInput = document.createElement('input')
    shadow.appendChild(panelInput)

    // Hold Space
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    // Dispatch pointerdown from inside shadow DOM — should NOT be prevented
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    })
    const prevented = !panelInput.dispatchEvent(event)
    expect(prevented).toBe(false)

    // Release Space
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))

    cortexHost.remove()
    unmount()
  })

  describe('momentum', () => {
    afterEach(() => restoreRAFMock())

    it('wheel-to-pan has momentum after scroll stops', async () => {
      const { unmount } = renderHook(() => useCanvasZoom(true))
      // Structural hold: wait for useEffect (wheel handler) to be installed.
      // useLayoutEffect sets the initial transform synchronously, but the wheel
      // listener is added by a separate useEffect that runs async. 10ms flaked
      // under serial-loop load — 50ms gives the same margin as the cursor tests.
      // Load-bearing — NOT vi.waitFor; structural event-ordering wait.
      await new Promise<void>(r => setTimeout(r, 50))
      installRAFMock()

      const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
      const beforeWheel = getY(document.body.style.transform)

      // Dispatch wheel (applies immediate delta + starts momentum)
      dispatchWheel(100, false)
      const afterWheel = getY(document.body.style.transform)

      // Step a few rAF frames — position should keep changing (momentum)
      stepRAF(3)
      const afterMomentum = getY(document.body.style.transform)

      expect(afterWheel).toBeLessThan(beforeWheel) // immediate pan
      expect(afterMomentum).toBeLessThan(afterWheel) // momentum continued
      unmount()
    })

    it('momentum stops within expected frame count', async () => {
      const { unmount } = renderHook(() => useCanvasZoom(true))
      await new Promise<void>(r => setTimeout(r, 10))
      installRAFMock()

      const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

      dispatchWheel(10, false) // 10px delta
      stepRAF(25) // well beyond expected ~17 frames
      const settled = getY(document.body.style.transform)

      stepRAF(10) // 10 more frames
      const afterSettle = getY(document.body.style.transform)

      expect(afterSettle).toBe(settled) // no more movement
      unmount()
    })

    it('new wheel event cancels existing momentum', async () => {
      const { unmount } = renderHook(() => useCanvasZoom(true))
      await new Promise<void>(r => setTimeout(r, 10))
      installRAFMock()

      const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])

      // Scroll right (negative deltaX = pan right = x increases)
      dispatchWheel(0, false, -100)
      stepRAF(3)
      const midCoast = getX(document.body.style.transform)

      // Now scroll left (positive deltaX = pan left = x decreases)
      dispatchWheel(0, false, 100)
      stepRAF(5)
      const afterReverse = getX(document.body.style.transform)

      expect(afterReverse).toBeLessThan(midCoast) // reversed direction
      unmount()
    })

    it('Cmd+scroll cancels momentum and changes scale', async () => {
      const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
      await new Promise<void>(r => setTimeout(r, 10))
      installRAFMock()

      const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

      dispatchWheel(100, false) // start momentum
      stepRAF(2)

      // Cmd+scroll to zoom — should cancel momentum
      dispatchWheel(100, true)

      // Verify momentum stopped: position shouldn't change on further frames
      const afterZoom = getY(document.body.style.transform)
      stepRAF(5)
      const afterMore = getY(document.body.style.transform)
      expect(afterMore).toBe(afterZoom) // momentum is dead

      // Verify scale changed
      restoreRAFMock()
      await vi.waitFor(() => {
        rerender(() => useCanvasZoom(true))
        expect(result.current.scale).toBeLessThan(0.85)
      }, { timeout: 500 })
      unmount()
    })

    it('disabling canvas mode during momentum stops animation', async () => {
      const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
      await new Promise<void>(r => setTimeout(r, 10))
      installRAFMock()

      dispatchWheel(100, false) // start momentum
      stepRAF(2) // a couple frames of coast

      // Disable canvas mode
      restoreRAFMock()
      rerender(() => useCanvasZoom(false))
      // Styles should be restored, not still animating
      await vi.waitFor(() => {
        expect(document.body.style.transform).toBe('')
      }, { timeout: 500 })
      unmount()
    })
  })
})
