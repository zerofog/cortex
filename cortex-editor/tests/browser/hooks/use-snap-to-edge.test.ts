import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  clamp,
  getPanelBounds,
  snapToEdge,
  getInitialPosition,
  PANEL_WIDTH,
  PANEL_MAX_HEIGHT,
  PANEL_MARGIN,
} from '../../../src/browser/hooks/useSnapToEdge.js'

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
})
