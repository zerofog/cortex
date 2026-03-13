import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

export const PANEL_WIDTH = 300
export const PANEL_MAX_HEIGHT = 460
export const PANEL_MARGIN = 12
const STORAGE_KEY = 'cortex-panel-position'
const SNAP_DURATION = 350

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
  const centerX = position.x + PANEL_WIDTH / 2
  const centerY = position.y + PANEL_MAX_HEIGHT / 2
  const vw = window.innerWidth
  const vh = window.innerHeight

  const distances = {
    top: centerY,
    bottom: vh - centerY,
    left: centerX,
    right: vw - centerX,
  }

  let nearest: 'top' | 'bottom' | 'left' | 'right' = 'right'
  let min = Infinity
  for (const [edge, dist] of Object.entries(distances) as ['top' | 'bottom' | 'left' | 'right', number][]) {
    if (dist < min) {
      min = dist
      nearest = edge
    }
  }

  const freeX = clamp(position.x, minX, maxX)
  const freeY = clamp(position.y, minY, maxY)

  switch (nearest) {
    case 'top':    return { x: freeX, y: minY }
    case 'bottom': return { x: freeX, y: maxY }
    case 'left':   return { x: minX, y: freeY }
    case 'right':  return { x: maxX, y: freeY }
  }
}

function parseStoredPosition(raw: string): Position | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as { x?: unknown; y?: unknown }
    if (typeof candidate.x !== 'number' || !Number.isFinite(candidate.x)) return null
    if (typeof candidate.y !== 'number' || !Number.isFinite(candidate.y)) return null
    return { x: candidate.x, y: candidate.y }
  } catch {
    return null
  }
}

export function getInitialPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseStoredPosition(stored)
      if (parsed) return snapToEdge(parsed)
    }
  } catch {}

  return snapToEdge({
    x: window.innerWidth - PANEL_WIDTH - PANEL_MARGIN,
    y: PANEL_MARGIN,
  })
}

export interface UseSnapToEdgeResult {
  position: Position
  isSnapping: boolean
  setPosition: (pos: Position) => void
  snap: () => void
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

    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null
      setIsSnapping(false)
    }, SNAP_DURATION)

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped)) } catch {}
  }, [])

  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    function handleResize() {
      setPositionState(prev => {
        const next = snapToEdge(prev)
        positionRef.current = next
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
        }, 200)
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    }
  }, [])

  return { position, isSnapping, setPosition, snap }
}
