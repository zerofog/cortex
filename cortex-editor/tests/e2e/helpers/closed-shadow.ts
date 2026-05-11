/**
 * Boot helper for specs that need a genuinely closed ShadowRoot.
 *
 * Business purpose: `setupDebugBridge` in `bridge.ts` patches `attachShadow`
 * to force open mode so Panel DOM is introspectable by Playwright. That patch
 * is load-bearing for Panel-asserting specs but DEFEATS any test that needs to
 * exercise closed-shadow event retargeting (ZF0-1560). This helper boots the
 * IIFE bundle WITHOUT the attachShadow override — it arms only the debug flag
 * and the send stub, leaving any `attachShadow({ mode: 'closed' })` call
 * genuinely closed.
 *
 * Cross-reference: if `setupDebugBridge` in bridge.ts changes its boot
 * sequence (e.g. a new global it must set), audit this file for parity.
 */
import type { Page } from '@playwright/test'
import { assertPreNavigation } from './bridge.js'
import { installFixtureServer, FIXTURE_URL } from './fixture-server.js'

/**
 * Boots the IIFE bundle WITHOUT patching attachShadow. Use this for any
 * spec that genuinely needs closed-shadow behavior — the standard
 * setupDebugBridge in bridge.ts patches attachShadow to force open mode
 * so Panel DOM is introspectable, which defeats closed-shadow tests.
 *
 * This helper only arms the bridge debug flag and stubs __cortex_send__;
 * it does NOT touch attachShadow.
 */
export async function bootBundleWithClosedShadow(page: Page): Promise<void> {
  assertPreNavigation(page, 'bootBundleWithClosedShadow')
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
    ;(globalThis as unknown as { __cortex_send__?: (msg: unknown) => void }).__cortex_send__ = () => { /* no-op */ }
  })
  await installFixtureServer(page)
  await page.goto(FIXTURE_URL)
  await page.waitForFunction(
    () => typeof (globalThis as unknown as { CortexEditor?: unknown }).CortexEditor !== 'undefined',
    null,
    { timeout: 5000 },
  )
  await page.waitForFunction(
    () => {
      const t = (globalThis as unknown as { __CORTEX_TEST__?: { useOutsideDismissKit?: unknown } }).__CORTEX_TEST__
      return !!t?.useOutsideDismissKit
    },
    null,
    { timeout: 5000 },
  )
}
