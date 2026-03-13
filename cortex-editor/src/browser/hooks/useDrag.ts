import { useState, useRef, useCallback } from 'preact/hooks'

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

interface Position {
  x: number
  y: number
}

export interface UseDragOptions {
  onDrag: (x: number, y: number) => void
  onDragEnd?: (x: number, y: number) => void
}

export interface UseDragResult {
  isDragging: boolean
  handlePointerDown: (e: PointerEvent) => void
  handlePointerMove: (e: PointerEvent) => void
  handlePointerUp: (e: PointerEvent) => void
  handlePointerCancel: (e: PointerEvent) => void
}

export function useDrag({ onDrag, onDragEnd }: UseDragOptions): UseDragResult {
  const [isDragging, setIsDragging] = useState(false)
  const draggingRef = useRef(false)
  const offsetRef = useRef<Position>({ x: 0, y: 0 })
  const lastPosRef = useRef<Position>({ x: 0, y: 0 })

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest(INTERACTIVE_SELECTOR)) return

    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    offsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    draggingRef.current = true
    setIsDragging(true)
    try { el.setPointerCapture(e.pointerId) } catch {}
  }, [])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    const x = e.clientX - offsetRef.current.x
    const y = e.clientY - offsetRef.current.y
    lastPosRef.current = { x, y }
    onDrag(x, y)
  }, [onDrag])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    onDragEnd?.(lastPosRef.current.x, lastPosRef.current.y)
  }, [onDragEnd])

  const handlePointerCancel = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }, [])

  return { isDragging, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel }
}
