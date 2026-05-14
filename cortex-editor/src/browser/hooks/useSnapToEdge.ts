import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { cortexStorage, isValidPosition } from '../persistence.js'

export const PANEL_WIDTH = 320
export const PANEL_MAX_HEIGHT = 460
export const PANEL_MARGIN = 12
const SNAP_DURATION = 350
/** Distance from viewport edge at which the panel magnetically snaps. */
const SNAP_THRESHOLD = 80

interface Position { x: number; y: number }

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

export function getPanelBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const availableX = window.innerWidth - PANEL_WIDTH
  const availableY = window.innerHeight - PANEL_MAX_HEIGHT
  const minX = availableX <= 0 ? 0 : Math.min(PANEL_MARGIN, availableX)
  const minY = availableY <= 0 ? 0 : Math.min(PANEL_MARGIN, availableY)
  const maxX = availableX <= 0 ? 0 : Math.max(minX, availableX - PANEL_MARGIN)
  const maxY = availableY <= 0 ? 0 : Math.max(minY, availableY - PANEL_MARGIN)
  return { minX, maxX, minY, maxY }
}

export function normalizePosition(position: Position): Position {
  const { minX, maxX, minY, maxY } = getPanelBounds()
  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  }
}

export function snapToEdge(position: Position): Position {
  const { minX, maxX, minY, maxY } = getPanelBounds()
  const freeY = clamp(position.y, minY, maxY)

  // Magnetic snap: only snap X when near left or right edge.
  // Otherwise the panel stays wherever the user dropped it.
  const distLeft = position.x - minX
  const distRight = maxX - position.x

  let x: number
  if (distLeft <= SNAP_THRESHOLD) {
    x = minX
  } else if (distRight <= SNAP_THRESHOLD) {
    x = maxX
  } else {
    x = clamp(position.x, minX, maxX)
  }

  return { x, y: freeY }
}

/** The panel's home position — top-right corner, viewport-clamped. Storage-free,
 *  so `reset()` can return to a clean default regardless of any persisted drag. */
export function getDefaultPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  return normalizePosition({
    x: Math.max(0, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN),
    y: PANEL_MARGIN,
  })
}

export function getInitialPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 }

  // Clamp to current viewport — stored position may be from a wider/taller window.
  // Note: reset() (deselect → home) is session-local and does NOT write to
  // storage, so after a drag + deselect + reload the panel restores the last
  // *dragged* position, not the reset default. Only snap() persists.
  return normalizePosition(cortexStorage.get('panel-position', getDefaultPosition(), isValidPosition))
}

export interface UseSnapToEdgeResult {
  position: Position
  isSnapping: boolean
  setPosition: (pos: Position) => void
  snap: () => void
  /** Return the panel to its home position. Called on deselect so each new
   *  selection opens the panel at its default spot, not the last drag target.
   *  In-memory only — the persisted cross-reload position is left untouched. */
  reset: () => void
  recheckOverlap: (elementRect: DOMRect) => void
}

export function useSnapToEdge(): UseSnapToEdgeResult {
  const [position, setPositionState] = useState<Position>(getInitialPosition)
  const [isSnapping, setIsSnapping] = useState(false)
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const positionRef = useRef(position)

  const setPosition = useCallback((pos: Position) => {
    const clamped = normalizePosition(pos)
    positionRef.current = clamped
    setPositionState(clamped)
  }, [])

  const snap = useCallback(() => {
    const snapped = snapToEdge(positionRef.current)
    positionRef.current = snapped
    setPositionState(snapped)
    setIsSnapping(true)
    cortexStorage.set('panel-position', snapped)

    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null
      setIsSnapping(false)
    }, SNAP_DURATION)
  }, [])

  useEffect(() => {
    function handleResize() {
      // Snap to nearest horizontal edge unconditionally on resize — no threshold.
      // Without this, expanding the viewport leaves the panel stranded in the middle
      // because it's too far from the new edge to trigger the 80px snap threshold.
      setPositionState(prev => {
        const { minX, maxX, minY, maxY } = getPanelBounds()
        const y = clamp(prev.y, minY, maxY)
        const x = Math.abs(prev.x - minX) <= Math.abs(prev.x - maxX) ? minX : maxX
        const next = { x, y }
        positionRef.current = next
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const reset = useCallback(() => {
    const home = getDefaultPosition()
    positionRef.current = home
    setPositionState(home)
  }, [])

  const recheckOverlap = useCallback((elementRect: DOMRect): void => {
    // Read from positionRef (not state) to avoid stale closure
    const pos = positionRef.current
    const panelRight = pos.x + PANEL_WIDTH
    const panelBottom = pos.y + PANEL_MAX_HEIGHT // conservative upper bound

    const overlaps = !(
      panelRight < elementRect.left ||
      pos.x > elementRect.right ||
      panelBottom < elementRect.top ||
      pos.y > elementRect.bottom
    )

    if (overlaps) {
      // Move to opposite horizontal edge, then snap to clean position
      const viewportCenter = window.innerWidth / 2
      const targetX = pos.x < viewportCenter
        ? window.innerWidth - PANEL_WIDTH - PANEL_MARGIN
        : PANEL_MARGIN
      positionRef.current = { x: targetX, y: pos.y }
      snap()
    }
  }, [snap])

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    }
  }, [])

  return { position, isSnapping, setPosition, snap, reset, recheckOverlap }
}
