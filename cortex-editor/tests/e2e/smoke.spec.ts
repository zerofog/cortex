/**
 * Foundation smoke test for the Playwright e2e harness.
 *
 * Business purpose: This spec does NOT test application behavior. It
 * validates that the test infrastructure itself is wired correctly —
 * the fixture HTML loads, route interception serves the IIFE bundle,
 * the bundle boots under Playwright, and the debug bridge
 * (`window.__CORTEX_TEST__`) exposes the handles that Tasks 2–4 will
 * need (`overrideManager` + `channel`). If this ever goes red, no
 * further e2e specs can be trusted.
 */
import { test, expect } from '@playwright/test'
import {
  installFixtureServer,
  FIXTURE_URL,
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
} from './helpers/fixture-server.js'
import { setupDebugBridge, waitForBridge, collectDivergences } from './helpers/bridge.js'

test.describe('harness smoke', () => {
  test('fixture loads, CortexEditor bundle boots, debug bridge exposes overrideManager + channel', async ({ page }) => {
    // Arm the debug flag + open Shadow DOM BEFORE navigation, then
    // install route interception for the synthetic fixture origin.
    await setupDebugBridge(page)
    await installFixtureServer(page)

    await page.goto(FIXTURE_URL)

    // The IIFE auto-bootstraps on DOMContentLoaded; wait for its globals.
    await page.waitForFunction(() => typeof (globalThis as any).CortexEditor !== 'undefined', null, { timeout: 5000 })

    // Debug bridge must come online once CortexApp mounts.
    await waitForBridge(page)

    // Shape check: the two handles Tasks 2–4 will import must be present.
    const bridgeShape = await page.evaluate(() => {
      const test = (globalThis as unknown as { __CORTEX_TEST__?: Record<string, unknown> }).__CORTEX_TEST__
      return {
        hasTest: !!test,
        hasOverrideManager: !!test?.overrideManager,
        hasChannel: !!test?.channel,
        hasSelectElement: typeof test?.selectElement === 'function',
      }
    })

    expect(bridgeShape).toEqual({
      hasTest: true,
      hasOverrideManager: true,
      hasChannel: true,
      hasSelectElement: true,
    })

    // Fixture seed element must exist — confirms our HTML reached the page.
    const seedHandle = page.locator(`${FIXTURE_SEED_SELECTOR}[data-cortex-source="${FIXTURE_SEED_SOURCE}"]`)
    await expect(seedHandle).toHaveCount(1)
  })

  test('divergence listener round-trip — forced server-mismatch reaches Node collector', async ({ page }) => {
    // Business purpose: this test fails the moment the divergence bridge
    // regresses — if `__CORTEX_TEST__.onDivergence` stops working, or the
    // Node-side collector stops receiving events, the round-trip assertion
    // breaks immediately. Without it the stub-to-real fix could silently
    // rot back into "events array always empty" (the original defect).
    await setupDebugBridge(page)
    await installFixtureServer(page)
    await page.goto(FIXTURE_URL)
    await page.waitForFunction(() => typeof (globalThis as any).CortexEditor !== 'undefined', null, { timeout: 5000 })
    await waitForBridge(page)

    const { events, unsubscribe } = await collectDivergences(page)

    // Force a server-mismatch divergence via the bridge:
    //   - set an override on the seed element
    //   - flush pending rebuild so the override is live
    //   - track the edit
    //   - call handleHMRVerified(..., false, ...) — the match=false path
    //     emits divergence immediately without the retry window
    //     (override.ts:624-631).
    await page.evaluate((source) => {
      const bridge = (globalThis as any).__CORTEX_TEST__
      const editId = 'smoke-divergence-1'
      bridge.overrideManager.set(source, 'padding-top', '99px')
      bridge.overrideManager.flush()
      bridge.overrideManager.trackPendingEdit(editId, source, 'padding-top', '99px')
      bridge.overrideManager.handleHMRVerified(editId, false, 'jsx-immediate')
    }, FIXTURE_SEED_SOURCE)

    await expect.poll(() => events.length, { timeout: 2000 }).toBeGreaterThan(0)
    expect(events[0]).toMatchObject({
      source: FIXTURE_SEED_SOURCE,
      property: 'padding-top',
      expected: '99px',
    })

    await unsubscribe()
  })
})
