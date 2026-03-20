# Phase 6: Toolbar + Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the floating toolbar (mode switching, activity badge, drag-to-dock), wire panel auto-positioning, add auto-scroll on selection, and implement lightweight canvas zoom-out mode.

**Architecture:** Four features coordinated through CortexApp state: (1) Toolbar component with drag-to-dock via new `useToolbarDock` hook, (2) wire existing `recheckOverlap` from `useSnapToEdge` for panel auto-positioning, (3) `scrollIntoView` on selection for off-viewport elements, (4) CSS transform zoom via new `useCanvasZoom` hook. Mode state (`select`/`comment`/`canvas`) lives in CortexApp and flows down to Toolbar and selection system.

**Tech Stack:** Preact (not React), TypeScript, Vitest + happy-dom, CSS (injected into Shadow DOM as string)

**Spec:** `thoughts/shared/plans/2026-03-10-cortex-v2-implementation.md` (Phase 6, lines 1830-1924), `thoughts/shared/research/2026-03-09-cortex-v2-ux-and-architecture-spec.md` (Toolbar + Viewport Handling sections)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/browser/hooks/useToolbarDock.ts` | Toolbar snap-to-edge (all 4 edges), orientation, localStorage persistence |
| Create | `src/browser/components/Toolbar.tsx` | Toolbar UI: mode buttons, activity badge, close, drag handle |
| Create | `src/browser/hooks/useCanvasZoom.ts` | Canvas zoom: CSS transform, Cmd+scroll, Space+drag pan |
| Create | `tests/browser/hooks/use-toolbar-dock.test.tsx` | Dock hook tests |
| Create | `tests/browser/toolbar.test.tsx` | Toolbar component tests |
| Create | `tests/browser/hooks/use-canvas-zoom.test.tsx` | Canvas zoom tests |
| Modify | `src/browser/components/CortexApp.tsx` | Wire toolbar, modes, auto-position, auto-scroll, canvas zoom, keyboard shortcuts, exit |
| Modify | `src/browser/styles.css` | Toolbar styles, canvas mode background |
| Modify | `tests/browser/cortex-app.test.tsx` | Integration tests for new wiring |

**Not modified:** `src/browser/selection.ts` (existing Escape handler is compatible), `src/browser/hooks/useDrag.ts` (works as-is for toolbar), `src/browser/hooks/useSnapToEdge.ts` (recheckOverlap already exists, just needs wiring).

---

## Parallel Execution Map

```
Independent (Wave 1 — parallel):
  Task 1: useToolbarDock hook
  Task 3: useCanvasZoom hook

Sequential:
  Task 2: Toolbar component (depends on Task 1)
  Task 4: CortexApp wiring (depends on Tasks 1, 2, 3)
  Task 5: CSS styles (after Task 2 to know class names)
  Task 6: Integration verification (after all)
```

---

## Task 1: useToolbarDock Hook

**Files:**
- Create: `cortex-editor/src/browser/hooks/useToolbarDock.ts`
- Test: `cortex-editor/tests/browser/hooks/use-toolbar-dock.test.tsx`

**Context:** The toolbar can dock to any of 4 viewport edges. When docked to top/bottom it's horizontal; when left/right it's vertical. Position persists to localStorage. This is fundamentally different from `useSnapToEdge` (which only snaps left/right for the panel), so a separate hook is cleaner.

**Constants:**
- `TOOLBAR_THICKNESS = 40` (cross-axis dimension)
- `TOOLBAR_LENGTH = 240` (main-axis dimension, approximate)
- `TOOLBAR_MARGIN = 16`
- `SNAP_DURATION = 300` (spec: 300ms spring)
- `STORAGE_KEY = 'cortex-toolbar-position'`

- [ ] **Step 1: Write failing tests**

```tsx
// tests/browser/hooks/use-toolbar-dock.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'preact'
import { useToolbarDock } from '../../../src/browser/hooks/useToolbarDock.js'

