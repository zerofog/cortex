/**
 * Apply button 5-state machine — lifecycle + error-path e2e spec.
 *
 * Business purpose: ZF0-1453 shipped the Apply button + its 5-state machine
 * (hidden → Apply(N) → Delivering… → hidden[pendingClaude] → hidden[buffer=0]).
 * Two post-ship bugs were found only through manual verification:
 *   1. `staged-edits-discard` arriving from the server didn't trigger a Panel
 *      re-render (useEditStagingBuffer useRef-only state, no re-render trigger).
 *   2. Apply button reappearing as `Apply (N)` immediately after `sendAndAck`
 *      resolved (spec violation: "Hidden after success").
 *
 * These tests catch both regressions automatically by driving the full
 * lifecycle through the debug bridge — staging edits, clicking Apply,
 * injecting server ack/discard messages, and verifying each state
 * transition. They also cover the error path where `sendAndAck` rejects,
 * ensuring the button returns to the Apply(N) state and the error banner
 * appears.
 *
 * Staging edits: the Apply button shows when Panel's staging buffer is
 * non-empty. The buffer is populated via `bridge.stageEdit()` — a TEST-ONLY
 * bridge method (gated by __CORTEX_TEST_BUILD__) that calls `buffer.append()`
 * directly inside Panel.tsx without going through the scrub UI. This was
 * added as part of ZF0-1473 sub-B to enable deterministic Apply lifecycle
 * specs.
 *
 * Why not `bootFixture`: `installSendSpy` MUST be called AFTER
 * `setupDebugBridge` and BEFORE `page.goto`. The `bootFixture` orchestrator
 * calls `page.goto` internally, which makes the spy-before-goto ordering
 * impossible when using the convenience helper. These specs therefore use the
 * shared `bootWithSendSpy` helper from `helpers/panel.ts`, which composes the
 * canonical boot order with the spy registered before navigation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 1 (happy-path lifecycle)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: in `PanelHeader.tsx`, temporarily removed the
 *   `setPendingClaude(true)` call from the `.then()` success branch
 *   (around line 154-155 of the original; the `if (mountedRef.current)`
 *   block that sets both `setDelivering(false)` and `setPendingClaude(true)`
 *   — only `setPendingClaude(true)` was removed, leaving `setDelivering(false)`
 *   intact). Rebuilt with `npm run build:test`, re-ran this spec.
 *
 *   Observed failure:
 *     - Step 5 (ack injection → button hides) FAILED: after
 *       `simulateServerMessage(staged-edits-acked)`, the poll for
 *       `{ visible: false }` timed out. The button stayed visible as
 *       `Apply (1)` because without `setPendingClaude(true)` there was
 *       nothing blocking the `bufferSize > 0 && !pendingClaude` condition
 *       in PanelHeader.tsx:263. The test directly caught the regression
 *       that the `pendingClaude` gate exists to prevent.
 *     - Steps 6–7 also FAILED (downstream of step 5's unresolved state).
 *
 *   Revert: restored `PanelHeader.tsx`, rebuilt with `npm run build:test`,
 *   re-ran. All 2 cases green.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 2 (error path)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: in `Panel.tsx`, temporarily replaced `handleApplyError`'s
 *   body with a no-op:
 *     `const handleApplyError = useCallback((_err: unknown) => {}, [])`
 *   Rebuilt with `npm run build:test`, re-ran this spec.
 *
 *   Observed failure:
 *     - Step 3 (error banner visible) FAILED: after `clickApplyButton`,
 *       the poll for `{ visible: true, message: <contains 'test-rejection'> }`
 *       on `getApplyErrorBannerState` timed out — the banner never appeared
 *       because `setApplyError` was never called. This proves the test
 *       directly exercises the `handleApplyError → setApplyError` path in
 *       Panel.tsx, not an incidental side-effect.
 *
 *   Revert: restored `Panel.tsx`, rebuilt with `npm run build:test`,
 *   re-ran. All 2 cases green.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from '@playwright/test'
import {
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
  FIXTURE_SECONDARY_SOURCE,
} from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  getSentMessages,
  simulateServerMessage,
  getApplyButtonState,
  clickApplyButton,
  getApplyErrorBannerState,
  dismissApplyErrorBanner,
  selectElement,
  stageEdit,
} from './helpers/panel.js'

test.describe('Apply button 5-state machine (ZF0-1453 regression cover)', () => {
  test('happy-path lifecycle: hidden → Apply(1) → Delivering… → hidden[ack] → hidden[discard] → Apply(1)[new edit]', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)

    // ── Step 1: empty buffer → button hidden ─────────────────────────────
    const initial = await getApplyButtonState(page)
    expect(initial).toMatchObject({ visible: false })

    // ── Step 2: stage an edit → Apply (1) ────────────────────────────────
    // bridge.stageEdit calls buffer.append directly in Panel.tsx — the TEST-ONLY
    // path for seeding the staging buffer without going through the scrub UI.
    // Returns the intentId so we can drain the buffer via staged-edits-discard.
    const intentId = await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '32px')
    expect(typeof intentId).toBe('string')
    expect(intentId.length).toBeGreaterThan(0)

    // Buffer mutation is synchronous but React renders asynchronously —
    // poll rather than read once.
    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, label: 'Apply (1)', disabled: false, ariaBusy: false })

    // ── Step 3: click Apply → Delivering… ────────────────────────────────
    const clicked = await clickApplyButton(page)
    expect(clicked).toBe(true)

    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, label: 'Delivering…', disabled: true, ariaBusy: true })

    // ── Step 4: read outbound message, capture requestId ─────────────────
    // sendAndAck stamps a requestId — use it to inject the ack so
    // matchesRequestId (channel.ts:34) accepts the server message.
    const messages = await getSentMessages(page)
    const readyMsg = messages.find(
      (m) => typeof m === 'object' && m !== null && (m as Record<string, unknown>).type === 'staged-edits-ready',
    ) as Record<string, unknown> | undefined

    expect(readyMsg).toBeDefined()
    expect(typeof readyMsg!.requestId).toBe('string')
    const requestId = readyMsg!.requestId as string
    expect(requestId.length).toBeGreaterThan(0)

    // ── Step 5: inject ack → button hides (pendingClaude=true) ───────────
    // sendAndAck's onMessage handler resolves the Promise on requestId match,
    // which calls the PanelHeader .then() success branch that runs
    // setDelivering(false) + setPendingClaude(true). The pendingClaude gate
    // at PanelHeader.tsx:263 (`bufferSize > 0 && !pendingClaude`) then
    // evaluates false → button unmounts.
    await simulateServerMessage(page, { type: 'staged-edits-acked', requestId })

    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: false })

    // ── Step 6: inject discard → buffer drains, pendingClaude resets ─────
    // staged-edits-discard triggers buffer.remove([intentId]) in Panel.tsx:315-317.
    // When bufferSize → 0, PanelHeader's useEffect (lines 129-131) runs:
    //   if (bufferSize === 0 && pendingClaude) setPendingClaude(false)
    // Button stays hidden because bufferSize === 0 is the primary gate.
    await simulateServerMessage(page, { type: 'staged-edits-discard', intentIds: [intentId] })

    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: false })

    // ── Step 7: stage NEW edit on secondary source → button reappears ─────
    // This proves pendingClaude was properly reset: if it stayed true, the
    // `!pendingClaude` gate would keep the button hidden even though bufferSize > 0.
    await stageEdit(page, FIXTURE_SECONDARY_SOURCE, 'padding-top', '16px')

    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, label: 'Apply (1)', disabled: false, ariaBusy: false })
  })

  test('error path: sendAndAck rejection → button returns to Apply(N), error banner shows, dismiss works', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)

    // ── Stage edit → Apply (1) ────────────────────────────────────────────
    await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '24px')

    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, label: 'Apply (1)', disabled: false })

    // ── Monkey-patch sendAndAck to reject BEFORE clicking ─────────────────
    // channel is a plain object literal (createViteChannel returns a non-frozen
    // object — channel.ts:152-190). `sendAndAck` IS writable per architecture
    // constraints (plans/2026-04-30-zf0-1473-panel-ui-e2e-tests.md §Architecture
    // Constraints). Panel.tsx calls `channel.sendAndAck(...)` which dispatches
    // through the property look-up at call time — monkey-patching the property
    // replaces the dispatch target for subsequent calls.
    //
    // Note: the bridge exposes `channel` as the live CortexChannel object (not a copy),
    // so patching bridge.channel.sendAndAck replaces the same reference Panel.tsx holds.
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as {
        __CORTEX_TEST__?: { channel?: Record<string, unknown> }
      }).__CORTEX_TEST__
      if (!bridge?.channel) throw new Error('[test] bridge.channel not present')
      ;(bridge.channel as Record<string, unknown>)['sendAndAck'] = (): Promise<never> =>
        Promise.reject(new Error('test-rejection'))
    })

    // ── Click Apply → wait for error state ───────────────────────────────
    // The rejection flows through PanelHeader's .then(_, onError) branch
    // (lines 158-163): setDelivering(false) + onApplyError(err). Panel.tsx's
    // handleApplyError calls setApplyError(err.message) which renders the banner.
    const clicked = await clickApplyButton(page)
    expect(clicked).toBe(true)

    // ── Assert error banner visible with rejection message ────────────────
    // ZF0-1473 PR #93 Copilot feedback: collapse the redundant re-read into
    // the poll matcher. Single assertion site, less cross-process page
    // evaluation, cleaner intent.
    await expect
      .poll(() => getApplyErrorBannerState(page), { timeout: 3000 })
      .toMatchObject({
        visible: true,
        message: expect.stringContaining('test-rejection'),
      })

    // ── Assert button returned to Apply (1) ───────────────────────────────
    // On the reject path: setDelivering(false) runs, pendingClaude stays false
    // (per PanelHeader.tsx:158-163, the error branch does NOT call setPendingClaude).
    // Buffer still has the edit. So bufferSize > 0 && !pendingClaude → visible.
    const buttonAfterError = await getApplyButtonState(page)
    expect(buttonAfterError).toMatchObject({
      visible: true,
      label: 'Apply (1)',
      disabled: false,
      ariaBusy: false,
    })

    // ── Dismiss error banner ──────────────────────────────────────────────
    const dismissed = await dismissApplyErrorBanner(page)
    expect(dismissed).toBe(true)

    await expect
      .poll(() => getApplyErrorBannerState(page), { timeout: 2000 })
      .toMatchObject({ visible: false })
  })
})
