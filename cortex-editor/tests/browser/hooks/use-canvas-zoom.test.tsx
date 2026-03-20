import { describe, it, expect, beforeEach } from 'vitest'
import { render } from 'preact'
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
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.style.transform).toBe('')
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

  // Helper: happy-dom's WheelEvent may not propagate metaKey from init,
  // so we set it explicitly via Object.defineProperty
  function dispatchWheel(deltaY: number, metaKey: boolean, deltaX = 0): void {
    const event = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'metaKey', { value: metaKey })
    window.dispatchEvent(event)
  }

  it('Cmd+scroll down decreases scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    const initialScale = result.current.scale
    dispatchWheel(100, true)
    await new Promise(r => setTimeout(r, 10))
    rerender(() => useCanvasZoom(true))
    expect(result.current.scale).toBeLessThan(initialScale)
    unmount()
  })

  it('Cmd+scroll up increases scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    dispatchWheel(100, true) // zoom out first
    await new Promise(r => setTimeout(r, 10))
    rerender(() => useCanvasZoom(true))
    const zoomedOut = result.current.scale
    dispatchWheel(-100, true) // zoom back in
    await new Promise(r => setTimeout(r, 10))
    rerender(() => useCanvasZoom(true))
    expect(result.current.scale).toBeGreaterThan(zoomedOut)
    unmount()
  })

  it('regular scroll without Cmd does not change scale', async () => {
    const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    const initialScale = result.current.scale
    dispatchWheel(100, false)
    await new Promise(r => setTimeout(r, 10))
    rerender(() => useCanvasZoom(true))
    expect(result.current.scale).toBe(initialScale)
    unmount()
  })

  it('saves and restores original body.style.transform on disable', async () => {
    // Set a pre-existing transform (e.g. GSAP ScrollSmoother)
    document.body.style.transform = 'translateY(-100px)'
    document.body.style.transformOrigin = 'center center'

    const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 0))
    // Canvas zoom should override
    expect(document.body.style.transform).toContain('scale(')

    // Disable — should restore originals
    rerender(() => useCanvasZoom(false))
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.style.transform).toBe('translateY(-100px)')
    expect(document.body.style.transformOrigin).toBe('center center')

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
    await new Promise(r => setTimeout(r, 10))
    const before = document.body.style.transform
    dispatchWheel(100, false)
    await new Promise(r => setTimeout(r, 10))
    const after = document.body.style.transform
    expect(after).not.toBe(before)
    // The y-offset in translate should have decreased (scrolled down → pan up)
    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
    expect(getY(after)).toBeLessThan(getY(before))
    unmount()
  })

  it('regular scroll pans horizontally', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    const before = document.body.style.transform
    dispatchWheel(0, false, 100)
    await new Promise(r => setTimeout(r, 10))
    const after = document.body.style.transform
    expect(after).not.toBe(before)
    // The x-offset in translate should have decreased (scrolled right → pan left)
    const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])
    expect(getX(after)).toBeLessThan(getX(before))
    unmount()
  })

  it('Space hold shows grab cursor', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(document.body.style.cursor).toBe('grab')
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    unmount()
  })

  it('Space+drag shows grabbing cursor', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
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
    await new Promise(r => setTimeout(r, 10))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(document.body.style.cursor).toBe('grab')
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(document.body.style.cursor).toBe('crosshair')
    unmount()
  })

  it('Space+drag pointer up returns to grab (not grabbing)', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
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
    await new Promise(r => setTimeout(r, 10))

    // Pan the canvas
    dispatchWheel(200, false)
    await new Promise(r => setTimeout(r, 10))
    const panTransform = document.body.style.transform
    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
    const panY = getY(panTransform)

    // Zoom — should preserve pan offset, not reset it
    dispatchWheel(100, true)
    await new Promise(r => setTimeout(r, 10))
    rerender(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    const zoomTransform = document.body.style.transform
    const zoomY = getY(zoomTransform)

    // The y-offset should reflect the pan, not be reset to the default margin
    expect(Math.abs(zoomY - panY)).toBeLessThan(50) // allows for margin recalc on scale change
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
})
