/**
 * StagingDriftBanner — intent drift + stale override e2e spec.
 *
 * Business purpose: ZF0-1453 shipped the StagingDriftBanner driven by two
 * independent signals:
 *
 *   1. `intentDriftCount` — Panel's buffer.reconcile() detects that a staged
 *      edit's `previousValue` no longer matches the live DOM after an HMR event.
 *      The banner shows how many staged edits may be affected by external source
 *      changes and lets the designer Refresh or Dismiss.
 *
 *   2. `staleOverrideCount` — CSSOverrideManager.onStale() fires when an applied
 *      override has not been hmr_verified within the TTL. The banner shows how
 *      many edits saved but where HMR didn't confirm application.
 *
 * ZF0-1474 Item #5 added the "strict-increase re-shows" logic in
 * StagingDriftBanner.tsx:29-35: dismissing the banner stores the current count;
 * the banner reappears only if the count STRICTLY increases (not if it drops or
 * stays the same). This prevents a dismissed banner from reappearing during
 * recovery (count decreasing) while still alerting on new divergence events.
 *
 * These tests prove:
 *   - Test 1: intentDriftCount → banner visible → dismiss → count 1→2 re-shows
 *   - Test 2: _testOnly_evictStale → staleCount banner visible
 *
 * Boot sequence uses the shared `bootWithSendSpy` helper from `helpers/panel.ts`
 * (also consumed by panel-apply-lifecycle.spec.ts) because `installSendSpy` must
 * be called AFTER `setupDebugBridge` and BEFORE `page.goto`. The convenience
 * `bootFixture` helper calls `page.goto` internally, making that ordering
 * impossible — hence the dedicated send-spy boot composer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 1 (intent drift detected, dismiss, strict-increase re-shows)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: in Panel.tsx, temporarily replaced the reconcile effect body
 *   (lines 382-388) with a no-op that calls setIntentDriftCount(0) regardless:
 *     useEffect(() => { setIntentDriftCount(0) }, [hmrEventVersion, buffer.version])
 *   Rebuilt with `npm run build:test`, re-ran this spec.
 *
 *   Observed failure:
 *     - Step 6 (banner visible with intentCount: 1) FAILED: after
 *       simulateServerMessage({ type: 'hmr-applied', files: ['fixture'] }), the
 *       poll for { visible: true, intentCount: 1 } timed out with 2000ms.
 *       getDriftBannerState returned { visible: false, intentCount: 0, staleCount: 0 }
 *       because setIntentDriftCount(0) never raised the count above 0, so
 *       StagingDriftBanner.tsx:40 short-circuited to null on every render.
 *       The test directly catches the regression that buffer.reconcile()
 *       drives the banner.
 *     - Steps 7–11 also FAILED (downstream of step 6's unresolved state).
 *
 *   Revert: restored Panel.tsx, rebuilt with `npm run build:test`, re-ran.
 *   All 2 cases green.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FALSIFIABILITY PROOF — Test 2 (stale override increment shows banner)
 * Performed 2026-04-30 per CLAUDE.md Test Anti-Patterns §2 + README.
 *
 *   Mutation: in CortexApp.tsx, temporarily neutered the _testOnly_evictStale
 *   closure body to a no-op (the entire staleEntries.add + conditional emitStale
 *   block was replaced with `// no-op`), rebuilt with `npm run build:test`,
 *   re-ran this spec.
 *
 *   Observed failure:
 *     - Step 5 (banner visible with staleCount >= 1) FAILED: after
 *       page.evaluate([...bridge.overrideManager._testOnly_evictStale(...)]),
 *       the poll for { visible: true, staleCount: ... } timed out with 2000ms.
 *       getDriftBannerState returned { visible: false, staleCount: 0 } because
 *       the no-op never added to staleEntries and never called emitStale(),
 *       so overrideManager.onStale never fired and CortexApp's
 *       setStaleOverrideCount stayed at 0. The test directly catches the
 *       regression that _testOnly_evictStale drives the banner.
 *
 *   Revert: restored CortexApp.tsx, rebuilt with `npm run build:test`, re-ran.
 *   All 2 cases green.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from '@playwright/test'
import { type CortexTestBridge } from './helpers/bridge.js'
import {
  FIXTURE_SEED_SELECTOR,
  FIXTURE_SEED_SOURCE,
  FIXTURE_SECONDARY_SELECTOR,
  FIXTURE_SECONDARY_SOURCE,
} from './helpers/fixture-server.js'
import {
  bootWithSendSpy,
  simulateServerMessage,
  getDriftBannerState,
  dismissDriftBanner,
  selectElement,
  waitForElementStatePanel,
  stageEdit,
} from './helpers/panel.js'

test.describe('StagingDriftBanner (ZF0-1453 / ZF0-1474 regression cover)', () => {
  test('intent drift detected, dismiss, strict-increase re-shows banner', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    // Wait for Panel to commit the element-state branch before proceeding.
    // See `waitForElementStatePanel` JSDoc for the full explanation of why
    // this is necessary to prevent a null-state vs element-state banner race.
    await waitForElementStatePanel(page)

    // ── Step 1: empty buffer → banner hidden ─────────────────────────────────
    // Baseline: no staged edits, no drift signal — banner must be absent.
    const initial = await getDriftBannerState(page)
    expect(initial).toMatchObject({ visible: false, intentCount: 0, staleCount: 0 })

    // ── Step 2: stage an edit on #center ─────────────────────────────────────
    // bridge.stageEdit appends a PendingEdit with previousValue: '' (Panel.tsx:746).
    // After hmr-applied, reconcile compares live computed value vs ''. Since
    // #center has padding-top: 10px inline, any non-empty value ≠ '' → divergent.
    await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '32px')

    // ── Step 3: mutate live DOM to ensure divergence is observable ────────────
    // This simulates an external source edit landing that changed padding-top to
    // something different from our staged previousValue. The DOM mutation is not
    // strictly required (previousValue '' already diverges from live '10px'), but
    // it documents the production scenario: external HMR changed the source file
    // and the live DOM now reflects a different value than when we staged.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('#center')!
      el.style.paddingTop = '999px'
    })

    // ── Step 4: inject hmr-applied signal ────────────────────────────────────
    // This triggers CortexApp's handler (CortexApp.tsx:433) which:
    //   1. Bumps hmrEventVersion (always-bump counter)
    //   2. Sets hmrChangedFiles to ['fixture']
    // Panel's reconcile effect dep [hmrEventVersion, buffer.version] then fires
    // buffer.reconcile(['fixture'], readSourceValue) → result.divergent.length=1
    // → setIntentDriftCount(1) → StagingDriftBanner renders.
    await simulateServerMessage(page, { type: 'hmr-applied', files: ['fixture'] })

    // ── Step 5: assert banner visible with intentCount: 1 ────────────────────
    await expect
      .poll(() => getDriftBannerState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, intentCount: 1, dismissAvailable: true })

    // ── Step 6: dismiss the banner ───────────────────────────────────────────
    // StagingDriftBanner.tsx:42-45: handleDismiss sets dismissed=true → banner
    // unmounts on next render. prevIntentRef retains the dismissed-at count (1).
    //
    // StagingDriftBanner uses useLayoutEffect (not useEffect) for the strict-
    // increase ref update. useLayoutEffect fires synchronously after DOM commit,
    // before paint — so prevIntentRef.current is guaranteed to equal 1 before
    // Playwright can observe `visible: true`. Without this, a race exists:
    // Playwright sees visible=true, clicks dismiss, but prevIntentRef is still 0
    // because the async useEffect hadn't fired yet. The useEffect then fires later
    // and calls setDismissed(false) (1 > 0), causing the dismissed banner to
    // reappear. useLayoutEffect eliminates this window entirely.
    const dismissed = await dismissDriftBanner(page)
    expect(dismissed).toBe(true)

    // ZF0-1473 PR #93 Cubic feedback: absence assertions use `toPass`, NOT
    // `expect.poll(...).toMatchObject({ visible: false })`. The poll variant
    // returns on the first frame where visible=false (which is immediate
    // after dismiss), then proceeds — but a re-show racing in afterward would
    // be silently missed. `toPass` re-asserts for the full timeout budget,
    // failing immediately if `visible` flips back to true. See
    // tests/e2e/README.md "Four tripwires" §3.
    await expect(async () => {
      const state = await getDriftBannerState(page)
      expect(state).toMatchObject({ visible: false })
    }).toPass({ timeout: 2000 })

    // ── Step 7: stage a second edit on #left ─────────────────────────────────
    // FIXTURE_SECONDARY_SOURCE ('fixture:2:1') shares file path 'fixture' with
    // FIXTURE_SEED_SOURCE after stripLineCol, so a single hmr-applied with
    // files: ['fixture'] reconciles both.
    await stageEdit(page, FIXTURE_SECONDARY_SOURCE, 'padding-top', '16px')

    // ── Step 8: mutate #left's DOM ───────────────────────────────────────────
    await page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(sel)!
      el.style.paddingTop = '999px'
    }, FIXTURE_SECONDARY_SELECTOR)

    // ── Step 9: re-inject hmr-applied with same files ─────────────────────────
    // reconcile now finds 2 divergent edits (fixture:1:1 + fixture:2:1).
    // intentDriftCount goes from 1 → 2 — a STRICT increase.
    // StagingDriftBanner.tsx:29-35 useLayoutEffect: intentDriftCount (2) >
    // prevIntentRef.current (1) → setDismissed(false) → banner re-shows.
    await simulateServerMessage(page, { type: 'hmr-applied', files: ['fixture'] })

    // ── Step 10: assert banner re-shows with intentCount: 2 ──────────────────
    // This proves ZF0-1474 Item #5: dismissed state resets ONLY on strict increase.
    // The count went 1 → 2, which is strictly greater → banner wakes.
    await expect
      .poll(() => getDriftBannerState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, intentCount: 2 })
  })

  test('stale override increment shows banner', async ({ page }) => {
    await bootWithSendSpy(page)
    await selectElement(page, FIXTURE_SEED_SELECTOR)
    await waitForElementStatePanel(page)

    // ── Step 1: stage an edit to provide context ──────────────────────────────
    // The stale signal is independent of the staging buffer, but staging an edit
    // documents that the typical user scenario has both active staged edits AND
    // a stale override — e.g. they staged a padding-top edit, applied it, and
    // HMR didn't confirm within the TTL.
    await stageEdit(page, FIXTURE_SEED_SOURCE, 'padding-top', '32px')

    // ── Step 2: baseline — banner not visible ─────────────────────────────────
    const initial = await getDriftBannerState(page)
    expect(initial).toMatchObject({ visible: false, staleCount: 0 })

    // ── Step 3: drive synthetic stale via bridge ──────────────────────────────
    // _testOnly_evictStale(source, property) synchronously:
    //   1. Adds `${source}\0${property}\0` to overrideManager.staleEntries
    //   2. Calls overrideManager.emitStale() if it was a new entry
    //   3. CortexApp.tsx:208 onStale listener fires: setStaleOverrideCount(staleSet.size)
    // This bypasses the 30s TTL for deterministic Playwright specs.
    await page.evaluate(({ source, prop }) => {
      const bridge = (globalThis as unknown as { __CORTEX_TEST__: CortexTestBridge }).__CORTEX_TEST__
      bridge.overrideManager._testOnly_evictStale(source, prop)
    }, { source: FIXTURE_SEED_SOURCE, prop: 'padding-top' })

    // ── Step 4: assert banner visible with staleCount >= 1 ───────────────────
    // StagingDriftBanner.tsx:40: hasStale = staleOverrideCount > 0 → renders the
    // stale row. The count equals the number of unique stale entries in
    // overrideManager.staleEntries (1 in this test). The banner must be visible
    // regardless of whether intentDriftCount is also non-zero (both signals
    // independently contribute to the banner when non-zero).
    // ZF0-1473 PR #93 Copilot feedback: the `staleCount >= 1` defensive
    // re-read was subsumed by the poll's `staleCount: 1` matcher (CLAUDE.md
    // Test Anti-Patterns §5 — no subsumption). Removed.
    await expect
      .poll(() => getDriftBannerState(page), { timeout: 2000 })
      .toMatchObject({ visible: true, staleCount: 1 })
  })
})
