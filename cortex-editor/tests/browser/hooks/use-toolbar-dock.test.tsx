import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import type { JSX } from 'preact'
import { useToolbarDock } from '../../../src/browser/hooks/useToolbarDock.js'

// Minimal renderHook for Preact (same pattern used in use-snap-to-edge tests)
function renderHook<T>(hookFn: () => T): {
  result: { current: T }
  rerender: () => void
  unmount: () => void
} {
  const result = { current: null as unknown as T }
  const container = document.createElement('div')
  document.body.appendChild(container)

  function Wrapper(): JSX.Element {
    result.current = hookFn()
    return null as unknown as JSX.Element
  }

  const doRender = () => render(<Wrapper />, container)
  doRender()

  return {
    result,
    rerender: doRender,
    unmount: () => {
      render(null, container)
      container.remove()
    },
  }
}

// Flush Preact's microtask-based state updates then re-render to surface them.
const flush = (rerender?: () => void) =>
  new Promise<void>(r => setTimeout(r, 0)).then(() => rerender?.())

describe('useToolbarDock', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to bottom-center', () => {
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.edge).toBe('bottom')
    expect(result.current.position.x).toBe(632) // (1440 - 176) / 2
    expect(result.current.position.y).toBe(844) // 900 - 40 - 16
  })

  it('isHorizontal is true for top/bottom edges', () => {
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.isHorizontal).toBe(true)
  })

  it('snap finds nearest edge from position', async () => {
    const { result, rerender } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 600, y: 30 })
    await flush(rerender)
    result.current.snap()
    await flush(rerender)
    expect(result.current.edge).toBe('top')
    expect(result.current.position.y).toBe(16)
  })

  it('snap to left edge changes to vertical', async () => {
    const { result, rerender } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 30, y: 400 })
    await flush(rerender)
    result.current.snap()
    await flush(rerender)
    expect(result.current.edge).toBe('left')
    expect(result.current.isHorizontal).toBe(false)
  })

  it('snap to right edge changes to vertical', async () => {
    const { result, rerender } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 1400, y: 400 })
    await flush(rerender)
    result.current.snap()
    await flush(rerender)
    expect(result.current.edge).toBe('right')
    expect(result.current.isHorizontal).toBe(false)
  })

  it('defaults to bottom edge on fresh mount', () => {
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.edge).toBe('bottom')
    expect(result.current.isHorizontal).toBe(true)
  })

  describe('localStorage persistence', () => {
    beforeEach(() => localStorage.clear())

    it('restores toolbar position from localStorage on init', async () => {
      vi.resetModules()
      const PORT = location.port || '0'
      localStorage.setItem(`cortex:${PORT}:toolbar-position`, JSON.stringify({ x: 300, y: 16 }))
      localStorage.setItem(`cortex:${PORT}:toolbar-edge`, JSON.stringify('top'))
      const { useToolbarDock: freshUseToolbarDock } = await import('../../../src/browser/hooks/useToolbarDock.js')
      const { result } = renderHook(() => freshUseToolbarDock())
      expect(result.current.edge).toBe('top')
      expect(result.current.position.x).toBe(300)
      expect(result.current.position.y).toBe(16)
    })

    it('falls back to default when localStorage is empty', async () => {
      vi.resetModules()
      const { useToolbarDock: freshUseToolbarDock } = await import('../../../src/browser/hooks/useToolbarDock.js')
      const { result } = renderHook(() => freshUseToolbarDock())
      expect(result.current.edge).toBe('bottom')
    })

    it('falls back to default when stored value is invalid', async () => {
      vi.resetModules()
      const PORT = location.port || '0'
      localStorage.setItem(`cortex:${PORT}:toolbar-position`, JSON.stringify({ x: 'bad', y: 16 }))
      localStorage.setItem(`cortex:${PORT}:toolbar-edge`, JSON.stringify('top'))
      const { useToolbarDock: freshUseToolbarDock } = await import('../../../src/browser/hooks/useToolbarDock.js')
      const { result } = renderHook(() => freshUseToolbarDock())
      // Invalid position falls back to default edge
      expect(result.current.edge).toBe('bottom')
    })
  })

  it('isSnapping is true during snap animation', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 600, y: 30 })
    result.current.snap()
    rerender()
    expect(result.current.isSnapping).toBe(true)
    vi.advanceTimersByTime(300)
    // Preact schedules updates via Promise.then — need to flush microtasks
    await Promise.resolve()
    rerender()
    expect(result.current.isSnapping).toBe(false)
    vi.useRealTimers()
  })

  it('clamps position within viewport on resize', async () => {
    const { result, rerender } = renderHook(() => useToolbarDock())
    // Flush effects so the resize listener is attached before dispatching the event
    await flush(rerender)
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await flush(rerender)
    expect(result.current.position.x).toBeLessThanOrEqual(400 - 16)
  })

  it('preserves offset along edge on snap', async () => {
    const { result, rerender } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 1000, y: 860 })
    await flush(rerender)
    result.current.snap()
    await flush(rerender)
    expect(result.current.edge).toBe('bottom')
    expect(result.current.position.x).toBe(1000)
  })
})
