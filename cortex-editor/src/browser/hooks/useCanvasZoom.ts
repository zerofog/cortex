import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks'
import { isOwnUI } from '../selection.js'
import { emitTransformUpdate } from '../transform-bus.js'
import { isInputFocused } from '../focus-utils.js'

const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.0
const ZOOM_STEP = 0.05
const CANVAS_MIN_MARGIN = 48
const FRICTION = 0.75
const STOP_THRESHOLD = 0.1
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

// ─── Exported pure functions (used by the hook; tested in isolation) ─────────

export interface MomentumState {
  pan: { x: number; y: number }
  velocity: { x: number; y: number }
}

export interface PanBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface MomentumStepResult {
  state: MomentumState
  shouldStop: boolean
}

/** Apply one momentum coast step.
 * @param state  Current pan + velocity
 * @param dt     Time delta normalized to 60fps basis (raw_ms / 16.667), capped at 50ms
 * @param bounds Pan clamp limits
 */
export function stepMomentum(
  state: MomentumState,
  dt: number,
  bounds: PanBounds,
): MomentumStepResult {
  const cappedDt = Math.min(dt, 50 / 16.667)
  const friction = Math.pow(FRICTION, cappedDt)
  let vx = state.velocity.x * friction
  let vy = state.velocity.y * friction
  let px = state.pan.x + vx
  let py = state.pan.y + vy
  const clampedPx = clamp(px, bounds.minX, bounds.maxX)
  const clampedPy = clamp(py, bounds.minY, bounds.maxY)
  if (clampedPx !== px) vx = 0
  if (clampedPy !== py) vy = 0
  px = clampedPx
  py = clampedPy
  return {
    state: { pan: { x: px, y: py }, velocity: { x: vx, y: vy } },
    shouldStop: Math.abs(vx) + Math.abs(vy) < STOP_THRESHOLD,
  }
}

export interface PanDelta {
  dx: number
  dy: number
}

export interface PanStepResult {
  pan: { x: number; y: number }
  clampedX: boolean
  clampedY: boolean
}

/** Compute the result of applying a wheel delta to the current pan position.
 * @param pan    Current pan offset
 * @param delta  Wheel delta (positive dx = scroll right = pan moves left)
 * @param bounds Pan clamp limits
 */