// Minimal renderHook for Preact (same pattern used in use-snap-to-edge tests)
function renderHook<T>(hookFn: () => T): { result: { current: T }; unmount: () => void } {
  const result = { current: null as T }
  const container = document.createElement('div')
  document.body.appendChild(container)

  function Wrapper() {
    result.current = hookFn()
    return null
  }

  render(<Wrapper />, container)
  return {
    result,
    unmount: () => {
      render(null, container)
      container.remove()
    },
  }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('useToolbarDock', () => {
  beforeEach(() => {
    localStorage.clear()
    // Set viewport to 1440x900
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  })

  it('defaults to bottom-center', () => {
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.edge).toBe('bottom')
    // Centered horizontally: (1440 - 240) / 2 = 600
    expect(result.current.position.x).toBe(600)
    // 16px from bottom: 900 - 40 - 16 = 844
    expect(result.current.position.y).toBe(844)
  })

  it('isHorizontal is true for top/bottom edges', () => {
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.isHorizontal).toBe(true) // bottom = horizontal
  })

  it('snap finds nearest edge from position', async () => {
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 600, y: 30 })
    await flush()
    result.current.snap()
    await flush()
    expect(result.current.edge).toBe('top')
    expect(result.current.position.y).toBe(16) // TOOLBAR_MARGIN
  })

  it('snap to left edge changes to vertical', async () => {
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 30, y: 400 })
    await flush()
    result.current.snap()
    await flush()
    expect(result.current.edge).toBe('left')
    expect(result.current.isHorizontal).toBe(false)
  })

  it('snap to right edge changes to vertical', async () => {
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 1400, y: 400 })
    await flush()
    result.current.snap()
    await flush()
    expect(result.current.edge).toBe('right')
    expect(result.current.isHorizontal).toBe(false)
  })

  it('persists edge to localStorage on snap', async () => {
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 600, y: 30 })
    await flush()
    result.current.snap()
    await flush()
    const stored = JSON.parse(localStorage.getItem('cortex-toolbar-position') ?? '{}')
    expect(stored.edge).toBe('top')
  })

  it('restores edge from localStorage', () => {
    localStorage.setItem('cortex-toolbar-position', JSON.stringify({ edge: 'left', offset: 400 }))
    const { result } = renderHook(() => useToolbarDock())
    expect(result.current.edge).toBe('left')
    expect(result.current.isHorizontal).toBe(false)
  })

  it('isSnapping is true during snap animation', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 600, y: 30 })
    result.current.snap()
    expect(result.current.isSnapping).toBe(true)
    vi.advanceTimersByTime(300)
    await flush()
    expect(result.current.isSnapping).toBe(false)
    vi.useRealTimers()
  })

  it('clamps position within viewport on resize', async () => {
    const { result } = renderHook(() => useToolbarDock())
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await flush()
    expect(result.current.position.x).toBeLessThanOrEqual(400 - 16)
  })

  it('preserves offset along edge on snap', async () => {
    const { result } = renderHook(() => useToolbarDock())
    result.current.setPosition({ x: 1000, y: 860 })
    await flush()
    result.current.snap()
    await flush()
    expect(result.current.edge).toBe('bottom')
    expect(result.current.position.x).toBe(1000) // preserves x offset
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-toolbar-dock.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```ts
// src/browser/hooks/useToolbarDock.ts
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
    if (parsed && typeof parsed.edge === 'string' && typeof parsed.offset === 'number') {
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
  const horiz = isHorizontalEdge(edge)
  const mainLen = horiz ? TOOLBAR_LENGTH : TOOLBAR_THICKNESS
  const crossLen = horiz ? TOOLBAR_THICKNESS : TOOLBAR_LENGTH

  if (edge === 'top') {
    return { x: clamp(offset, TOOLBAR_MARGIN, vw - mainLen - TOOLBAR_MARGIN), y: TOOLBAR_MARGIN }
  }
  if (edge === 'bottom') {
    return { x: clamp(offset, TOOLBAR_MARGIN, vw - mainLen - TOOLBAR_MARGIN), y: vh - crossLen - TOOLBAR_MARGIN }
  }
  if (edge === 'left') {
    return { x: TOOLBAR_MARGIN, y: clamp(offset, TOOLBAR_MARGIN, vh - crossLen - TOOLBAR_MARGIN) }
  }
  // right
  return { x: vw - mainLen - TOOLBAR_MARGIN, y: clamp(offset, TOOLBAR_MARGIN, vh - crossLen - TOOLBAR_MARGIN) }
}

function getDefaultPosition(): { position: Position; edge: DockEdge } {
  if (typeof window === 'undefined') return { position: { x: 0, y: 0 }, edge: 'bottom' }

  const stored = loadStored()
  if (stored) {
    return { position: computePosition(stored.edge, stored.offset), edge: stored.edge }
  }
  // Default: bottom-center
  const edge: DockEdge = 'bottom'
  const offset = (window.innerWidth - TOOLBAR_LENGTH) / 2
  return { position: computePosition(edge, offset), edge }
}

function findNearestEdge(pos: Position, currentEdge: DockEdge): { edge: DockEdge; offset: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Use actual dimensions based on current orientation for accurate center
  const horiz = isHorizontalEdge(currentEdge)
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
  return { edge: distances[0].edge, offset: distances[0].offset }
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

  // Handle viewport resize
  useEffect(() => {
    function handleResize() {
      const currentEdge = edgeRef.current
      const currentPos = positionRef.current
      // Determine offset along current edge
      const offset = isHorizontalEdge(currentEdge) ? currentPos.x : currentPos.y
      const newPos = computePosition(currentEdge, offset)
      positionRef.current = newPos
      setPositionState(newPos)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Cleanup snap timer
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-toolbar-dock.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd cortex-editor && git add src/browser/hooks/useToolbarDock.ts tests/browser/hooks/use-toolbar-dock.test.tsx && git commit -m "feat(phase-6): add useToolbarDock hook — snap to 4 edges, orientation, localStorage"
```

---

## Task 2: Toolbar Component

**Files:**
- Create: `cortex-editor/src/browser/components/Toolbar.tsx`
- Test: `cortex-editor/tests/browser/toolbar.test.tsx`

**Depends on:** Task 1 (useToolbarDock)

**Context:** The toolbar is a floating pill with mode buttons, activity badge, close button, and drag-to-dock. It uses `useDrag` (from Phase 3) for pointer tracking and `useToolbarDock` (Task 1) for snap-to-edge behavior. The `useDrag` hook already filters out interactive elements (buttons) via `INTERACTIVE_SELECTOR`, so only the logo div (non-button) initiates drag.

**Mode type (shared):**
```ts
export type CortexMode = 'select' | 'comment' | 'canvas'
```

- [ ] **Step 1: Write failing tests**

```tsx
// tests/browser/toolbar.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import type { CortexMode } from '../../src/browser/components/Toolbar.js'
import { renderInShadow } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{
    mode: CortexMode
    onModeChange: (m: CortexMode) => void
    activityCount: number
    onClose: () => void
    canvasActive: boolean
  }> = {}) {
    const props = {
      mode: 'select' as CortexMode,
      onModeChange: vi.fn(),
      activityCount: 0,
      onClose: vi.fn(),
      canvasActive: false,
      ...overrides,
    }
    const result = renderInShadow(<Toolbar {...props} />)
    cleanup = result.cleanup
    return { ...result, props }
  }

  it('renders toolbar element', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
  })

  it('renders all toolbar buttons', () => {
    const { root } = setup()
    const buttons = root.querySelectorAll('button')
    // Select, Comment, Canvas, Close = 4 buttons
    expect(buttons.length).toBe(4)
  })

  it('select button has active class when mode is select', () => {
    const { root } = setup({ mode: 'select' })
    const selectBtn = root.querySelector('[data-mode="select"]')
    expect(selectBtn?.classList.contains('cortex-toolbar__btn--active')).toBe(true)
  })

  it('clicking comment button calls onModeChange with comment', () => {
    const onModeChange = vi.fn()
    const { root } = setup({ onModeChange })
    const commentBtn = root.querySelector('[data-mode="comment"]') as HTMLButtonElement
    commentBtn.click()
    expect(onModeChange).toHaveBeenCalledWith('comment')
  })

  it('clicking canvas button calls onModeChange with canvas', () => {
    const onModeChange = vi.fn()
    const { root } = setup({ onModeChange })
    const canvasBtn = root.querySelector('[data-mode="canvas"]') as HTMLButtonElement
    canvasBtn.click()
    expect(onModeChange).toHaveBeenCalledWith('canvas')
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    const { root } = setup({ onClose })
    const closeBtn = root.querySelector('[data-action="close"]') as HTMLButtonElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('displays activity count', () => {
    const { root } = setup({ activityCount: 5 })
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge?.textContent).toContain('5')
  })

  it('hides badge when activity count is 0', () => {
    const { root } = setup({ activityCount: 0 })
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge).toBeNull()
  })

  it('canvas button shows active state when canvasActive', () => {
    const { root } = setup({ canvasActive: true })
    const canvasBtn = root.querySelector('[data-mode="canvas"]')
    expect(canvasBtn?.classList.contains('cortex-toolbar__btn--active')).toBe(true)
  })

  it('renders logo drag handle as non-button div', () => {
    const { root } = setup()
    const logo = root.querySelector('.cortex-toolbar__logo')
    expect(logo).not.toBeNull()
    expect(logo?.tagName.toLowerCase()).not.toBe('button')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/toolbar.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```tsx
// src/browser/components/Toolbar.tsx
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { useDrag } from '../hooks/useDrag.js'
import { useToolbarDock, TOOLBAR_LENGTH, TOOLBAR_THICKNESS } from '../hooks/useToolbarDock.js'

export type CortexMode = 'select' | 'comment' | 'canvas'

export interface ToolbarProps {
  mode: CortexMode
  onModeChange: (mode: CortexMode) => void
  activityCount: number
  onClose: () => void
  canvasActive?: boolean
}

export function Toolbar({
  mode,
  onModeChange,
  activityCount,
  onClose,
  canvasActive = false,
}: ToolbarProps): JSX.Element {
  const { position, edge, isHorizontal, isSnapping, setPosition, snap } = useToolbarDock()

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) { setPosition({ x, y }) },
    onDragEnd() { snap() },
  })

  const handleModeClick = useCallback((newMode: CortexMode) => {
    onModeChange(newMode)
  }, [onModeChange])

  const classes = [
    'cortex-toolbar',
    isHorizontal ? 'cortex-toolbar--horizontal' : 'cortex-toolbar--vertical',
    isSnapping && 'cortex-toolbar--snapping',
  ].filter(Boolean).join(' ')

  const width = isHorizontal ? TOOLBAR_LENGTH : TOOLBAR_THICKNESS
  const height = isHorizontal ? TOOLBAR_THICKNESS : TOOLBAR_LENGTH

  return (
    <div
      class={classes}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Logo — drag handle (not a button, so useDrag allows drag from here) */}
      <div class="cortex-toolbar__logo" aria-label="Cortex — drag to reposition">
        ◇
      </div>

      <button
        class={`cortex-toolbar__btn${mode === 'select' ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="select"
        onClick={() => handleModeClick('select')}
        data-tooltip="Select (V)"
      >
        ↖
      </button>

      <button
        class={`cortex-toolbar__btn${mode === 'comment' ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="comment"
        onClick={() => handleModeClick('comment')}
        data-tooltip="Comment (C)"
      >
        💬
      </button>

      <button
        class={`cortex-toolbar__btn${canvasActive ? ' cortex-toolbar__btn--active' : ''}`}
        data-mode="canvas"
        onClick={() => handleModeClick('canvas')}
        data-tooltip="Canvas (⌘0)"
      >
        ⊞
      </button>

      {activityCount > 0 && (
        <span class="cortex-toolbar__badge">
          {activityCount} {activityCount === 1 ? 'change' : 'changes'}
        </span>
      )}

      <button
        class="cortex-toolbar__btn cortex-toolbar__btn--close"
        data-action="close"
        onClick={onClose}
        data-tooltip="Close Cortex (Esc)"
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/toolbar.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd cortex-editor && git add src/browser/components/Toolbar.tsx tests/browser/toolbar.test.tsx && git commit -m "feat(phase-6): add Toolbar component — mode buttons, activity badge, drag-to-dock"
```

---

## Task 3: useCanvasZoom Hook

**Files:**
- Create: `cortex-editor/src/browser/hooks/useCanvasZoom.ts`
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

**Context:** Canvas zoom applies a CSS `transform: scale(S)` on `<body>` for a lightweight zoom-out mode. Cmd+scroll adjusts zoom (0.5–1.0 range). Space+drag pans when zoomed out. This is intentionally simple — no DOM traversal, no forced layout, just a CSS transform.

**Can run in parallel with Task 1.**

- [ ] **Step 1: Write failing tests**

```tsx
// tests/browser/hooks/use-canvas-zoom.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { useCanvasZoom } from '../../../src/browser/hooks/useCanvasZoom.js'

function renderHook<T>(hookFn: () => T): { result: { current: T }; unmount: () => void; rerender: (newHookFn: () => T) => void } {
  const result = { current: null as T }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let currentFn = hookFn

  function Wrapper() {
    result.current = currentFn()
    return null
  }

  render(<Wrapper />, container)
  return {
    result,
    unmount: () => {
      render(null, container)
      container.remove()
    },
    rerender: (newHookFn: () => T) => {
      currentFn = newHookFn
      render(<Wrapper />, container)
    },
  }
}

describe('useCanvasZoom', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    document.body.style.transform = ''
    document.body.style.transformOrigin = ''
    document.documentElement.style.backgroundColor = ''
  })

  it('does not apply transform when disabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(false))
    expect(document.body.style.transform).toBe('')
    unmount()
  })

  it('applies transform when enabled', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    expect(document.body.style.transformOrigin).toBe('0 0')
    expect(result.current.scale).toBeGreaterThan(0.5)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)
    unmount()
  })

  it('calculates default scale as (vw - 320) / vw', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    const expected = (1440 - 320) / 1440 // ≈ 0.778
    expect(result.current.scale).toBeCloseTo(expected, 2)
    unmount()
  })

  it('sets background on html element when enabled', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.documentElement.style.backgroundColor).toBe('#f5f5f5')
    unmount()
  })

  it('cleans up transform when disabled', async () => {
    const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    rerender(() => useCanvasZoom(false))
    await new Promise(r => setTimeout(r, 0))
    expect(document.body.style.transform).toBe('')
    unmount()
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    expect(document.body.style.transform).toContain('scale(')
    unmount()
    expect(document.body.style.transform).toBe('')
  })

  it('clamps scale between 0.5 and 1.0', () => {
    const { result, unmount } = renderHook(() => useCanvasZoom(true))
    expect(result.current.scale).toBeGreaterThanOrEqual(0.5)
    expect(result.current.scale).toBeLessThanOrEqual(1.0)
    unmount()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```ts
// src/browser/hooks/useCanvasZoom.ts
import { useState, useRef, useEffect } from 'preact/hooks'

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
  const prevEnabledRef = useRef(false)
  const spaceHeldRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null)

  // Apply/remove CSS transform on body. Also resets scale when re-enabled.
  useEffect(() => {
    if (enabled) {
      // Reset scale on fresh enable (not on scale change within same session)
      if (!prevEnabledRef.current) {
        const fresh = clamp((window.innerWidth - 320) / window.innerWidth, MIN_ZOOM, MAX_ZOOM)
        setScale(fresh)
        document.body.style.transform = `scale(${fresh})`
      } else {
        document.body.style.transform = `scale(${scale})`
      }
      document.body.style.transformOrigin = '0 0'
      document.documentElement.style.backgroundColor = '#f5f5f5'
    } else {
      document.body.style.transform = ''
      document.body.style.transformOrigin = ''
      document.documentElement.style.backgroundColor = ''
    }
    prevEnabledRef.current = enabled
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd cortex-editor && git add src/browser/hooks/useCanvasZoom.ts tests/browser/hooks/use-canvas-zoom.test.tsx && git commit -m "feat(phase-6): add useCanvasZoom hook — CSS transform, Cmd+scroll, Space+drag pan"
```

---

## Task 4: CortexApp Wiring

**Files:**
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx`
- Modify: `cortex-editor/tests/browser/cortex-app.test.tsx`

**Depends on:** Tasks 1, 2, 3

**Context:** CortexApp is the root component. It needs to:
1. Manage `mode` state (`select`/`comment`/`canvas`)
2. Render Toolbar (always visible, not just when element is selected)
3. Track `activityCount` from `edit_status` messages with `status: 'done'`
4. Call `recheckOverlap` from `useSnapToEdge` when selection changes (6.2 wiring)
5. Auto-scroll selected element into view when off-viewport (6.3)
6. Pass `canvasActive` state to `useCanvasZoom` hook (6.4)
7. Handle keyboard shortcuts: V (select), C (comment), Cmd+0 (canvas toggle), Escape (exit when no panel)
8. Handle exit (close toolbar + disable design mode)

**Important:** The Panel currently owns its own `useSnapToEdge` instance. To wire `recheckOverlap`, CortexApp needs to either (a) lift `useSnapToEdge` up to CortexApp and pass position down to Panel, or (b) use a ref/callback to call Panel's `recheckOverlap`. Option (a) is cleaner — it makes auto-positioning a CortexApp responsibility since it depends on selection state.

This means Panel.tsx needs a small refactor: accept `position`, `isSnapping`, and drag handlers from props instead of calling `useSnapToEdge`/`useDrag` internally. The `useDrag`/`useSnapToEdge` calls move to CortexApp.

- [ ] **Step 1: Write failing tests for new CortexApp behavior**

Add these tests to `cortex-app.test.tsx`:

```tsx
// Append to existing tests/browser/cortex-app.test.tsx

it('renders toolbar even without selection', async () => {
  setup()
  const channel = createMockChannel()
  render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
  await new Promise(r => setTimeout(r, 10))

  const toolbar = root.querySelector('.cortex-toolbar')
  expect(toolbar).not.toBeNull()
})

it('tracks activity count from edit_status done messages', async () => {
  setup()
  const channel = createMockChannel()
  render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
  await new Promise(r => setTimeout(r, 10))

  // Simulate edit_status done
  channel._simulateMessage({ type: 'edit_status', editId: 'e1', status: 'done' })
  await new Promise(r => setTimeout(r, 10))

  const badge = root.querySelector('.cortex-toolbar__badge')
  expect(badge?.textContent).toContain('1')
})

it('calls recheckOverlap when element is selected', async () => {
  setup()
  const channel = createMockChannel()
  render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
  await new Promise(r => setTimeout(r, 10))

  const { _getCallbacks } = await import('../../src/browser/selection.js') as unknown as {
    _getCallbacks: () => { selectCb: (el: HTMLElement | null) => void }
  }
  const { selectCb } = _getCallbacks()

  const target = document.createElement('div')
  document.body.appendChild(target)
  mockGetBoundingClientRect(target, { top: 50, left: 50, width: 100, height: 40, right: 150, bottom: 90 })

  selectCb(target)
  await new Promise(r => setTimeout(r, 10))

  // Panel should exist (selection triggers panel)
  const panel = root.querySelector('.cortex-panel')
  expect(panel).not.toBeNull()

  target.remove()
})

it('keyboard V switches to select mode', async () => {
  setup()
  const channel = createMockChannel()
  render(<CortexApp channel={channel} shadowRoot={shadow} />, root)
  await new Promise(r => setTimeout(r, 10))

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))
  await new Promise(r => setTimeout(r, 10))

  const selectBtn = root.querySelector('[data-mode="select"]')
  expect(selectBtn?.classList.contains('cortex-toolbar__btn--active')).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/cortex-app.test.tsx`
Expected: FAIL (toolbar not rendered, etc.)

- [ ] **Step 3: Refactor Panel to accept position from props**

Modify `src/browser/components/Panel.tsx`:
- Add to `PanelProps`: `position`, `isSnapping`, `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel` (from parent)
- Remove internal `useSnapToEdge()` and `useDrag()` calls
- Use props for positioning and drag handlers instead

The Panel line 110 currently has:
```ts
const { position, isSnapping, setPosition, snap } = useSnapToEdge()
const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
  onDrag(x, y) { setPosition({ x, y }) },
  onDragEnd() { snap() },
})
```

Replace with props:
```ts
// In PanelProps, add:
position: { x: number; y: number }
isSnapping: boolean
panelPointerDown: (e: PointerEvent) => void
panelPointerMove: (e: PointerEvent) => void
panelPointerUp: (e: PointerEvent) => void
panelPointerCancel: (e: PointerEvent) => void
```

And in the JSX, pass these to PanelHeader instead of the locally-created handlers.

- [ ] **Step 4: Write CortexApp wiring**

Replace `src/browser/components/CortexApp.tsx` with the wired version:

```tsx
import type { JSX } from 'preact'
import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'
import { CSSOverrideManager } from '../override.js'
import { initSelection } from '../selection.js'
import type { SelectionHandle } from '../selection.js'
import { detectStates } from '../state-detector.js'
import type { StateDeclarations, InteractionState } from '../state-detector.js'
import { HoverOverlay } from './HoverOverlay.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { Panel } from './Panel.js'
import { Toolbar } from './Toolbar.js'
import type { CortexMode } from './Toolbar.js'
import { useDrag } from '../hooks/useDrag.js'
import { useSnapToEdge } from '../hooks/useSnapToEdge.js'
import { useCanvasZoom } from '../hooks/useCanvasZoom.js'

