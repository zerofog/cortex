/**
 * Activation parity matrix — pins the user-facing contract that every entry
 * point produces identical observable state. If any future change breaks
 * any of these invariants for any entry point, this test fails — that's its
 * only job.
 *
 * Five entry points under test:
 * 1. keyboard-toggle — cmd+shift+. shortcut (browser-side; harness injects the
 *    cortex/set-active message the keyboard handler sends)
 * 2. mcp-activate — cortex_activate MCP tool
 * 3. mcp-deactivate — cortex_deactivate MCP tool
 * 4. esc-key — Escape key inside the Cortex panel (SKIPPED: requires real
 *    shadow-root focus, not available in Node)
 * 5. close-button — panel close button click (SKIPPED: requires Preact component
 *    mounted in DOM, not available in Node)
 *
 * Four observable axes per entry point:
 * - server.activeState.editorActive — server-owned activation state machine
 * - browser.reducerState.active — cortexAppReducer tracks server broadcasts
 * - cortex/active-changed broadcast was emitted with the expected value
 * - data-cortex-active on <html> (simulated; see harness comment for why)
 *
 * // TODO: requires real CSSOM/focus — esc-key and close-button need real
 * // shadow-root focus handling and Preact component mount that is not available
 * // in the Node integration test environment. These paths are covered by manual
 * // QA and should be added to an e2e browser test suite when one exists.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupParityHarness, type ParityHarness } from './activation-parity-harness.js'

const ENTRY_POINTS = [
  'keyboard-toggle',
  'mcp-activate',
  'mcp-deactivate',
  'esc-key',
  'close-button',
] as const

/**
 * Expected activation outcome for each entry point.
 * keyboard-toggle and mcp-activate converge on active=true (starting from
 * the harness's default inactive state).
 * mcp-deactivate, esc-key, and close-button converge on active=false
 * (the test calls activateAsBaseline() first for these).
 */
const EXPECTED_ACTIVE: Record<(typeof ENTRY_POINTS)[number], boolean> = {
  'keyboard-toggle': true,
  'mcp-activate': true,
  'mcp-deactivate': false,
  'esc-key': false,
  'close-button': false,
}

describe('activation parity matrix — all entry points produce identical observable state', () => {
  let harness: ParityHarness

  beforeEach(async () => {
    harness = await setupParityHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  describe.each(ENTRY_POINTS)('entry point: %s', (entry) => {
    const expectedActive = EXPECTED_ACTIVE[entry]

    // esc-key and close-button require shadow-root focus and Preact component
    // mount that cannot be done in the Node integration environment.
    // // TODO: requires real CSSOM/focus — promote to e2e test when browser
    // // automation suite exists (playwright or similar).
    const itOrSkip = (entry === 'esc-key' || entry === 'close-button') ? it.skip : it

    itOrSkip('server.editorActive matches expected', async () => {
      if (!expectedActive) await harness.activateAsBaseline()
      await harness.fireEntryPoint(entry)
      expect(harness.server.activeState.editorActive).toBe(expectedActive)
    })

    itOrSkip('browser reducer state matches expected', async () => {
      if (!expectedActive) await harness.activateAsBaseline()
      await harness.fireEntryPoint(entry)
      expect(harness.browser.reducerState.active).toBe(expectedActive)
    })

    itOrSkip('cortex/active-changed broadcast emitted with expected value', async () => {
      if (!expectedActive) await harness.activateAsBaseline()
      harness.broadcasts.length = 0
      await harness.fireEntryPoint(entry)
      const broadcast = harness.broadcasts.find((b) => b.type === 'cortex/active-changed')
      expect(broadcast).toBeDefined()
      expect(broadcast?.active).toBe(expectedActive)
    })

    itOrSkip('data-cortex-active on <html> matches expected', async () => {
      if (!expectedActive) await harness.activateAsBaseline()
      await harness.fireEntryPoint(entry)
      const hasAttr = harness.browser.documentElement.hasAttribute('data-cortex-active')
      expect(hasAttr).toBe(expectedActive)
    })
  })
})
