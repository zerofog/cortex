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
 * Cross-reference: if `bootFixture` in boot.ts changes its boot sequence
 * (e.g. a new global it must set), this file stays in sync automatically
 * because it delegates to `bootFixture` with `patchAttachShadow: false`.
 */
import type { Page } from '@playwright/test'
import { bootFixture } from './boot.js'

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
  await bootFixture(page, {
    patchAttachShadow: false,
    waitForKit: 'useOutsideDismissKit',
    collectDivergences: false,
  })
  const patchActive = await page.evaluate(() => {
    const host = document.createElement('div')
    host.setAttribute('data-cortex-shadow-probe', '')
    document.body.appendChild(host)
    host.attachShadow({ mode: 'closed' })
    const leaked = host.shadowRoot !== null
    host.remove()
    return leaked
  })
  if (patchActive) {
    throw new Error(
      '[bootBundleWithClosedShadow] attachShadow patch is ACTIVE despite ' +
      'patchAttachShadow: false — closed-shadow specs cannot exercise ' +
      'real shadow retargeting. Check that BootFixtureOptions.patchAttachShadow ' +
      'still forwards to setupDebugBridge in helpers/boot.ts.',
    )
  }
}
