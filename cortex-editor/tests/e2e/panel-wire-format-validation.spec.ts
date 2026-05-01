/**
 * Wire-format schema validation gate — e2e spec (ZF0-1501).
 *
 * Business purpose: the e2e harness injects server→browser messages via
 * `simulateServerMessage` and captures browser→server messages via
 * `installSendSpy`. Before T3, a spec could inject `{ type: 'staged-edits-acked' }`
 * (missing `requestId`) and silently pass — the schema drift would only surface
 * at runtime in a real browser session.
 *
 * These tests prove both halves of the gate added in ZF0-1501:
 *
 *   Test 1 — malformed injection throws:
 *     `simulateServerMessage` validates against `serverToBrowserSchema` BEFORE
 *     dispatching into the page. A message missing required fields (e.g.
 *     `requestId`) must cause the call to reject with `SchemaViolationError`,
 *     turning injector drift into an immediate test failure rather than silent passage.
 *
 *   Test 2 — valid fixture passes through:
 *     Loading a valid `staged-edits-acked` fixture via `loadWireFormatFixture`
 *     and injecting it via `simulateServerMessage` must NOT throw. The message
 *     must reach `handleServerMessage` in the page (confirmed by verifying the
 *     Apply button hides, which is the observable side-effect of a successful
 *     ack reaching the Panel).
 *
 *   Test 3 — assertSentMessagesValid rejects malformed captured messages:
 *     The helper is validated using a hand-crafted conformant message written
 *     directly into `window.__cortexSentMessages__` via page.evaluate. This
 *     avoids depending on the test channel's `token: undefined` behavior (the
 *     real channel stamps `capturedToken` from `window.__CORTEX_TOKEN__`, which
 *     is undefined in the e2e harness because there is no WS auth). The helper
 *     is for opt-in use in specs that construct messages manually.
 *
 * Boot sequence uses `bootWithSendSpy` — the same canonical compositor as
 * `panel-apply-lifecycle.spec.ts`. Tests are independent (each uses a fresh
 * page via Playwright's default per-test page isolation).
 */
import { test, expect } from '@playwright/test'
import { FIXTURE_SEED_SELECTOR, FIXTURE_SEED_SOURCE } from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  simulateServerMessage,
  loadWireFormatFixture,
  selectElement,
  stageEdit,
  clickApplyButton,
  getApplyButtonState,
  getSentMessages,
  assertSentMessagesValid,
} from './helpers/panel.js'

test.describe('Wire-format schema validation gate (ZF0-1501)', () => {
  test('malformed staged-edits-acked (missing requestId) — simulateServerMessage throws', async ({ page }) => {
    await bootWithSendSpy(page)

    // The message intentionally omits `requestId`, which is required by
    // serverToBrowserSchema for type 'staged-edits-acked'. simulateServerMessage
    // always throws SchemaViolationError on validation failure — e2e infrastructure
    // never silently warns, unlike the production parseOrFail (which warns in prod).
    await expect(
      simulateServerMessage(page, { type: 'staged-edits-acked' }),
    ).rejects.toThrow(/SCHEMA_VIOLATION|requestId/)
  })

  test('valid staged-edits-acked fixture passes validation and reaches handleServerMessage', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)

    // Stage an edit so the Apply button becomes visible, then click Apply so
    // the Panel enters the Delivering… state and listens for a `staged-edits-acked`
    // acknowledgement. This is the exact code path that processes the ack in
    // production — the fixture exercises real Panel state transitions, not just
    // message routing.
    const intentId = await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '32px')
    expect(typeof intentId).toBe('string')

    // Wait for Apply button to appear before clicking.
    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, disabled: false })

    const clicked = await clickApplyButton(page)
    expect(clicked).toBe(true)

    // Capture the requestId from the outbound staged-edits-ready message so we
    // can inject a matching ack. The ack must echo the same requestId or the
    // Panel's `matchesRequestId` check (channel.ts) will silently drop it.
    const messages = await getSentMessages(page)
    const readyMsg = messages.find(
      (m) => typeof m === 'object' && m !== null && (m as Record<string, unknown>).type === 'staged-edits-ready',
    ) as Record<string, unknown> | undefined
    expect(readyMsg).toBeDefined()
    const requestId = readyMsg!.requestId as string
    expect(typeof requestId).toBe('string')

    // Load the golden fixture and overwrite its requestId with the live one
    // from the session so the Panel's matchesRequestId check accepts it.
    // loadWireFormatFixture is the same helper used by T1 contract tests;
    // re-exporting it from panel.ts lets specs import it without reaching into
    // src/ directly.
    const ackFixture = loadWireFormatFixture('server-to-browser/staged-edits-acked.json') as Record<string, unknown>
    const validAck = { ...ackFixture, requestId }

    // simulateServerMessage validates `validAck` against serverToBrowserSchema
    // before dispatching. Must NOT throw — proves the gate doesn't block valid
    // messages from reaching handleServerMessage.
    await simulateServerMessage(page, validAck)

    // After a matching ack, Panel sets pendingClaude=true + setDelivering(false).
    // The Apply button hides (bufferSize > 0 but pendingClaude=true). This is the
    // observable side-effect proving the ack reached handleServerMessage and was
    // processed by the Panel state machine — not just that the function returned.
    await expect
      .poll(() => getApplyButtonState(page), { timeout: 2000 })
      .toMatchObject({ visible: false })
  })

  test('assertSentMessagesValid throws on malformed captured message, passes on conformant one', async ({ page }) => {
    await bootWithSendSpy(page)

    // Write a conformant browser→server message directly into the spy array.
    // The real channel stamps `token: capturedToken` from window.__CORTEX_TOKEN__,
    // which is undefined in e2e because there is no WS auth. Using page.evaluate
    // to write a complete conformant message bypasses that gap and lets us prove
    // the helper's validation logic independently of channel internals.
    await page.evaluate(() => {
      ;(globalThis as unknown as { __cortexSentMessages__?: unknown[] }).__cortexSentMessages__ = [
        {
          type: 'staged-edits-ready',
          count: 1,
          requestId: 'req-test-001',
          token: 'tok-test',
        },
      ]
    })

    // Valid message — assertSentMessagesValid must not throw.
    await expect(assertSentMessagesValid(page)).resolves.toBeUndefined()

    // Now overwrite with a malformed message (missing `requestId`).
    await page.evaluate(() => {
      ;(globalThis as unknown as { __cortexSentMessages__?: unknown[] }).__cortexSentMessages__ = [
        { type: 'staged-edits-ready', count: 1, token: 'tok-test' },
      ]
    })

    // assertSentMessagesValid must throw on the malformed entry.
    await expect(assertSentMessagesValid(page)).rejects.toThrow(/SCHEMA_VIOLATION|requestId/)
  })
})