export interface CortexAppProps {
  channel: CortexChannel
  shadowRoot: ShadowRoot
}

export function CortexApp({ channel, shadowRoot }: CortexAppProps): JSX.Element | null {
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null)
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null)
  const [swatches, setSwatches] = useState<string[] | undefined>(undefined)
  const [activeState, setActiveState] = useState<InteractionState>('default')
  const [availableStates, setAvailableStates] = useState<StateDeclarations | undefined>(undefined)
  const [hasBefore, setHasBefore] = useState(false)
  const [hasAfter, setHasAfter] = useState(false)
  const [hoverEnabled, setHoverEnabled] = useState(true)
  const [mode, setMode] = useState<CortexMode>('select')
  const [activityCount, setActivityCount] = useState(0)
  const [active, setActive] = useState(true)
  const overrideRef = useRef<CSSOverrideManager | null>(null)
  const selectionRef = useRef<SelectionHandle | null>(null)
  const selectedElementRef = useRef<HTMLElement | null>(null)
  selectedElementRef.current = selectedElement

  // Panel positioning (lifted from Panel for auto-position wiring)
  const { position: panelPosition, isSnapping: panelSnapping, setPosition: setPanelPosition, snap: panelSnap, recheckOverlap } = useSnapToEdge()
  const { handlePointerDown: panelPointerDown, handlePointerMove: panelPointerMove, handlePointerUp: panelPointerUp, handlePointerCancel: panelPointerCancel } = useDrag({
    onDrag(x, y) { setPanelPosition({ x, y }) },
    onDragEnd() { panelSnap() },
  })

  // Canvas zoom
  const canvasActive = mode === 'canvas'
  const { scale: canvasScale } = useCanvasZoom(canvasActive)

  useEffect(() => {
    const overrideManager = new CSSOverrideManager()
    overrideRef.current = overrideManager

    const selectionHandle = initSelection(
      shadowRoot,
      setHoveredElement,
      setSelectedElement,
    )
    selectionRef.current = selectionHandle

    const unsubscribe = channel.onMessage((msg) => {
      if (msg.type === 'hello') {
        if (msg.swatches && msg.swatches.length > 0) {
          setSwatches(msg.swatches)
        }
      }
      if (msg.type === 'edit_status' && msg.status === 'done') {
        setActivityCount(c => c + 1)
      }
    })

    return () => {
      unsubscribe()
      selectionHandle.cleanup()
      overrideManager.dispose()
      overrideRef.current = null
      selectionRef.current = null
    }
  }, [channel, shadowRoot])

  // Detect interaction states and pseudo-elements on element selection change
  useEffect(() => {
    overrideRef.current?.clearStateOverrides()

    if (!selectedElement) {
      setAvailableStates(undefined)
      setActiveState('default')
      setHasBefore(false)
      setHasAfter(false)
      return
    }

    const states = detectStates(selectedElement)
    setAvailableStates(states)
    setActiveState('default')

    const beforeContent = getComputedStyle(selectedElement, '::before').content
    const afterContent = getComputedStyle(selectedElement, '::after').content
    setHasBefore(beforeContent !== 'none' && beforeContent !== '')
    setHasAfter(afterContent !== 'none' && afterContent !== '')

    // 6.2: Auto-position — check if panel overlaps newly selected element (20px margin per spec)
    const rect = selectedElement.getBoundingClientRect()
    const OVERLAP_MARGIN = 20
    recheckOverlap(new DOMRect(
      rect.x - OVERLAP_MARGIN, rect.y - OVERLAP_MARGIN,
      rect.width + OVERLAP_MARGIN * 2, rect.height + OVERLAP_MARGIN * 2,
    ))

    // 6.3: Auto-scroll — bring off-viewport elements into view
    const offScreen = rect.top < 0 || rect.bottom > window.innerHeight ||
                      rect.left < 0 || rect.right > window.innerWidth
    if (offScreen) {
      selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedElement, recheckOverlap])

  // Handle state changes from the lens overlay
  const handleStateChange = useCallback((state: InteractionState) => {
    const manager = overrideRef.current
    if (!manager || !selectedElement) return

    if (state === 'default') {
      manager.clearStateOverrides()
      setActiveState(state)
    } else if (availableStates) {
      const declarations = availableStates[state]
      if (declarations.size > 0) {
        const source = selectedElement.getAttribute('data-cortex-source')
        if (source) {
          manager.setStateOverrides(source, declarations)
          setActiveState(state)
        }
      }
    }
  }, [selectedElement, availableStates])

  const handleClose = useCallback(() => setSelectedElement(null), [])
  const handleSelectElement = useCallback((el: HTMLElement | null) => setSelectedElement(el), [])
  const handleToggleHover = useCallback(() => setHoverEnabled(v => !v), [])

  // Handle mode changes
  const handleModeChange = useCallback((newMode: CortexMode) => {
    if (newMode === mode) {
      // Toggle canvas off if already in canvas mode
      if (newMode === 'canvas') setMode('select')
      return
    }
    setMode(newMode)
  }, [mode])

  // Exit Cortex entirely
  const handleExit = useCallback(() => {
    selectionRef.current?.setDesignMode(false)
    setSelectedElement(null)
    setActive(false)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Don't intercept when typing in inputs or contentEditable elements
      const target = e.target as HTMLElement
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (target?.isContentEditable) return

      if (e.key === 'v' || e.key === 'V') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) setMode('select')
      }
      if (e.key === 'c' || e.key === 'C') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) setMode('comment')
      }
      if (e.key === '0' && e.metaKey) {
        e.preventDefault()
        setMode(prev => prev === 'canvas' ? 'select' : 'canvas')
      }
      if (e.key === 'Escape' && !selectedElementRef.current) {
        handleExit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleExit])

  if (!active) return null

  return (
    <>
      <HoverOverlay element={hoverEnabled ? hoveredElement : null} />
      <SelectionOverlay
        element={selectedElement}
        availableStates={availableStates}
        activeState={activeState}
        onStateChange={handleStateChange}
        overlaysVisible={hoverEnabled}
      />
      {selectedElement && overrideRef.current && (
        <Panel
          element={selectedElement}
          overrideManager={overrideRef.current}
          onClose={handleClose}
          onSelectElement={handleSelectElement}
          swatches={swatches}
          activeState={activeState}
          hasBefore={hasBefore}
          hasAfter={hasAfter}
          hoverEnabled={hoverEnabled}
          onToggleHover={handleToggleHover}
          position={panelPosition}
          isSnapping={panelSnapping}
          panelPointerDown={panelPointerDown}
          panelPointerMove={panelPointerMove}
          panelPointerUp={panelPointerUp}
          panelPointerCancel={panelPointerCancel}
        />
      )}
      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        activityCount={activityCount}
        onClose={handleExit}
        canvasActive={canvasActive}
      />
    </>
  )
}
```

- [ ] **Step 5: Update Panel.tsx to accept position props**

Modify `PanelProps` to include the lifted position/drag state, remove internal `useSnapToEdge`/`useDrag` calls, and use the props instead.

Key changes in Panel.tsx:
1. Add to `PanelProps`: `position`, `isSnapping`, `panelPointerDown`, `panelPointerMove`, `panelPointerUp`, `panelPointerCancel`
2. Remove the line: `const { position, isSnapping, setPosition, snap } = useSnapToEdge()`
3. Remove the line: `const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({...})`
4. Remove unused imports: `useDrag`, `useSnapToEdge`
5. In `<PanelHeader>`, replace `onPointerDown={handlePointerDown}` etc. with `onPointerDown={panelPointerDown}` etc.
6. Use `position` and `isSnapping` from props instead of local hook state

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/cortex-app.test.tsx tests/browser/panel.test.tsx`
Expected: ALL PASS (panel tests may need minor adjustments for new props)

