/**
 * Leaf-unit tests for the pure math functions extracted from useCanvasZoom.
 * No DOM, no Preact, no rAF — pure synchronous arithmetic.
 */
import { describe, it, expect } from 'vitest'
import {
  stepMomentum,
  computePanStep,
} from '../../src/browser/hooks/useCanvasZoom.js'
import type {
  MomentumState,
  PanBounds,
  PanDelta,
} from '../../src/browser/hooks/useCanvasZoom.js'

const FRICTION = 0.75
const STOP_THRESHOLD = 0.1

// ─── helpers ────────────────────────────────────────────────────────────────

function infiniteBounds(): PanBounds {
  return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity }
}

function tightBounds(cx = 0, cy = 0): PanBounds {
  return { minX: cx - 100, maxX: cx + 100, minY: cy - 100, maxY: cy + 100 }
}

// dt=1 → normalize to 1 frame at 60fps basis (dt = 1ms / 16.667 * 16.667 normalised?)
// Actually: dt in stepMomentum is already the normalized value (milliseconds / 16.667).
// At dt=1 (one 60fps frame worth): friction = FRICTION^1 = 0.75
const DT_ONE_FRAME = 1 // normalized to 60fps basis

// ─── stepMomentum ───────────────────────────────────────────────────────────

describe('stepMomentum', () => {
  it('single step unclamped: friction applied, pan moves by post-friction velocity', () => {
    const state: MomentumState = {
      pan: { x: 0, y: 0 },
      velocity: { x: 10, y: 0 },
    }
    const bounds = infiniteBounds()
    const { state: next, shouldStop } = stepMomentum(state, DT_ONE_FRAME, bounds)

    const expectedVx = 10 * FRICTION // 7.5
    expect(next.velocity.x).toBeCloseTo(expectedVx, 6)
    expect(next.velocity.y).toBeCloseTo(0, 6)
    expect(next.pan.x).toBeCloseTo(expectedVx, 6) // pan += new velocity
    expect(next.pan.y).toBe(0)
    expect(shouldStop).toBe(false)
  })

  it('preserves sign of velocity through unclamped friction step', () => {
    // Catches mutations like `vx = Math.abs(velocity.x * friction)` that would
    // pass every other test (which use positive starting velocity, or zero the
    // negative axis via clamping).
    const state: MomentumState = {
      pan: { x: 0, y: 0 },
      velocity: { x: -8, y: -3 },
    }
    const { state: next } = stepMomentum(state, DT_ONE_FRAME, infiniteBounds())
    expect(next.velocity.x).toBeLessThan(0)
    expect(next.velocity.y).toBeLessThan(0)
    expect(next.pan.x).toBeLessThan(0)
    expect(next.pan.y).toBeLessThan(0)
  })

  it('multi-step: starting from velocity (10, 0) at dt=1, shouldStop becomes true after ~17 steps', () => {
    const N = Math.ceil(Math.log(STOP_THRESHOLD / 10) / Math.log(FRICTION))
    // N should be ~17 (verify: FRICTION^17 * 10 ≈ 0.75^17 * 10 ≈ 0.075 < 0.1 but per-axis)
    // shouldStop checks sum |vx| + |vy|; starting at vx=10, vy=0 so same as |vx|

    let state: MomentumState = { pan: { x: 0, y: 0 }, velocity: { x: 10, y: 0 } }
    const bounds = infiniteBounds()

    let stoppedAt = -1
    for (let i = 0; i < N + 5; i++) {
      const result = stepMomentum(state, DT_ONE_FRAME, bounds)
      state = result.state
      if (result.shouldStop && stoppedAt === -1) {
        stoppedAt = i + 1
      }
    }
    // Convergence rate matters: stoppedAt must be near N, not 1 (would imply
    // immediate-stop mutation that always returns shouldStop=true).
    expect(stoppedAt).toBeGreaterThan(N - 3)
    expect(stoppedAt).toBeLessThanOrEqual(N + 1)
  })

  it('X-axis clamp at maxX zeroes vx, leaves vy intact', () => {
    const bounds: PanBounds = { minX: -1000, maxX: 5, minY: -1000, maxY: 1000 }
    // pan.x = 4, vx = 10 — after one step pan.x would be 4 + (10*0.75) = 11.5 → clamped to 5
    const state: MomentumState = {
      pan: { x: 4, y: 0 },
      velocity: { x: 10, y: 5 },
    }
    const { state: next } = stepMomentum(state, DT_ONE_FRAME, bounds)

    expect(next.pan.x).toBe(5)
    expect(next.velocity.x).toBe(0)
    // vy should still be friction-dampened, not zeroed
    expect(next.velocity.y).toBeCloseTo(5 * FRICTION, 6)
    expect(next.pan.y).toBeCloseTo(5 * FRICTION, 6)
  })

  it('Y-axis clamp at minY zeroes vy, leaves vx intact', () => {
    const bounds: PanBounds = { minX: -1000, maxX: 1000, minY: -5, maxY: 1000 }
    // pan.y = -4, vy = -10 — after step pan.y would be -4 + (-10*0.75) = -11.5 → clamped to -5
    const state: MomentumState = {
      pan: { x: 0, y: -4 },
      velocity: { x: 5, y: -10 },
    }
    const { state: next } = stepMomentum(state, DT_ONE_FRAME, bounds)

    expect(next.pan.y).toBe(-5)
    expect(next.velocity.y).toBe(0)
    expect(next.velocity.x).toBeCloseTo(5 * FRICTION, 6)
    expect(next.pan.x).toBeCloseTo(5 * FRICTION, 6)
  })

  it('dt capped at 50ms equivalent: dt = 50/16.667, friction = FRICTION^3', () => {
    // dt capping: the hook does Math.min(rawDt, 50) / 16.667 before passing to stepMomentum.
    // If stepMomentum itself caps dt at 50/16.667 ≈ 3.0, then at dt=10 (very large) the
    // friction used should be FRICTION^(50/16.667) ≈ FRICTION^3.
    // We verify that passing dt=10 gives same result as dt=50/16.667.
    const dtCapped = 50 / 16.667
    const dtBig = 100 / 16.667 // beyond cap

    const state: MomentumState = { pan: { x: 0, y: 0 }, velocity: { x: 10, y: 0 } }
    const bounds = infiniteBounds()

    const r1 = stepMomentum(state, dtCapped, bounds)
    const r2 = stepMomentum(state, dtBig, bounds)
    // If dt is capped inside stepMomentum, both results should be equal
    expect(r1.state.velocity.x).toBeCloseTo(r2.state.velocity.x, 6)
    expect(r1.state.pan.x).toBeCloseTo(r2.state.pan.x, 6)

    // Verify the cap value is exactly 50/16.667 (≈3.0). Catches mutations
    // like Math.min(dt, 30/16.667) where r1==r2 holds but the cap is wrong.
    const expectedFriction = Math.pow(FRICTION, 50 / 16.667)
    expect(r1.state.velocity.x).toBeCloseTo(10 * expectedFriction, 6)
  })

  it('shouldStop fires when |vx| + |vy| < STOP_THRESHOLD', () => {
    // velocity just below threshold
    const state: MomentumState = {
      pan: { x: 0, y: 0 },
      velocity: { x: 0.04, y: 0.04 }, // sum = 0.08 < 0.1
    }
    const { shouldStop } = stepMomentum(state, DT_ONE_FRAME, infiniteBounds())
    // After one friction step the velocity will be even smaller — definitely stopped
    expect(shouldStop).toBe(true)
  })

  it('shouldStop uses sum-of-magnitudes, not max — vx=vy=0.1 (sum > threshold) does NOT stop', () => {
    // Distinguishes the production sum semantics from a `Math.max(|vx|, |vy|)`
    // mutation. Inputs: vx=vy=0.1 → after friction = 0.075 each → sum=0.15 (>0.1)
    // but max=0.075 (<0.1). Production must NOT stop here; max-mutation would.
    const state: MomentumState = {
      pan: { x: 0, y: 0 },
      velocity: { x: 0.1, y: 0.1 },
    }
    const { shouldStop } = stepMomentum(state, DT_ONE_FRAME, infiniteBounds())
    expect(shouldStop).toBe(false)
  })
})

