/**
 * Standard e2e bootstrap orchestrator.
 *
 * Business purpose: all four specs under `tests/e2e/` converged on the
 * same 5-line arm sequence before asserting anything — bridge debug
 * flag, optional design-mode activation, fixture route interception,
 * navigation, bundle-boot wait, bridge-ready wait, optional element
 * select, optional divergence collector. Copy-paste between specs was
 * the #1 source of drift in the Step 5 /simplify review; centralizing
 * here means a new spec is one line and any future bootstrap change
 * (e.g. ZF0-1298 env-gated debug flag) happens in one place.
 *
 * This helper sits above `bridge.ts` + `fixture-server.ts` as an
 * orchestrator — both remain importable as primitives for specs that
 * need finer-grained control (e.g. asserting bundle-boot failure
 * handling).
 */
import type { Page } from '@playwright/test'
import {
  setupDebugBridge,
  activateDesignMode,
  waitForBridge,
  collectDivergences,
  type DivergenceCollector,
  type CortexTestBridge,
} from './bridge.js'
import { installFixtureServer, FIXTURE_URL } from './fixture-server.js'

export interface BootFixtureOptions {
  /** Set `data-cortex-active` before boot so Panel renders. Default: false.
   *  Omit for specs that only assert on bus events; set true for any spec
   *  that reaches into the Panel's Shadow DOM (EditErrorCard, Panel UI). */
  activateDesignMode?: boolean
  /** CSS selector to resolve + hand to `bridge.selectElement()` after
   *  boot completes. Matches the divergence-card spec's pattern where
   *  the Panel only renders EditErrorCard when the selected element's
   *  `data-cortex-source` matches the divergence event. Default: none. */
  selectElement?: string
  /** Install a Node-side divergence collector. Default: true.
   *  Set to false for specs that don't care about divergence events
   *  (rare — most override-lifecycle specs need it). */
  collectDivergences?: boolean
}

/**
 * Standard e2e bootstrap: arms the debug bridge, optionally activates
 * design mode, installs route interception, navigates to the fixture,
 * and waits for bundle boot + bridge online. Returns a ready-to-use
 * divergence collector (or `null` if `collectDivergences: false`).
 *
 * Canonical call pattern:
 * ```ts
 * const { events, unsubscribe } = (await bootFixture(page, {
 *   activateDesignMode: true,
 *   selectElement: FIXTURE_SEED_SELECTOR,
 * }))!
 * ```
 */
export async function bootFixture(
  page: Page,
  opts: BootFixtureOptions = {},
): Promise<DivergenceCollector | null> {
  await setupDebugBridge(page)
  if (opts.activateDesignMode) await activateDesignMode(page)
  await installFixtureServer(page)
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { CortexEditor?: unknown }).CortexEditor !== 'undefined',
    null,
    { timeout: 5000 },
  )
  await waitForBridge(page)
  if (opts.selectElement) {
    await page.evaluate((selector) => {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) throw new Error(`[bootFixture] selectElement: ${selector} not found`)
      const bridge = (globalThis as unknown as { __CORTEX_TEST__?: CortexTestBridge }).__CORTEX_TEST__
      if (!bridge?.selectElement) throw new Error('[bootFixture] __CORTEX_TEST__.selectElement not present')
      bridge.selectElement(el)
    }, opts.selectElement)
  }
  return opts.collectDivergences !== false ? await collectDivergences(page) : null
}
