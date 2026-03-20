# Canvas Scroll-to-Pan Momentum

## Context

The phase-6 refactor added wheel-to-pan in `useCanvasZoom.ts`. Regular scroll (no Cmd/Ctrl) converts `deltaX`/`deltaY` into pan offsets via `panRef` + `applyTransform`. This works but stops abruptly when the user lifts their fingers — because `e.preventDefault()` kills native macOS trackpad momentum and mice have none to begin with.

## Goal

Add gentle momentum (inertia) to wheel-to-pan so the canvas coasts to a stop over ~250ms after the user stops scrolling. Must be framework-agnostic (the sidecar injects into any app) and cross-browser.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Wheel-to-pan only | Space+drag is a precision gesture — users expect it to stop on release (Figma/Sketch convention) |
| Feel | Short coast, ~200-300ms | Gentle. Canvas settles quickly, doesn't feel slippery |
| Interruption | New wheel cancels and restarts | Each scroll gesture owns the motion. No velocity accumulation |
| Approach | rAF decay loop with exponential friction | Fits the existing imperative pan architecture. CSS transitions and WAAPI both conflict with `applyTransform()` |

## Physics Model

Exponential friction decay in a `requestAnimationFrame` loop:

```
each frame:
  velocity.x *= FRICTION
  velocity.y *= FRICTION
  panRef.x += velocity.x
  panRef.y += velocity.y
  applyTransform(scale)

  if |velocity.x| + |velocity.y| < STOP_THRESHOLD:
    stop loop
```

### Constants

| Constant | Value | Rationale |
|---|---|---|
| `FRICTION` | `0.85` | `0.85^15 ≈ 0.087` — 91% decay in 15 frames (~250ms at 60fps). For a typical trackpad delta of 10px, velocity drops below threshold in ~14 frames (~233ms). For a large flick (30px), ~18 frames (~300ms). Matches the 200-300ms design goal. |
| `STOP_THRESHOLD` | `0.1` | Stop when total velocity < 0.1px/frame (6px/s at 60fps). Below perceptual threshold for discrete stopping on a static canvas. |

### Velocity capture

Each wheel event sets `velocity = { x: -deltaX, y: -deltaY }`. No accumulation — new wheel replaces existing velocity (cancel-and-restart).

### Velocity capture caveat

Wheel `deltaX`/`deltaY` represent scroll distance per event, not true velocity. The trackpad driver sends many small-delta events per gesture; the last event may have a small tail-off delta rather than peak speed. The simple "last delta = velocity" approach may feel inconsistent for very fast flicks. If so, the path forward is a rolling velocity estimator (average delta over the last 50-100ms of wheel events). Deferred to tuning — start simple.

### Why exponential, not linear

Linear decay (`velocity -= constant`) creates a sudden stop. Exponential (`velocity *= 0.85`) asymptotically approaches zero, producing a natural ease-out curve matching the project's existing `150ms ease-out` CSS timing convention.

## Integration

### File: `cortex-editor/src/browser/hooks/useCanvasZoom.ts`

**New state** (closure variables inside the wheel `useEffect`, not refs — scoped to effect lifetime):
- `velocity: { x: number, y: number }` — current momentum velocity
- `rafId: number` — active rAF handle for cancellation
- `disposed: boolean` — set to `true` in effect cleanup; rAF loop checks this before each frame to prevent stray writes after teardown

**Modified wheel handler**:
1. Cancel any running rAF loop (new wheel cancels momentum)
2. Apply immediate pan offset (existing behavior, unchanged)
3. Set velocity from current `deltaX`/`deltaY`
4. Start rAF decay loop

**rAF loop** (`coastLoop` function):
1. If `disposed`, return immediately (prevents stray DOM writes after effect teardown)
2. Apply friction: `velocity.x *= FRICTION`, `velocity.y *= FRICTION`
3. Update pan: `panRef.current.x += velocity.x`, `panRef.current.y += velocity.y`
4. Call `applyTransform(scale)`
5. If `|velocity.x| + |velocity.y| < STOP_THRESHOLD`, stop. Otherwise `rafId = requestAnimationFrame(coastLoop)`

**Cleanup**: Effect cleanup sets `disposed = true` and calls `cancelAnimationFrame(rafId)`. The `disposed` flag is belt-and-suspenders — `cancelAnimationFrame` should prevent the next frame, but if the rAF callback was already queued, `disposed` catches it.

### Cmd+scroll (zoom) path

Unchanged. The zoom branch does not set velocity or start a coast loop. If momentum is running when the user Cmd+scrolls, the new wheel event cancels the rAF loop before entering the zoom branch.

Additionally, because the wheel effect depends on `[enabled, scale]`, a zoom (`setScale`) triggers effect teardown and re-mount, which implicitly cancels any running rAF loop via the cleanup function. This is the primary cancellation path for zoom-during-momentum; the in-handler `cancelAnimationFrame` is belt-and-suspenders.

### Disable/unmount during momentum

When `enabled` transitions to `false` while momentum is active, the effect cleanup fires (`cancelAnimationFrame` + `disposed = true`). The `useLayoutEffect` that restores styles fires synchronously before paint. The `disposed` flag prevents any queued rAF callback from re-applying canvas transforms after style restoration.

## Framework independence

The momentum logic uses only `requestAnimationFrame`, `cancelAnimationFrame`, and DOM style mutations. The Preact `useEffect` is the lifecycle wrapper only. Works identically with Svelte `onMount`/`onDestroy`, Vue `onMounted`/`onUnmounted`, or vanilla JS.

## Tests

### Test strategy

Use `vi.useFakeTimers()` and `vi.advanceTimersByTime(16)` to simulate individual rAF frames, consistent with existing test patterns in the codebase (see `use-toolbar-dock.test.tsx`, `channel.test.ts`).

### New tests
- **"wheel-to-pan has momentum after scroll stops"**: dispatch wheel, advance rAF frames, verify transform changed beyond the immediate delta
- **"momentum stops within expected frame count"**: dispatch wheel, advance 20+ frames (16ms each), record position, advance 10 more frames, assert position unchanged
- **"new wheel event cancels existing momentum"**: dispatch wheel, advance a few frames, dispatch opposite-direction wheel, verify canvas moves in new direction
- **"Cmd+scroll cancels momentum"**: dispatch regular wheel (starts momentum), then Cmd+wheel, verify momentum stopped and zoom changed
- **"disabling canvas mode during momentum stops animation"**: dispatch wheel (starts momentum), toggle `enabled` to `false`, advance frames, verify styles restored and no stray transform writes

### Existing test impact
- All existing tests unaffected. The immediate pan behavior is unchanged; momentum is additive after the wheel event.

## Risks

- **Timer sensitivity in tests**: rAF-based tests can be flaky. Use `vi.useFakeTimers()` with `vi.advanceTimersByTime(16)` per frame.
- **Tuning**: `FRICTION = 0.85` is calculated for ~250ms coast but may need adjustment after manual testing. Constants are named and top-level for easy tuning.
- **Velocity from deltas**: Wheel `deltaX`/`deltaY` are displacement per event, not true velocity. May feel inconsistent on very fast flicks. See "Velocity capture caveat" above. Start simple, upgrade to rolling estimator if needed.
- **Background tabs**: Browsers throttle rAF to ~1fps or pause entirely in background tabs. Momentum may appear to freeze and resume on tab switch. Acceptable for a sub-second animation; no mitigation needed.
