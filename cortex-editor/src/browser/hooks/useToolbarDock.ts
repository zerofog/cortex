import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { cortexStorage } from '../persistence.js'

export const TOOLBAR_THICKNESS = 40
export const TOOLBAR_LENGTH = 176
export const TOOLBAR_MARGIN = 16
const SNAP_DURATION = 300

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'

interface Position { x: number; y: number }

function isValidPosition(v: unknown): v is Position {
  return (
    typeof v === 'object' &&
    v !== null &&
    'x' in v &&
    'y' in v &&
    Number.isFinite((v as Position).x) &&
    Number.isFinite((v as Position).y)
  )
}

const VALID_EDGES = new Set<string>(['top', 'bottom', 'left', 'right'])

function isValidEdge(v: unknown): v is DockEdge {
  return typeof v === 'string' && VALID_EDGES.has(v)
}

export interface UseToolbarDockResult {
  position: Position
  edge: DockEdge
  isHorizontal: boolean
  isSnapping: boolean
  setPosition: (pos: Position) => void
  snap: () => void
}

function isHorizontalEdge(edge: DockEdge): boolean {
  return edge === 'top' || edge === 'bottom'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function computePosition(edge: DockEdge, offset: number): Position {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Floor clamp maxes to prevent negative values at narrow viewports
  const maxX = Math.max(TOOLBAR_MARGIN, vw - TOOLBAR_LENGTH - TOOLBAR_MARGIN)
  const maxY = Math.max(TOOLBAR_MARGIN, vh - TOOLBAR_LENGTH - TOOLBAR_MARGIN)

  if (edge === 'top') {
    return { x: clamp(offset, TOOLBAR_MARGIN, maxX), y: TOOLBAR_MARGIN }
  }
  if (edge === 'bottom') {
    return { x: clamp(offset, TOOLBAR_MARGIN, maxX), y: Math.max(TOOLBAR_MARGIN, vh - TOOLBAR_THICKNESS - TOOLBAR_MARGIN) }
  }
  if (edge === 'left') {
    return { x: TOOLBAR_MARGIN, y: clamp(offset, TOOLBAR_MARGIN, maxY) }
  }
  // right
  return { x: Math.max(TOOLBAR_MARGIN, vw - TOOLBAR_THICKNESS - TOOLBAR_MARGIN), y: clamp(offset, TOOLBAR_MARGIN, maxY) }
}

function getDefaultPosition(): { position: Position; edge: DockEdge } {
  if (typeof window === 'undefined') return { position: { x: 0, y: 0 }, edge: 'bottom' }

  // Attempt to restore from localStorage — null sentinel detects missing/invalid keys
  const storedEdge = cortexStorage.get<DockEdge | null>('toolbar-edge', null, (v): v is DockEdge => isValidEdge(v))
  const storedPos = cortexStorage.get<Position | null>('toolbar-position', null, (v): v is Position => isValidPosition(v))

  // Only restore if both edge and position are valid and present
  // Clamp to current viewport — stored position may be from a different window size
  if (storedEdge !== null && storedPos !== null) {
    return { position: computePosition(storedEdge, storedEdge === 'top' || storedEdge === 'bottom' ? storedPos.x : storedPos.y), edge: storedEdge }
  }

  // Default: bottom edge, horizontally centered
  const edge: DockEdge = 'bottom'
  const offset = (window.innerWidth - TOOLBAR_LENGTH) / 2
  return { position: computePosition(edge, offset), edge }
}

function findNearestEdge(pos: Position, currentEdge: DockEdge): { edge: DockEdge; offset: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const horiz = isHorizontalEdge(currentEdge)
  // Use the current edge orientation to determine toolbar dimensions
  const w = horiz ? TOOLBAR_LENGTH : TOOLBAR_THICKNESS
  const h = horiz ? TOOLBAR_THICKNESS : TOOLBAR_LENGTH
  const cx = pos.x + w / 2
  const cy = pos.y + h / 2

  const distances: Array<{ edge: DockEdge; dist: number; offset: number }> = [
    { edge: 'top', dist: cy, offset: pos.x },
    { edge: 'bottom', dist: vh - cy, offset: pos.x },
    { edge: 'left', dist: cx, offset: pos.y },
    { edge: 'right', dist: vw - cx, offset: pos.y },
  ]

  distances.sort((a, b) => a.dist - b.dist)
  const nearest = distances[0]!
  return { edge: nearest.edge, offset: nearest.offset }
}

export function useToolbarDock(): UseToolbarDockResult {
  // Lazy initializer — avoids recomputing the default position on every render
  const initRef = useRef<{ position: Position; edge: DockEdge } | null>(null)
  if (!initRef.current) initRef.current = getDefaultPosition()
  const [position, setPositionState] = useState<Position>(initRef.current.position)
  const [edge, setEdge] = useState<DockEdge>(initRef.current.edge)
  const [isSnapping, setIsSnapping] = useState(false)
  const positionRef = useRef(initRef.current.position)
  const edgeRef = useRef(initRef.current.edge)
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setPosition = useCallback((pos: Position) => {
    positionRef.current = pos
    setPositionState(pos)
  }, [])

  const snap = useCallback(() => {
    const { edge: newEdge, offset } = findNearestEdge(positionRef.current, edgeRef.current)
    const newPos = computePosition(newEdge, offset)
    positionRef.current = newPos
    edgeRef.current = newEdge
    setPositionState(newPos)
    setEdge(newEdge)
    setIsSnapping(true)
    cortexStorage.set('toolbar-position', newPos)
    cortexStorage.set('toolbar-edge', newEdge)

    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null
      setIsSnapping(false)
    }, SNAP_DURATION)
  }, [])

  useEffect(() => {
    function handleResize() {
      const currentEdge = edgeRef.current
      // Re-center on the current edge — don't preserve old offset, it was for the old viewport size
      const centered = isHorizontalEdge(currentEdge)
        ? (window.innerWidth - TOOLBAR_LENGTH) / 2
        : (window.innerHeight - TOOLBAR_LENGTH) / 2
      const newPos = computePosition(currentEdge, centered)
      positionRef.current = newPos
      setPositionState(newPos)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    }
  }, [])

  return {
    position,
    edge,
    isHorizontal: isHorizontalEdge(edge),
    isSnapping,
    setPosition,
    snap,
  }
}