// ─── computePanStep ─────────────────────────────────────────────────────────

describe('computePanStep', () => {
  it('unclamped delta: pan moves by exactly (-dx, -dy)', () => {
    const pan = { x: 10, y: 20 }
    const delta: PanDelta = { dx: 5, dy: -3 }
    const bounds = infiniteBounds()
    const { pan: next, clampedX, clampedY } = computePanStep(pan, delta, bounds)

    expect(next.x).toBe(5)
    expect(next.y).toBe(23)
    expect(clampedX).toBe(false)
    expect(clampedY).toBe(false)
  })

  it('X-axis clamping: target beyond maxX → pan at maxX, clampedX=true', () => {
    const pan = { x: 90, y: 0 }
    const delta: PanDelta = { dx: -20, dy: 0 } // would make x=110, but maxX=100
    const bounds = tightBounds()
    const { pan: next, clampedX, clampedY } = computePanStep(pan, delta, bounds)

    expect(next.x).toBe(100)
    expect(clampedX).toBe(true)
    expect(clampedY).toBe(false)
  })

  it('Y-axis clamping: target beyond minY → pan at minY, clampedY=true', () => {
    const pan = { x: 0, y: -90 }
    const delta: PanDelta = { dx: 0, dy: 20 } // would make y=-110, but minY=-100
    const bounds = tightBounds()
    const { pan: next, clampedX, clampedY } = computePanStep(pan, delta, bounds)

    expect(next.y).toBe(-100)
    expect(clampedX).toBe(false)
    expect(clampedY).toBe(true)
  })

  it('both axes clamping simultaneously: both flags true', () => {
    const pan = { x: 90, y: -90 }
    const delta: PanDelta = { dx: -20, dy: 20 } // x→110 (>100), y→-110 (<-100)
    const bounds = tightBounds()
    const { pan: next, clampedX, clampedY } = computePanStep(pan, delta, bounds)

    expect(next.x).toBe(100)
    expect(next.y).toBe(-100)
    expect(clampedX).toBe(true)
    expect(clampedY).toBe(true)
  })

  it('zero delta: pan unchanged, both flags false', () => {
    const pan = { x: 42, y: -13 }
    const delta: PanDelta = { dx: 0, dy: 0 }
    const bounds = tightBounds()
    const { pan: next, clampedX, clampedY } = computePanStep(pan, delta, bounds)

    expect(next.x).toBe(42)
    expect(next.y).toBe(-13)
    expect(clampedX).toBe(false)
    expect(clampedY).toBe(false)
  })
})