- [ ] **Step 7: Fix panel test failures (all 3 test blocks)**

The existing `panel.test.tsx` has 3 separate `describe` blocks that create Panel instances. ALL need the 6 new required props added to every `<Panel>` render call.

**Default props to add everywhere Panel is rendered:**
```tsx
const panelPositionProps = {
  position: { x: 1000, y: 12 },
  isSnapping: false,
  panelPointerDown: vi.fn(),
  panelPointerMove: vi.fn(),
  panelPointerUp: vi.fn(),
  panelPointerCancel: vi.fn(),
}
```

**Block 1: `describe('Panel')` (main block)** — Update the `setup()` function to spread `panelPositionProps` into every render call.

**Block 2: `describe('Panel -- library detection wiring')` (~line 202)** — This block uses inline `render(<Panel ...>)` calls. Add `{...panelPositionProps}` to each render call.

**Block 3: `describe('Panel -- activeState + activePseudo + dimming')` (~line 277)** — This block has its own setup functions. Add `{...panelPositionProps}` there too.

Search for all `<Panel` in `panel.test.tsx` and ensure every instance gets the new props. There are approximately 15 render calls total across the 3 blocks.

- [ ] **Step 8: Run full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd cortex-editor && git add src/browser/components/CortexApp.tsx src/browser/components/Panel.tsx tests/browser/cortex-app.test.tsx tests/browser/panel.test.tsx && git commit -m "feat(phase-6): wire toolbar, modes, auto-position, auto-scroll, canvas zoom, keyboard shortcuts"
```

---

## Task 5: CSS Styles

**Files:**
- Modify: `cortex-editor/src/browser/styles.css`

**Depends on:** Task 2 (Toolbar class names finalized)

**Context:** Add toolbar styles and canvas mode background. Follow existing patterns: `cortex-` prefix, glassmorphic appearance matching panel, spring easing for snap animations.

- [ ] **Step 1: Add toolbar CSS**

Append to `styles.css` after the dimmed section (end of file):

```css
/* ── Toolbar ─────────────────────────────────── */

