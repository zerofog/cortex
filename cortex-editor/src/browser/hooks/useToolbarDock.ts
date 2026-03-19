import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

export const TOOLBAR_THICKNESS = 40
export const TOOLBAR_LENGTH = 240
export const TOOLBAR_MARGIN = 16
const SNAP_DURATION = 300
const STORAGE_KEY = 'cortex-toolbar-position'

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'

interface Position { x: number; y: number }

interface StoredDock { edge: DockEdge; offset: number }

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

function loadStored(): StoredDock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const VALID_EDGES = new Set<string>(['top', 'bottom', 'left', 'right'])
    if (parsed && VALID_EDGES.has(parsed.edge) && typeof parsed.offset === 'number') {
      return parsed as StoredDock
    }
  } catch { /* corrupt data */ }
  return null
}

function saveStored(dock: StoredDock): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dock))
  } catch { /* storage full */ }
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
    return { x: clamp(offset, TOOLBAR_MARGIN, maxX), y: vh - TOOLBAR_THICKNESS - TOOLBAR_MARGIN }
  }
  if (edge === 'left') {
    return { x: TOOLBAR_MARGIN, y: clamp(offset, TOOLBAR_MARGIN, maxY) }
  }
  // right
  return { x: vw - TOOLBAR_THICKNESS - TOOLBAR_MARGIN, y: clamp(offset, TOOLBAR_MARGIN, maxY) }
}

function getDefaultPosition(): { position: Position; edge: DockEdge } {
  if (typeof window === 'undefined') return { position: { x: 0, y: 0 }, edge: 'bottom' }

  const stored = loadStored()
  if (stored) {
    return { position: computePosition(stored.edge, stored.offset), edge: stored.edge }
  }
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
  const init = getDefaultPosition()
  const [position, setPositionState] = useState<Position>(init.position)
  const [edge, setEdge] = useState<DockEdge>(init.edge)
  const [isSnapping, setIsSnapping] = useState(false)
  const positionRef = useRef(init.position)
  const edgeRef = useRef(init.edge)
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

    saveStored({ edge: newEdge, offset })

    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null
      setIsSnapping(false)
    }, SNAP_DURATION)
  }, [])

  useEffect(() => {
    function handleResize() {
      const currentEdge = edgeRef.current
      const currentPos = positionRef.current
      const offset = isHorizontalEdge(currentEdge) ? currentPos.x : currentPos.y
      const newPos = computePosition(currentEdge, offset)
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
