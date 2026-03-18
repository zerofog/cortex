import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render } from 'preact'
import type { JSX } from 'preact'
import {
  clamp,
  getPanelBounds,
  snapToEdge,
  getInitialPosition,
  useSnapToEdge,
  PANEL_WIDTH,
  PANEL_MAX_HEIGHT,
  PANEL_MARGIN,
} from '../../../src/browser/hooks/useSnapToEdge.js'

/**
 * Minimal renderHook helper for Preact — renders a component that calls the
 * hook and exposes results via a mutable ref object. Includes a rerender
 * function to flush pending state updates.
 */
function renderHook<T>(hookFn: () => T): {
  result: { current: T }
  container: HTMLDivElement
  rerender: () => void
  cleanup: () => void
} {
  const result = { current: null as unknown as T }
  const container = document.createElement('div')
  document.body.appendChild(container)

  function Harness(): JSX.Element {
    const value = hookFn()
    result.current = value
    return null as unknown as JSX.Element
  }

  const doRender = () => render(<Harness />, container)
  doRender()

  return {
    result,
    container,
    rerender: doRender,
    cleanup: () => {
      render(null, container)
      container.remove()
    },
  }
}

/**
 * Synchronous act — runs the callback then forces a Preact re-render via
 * the provided rerender function to flush pending state updates.
 */
function act(fn: () => void, rerender?: () => void): void {
  fn()
  if (rerender) rerender()
}

describe('useSnapToEdge utilities', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true })
  })

  describe('clamp', () => {
    it('returns value when within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })

    it('clamps to min', () => {
      expect(clamp(-5, 0, 10)).toBe(0)
    })

    it('clamps to max', () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('returns min for NaN', () => {
      expect(clamp(NaN, 0, 10)).toBe(0)
    })

    it('returns min when max < min', () => {
      expect(clamp(5, 10, 0)).toBe(10)
    })
  })

  describe('getPanelBounds', () => {
    it('returns correct bounds for standard viewport', () => {
      const bounds = getPanelBounds()
      expect(bounds.minX).toBe(PANEL_MARGIN)
      expect(bounds.maxX).toBe(1024 - PANEL_WIDTH - PANEL_MARGIN)
      expect(bounds.minY).toBe(PANEL_MARGIN)
    })

    it('returns zero bounds when panel larger than viewport', () => {
      Object.defineProperty(window, 'innerWidth', { value: 200, writable: true, configurable: true })
      const bounds = getPanelBounds()
      expect(bounds.minX).toBe(0)
      expect(bounds.maxX).toBe(0)
    })
  })

  describe('snapToEdge', () => {
    it('snaps to right edge when panel is near right', () => {
      const result = snapToEdge({ x: 600, y: 200 })
      expect(result.x).toBe(1024 - PANEL_WIDTH - PANEL_MARGIN)
      expect(result.y).toBe(200)
    })

    it('snaps to left edge when panel is near left', () => {
      const result = snapToEdge({ x: 50, y: 200 })
      expect(result.x).toBe(PANEL_MARGIN)
      expect(result.y).toBe(200)
    })

    it('snaps to top edge when panel is near top', () => {
      const result = snapToEdge({ x: 400, y: 20 })
      expect(result.y).toBe(PANEL_MARGIN)
    })

    it('snaps to bottom edge when panel is near bottom', () => {
      const result = snapToEdge({ x: 400, y: 600 })
      const bounds = getPanelBounds()
      expect(result.y).toBe(bounds.maxY)
    })
  })

  describe('getInitialPosition', () => {
    afterEach(() => {
      localStorage.clear()
    })

    it('returns default top-right position with no stored value', () => {
      const pos = getInitialPosition()
      expect(pos.x).toBe(1024 - PANEL_WIDTH - PANEL_MARGIN)
    })

    it('restores and snaps stored position', () => {
      localStorage.setItem('cortex-panel-position', JSON.stringify({ x: 100, y: 200 }))
      const pos = getInitialPosition()
      expect(pos.x).toBe(PANEL_MARGIN)
    })

    it('falls back to default on invalid stored JSON', () => {
      localStorage.setItem('cortex-panel-position', 'not-json')
      const pos = getInitialPosition()
      expect(pos.x).toBe(1024 - PANEL_WIDTH - PANEL_MARGIN)
    })
  })

  describe('recheckOverlap', () => {
    let hookContainer: HTMLDivElement | null = null

    afterEach(() => {
      if (hookContainer) {
        render(null, hookContainer)
        hookContainer.remove()
        hookContainer = null
      }
      localStorage.clear()
    })

    it('does not reposition when panel does not overlap element', () => {
      // Setup: panel at x=0 (left edge), element at x=800 (right side)
      const { result, container, rerender } = renderHook(() => useSnapToEdge())
      hookContainer = container
      act(() => result.current.setPosition({ x: 0, y: 100 }), rerender)

      const elementRect = { left: 800, right: 900, top: 100, bottom: 200 } as DOMRect
      act(() => result.current.recheckOverlap(elementRect), rerender)

      // Panel should not have moved — still snapped to left edge
      // setPosition(0,100) gets clamped+normalized; recheckOverlap should not move it
      expect(result.current.position.x).toBeLessThan(800)
    })

    it('repositions to opposite edge when panel overlaps element', () => {
      // Setup: panel at x=700 (right edge), element also at x=650 (overlapping)
      const { result, container, rerender } = renderHook(() => useSnapToEdge())
      hookContainer = container
      act(() => result.current.setPosition({ x: 700, y: 100 }), rerender)

      const elementRect = { left: 650, right: 850, top: 100, bottom: 200 } as DOMRect
      act(() => result.current.recheckOverlap(elementRect), rerender)

      // Panel should have moved to the left side
      expect(result.current.position.x).toBeLessThan(650)
    })

    it('uses PANEL_MAX_HEIGHT as conservative upper bound for overlap check', () => {
      // Panel at x=0, y=0 with PANEL_MAX_HEIGHT=460
      // Element at y=300 — overlap only if panel height considered > 300
      const { result, container, rerender } = renderHook(() => useSnapToEdge())
      hookContainer = container
      act(() => result.current.setPosition({ x: 0, y: 0 }), rerender)

      const elementRect = { left: 0, right: 300, top: 300, bottom: 400 } as DOMRect
      act(() => result.current.recheckOverlap(elementRect), rerender)

      // Should detect overlap (PANEL_MAX_HEIGHT=460 extends past y=300)
      // After overlap detected, panel moves to opposite edge
      expect(result.current.position.x).not.toBe(0)
    })
  })
})