.cortex-toolbar {
  position: fixed;
  left: 0;
  top: 0;
  will-change: transform;
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: #111827;
  padding: 4px;
  animation: cortex-toolbar-fade-in 200ms ease-out;
}

@keyframes cortex-toolbar-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cortex-toolbar--horizontal {
  flex-direction: row;
}

.cortex-toolbar--vertical {
  flex-direction: column;
}

.cortex-toolbar--snapping {
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cortex-toolbar__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: grab;
  font-size: 16px;
  flex-shrink: 0;
  user-select: none;
}

.cortex-toolbar__logo:active {
  cursor: grabbing;
}

.cortex-toolbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #6b7280;
  padding: 0;
  flex-shrink: 0;
}

.cortex-toolbar__btn:hover:not(.cortex-toolbar__btn--active) {
  background: rgba(0, 0, 0, 0.04);
  color: #374151;
}

.cortex-toolbar__btn--active {
  background: #3b82f6;
  color: #fff;
}

.cortex-toolbar__btn--close {
  color: #9ca3af;
}

.cortex-toolbar__btn--close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.cortex-toolbar__badge {
  font-size: 11px;
  color: #6b7280;
  padding: 0 8px;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
}

.cortex-toolbar__badge:hover {
  color: #3b82f6;
}

/* Vertical toolbar: tooltips appear to the right instead of above */
.cortex-toolbar--vertical [data-tooltip]:hover::after,
.cortex-toolbar--vertical [data-tooltip]:focus-visible::after {
  bottom: auto;
  left: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
}
```

- [ ] **Step 2: Run test suite to verify no regressions**

Run: `cd cortex-editor && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
cd cortex-editor && git add src/browser/styles.css && git commit -m "feat(phase-6): add toolbar CSS styles — glassmorphic pill, snap animation, mode buttons"
```

---

## Task 6: Integration Verification

**Files:** None (verification only)

**Context:** Verify all tests pass, type checking succeeds, and no regressions introduced.

- [ ] **Step 1: Run full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: ALL tests pass (previous ~658 + new ~25-30)

- [ ] **Step 2: Run type checker**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Check for unused imports/exports**

Run: `cd cortex-editor && npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: clean output

