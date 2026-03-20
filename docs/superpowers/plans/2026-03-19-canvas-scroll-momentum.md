# Canvas Scroll-to-Pan Momentum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gentle momentum (inertia) to wheel-to-pan so the canvas coasts to a stop over ~280ms, with prerequisite structural fixes from architecture review.

**Architecture:** The momentum rAF loop lives inside the wheel `useEffect` as closure state. Three prerequisite refactors (scaleRef, applyTransform split, deltaMode normalization) must land first — they fix existing bugs and are required for the momentum loop to perform well. Time-based friction ensures consistent feel across 60/120/144Hz displays.

**Tech Stack:** Preact hooks, requestAnimationFrame, DOMHighResTimeStamp, Vitest with manual rAF mocks

**Spec:** `docs/superpowers/specs/2026-03-19-canvas-scroll-momentum-design.md`

---

## File Structure

All changes are in two existing files:

| File | Responsibility | Changes |
|---|---|---|
| `cortex-editor/src/browser/hooks/useCanvasZoom.ts` | Canvas zoom/pan hook | Tasks 1-6: refactor effects, split applyTransform, add deltaMode normalization, add momentum loop, add pan bounds |
| `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx` | Hook tests | Tasks 1-6: add rAF mock infrastructure, update existing tests, add momentum tests |

No new files needed.

---

### Task 1: scaleRef — Decouple effects from `scale` dependency

