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
import { installFixtureServer, FIXTURE_URL } from './helpers/fixture-server.js'
import { setupDebugBridge, waitForBridge } from './helpers/bridge.js'

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
    const seedHandle = page.locator('#center[data-cortex-source="fixture:1:1"]')
    await expect(seedHandle).toHaveCount(1)
  })
})
