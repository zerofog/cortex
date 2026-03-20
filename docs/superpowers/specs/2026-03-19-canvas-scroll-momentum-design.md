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
| `FRICTION` | `0.92` | Decays to near-zero in ~250ms (~15 frames at 60fps). Gentle |
| `STOP_THRESHOLD` | `0.5` | Stop when movement < 0.5px/frame — imperceptible |

### Velocity capture

Each wheel event sets `velocity = { x: -deltaX, y: -deltaY }`. No accumulation — new wheel replaces existing velocity (cancel-and-restart).

### Why exponential, not linear

Linear decay (`velocity -= constant`) creates a sudden stop. Exponential (`velocity *= 0.92`) asymptotically approaches zero, producing a natural ease-out curve matching the project's existing `150ms ease-out` CSS timing convention.

## Integration

### File: `cortex-editor/src/browser/hooks/useCanvasZoom.ts`

**New state** (closure variables inside the wheel `useEffect`, not refs — scoped to effect lifetime):
- `velocity: { x: number, y: number }` — current momentum velocity
- `rafId: number` — active rAF handle for cancellation

**Modified wheel handler**:
1. Cancel any running rAF loop (new wheel cancels momentum)
2. Apply immediate pan offset (existing behavior, unchanged)
3. Set velocity from current `deltaX`/`deltaY`
4. Start rAF decay loop

**rAF loop** (`coastLoop` function):
1. Apply friction: `velocity.x *= FRICTION`, `velocity.y *= FRICTION`
2. Update pan: `panRef.current.x += velocity.x`, `panRef.current.y += velocity.y`
3. Call `applyTransform(scale)`
4. If `|velocity.x| + |velocity.y| < STOP_THRESHOLD`, stop. Otherwise `rafId = requestAnimationFrame(coastLoop)`

**Cleanup**: Effect cleanup function calls `cancelAnimationFrame(rafId)`.

### Cmd+scroll (zoom) path

Unchanged. The zoom branch does not set velocity or start a coast loop. If momentum is running when the user Cmd+scrolls, the new wheel event cancels the rAF loop before entering the zoom branch.

## Framework independence

The momentum logic uses only `requestAnimationFrame`, `cancelAnimationFrame`, and DOM style mutations. The Preact `useEffect` is the lifecycle wrapper only. Works identically with Svelte `onMount`/`onDestroy`, Vue `onMounted`/`onUnmounted`, or vanilla JS.

## Tests

### New tests
- **"wheel-to-pan has momentum after scroll stops"**: dispatch wheel, wait ~300ms, verify transform changed beyond the immediate delta
- **"momentum stops within 400ms"**: dispatch wheel, wait 400ms, record position, wait another 200ms, assert position unchanged
- **"new wheel event cancels existing momentum"**: dispatch wheel, wait 100ms, dispatch opposite-direction wheel, verify canvas moves in new direction
- **"Cmd+scroll cancels momentum"**: dispatch regular wheel (starts momentum), then Cmd+wheel, verify momentum stopped and zoom changed

### Existing test impact
- All existing tests unaffected. The immediate pan behavior is unchanged; momentum is additive after the wheel event.

## Risks

- **Timer sensitivity in tests**: rAF-based tests can be flaky. Use `vi.useFakeTimers()` with manual `requestAnimationFrame` advancement.
- **Tuning**: `FRICTION = 0.92` is a starting point. May need adjustment after manual testing. Constants are named and top-level for easy tuning.