Fixes architecture review C2: effect teardown resets pan on every zoom step and causes unnecessary listener churn.

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts:17-184`
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

- [ ] **Step 1: Write the failing test — zoom preserves pan offset**

Add to the test file, after the existing "saves and restores" tests:

```typescript
it('zooming preserves pan offset', async () => {
  const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))

  // Pan the canvas
  dispatchWheel(200, false)
  await new Promise(r => setTimeout(r, 10))
  const panTransform = document.body.style.transform
  const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
  const panY = getY(panTransform)

  // Zoom — should preserve pan offset, not reset it
  dispatchWheel(100, true)
  await new Promise(r => setTimeout(r, 10))
  rerender(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  const zoomTransform = document.body.style.transform
  const zoomY = getY(zoomTransform)

  // The y-offset should reflect the pan, not be reset to the default margin
  // (Default margin is ~48px or centered; pan of 200 should shift it significantly)
  expect(Math.abs(zoomY - panY)).toBeLessThan(50) // allows for margin recalc on scale change
  unmount()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: FAIL — zoom resets panRef to {0,0} due to C2 bug.

- [ ] **Step 3: Add scaleRef and fix layout effect**

In `useCanvasZoom.ts`, add `scaleRef` after line 21:

```typescript
const scaleRef = useRef(scale)
scaleRef.current = scale
```

Split the `useLayoutEffect` (lines 66-84) into two effects:

```typescript
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
  } else if (!enabled) {
    restoreSavedStyles()
  }
  return () => { if (!enabled) return; restoreSavedStyles() }
}, [enabled])

// Apply transform — depends on [enabled, scale]
useLayoutEffect(() => {
  if (enabled) applyTransform(scale)
}, [enabled, scale])
```

Change all three `useEffect` hooks to depend only on `[enabled]` and read `scaleRef.current`:

- Resize effect (line 87-92): `applyTransform(scaleRef.current)`, deps: `[enabled]`
- Wheel effect (line 94-112): `applyTransform(scaleRef.current)`, deps: `[enabled]`
- Space+drag effect (line 114-182): `applyTransform(scaleRef.current)`, deps: `[enabled]`

- [ ] **Step 4: Run all tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS (18 existing + 1 new)

- [ ] **Step 5: Type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "fix: decouple effects from scale dep — zoom preserves pan offset

Split useLayoutEffect into [enabled]-only (save/restore) and
[enabled, scale]-only (apply transform). All useEffects now depend
only on [enabled] and read scaleRef.current, eliminating listener
churn on every zoom step.

Fixes architecture review C2."
```

---

### Task 2: Split applyTransform — cache scrollHeight, write-only rAF path

Fixes architecture review C1: forced synchronous layout on every frame.

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts:44-61`
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

- [ ] **Step 1: Write the failing test — static styles applied once on enable**

```typescript
it('static canvas styles are applied when enabled', () => {
  const { unmount } = renderHook(() => useCanvasZoom(true))
  expect(document.body.style.transformOrigin).toBe('50% 0')
  expect(document.body.style.boxShadow).toContain('rgba(0,0,0,0.06)')
  expect(document.documentElement.style.overflow).toBe('hidden')
  expect(document.documentElement.style.backgroundColor).toBe('#e5e5e5')
  expect(document.body.style.backgroundColor).toBe('#ffffff')
  unmount()
})
```

- [ ] **Step 2: Run test to verify it passes (baseline — this should already pass)**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: PASS — confirms current behavior before refactoring.

- [ ] **Step 3: Split applyTransform into applyStaticStyles + applyTransformPosition**

```typescript
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
```

Update the layout effect to call `applyStaticStyles()` on enable and `updateCachedBodyH(scale)` + `applyTransformPosition(scale)`.

Update the resize handler to call `updateCachedBodyH(scaleRef.current)` then `applyTransformPosition(scaleRef.current)`.

Replace all calls to `applyTransform(...)` with `applyTransformPosition(scaleRef.current)` in the wheel and Space+drag handlers.

Remove the old `applyTransform` function entirely.

- [ ] **Step 4: Run all tests**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "perf: split applyTransform — cache scrollHeight, write-only per-frame path

applyStaticStyles() runs once on enable (5 style writes).
applyTransformPosition() runs per-frame (1 style write, no layout read).
scrollHeight cached in ref, invalidated on resize and scale change.

Fixes architecture review C1: eliminates forced synchronous layout
in the rAF hot path."
```

---

### Task 3: Normalize deltaMode for cross-browser wheel handling

Fixes architecture review H2: Firefox mouse sends line-based deltas.

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts` (wheel handler)
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

- [ ] **Step 1: Write the failing test — line-based deltaMode**

First, extend the `dispatchWheel` helper to accept an optional `deltaMode` parameter:

```typescript
function dispatchWheel(deltaY: number, metaKey: boolean, deltaX = 0, deltaMode = 0): void {
  const event = new WheelEvent('wheel', { deltaY, deltaX, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'metaKey', { value: metaKey })
  if (deltaMode !== 0) Object.defineProperty(event, 'deltaMode', { value: deltaMode })
  window.dispatchEvent(event)
}
```

Then the test:

```typescript
it('normalizes line-based deltaMode for Firefox mouse', async () => {
  const { unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  const before = document.body.style.transform
  const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

  // Simulate Firefox mouse: deltaMode=1 (lines), deltaY=3
  dispatchWheel(3, false, 0, 1) // deltaMode=1 (DOM_DELTA_LINE)
  await new Promise(r => setTimeout(r, 10))

  const after = document.body.style.transform
  // 3 lines * ~40px/line = ~120px of pan, not 3px
  const deltaY = getY(before) - getY(after)
  expect(deltaY).toBeGreaterThan(50)
  unmount()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: FAIL — deltaY of 3 produces only 3px of pan without normalization.

- [ ] **Step 3: Add deltaMode normalization**

Add a helper function near the top of the file:

```typescript
const LINE_HEIGHT = 40 // px — CSS standard approximation for deltaMode=1

function normalizeDelta(e: WheelEvent): { dx: number; dy: number } {
  const mult = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? window.innerHeight : 1
  return { dx: e.deltaX * mult, dy: e.deltaY * mult }
}
```

In the wheel handler, replace direct `e.deltaX`/`e.deltaY` usage with `normalizeDelta(e)`:

```typescript
function handleWheel(e: WheelEvent): void {
  e.preventDefault()
  if (e.metaKey || e.ctrlKey) {
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setScale(s => clamp(s + delta, MIN_ZOOM, MAX_ZOOM))
  } else {
    const { dx, dy } = normalizeDelta(e)
    panRef.current.x -= dx
    panRef.current.y -= dy
    applyTransformPosition(scaleRef.current)
  }
}
```

Note: also switches to in-place mutation of `panRef.current` (fixes LOW object-allocation finding).

- [ ] **Step 4: Run all tests**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "fix: normalize WheelEvent deltaMode for Firefox mouse support

Firefox mouse sends deltaMode=1 (lines) with deltaY≈3 per notch.
Without normalization, this produced 3px of pan vs ~360px on Chrome.
Multiplies by LINE_HEIGHT (40px) for mode 1, innerHeight for mode 2.

Fixes architecture review H2."
```

---

### Task 4: Add momentum constants and rAF test infrastructure

Sets up the testing foundation for the momentum feature.

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts` (add constants)
- Modify: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx` (add rAF mock)

- [ ] **Step 1: Add momentum constants to source**

At the top of `useCanvasZoom.ts`, after the existing constants:

```typescript
const FRICTION = 0.75
const STOP_THRESHOLD = 0.1
```

These are module-private — tests verify behavior, not constants.

- [ ] **Step 2: Add rAF mock infrastructure to test file**

Add imports at the top:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
```

Add the rAF mock helpers inside the `describe` block, after `beforeEach`:

```typescript
afterEach(() => {
  document.body.style.cursor = ''
})

// --- rAF mock infrastructure (matches selection-overlay.test.tsx pattern) ---
let rafCallbacks: FrameRequestCallback[]
let mockNow: number
const originalRAF = window.requestAnimationFrame
const originalCAF = window.cancelAnimationFrame
const originalPerfNow = performance.now

function installRAFMock() {
  rafCallbacks = []
  mockNow = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => mockNow)
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  }) as typeof requestAnimationFrame
  window.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
}