export function computePanStep(
  pan: { x: number; y: number },
  delta: PanDelta,
  bounds: PanBounds,
): PanStepResult {
  const targetX = pan.x - delta.dx
  const targetY = pan.y - delta.dy
  const clampedX = clamp(targetX, bounds.minX, bounds.maxX)
  const clampedY = clamp(targetY, bounds.minY, bounds.maxY)
  return {
    pan: { x: clampedX, y: clampedY },
    clampedX: clampedX !== targetX,
    clampedY: clampedY !== targetY,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function useCanvasZoom(enabled: boolean): UseCanvasZoomResult {
  const [scale, setScale] = useState(() => 0.85)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const spaceHeldRef = useRef(false)
  const panRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const vpRef = useRef({ w: window.innerWidth, h: window.innerHeight })
  const momentumRafRef = useRef(0)

  function cancelMomentum(): void {
    if (momentumRafRef.current) {
      cancelAnimationFrame(momentumRafRef.current)
      momentumRafRef.current = 0
    }
  }

  function clampPan(): { clampedX: boolean; clampedY: boolean } {
    const vpW = vpRef.current.w
    const vpH = vpRef.current.h
    const topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2)
    // X: symmetric — content edge can reach the opposite viewport edge
    const maxX = (cachedBodyW.current + vpW) / 2
    const prevX = panRef.current.x
    const prevY = panRef.current.y
    panRef.current.x = clamp(panRef.current.x, -maxX, maxX)
    // Y: asymmetric — up limited by content top reaching viewport bottom,
    //    down limited by content bottom reaching viewport top
    panRef.current.y = clamp(panRef.current.y, -(cachedBodyH.current + topMargin), vpH - topMargin)
    return { clampedX: panRef.current.x !== prevX, clampedY: panRef.current.y !== prevY }
  }

  // Save original body/html styles on the false→true transition of `enabled`
  const wasEnabledRef = useRef(false)
  const savedTransformRef = useRef('')
  const savedOriginRef = useRef('')
  const savedBoxShadowRef = useRef('')
  const savedHtmlBgRef = useRef('')
  const savedOverflowRef = useRef('')

  function restoreSavedStyles(): void {
    if (wasEnabledRef.current) {
      document.body.style.transform = savedTransformRef.current
      document.body.style.transformOrigin = savedOriginRef.current
      document.body.style.boxShadow = savedBoxShadowRef.current
      document.documentElement.style.backgroundColor = savedHtmlBgRef.current
      document.documentElement.style.overflow = savedOverflowRef.current
      wasEnabledRef.current = false
    }
  }

  const cachedBodyH = useRef(0)
  const cachedBodyW = useRef(0)

  function updateCachedDimensions(s: number): void {
    cachedBodyH.current = document.body.scrollHeight * s
    cachedBodyW.current = document.body.scrollWidth * s
  }

  function getArtboardColor(): string {
    // Check body first; if transparent (common when bg is on :root), fall back to documentElement
    let bg = getComputedStyle(document.body).backgroundColor
    if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
      bg = getComputedStyle(document.documentElement).backgroundColor
    }
    const match = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (!match) return '#e5e5e5'
    const luminance = (0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])) / 255
    return luminance > 0.5 ? '#e5e5e5' : '#2a2a2a'
  }

  function applyStaticStyles(): void {
    document.body.style.transformOrigin = '50% 0'
    document.body.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.06), 0 2px 16px rgba(0,0,0,0.1)'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.backgroundColor = getArtboardColor()
  }

  function applyTransformPosition(s: number): void {
    const { x, y } = panRef.current
    const vpH = vpRef.current.h
    const topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2)
    document.body.style.transform = `translate(${x}px, ${y + topMargin}px) scale(${s})`
    emitTransformUpdate()
  }

  // Save/restore styles — only depends on [enabled]
  useLayoutEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      savedTransformRef.current = document.body.style.transform
      savedOriginRef.current = document.body.style.transformOrigin
      savedBoxShadowRef.current = document.body.style.boxShadow
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
      updateCachedDimensions(scale)
      applyTransformPosition(scale)
    }
  }, [enabled, scale])

  // Recalculate margins on viewport resize
  useEffect(() => {
    if (!enabled) return
    function handleResize() {
      vpRef.current = { w: window.innerWidth, h: window.innerHeight }
      updateCachedDimensions(scaleRef.current)
      applyTransformPosition(scaleRef.current)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [enabled])

  // Cmd+scroll to zoom, regular scroll to pan with momentum
  useEffect(() => {
    if (!enabled) return
    let velocity = { x: 0, y: 0 }
    let lastTs = 0
    let disposed = false

    function currentBounds(): PanBounds {
      const vpW = vpRef.current.w
      const vpH = vpRef.current.h
      const topMargin = Math.max(CANVAS_MIN_MARGIN, (vpH - cachedBodyH.current) / 2)
      const maxX = (cachedBodyW.current + vpW) / 2
      return {
        minX: -maxX,
        maxX,
        minY: -(cachedBodyH.current + topMargin),
        maxY: vpH - topMargin,
      }
    }

    function coastLoop(ts: number): void {
      if (disposed) return
      const dt = Math.min(ts - lastTs, 50) / 16.667 // normalize to 60fps basis
      lastTs = ts
      const r = stepMomentum({ pan: panRef.current, velocity }, dt, currentBounds())
      panRef.current = r.state.pan
      velocity = r.state.velocity
      applyTransformPosition(scaleRef.current)
      if (r.shouldStop) {
        momentumRafRef.current = 0
        return
      }
      momentumRafRef.current = requestAnimationFrame(coastLoop)
    }

    function handleWheel(e: WheelEvent): void {
      e.preventDefault()
      // Cancel any running momentum
      cancelMomentum()

      if (e.metaKey || e.ctrlKey) {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        setScale(s => clamp(s + delta, MIN_ZOOM, MAX_ZOOM))
      } else {
        const { dx, dy } = normalizeDelta(e)
        // Apply immediate pan, then start momentum coast
        const wheel = computePanStep(panRef.current, { dx, dy }, currentBounds())
        panRef.current = wheel.pan
        applyTransformPosition(scaleRef.current)
        // velocity = negative delta, same direction as the pan
        velocity.x = wheel.clampedX ? 0 : -dx
        velocity.y = wheel.clampedY ? 0 : -dy
        lastTs = performance.now()
        momentumRafRef.current = requestAnimationFrame(coastLoop)
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      disposed = true
      cancelMomentum()
      window.removeEventListener('wheel', handleWheel)
    }
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
        cancelMomentum() // Stop any coasting wheel momentum before drag starts
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
      void clampPan()
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
