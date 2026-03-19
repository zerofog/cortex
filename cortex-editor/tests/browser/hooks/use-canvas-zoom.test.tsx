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
    document.documentElement.style.backgroundColor = ''
  })

  it('does not apply transform when disabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(false))
    expect(document.body.style.transform).toBe('')
    unmount()
  })

  it('applies transform when enabled', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    expect(document.body.style.transformOrigin).toBe('0 0')
    expect(result.current.scale).toBeGreaterThan(0.5)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)
    unmount()
  })

  it('calculates default scale as (vw - 320) / vw', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    const expected = (1440 - 320) / 1440 // ≈ 0.778
    expect(result.current.scale).toBeCloseTo(expected, 2)
    unmount()
  })

  it('sets background on html element when enabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.documentElement.style.backgroundColor).toBe('#f5f5f5')
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
    expect(result.current.scale).toBeGreaterThanOrEqual(0.5)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)
    unmount()
  })

  // Helper: happy-dom's WheelEvent may not propagate metaKey from init,
  // so we set it explicitly via Object.defineProperty
  function dispatchWheel(deltaY: number, metaKey: boolean): void {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
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
})