function restoreRAFMock() {
  window.requestAnimationFrame = originalRAF
  window.cancelAnimationFrame = originalCAF
  performance.now = originalPerfNow
}

function stepRAF(count = 1, dtMs = 16.667) {
  for (let i = 0; i < count; i++) {
    mockNow += dtMs
    const cb = rafCallbacks.shift()
    if (cb) cb(mockNow)
  }
}
```

- [ ] **Step 3: Run all tests — verify infrastructure doesn't break existing tests**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "feat: add momentum constants and rAF test infrastructure

FRICTION=0.75, STOP_THRESHOLD=0.1 constants added.
Manual rAF mock with installRAFMock/stepRAF/restoreRAFMock helpers,
matching the established pattern from selection-overlay.test.tsx."
```

---

### Task 5: Implement momentum rAF loop with time-based friction

The core feature. Fixes architecture review H1 (frame-rate dependent physics).

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts` (wheel effect)
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

- [ ] **Step 1: Write the failing test — momentum continues after wheel stops**

```typescript
describe('momentum', () => {
  afterEach(() => restoreRAFMock())

  it('wheel-to-pan has momentum after scroll stops', async () => {
    const { unmount } = renderHook(() => useCanvasZoom(true))
    await new Promise(r => setTimeout(r, 10))
    installRAFMock()

    const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])
    const beforeWheel = getY(document.body.style.transform)

    // Dispatch wheel (applies immediate delta + starts momentum)
    dispatchWheel(100, false)
    const afterWheel = getY(document.body.style.transform)

    // Step a few rAF frames — position should keep changing (momentum)
    stepRAF(3)
    const afterMomentum = getY(document.body.style.transform)

    expect(afterWheel).toBeLessThan(beforeWheel) // immediate pan
    expect(afterMomentum).toBeLessThan(afterWheel) // momentum continued
    unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: FAIL — no momentum loop exists yet, position doesn't change after wheel event.

- [ ] **Step 3: Implement momentum rAF loop in the wheel effect**

Inside the wheel `useEffect`, add closure state and the coast loop:

```typescript
useEffect(() => {
  if (!enabled) return
  let velocity = { x: 0, y: 0 }
  let rafId = 0
  let lastTs = 0
  let disposed = false

  function coastLoop(ts: number): void {
    if (disposed) return
    const dt = Math.min(ts - lastTs, 50) / 16.667 // normalize to 60fps basis
    lastTs = ts
    const friction = Math.pow(FRICTION, dt)
    velocity.x *= friction
    velocity.y *= friction
    panRef.current.x += velocity.x
    panRef.current.y += velocity.y
    applyTransformPosition(scaleRef.current)
    if (Math.abs(velocity.x) + Math.abs(velocity.y) < STOP_THRESHOLD) {
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(coastLoop)
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault()
    // Cancel any running momentum
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }

    if (e.metaKey || e.ctrlKey) {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setScale(s => clamp(s + delta, MIN_ZOOM, MAX_ZOOM))
    } else {
      const { dx, dy } = normalizeDelta(e)
      // Apply immediate pan
      panRef.current.x -= dx
      panRef.current.y -= dy
      applyTransformPosition(scaleRef.current)
      // Set velocity and start momentum coast
      velocity.x = -dx
      velocity.y = -dy
      lastTs = performance.now()
      rafId = requestAnimationFrame(coastLoop)
    }
  }

  window.addEventListener('wheel', handleWheel, { passive: false })
  return () => {
    disposed = true
    if (rafId) cancelAnimationFrame(rafId)
    window.removeEventListener('wheel', handleWheel)
  }
}, [enabled])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: PASS

- [ ] **Step 5: Add remaining momentum tests**

```typescript
it('momentum stops within expected frame count', async () => {
  const { unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  installRAFMock()

  const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

  dispatchWheel(10, false) // 10px delta
  stepRAF(25) // well beyond expected ~17 frames
  const settled = getY(document.body.style.transform)

  stepRAF(10) // 10 more frames
  const afterSettle = getY(document.body.style.transform)

  expect(afterSettle).toBe(settled) // no more movement
  unmount()
})

it('new wheel event cancels existing momentum', async () => {
  const { unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  installRAFMock()

  const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])

  // Scroll right (negative deltaX = pan right = x increases)
  dispatchWheel(0, false, -100)
  stepRAF(3)
  const midCoast = getX(document.body.style.transform)

  // Now scroll left (positive deltaX = pan left = x decreases)
  dispatchWheel(0, false, 100)
  stepRAF(5)
  const afterReverse = getX(document.body.style.transform)

  expect(afterReverse).toBeLessThan(midCoast) // reversed direction
  unmount()
})

it('Cmd+scroll cancels momentum and changes scale', async () => {
  const { result, rerender, unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  installRAFMock()

  const getY = (t: string) => parseFloat(t.match(/translate\([^,]+,\s*([^)]+)px\)/)![1])

  dispatchWheel(100, false) // start momentum
  stepRAF(2)

  // Cmd+scroll to zoom — should cancel momentum
  dispatchWheel(100, true)

  // Verify momentum stopped: position shouldn't change on further frames
  const afterZoom = getY(document.body.style.transform)
  stepRAF(5)
  const afterMore = getY(document.body.style.transform)
  expect(afterMore).toBe(afterZoom) // momentum is dead

  // Verify scale changed
  restoreRAFMock()
  await new Promise(r => setTimeout(r, 10))
  rerender(() => useCanvasZoom(true))
  expect(result.current.scale).toBeLessThan(0.85)
  unmount()
})

it('disabling canvas mode during momentum stops animation', async () => {
  const { rerender, unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))
  installRAFMock()

  dispatchWheel(100, false) // start momentum
  stepRAF(2) // a couple frames of coast

  // Disable canvas mode
  restoreRAFMock()
  rerender(() => useCanvasZoom(false))
  await new Promise(r => setTimeout(r, 0))

  // Styles should be restored, not still animating
  expect(document.body.style.transform).toBe('')
  unmount()
})
```

- [ ] **Step 6: Run all tests**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 7: Type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "feat: add wheel-to-pan momentum with time-based friction

Exponential decay rAF loop with FRICTION=0.75, STOP_THRESHOLD=0.1.
Time-based physics using DOMHighResTimeStamp — consistent across
60/120/144Hz displays. New wheel cancels and restarts momentum.
Disposed flag prevents stray writes after effect teardown.

5 new tests with manual rAF mock infrastructure."
```

---

### Task 6: Pan bounds clamping

Fixes architecture review MEDIUM: canvas can be panned permanently off-screen.

**Files:**
- Modify: `cortex-editor/src/browser/hooks/useCanvasZoom.ts`
- Test: `cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
it('pan offset is clamped to prevent canvas from going off-screen', async () => {
  const { unmount } = renderHook(() => useCanvasZoom(true))
  await new Promise(r => setTimeout(r, 10))

  const getX = (t: string) => parseFloat(t.match(/translate\(([^p]+)px/)![1])

  // Try to pan 50000px to the right
  dispatchWheel(0, false, -50000)
  await new Promise(r => setTimeout(r, 10))
  const x = getX(document.body.style.transform)

  // Should be clamped — not 50000px
  expect(Math.abs(x)).toBeLessThan(10000)
  unmount()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: FAIL — x is ~50000.

- [ ] **Step 3: Add clampPan helper**

```typescript
const MAX_PAN = 5000 // px — generous bound, prevents off-screen loss

function clampPan(): void {
  panRef.current.x = clamp(panRef.current.x, -MAX_PAN, MAX_PAN)
  panRef.current.y = clamp(panRef.current.y, -MAX_PAN, MAX_PAN)
}
```

Call `clampPan()` after every `panRef` mutation:
- In the wheel handler, after `panRef.current.x -= dx` / `.y -= dy`
- In the `coastLoop`, after `panRef.current.x += velocity.x` / `.y += velocity.y`
- In `handlePointerMove`, after setting `panRef.current`

- [ ] **Step 4: Run all tests**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/browser/hooks/useCanvasZoom.ts cortex-editor/tests/browser/hooks/use-canvas-zoom.test.tsx
git commit -m "fix: clamp pan offset to prevent canvas from going off-screen

MAX_PAN=5000px applied after every panRef mutation (wheel, momentum,
space+drag). Prevents the canvas from being flung permanently off-
screen with no way to recover.

Fixes architecture review MEDIUM: pan bounds missing."
```

---

### Task 7: Build and manual verification

**Files:**
- None modified — verification only

- [ ] **Step 1: Run full test suite**

Run: `cd cortex-editor && npx vitest run tests/browser/hooks/use-canvas-zoom.test.tsx`
Expected: ALL PASS (18 existing + ~8 new = ~26 tests)

- [ ] **Step 2: Type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Build IIFE bundle**

Run: `cd cortex-editor && npm run build`
Expected: Clean build, no errors

- [ ] **Step 4: Run full test suite (all projects)**

Run: `cd cortex-editor && npx vitest run`
Expected: ALL PASS — no regressions in other test files

- [ ] **Step 5: Manual verification checklist**

If a dev server is available, verify:
1. Enter canvas mode → scroll to pan (smooth, no jank)
2. Lift fingers → canvas coasts gently to a stop (~300ms)
3. Fast flick → longer coast, slow scroll → shorter coast
4. Mid-coast, scroll again → old momentum cancels, new gesture takes over
5. Mid-coast, Cmd+scroll → momentum stops, zoom changes
6. Space+drag → grab/grabbing cursors, no momentum on release
7. Firefox with mouse → pan speed feels proportional (not 3px/notch)

---

## Summary

| Task | What | Why | Lines Changed (est.) |
|---|---|---|---|
| 1 | scaleRef pattern | Fixes pan-reset-on-zoom bug, eliminates listener churn | ~40 |
| 2 | Split applyTransform | Eliminates forced layout in rAF hot path | ~30 |
| 3 | deltaMode normalization | Firefox mouse support | ~15 |
| 4 | rAF mock infrastructure | Foundation for momentum tests | ~30 |
| 5 | Momentum rAF loop + tests | The actual feature | ~60 |
| 6 | Pan bounds clamping | Prevent off-screen canvas | ~15 |
| 7 | Build + verification | Prove it works | 0 |

Total: ~190 lines changed across 2 files.

---

## Deferred (out of scope for this plan)

These HIGH-severity findings from the architecture review are real issues but independent of momentum. They should be tracked and addressed in a follow-up:

- **H3: No `setPointerCapture` in Space+drag** — Drag freezes when pointer crosses iframe boundary. Fix: `(e.target as Element).setPointerCapture(e.pointerId)` in `handlePointerDown`.
- **H4: `isInputFocused` doesn't pierce Shadow DOM** — Space activates panning while typing in web components. Fix: walk `shadowRoot.activeElement` recursively.

---

## Tuning Note

Total displacement from a single wheel event is: immediate delta + momentum sum ≈ `delta × (1 + FRICTION / (1 - FRICTION))` ≈ `delta × 4`. For a 100px wheel event, the canvas travels ~400px total. This is intentionally generous for trackpad use — a gentle flick moves the canvas meaningfully. If it feels too floaty during manual testing, reduce initial velocity to a fraction of delta (e.g., `velocity = -dx * 0.5`) rather than changing FRICTION, which would also change the decay curve shape.
