import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.0
const ZOOM_STEP = 0.05

export interface UseCanvasZoomResult {
  scale: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function useCanvasZoom(enabled: boolean): UseCanvasZoomResult {
  const [scale, setScale] = useState(() =>
    typeof window !== 'undefined'
      ? clamp((window.innerWidth - 320) / window.innerWidth, MIN_ZOOM, MAX_ZOOM)
      : 0.8
  )
  const spaceHeldRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null)

  // Apply/remove CSS transform on body.
  // useLayoutEffect fires synchronously after DOM mutations, before paint —
  // avoids flash of un-scaled content when entering canvas mode.
  useLayoutEffect(() => {
    if (enabled) {
      document.body.style.transform = `scale(${scale})`
      document.body.style.transformOrigin = '0 0'
      document.documentElement.style.backgroundColor = '#f5f5f5'
    } else {
      document.body.style.transform = ''
      document.body.style.transformOrigin = ''
      document.documentElement.style.backgroundColor = ''
    }
    return () => {
      document.body.style.transform = ''
      document.body.style.transformOrigin = ''
      document.documentElement.style.backgroundColor = ''
    }
  }, [enabled, scale])

  // Cmd+scroll to adjust zoom
  useEffect(() => {
    if (!enabled) return
    function handleWheel(e: WheelEvent): void {
      if (!e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setScale(s => clamp(s + delta, MIN_ZOOM, MAX_ZOOM))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [enabled])

  // Space+drag to pan
  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space' && !spaceHeldRef.current && !isInputFocused()) {
        spaceHeldRef.current = true
        e.preventDefault()
      }
    }
    function handleKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        panStartRef.current = null
      }
    }
    function handlePointerDown(e: PointerEvent): void {
      if (spaceHeldRef.current) {
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        }
        e.preventDefault()
      }
    }
    function handlePointerMove(e: PointerEvent): void {
      if (!panStartRef.current) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      window.scrollTo(panStartRef.current.scrollX - dx, panStartRef.current.scrollY - dy)
    }
    function handlePointerUp(): void {
      panStartRef.current = null
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      spaceHeldRef.current = false
      panStartRef.current = null
    }
  }, [enabled])

  return { scale }
}

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable
}
