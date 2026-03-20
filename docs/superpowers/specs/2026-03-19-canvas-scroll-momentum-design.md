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
| `FRICTION` | `0.75` | For a typical trackpad delta of 10px: `10 × 0.75^17 ≈ 0.075` → stops at frame 17 (**~283ms**). For a large flick (30px): `30 × 0.75^20 ≈ 0.095` → stops at frame 20 (**~333ms**). Within the 200-300ms design goal for typical inputs; large flicks slightly exceed it. |
| `STOP_THRESHOLD` | `0.1` | Stop when total velocity < 0.1px/frame (6px/s at 60fps). Below perceptual threshold for discrete stopping on a static canvas. |

### Velocity capture

Each wheel event sets `velocity = { x: -deltaX, y: -deltaY }`. No accumulation — new wheel replaces existing velocity (cancel-and-restart).

### Velocity capture caveat

Wheel `deltaX`/`deltaY` represent scroll distance per event, not true velocity. The trackpad driver sends many small-delta events per gesture; the last event may have a small tail-off delta rather than peak speed. The simple "last delta = velocity" approach may feel inconsistent for very fast flicks. If so, the path forward is a rolling velocity estimator (average delta over the last 50-100ms of wheel events). Deferred to tuning — start simple.

### Why exponential, not linear

Linear decay (`velocity -= constant`) creates a sudden stop. Exponential (`velocity *= 0.75`) asymptotically approaches zero, producing a natural ease-out curve matching the project's existing `150ms ease-out` CSS timing convention.

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

Use manual rAF mocks with callback capture arrays (`installRAFMock`/`stepRAF`/`restoreRAFMock`), matching the established pattern from `selection-overlay.test.tsx` and `override.test.ts`. Do NOT use `vi.useFakeTimers()` + `vi.advanceTimersByTime(16)` — happy-dom's rAF may not be triggered reliably by fake timer advancement.

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
- **Tuning**: `FRICTION = 0.75` is calculated for ~283-333ms coast (10-30px deltas). May need adjustment after manual testing. Constants are named and top-level for easy tuning.
- **Velocity from deltas**: Wheel `deltaX`/`deltaY` are displacement per event, not true velocity. May feel inconsistent on very fast flicks. See "Velocity capture caveat" above. Start simple, upgrade to rolling estimator if needed.
- **Background tabs**: Browsers throttle rAF to ~1fps or pause entirely in background tabs. Momentum may appear to freeze and resume on tab switch. Acceptable for a sub-second animation; no mitigation needed.

---

## Architecture Review Findings (2026-03-19)

Review team: frontend, performance, jsts, testing, security
Mode: both (clink + native — 10 total reviewers)

### Cross-Reviewer Consensus

Issues flagged independently by 3+ reviewers — highest-confidence signals:

| Issue | Flagged By | Severity |
|---|---|---|
| `scrollHeight` read in `applyTransform` forces synchronous layout on every rAF frame | frontend-clink, performance-clink, jsts-codex, frontend-native, performance-native, jsts-native (6/10) | CRITICAL |
| Effect dep on `[enabled, scale]` tears down/re-mounts all listeners on every zoom step, resets pan | frontend-clink, performance-clink, jsts-codex, jsts-native, performance-native, frontend-native (6/10) | CRITICAL |
| Frame-rate dependent physics — 120fps ProMotion halves coast to ~142ms | frontend-clink, performance-clink, jsts-native, performance-native (4/10) | HIGH |
| `deltaMode` not normalized — Firefox mouse sends line-based deltas, pans ~3px/notch | frontend-clink, jsts-codex, testing-codex (3/10) | HIGH |
| No pan bounds — canvas can be scrolled permanently off-screen | frontend-clink, security-gemini, security-native, testing-native (4/10) | MEDIUM |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before shipping momentum

**C1: Forced synchronous layout in rAF loop** (`useCanvasZoom.ts:48`)

`document.body.scrollHeight` is a layout-triggering read. Inside the momentum rAF loop, each frame writes `transform` then reads `scrollHeight` — classic write-read-write layout thrashing. ~17 forced reflows in 283ms on every scroll gesture. On complex pages, each reflow adds 5-20ms, breaking the 16ms frame budget.

Fix: Cache `scrollHeight` in a ref. Invalidate only on `ResizeObserver` callback or scale change. The rAF loop should only write `body.style.transform` — split `applyTransform` into `applyStaticStyles()` (called once on enable) and `applyTransformPosition()` (called per-frame, writes only `transform`).

**C2: Effect teardown resets pan on every zoom step** (`useCanvasZoom.ts:66-84`)

The `useLayoutEffect` depends on `[enabled, scale]`. Each `setScale` triggers cleanup → `restoreSavedStyles()` → sets `wasEnabledRef.current = false` → next effect treats it as a false→true transition → zeros `panRef`. Net effect: zoom loses all pan offset. Additionally, all three `useEffect` hooks tear down and re-register 8+ event listeners on every zoom step — unnecessary churn.

Fix: Store `scale` in a `scaleRef`. Split the layout effect into `[enabled]`-only (save/restore) and `[enabled, scale]`-only (apply transform). Change wheel and Space+drag effects to depend only on `[enabled]` and read `scaleRef.current`.

#### HIGH — Should fix in v1

**H1: Frame-rate dependent physics** (spec lines 22-34)

