import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks'
import { isOwnUI } from '../selection.js'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.0
const ZOOM_STEP = 0.05
const CANVAS_MIN_MARGIN = 48
const LINE_HEIGHT = 40 // px — CSS standard approximation for deltaMode=1

function normalizeDelta(e: WheelEvent): { dx: number; dy: number } {
  const mult = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? window.innerHeight : 1
  return { dx: e.deltaX * mult, dy: e.deltaY * mult }
}

export interface UseCanvasZoomResult {
  scale: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function useCanvasZoom(enabled: boolean): UseCanvasZoomResult {
  const [scale, setScale] = useState(() => 0.85)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const spaceHeldRef = useRef(false)
  const panRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  // Save original body/html styles on the false→true transition of `enabled`
  const wasEnabledRef = useRef(false)
  const savedTransformRef = useRef('')
  const savedOriginRef = useRef('')
  const savedBoxShadowRef = useRef('')
  const savedBodyBgRef = useRef('')
  const savedHtmlBgRef = useRef('')
  const savedOverflowRef = useRef('')

  function restoreSavedStyles(): void {
    if (wasEnabledRef.current) {
      document.body.style.transform = savedTransformRef.current
      document.body.style.transformOrigin = savedOriginRef.current
      document.body.style.boxShadow = savedBoxShadowRef.current
      document.body.style.backgroundColor = savedBodyBgRef.current
      document.documentElement.style.backgroundColor = savedHtmlBgRef.current
      document.documentElement.style.overflow = savedOverflowRef.current
      wasEnabledRef.current = false
    }
  }

  const cachedBodyH = useRef(0)

  function updateCachedBodyH(s: number): void {
    cachedBodyH.current = document.body.scrollHeight * s
  }

  function applyStaticStyles(): void {
    document.body.style.transformOrigin = '50% 0'
    document.body.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.06), 0 2px 16px rgba(0,0,0,0.1)'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.backgroundColor = '#e5e5e5'
    document.body.style.backgroundColor = '#ffffff'
  }

  function applyTransformPosition(s: number): void {
    const { x, y } = panRef.current
    const vpH = window.innerHeight
    const topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2)
    document.body.style.transform = `translate(${x}px, ${y + topMargin}px) scale(${s})`
  }

  // Save/restore styles — only depends on [enabled]
  useLayoutEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      savedTransformRef.current = document.body.style.transform
      savedOriginRef.current = document.body.style.transformOrigin
      savedBoxShadowRef.current = document.body.style.boxShadow
      savedBodyBgRef.current = document.body.style.backgroundColor
      savedHtmlBgRef.current = document.documentElement.style.backgroundColor
      savedOverflowRef.current = document.documentElement.style.overflow
      wasEnabledRef.current = true
      panRef.current = { x: 0, y: 0 }
      applyStaticStyles()
    } else if (!enabled) {
      restoreSavedStyles()
    }
    return () => { if (!enabled) return; restoreSavedStyles() }
  }, [enabled])

  // Apply transform — depends on [enabled, scale]
  useLayoutEffect(() => {
    if (enabled) {
      updateCachedBodyH(scale)
      applyTransformPosition(scale)
    }
  }, [enabled, scale])

  // Recalculate margins on viewport resize
  useEffect(() => {
    if (!enabled) return
    function handleResize() { updateCachedBodyH(scaleRef.current); applyTransformPosition(scaleRef.current) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [enabled])

  // Cmd+scroll to zoom, regular scroll to pan
  useEffect(() => {
    if (!enabled) return
    function handleWheel(e: WheelEvent): void {
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        setScale(s => clamp(s + delta, MIN_ZOOM, MAX_ZOOM))
      } else {
        const { dx, dy } = normalizeDelta(e)
        panRef.current = {
          x: panRef.current.x - dx,
          y: panRef.current.y - dy,
        }
        applyTransformPosition(scaleRef.current)
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [enabled])

  // Space+drag to pan via transform translate
  useEffect(() => {
    if (!enabled) return
    let savedCursor = ''

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space' && !spaceHeldRef.current && !isInputFocused()) {
        spaceHeldRef.current = true
        savedCursor = document.body.style.cursor
        document.body.style.cursor = 'grab'
        e.preventDefault()
      }
    }
    function handleKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        panStartRef.current = null
        document.body.style.cursor = savedCursor
      }
    }
    function handlePointerDown(e: PointerEvent): void {
      if (spaceHeldRef.current) {
        // Don't intercept events from Cortex's own Shadow DOM — let panel/toolbar work
        if (isOwnUI(e)) return
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        document.body.style.cursor = 'grabbing'
        e.preventDefault()
      }
    }
    function handlePointerMove(e: PointerEvent): void {
      if (!panStartRef.current) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      panRef.current = {
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      }
      applyTransformPosition(scaleRef.current)
    }
    function handlePointerUp(): void {
      if (panStartRef.current && spaceHeldRef.current) {
        document.body.style.cursor = 'grab'
      }
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
      document.body.style.cursor = savedCursor
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
