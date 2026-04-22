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
    kindUsed?: string
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
 * Implementation note: we reach into override-bus via the debug bridge.
 * The bridge currently exposes `overrideManager`; the bus itself is
 * module-scoped and private. We piggyback by monkey-patching
 * `emitDivergence` callers — specifically, the `CSSOverrideManager`
 * instance on the bridge — after listening via `onDivergence` isn't
 * possible from outside. For now we install a page-side subscriber via
 * a small hook script that finds the bus through the manager's module.
 *
 * For Task 3 specifically (override-divergence-card.spec.ts) we listen
 * through the DOM instead: EditErrorCard renders on divergence, and
 * asserting on DOM is what the spec is about. This helper is provided
 * for specs that need to assert on raw events (e.g., timing in Task 4).
 */
export async function collectDivergences(
  page: Page,
): Promise<{ events: OverrideDivergenceEvent[]; unsubscribe: () => Promise<void> }> {
  const events: OverrideDivergenceEvent[] = []

  await page.exposeFunction('__cortexCollectDivergence', (event: OverrideDivergenceEvent) => {
    events.push(event)
  })

  // Install a page-side hook that dispatches any `divergence` CustomEvent
  // fired on the window (bridge) to our collector. Task 2/3/4 specs are
  // free to re-dispatch bus events onto window if they need richer
  // payloads, or to extend the bridge later (ZF0-1298 may refactor).
  const hookHandle = await page.evaluateHandle(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail
      if (detail) {
        ;(globalThis as unknown as {
          __cortexCollectDivergence?: (d: unknown) => void
        }).__cortexCollectDivergence?.(detail)
      }
    }
    window.addEventListener('cortex-divergence', handler)
    return handler
  })

  return {
    events,
    unsubscribe: async () => {
      await page.evaluate((h) => {
        window.removeEventListener('cortex-divergence', h as EventListener)
      }, hookHandle)
      await hookHandle.dispose()
    },
  }
}
