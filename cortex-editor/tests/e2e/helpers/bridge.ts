/**
 * Debug-bridge helpers for Playwright specs.
 *
 * Business purpose: the override lifecycle under test (ZF0-1235 class of
 * bugs) lives inside a closed Shadow DOM, with event listeners gated on
 * `window.__CORTEX_DEBUG_OVERRIDES__`. These helpers encapsulate the
 * two tricks every spec needs:
 *
 *   1. Set the debug flag AND force `attachShadow({ mode: 'open' })`
 *      BEFORE the IIFE runs, so Panel internals are inspectable.
 *   2. Wait for `window.__CORTEX_TEST__` (the bridge CortexApp exposes
 *      when the debug flag is set) — event-based wait, never a
 *      `waitForTimeout`.
 *
 * Divergence collection (step 3) hooks `onDivergence` from the page-side
 * override-bus via an exposed Node-side collector, so specs can assert on
 * the same events the Panel surfaces as EditErrorCards in Task 3.
 */
import type { Page } from '@playwright/test'

// Shape mirrors `OverrideDivergence` in src/browser/override-bus.ts.
// Duplicated intentionally — specs live outside the package's rootDir
// and can't import internals without dragging the JSX toolchain in.
// If the production shape changes in a way that matters to tests, this
// interface should move with it.
export interface OverrideDivergenceEvent {
  source: string
  property: string
  expected: string
  actual: string
  pseudo?: '::before' | '::after'
  diagnostics: {
    actualReadFrom: 'inline-style' | 'computed-style' | 'server-mismatch'
    kindUsed?: 'immediate' | 'jsx-immediate' | 'deferred'
    priorValues: readonly string[]
    retryDurationMs?: number
    errorMessage?: string
  }
}

/**
 * Arm the debug bridge and force open Shadow DOM. MUST be called before
 * `page.goto` — `addInitScript` only fires on subsequent navigations.
 *
 * The open-shadow patch is load-bearing: CortexApp does
 * `attachShadow({ mode: 'closed' })` by default, which makes Panel DOM
 * inaccessible from Playwright. Overriding `mode` at the prototype level
 * is the only reliable way; the hack is documented in the ZF0-1235 live
 * repros that this harness replaces.
 */
export async function setupDebugBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true

    // Patch attachShadow so the Cortex host's closed root becomes open.
    // Applies to EVERY attachShadow call — benign for other hosts in
    // tests, and the fixture has none.
    const original = Element.prototype.attachShadow
    Element.prototype.attachShadow = function patchedAttachShadow(init: ShadowRootInit) {
      return original.call(this, { ...init, mode: 'open' })
    }
  })
}

/**
 * Wait for `window.__CORTEX_TEST__` to exist — i.e., CortexApp has
 * mounted and seen the debug flag. Event-based only (no
 * `waitForTimeout`); raises if the bridge doesn't show up within the
 * timeout, which is almost always a bundle/boot failure.
 */
export async function waitForBridge(page: Page, timeoutMs: number = 5000): Promise<void> {
  await page.waitForFunction(
    () => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__?: Record<string, unknown> }).__CORTEX_TEST__
      return !!bridge && !!bridge.overrideManager && !!bridge.channel
    },
    null,
    { timeout: timeoutMs },
  )
}

/**
 * Subscribe (Node-side) to divergence events emitted by the page's
 * override-bus. Returns `{ events, unsubscribe }`.
 *
 * `events` is a shared array — the `exposeFunction` callback pushes to
 * it as divergences fire in the page. Specs read it synchronously after
 * triggering an override; if they need to await the first event, use
 * `expect.poll(() => events.length).toBeGreaterThan(0)` (event-based,
 * no fixed timeout).
 *
 * Implementation: the debug bridge exposes `onDivergence` — a direct
 * reference to `override-bus.ts`'s module-scoped subscriber. We call it
 * from a `page.evaluate` block (AFTER `waitForBridge` has resolved —
 * `addInitScript` would run too early, before CortexApp has mounted)
 * and forward each event through `page.exposeFunction` into Node. The
 * returned `unsubscribe` calls the real teardown closure to detach the
 * listener before releasing handles.
 *
 * Constraint: ONE collector per Page. Calling this helper twice on the
 * same `page` throws — Playwright's `exposeFunction` rejects duplicate
 * names, and a shared unsubscribe slot on `window` would let the second
 * call silently clobber the first. If a spec needs nested collection,
 * call `unsubscribe()` first or factor assertions into separate `test()`
 * blocks (each gets a fresh Page).
 */
export async function collectDivergences(
  page: Page,
): Promise<{ events: OverrideDivergenceEvent[]; unsubscribe: () => Promise<void> }> {
  const events: OverrideDivergenceEvent[] = []

  await page.exposeFunction('__cortexOnDivergence', (event: OverrideDivergenceEvent) => {
    events.push(event)
  })

  // Wire the page-side subscriber. Must run after CortexApp has mounted
  // (waitForBridge should have resolved before calling this helper) —
  // only then is `__CORTEX_TEST__.onDivergence` present. We stash the
  // unsubscribe closure on `window` so the teardown path below can reach
  // it without serializing a function across the evaluate boundary.
  await page.evaluate(() => {
    // Loud fail on double-call: the unsub slot is single-tenant. Without
    // this guard a second caller would replace the first's unsubscribe
    // closure, and the first's `unsubscribe()` would silently tear down
    // the second's listener — nightmare to debug.
    if ((globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub) {
      throw new Error('[bridge] collectDivergences already active on this page — call unsubscribe() before starting another collector')
    }
    const bridge = (globalThis as unknown as {
      __CORTEX_TEST__?: { onDivergence?: (cb: (d: unknown) => void) => () => void }
    }).__CORTEX_TEST__
    if (!bridge?.onDivergence) {
      throw new Error('[bridge] __CORTEX_TEST__.onDivergence not present — is the debug flag set and CortexApp mounted?')
    }
    const forward = (globalThis as unknown as {
      __cortexOnDivergence?: (d: unknown) => void
    }).__cortexOnDivergence
    if (!forward) {
      throw new Error('[bridge] __cortexOnDivergence not exposed — exposeFunction must run first')
    }
    const unsub = bridge.onDivergence((d) => forward(d))
    ;(globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub = unsub
  })

  return {
    events,
    unsubscribe: async () => {
      await page.evaluate(() => {
        const unsub = (globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub
        unsub?.()
        delete (globalThis as unknown as { __cortexDivergenceUnsub?: () => void }).__cortexDivergenceUnsub
      })
    },
  }
}