- [ ] **Step 4: Verify test count**

Expected new tests:
- `use-toolbar-dock.test.tsx`: ~10 tests
- `toolbar.test.tsx`: ~10 tests
- `use-canvas-zoom.test.tsx`: ~7 tests
- `cortex-app.test.tsx`: +4 tests (new wiring tests)

Total new: ~31 tests
Total overall: ~689 tests

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
cd cortex-editor && git add -A && git commit -m "fix(phase-6): test fixes from integration verification"
```

---

## Key Design Decisions

1. **Separate `useToolbarDock` vs extending `useSnapToEdge`:** Toolbar snaps to all 4 edges with orientation change; panel only snaps left/right. Behavior difference warrants separate hook.

2. **Panel position lifted to CortexApp:** `recheckOverlap` needs to be called from CortexApp (where selection state lives), so `useSnapToEdge` moves up from Panel. Panel becomes a presentational component for positioning.

3. **Canvas zoom as pure CSS transform:** No DOM traversal, no forced layout. Just `transform: scale(S)` on body. This is the opposite of made-refine's approach (12,000 node traversal).

4. **Activity badge from `edit_status` messages:** The server sends `edit_status` with `status: 'done'` when a source write completes. CortexApp counts these.

5. **Keyboard shortcuts in CortexApp, not selection.ts:** Mode switching (V/C/Cmd+0) depends on React state. The existing Escape handler in selection.ts (deselect) coexists with CortexApp's handler (exit when no selection).

6. **Comment mode is a placeholder:** Phase 6 wires the button and cursor change. Actual comment pinning is Phase 7 (AI Path).