`velocity *= FRICTION` per frame assumes 60fps. At 120fps (ProMotion Macs), 17 frames = ~142ms — half the design target. At 30fps (heavy page), coast doubles to ~566ms.

Fix: Use `DOMHighResTimeStamp` from rAF callback for time-based decay:
```
const dt = Math.min(now - lastTs, 50) / 16.667  // normalize to 60fps
velocity *= Math.pow(FRICTION, dt)
```

**H2: `deltaMode` not normalized** (`useCanvasZoom.ts:102-106`)

Firefox with a mouse sends `deltaMode = 1` (lines, not pixels) with `deltaY ≈ 3`. Chrome normalizes to ~360px for the same gesture. Pan is ~120x slower on Firefox mouse.

Fix: Multiply deltas by `LINE_HEIGHT` (40px) for mode 1, `window.innerHeight` for mode 2.

**H3: No `setPointerCapture` in Space+drag** (`useCanvasZoom.ts:134`)

Without pointer capture, `pointermove` events stop when the pointer crosses into a child `<iframe>`. Drag freezes mid-gesture. `pointerup` also missed outside window, leaving `panStartRef` non-null.

Fix: Call `(e.target as Element).setPointerCapture(e.pointerId)` in `handlePointerDown`.

**H4: `isInputFocused` doesn't pierce Shadow DOM** (`useCanvasZoom.ts:188-192`)

`document.activeElement` returns the shadow host, not the inner focused element. Space key activates panning while typing in Cortex's own panel or any web component.

Fix: Walk `shadowRoot.activeElement` recursively to find the deep active element.

#### MEDIUM

- **No pan bounds** — `panRef.x/y` are unclamped. A fast flick + momentum can send the canvas permanently off-screen. Add viewport-relative bounds clamping.
- **rAF test strategy** — `vi.advanceTimersByTime(16)` may not reliably trigger rAF in happy-dom. The codebase already uses manual rAF mocks with callback capture arrays in `selection-overlay.test.tsx`. Use that pattern instead.
- **`applyTransform` writes 6 styles per frame** — Only `transform` changes during momentum. The other 5 (`transformOrigin`, `boxShadow`, `overflow`, 2× `backgroundColor`) are constant. Write them once on enable.
- **Host app CSS transitions** — If body has `transition: transform`, it fights the rAF loop. Save and set `transition: none` on enable, restore on disable.
- **`will-change: transform`** — Without it, the browser may not compositor-promote the body, causing full-page repaint per frame. Set it on enable.
- **Velocity from last delta** — Multiple reviewers note this will feel "sticky" on trackpads where the OS sends tail-off events with tiny deltas. Consider implementing the rolling velocity estimator at launch rather than deferring.
- **`disposed` flag test gap** — No proposed test specifically verifies the `disposed` guard prevents stray writes after teardown. Add one.
- **Space+drag interrupting momentum** — No test for concurrent input methods (scroll starts momentum, then Space+drag starts). Both write to `panRef`. Add a test.

#### LOW

- **Object allocation per event** — `panRef.current = { x, y }` allocates a new object every wheel event. Mutate in place: `panRef.current.x -= e.deltaX`.
- **Cursor not saved at effect mount** — `savedCursor = ''` means cleanup clears host cursor even if Space was never pressed. Save at mount time.
- **`tagName.toLowerCase()` allocation** — Compare against uppercase constants (`'INPUT'`, `'TEXTAREA'`) to avoid string allocation on every keydown.
- **Browser coverage excluded from CI** — `src/browser/**` is excluded from coverage thresholds in vitest.config.ts. Momentum branches are invisible to CI.

### Positive Practices — Preserve These

1. **`disposed` + `cancelAnimationFrame` belt-and-suspenders** — Correct and defensive teardown design (praised by 5+ reviewers)
2. **`useLayoutEffect` for style application** — Prevents FOUC on canvas mode enter
3. **`isOwnUI` guard in pointer handler** — Prevents Cortex panel interactions from triggering canvas pan
4. **`{ passive: false }` on wheel listener** — Required for `preventDefault()` on wheel events
5. **Closure-scoped momentum state** — `velocity`/`rafId`/`disposed` as effect-lifetime variables, not refs
6. **Exponential decay choice** — Well-motivated, consistent with project's existing ease-out CSS convention
7. **Named top-level constants** — `FRICTION`, `STOP_THRESHOLD` tuning-friendly

### Review Methodology Note

**Clink mode** (5 reviewers across Claude, Codex, Gemini): Faster turnaround (~1-5 min each). Frontend-clink produced the most actionable findings (C1, C2, H1-H4). Performance-clink independently confirmed C1 and added rAF-gating for pointermove. Security-gemini had limited scope but caught pan bounds and CSS transition issues.

**Native mode** (5 Claude agents with full codebase access): Deeper analysis (~2-3 min each). Security-native went beyond scope into the broader system (WebSocket auth, edit pipeline) — valid findings but out of scope for this spec. Testing-native was the most valuable native reviewer — caught the fake-timer incompatibility with happy-dom, the weak test oracle, and 4 missing test scenarios. Performance-native produced a prioritized 10-item action table.

**Unique catches by mode**: Clink uniquely caught H3 (pointer capture) and the listener re-registration window (M3). Native uniquely caught the rAF mock incompatibility, `position: fixed` breakage from body transform, and broader system security issues. Running both was justified — each mode found ~3 issues the other missed.
