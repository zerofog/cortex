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
  /**
   * When true (the default), patch `Element.prototype.attachShadow` to
   * force open mode on `[data-cortex-host]` elements so Panel internals
   * are introspectable by Playwright. Set to `false` for specs that must
   * exercise a genuinely closed ShadowRoot — the patch defeats those tests
   * by converting the closed root to open before the spec can attach one.
   * Forwarded verbatim to `setupDebugBridge`. Default: true.
   */
  patchAttachShadow?: boolean
  /**
   * After the bundle boots, additionally wait for a specific kit to appear
   * on `window.__CORTEX_TEST__`. Useful for specs that exercise a test kit
   * (e.g. `'useOutsideDismissKit'`) that is populated asynchronously after
   * CortexApp mounts. The wait uses a 5 s ceiling — same as the
   * bundle-boot wait — and throws if the kit doesn't appear in time.
   */
  waitForKit?: 'useOutsideDismissKit'
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
  await setupDebugBridge(page, { patchAttachShadow: opts.patchAttachShadow })
  if (opts.activateDesignMode) await activateDesignMode(page)
  await installFixtureServer(page)
  await page.goto(FIXTURE_URL)
  // Bundle-boot wait: this is the FIRST wait to fire after navigation,
  // so its timeout is what users see on infra regression (bundle 404,
  // bundle threw on load, fixture served wrong content). Rewrap the
  // generic Playwright timeout with actionable triage — matches the
  // pattern in waitForBridge.
  try {
    await page.waitForFunction(
      () => typeof (globalThis as unknown as { CortexEditor?: unknown }).CortexEditor !== 'undefined',
      null,
      { timeout: 5000 },
    )
  } catch (err) {
    throw new Error(
      `[bootFixture] CortexEditor bundle did not boot within 5000ms. Likely causes:\n` +
        `  1. Bundle missing — run \`npm run build\` to produce dist/browser/index.js.\n` +
        `  2. Fixture server serving wrong content — check installFixtureServer routes.\n` +
        `  3. Bundle threw on load — check page.on('pageerror') output.\n` +
        `Page URL: ${page.url()}\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  await waitForBridge(page)
  if (opts.waitForKit) {
    const kit = opts.waitForKit
    try {
      await page.waitForFunction(
        (kitName: string) => {
          const t = (globalThis as unknown as { __CORTEX_TEST__?: Record<string, unknown> }).__CORTEX_TEST__
          return !!t?.[kitName]
        },
        kit,
        { timeout: 5000 },
      )
    } catch (err) {
      throw new Error(
        `[bootFixture] __CORTEX_TEST__.${kit} did not appear within 5000ms. Likely causes:\n` +
          `  1. Bundle built without CORTEX_TEST_BUILD=true env var (run \`npm run build:test\` — kit is DCE'd from prod bundles).\n` +
          `  2. Kit name drift — confirm CortexApp.tsx still assigns __CORTEX_TEST__.${kit}.\n` +
          `  3. __CORTEX_DEBUG_OVERRIDES__ not set before navigation — confirm setupDebugBridge ran pre-goto.\n` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
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
