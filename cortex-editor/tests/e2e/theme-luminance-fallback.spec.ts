/**
 * detectTheme() background-luminance fallback in real Chromium (ZF0-1562).
 *
 * Business purpose: the luminance branch of `detectTheme()`
 * (src/browser/index.tsx:42-54) computes WCAG-style relative luminance from
 * `getComputedStyle(document.body).backgroundColor` and applies the
 * `blueprint` (dark) theme when luminance < 0.4. Happy-dom returns
 * meaningless values for that property (Layer-4 of the ZF0-1494 audit), so
 * the unit-test layer skipped this branch. These specs run against real
 * Chromium with three minimal body-bg fixtures (dark / light / transparent)
 * and assert directly on the host's `data-theme` attribute — no debug-bridge
 * kit needed because the production code path naturally exercises the branch.
 *
 * Falsifiability proofs (load-bearing — each test has an independent witness;
 * referenced by test NAME, not line number, so refactors don't degrade the proof):
 *
 *   Coarse mutation (proves T1 'dark body background...'):
 *     Comment out src/browser/index.tsx:42-54 (the entire luminance block).
 *     T1 (dark) fails with `Expected: 'blueprint'  Received: null`.
 *     T2 (light) and T3 (transparent) still PASS — they assert null, which is
 *     what the broken code returns.
 *
 *   Mutation A — flip `<` to `>` on the threshold check inside the luminance
 *   block (proves T2 'light body background...'):
 *     T1 fails (dark luminance 0.04 > 0.4 false → null).
 *     T2 fails with `Expected: null  Received: 'blueprint'`
 *       (light luminance 0.97 > 0.4 true → blueprint).
 *     T3 still passes — alpha guard short-circuits before luminance is computed.
 *
 *   Mutation B — delete the alpha guard inside the luminance block (proves
 *   T3 'transparent body background...'):
 *     T1 passes (alpha=1, luminance 0.04 < 0.4 → blueprint).
 *     T2 passes (alpha=1, luminance 0.97 < 0.4 false → null).
 *     T3 fails with `Expected: null  Received: 'blueprint'`
 *       (transparent → rgba 0,0,0 unaffected by alpha → luminance 0 < 0.4 → blueprint).
 *
 *   Each mutation produced a SPECIFIC ASSERTION failure (not a timeout). A
 *   timeout would indicate the spec exercises some other code path (e.g.
 *   matchMedia leaking through) and tests nothing relevant. All mutations
 *   were applied, verified, then reverted byte-for-byte; production code is
 *   unchanged. See `thoughts/shared/ship-task/checkpoints/ZF0-1562-checkpoint.md`
 *   Steps 3 and 4 for the full reproduction log.
 *
 *   Witness matrix (precise — Step 8.5 audit nuance):
 *     - Coarse mutation separates T1 from {T2, T3} (T1 fails; T2, T3 pass).
 *     - Mutation A separates T3 from {T1, T2} (T3 passes; T1, T2 fail).
 *     - Mutation B separates T3 from {T1, T2} the other way (T3 fails; T1, T2 pass).
 *   T2 has no mutation that fails ONLY T2 — its independence is established
 *   pairwise (coarse: distinct from T1; Mutation A: distinct from T3). This
 *   is sufficient to prove T2 exercises a distinct production branch, but
 *   readers expecting strict 1:1 mutation→test mapping should know it's a
 *   3-mutation / 3-pair witness matrix, not 3-mutation / 3-test.
 *
 * Why `test.use({ colorScheme: 'light' })` at describe level is non-negotiable:
 * the cascade in detectTheme() hits matchMedia('(prefers-color-scheme: dark)')
 * at index.tsx:40 BEFORE the luminance branch. If the runner's OS theme is
 * dark, matchMedia short-circuits to 'blueprint' and the luminance branch
 * never runs — T1 would pass for the wrong reason. Forcing light at the
 * browser-context level guarantees the cascade falls through to luminance
 * for every test in the block.
 */
import { test, expect, type Page } from '@playwright/test'
import { waitForBundleBoot } from './helpers/boot.js'
import {
  installThemeFixture,
  THEME_FIXTURE_URL_DARK,
  THEME_FIXTURE_URL_LIGHT,
  THEME_FIXTURE_URL_TRANSPARENT,
} from './helpers/theme-fixture.js'

/**
 * Boots a luminance-fallback fixture and resolves the host's `data-theme`
 * attribute (or null when absent). Centralized so the three tests below
 * differ only in fixture URL and expected attribute. `colorScheme: 'light'`
 * is configured at describe level via `test.use`, applied at browser-context
 * creation — no per-test `emulateMedia` call needed.
 */
async function readHostThemeForFixture(page: Page, fixtureUrl: string): Promise<string | null> {
  await installThemeFixture(page)
  await page.goto(fixtureUrl)

  // Two-stage wait — both stages are load-bearing, not redundant:
  //
  //   1. `waitForBundleBoot` proves the IIFE evaluated (`globalThis.CortexEditor`
  //      is set). This is the only wait that gives a triage error message on
  //      bundle infra regressions (build:test not run, fixture 404, etc.).
  //
  //   2. `waitForSelector('[data-cortex-host]')` proves `bootstrap()` actually
  //      RAN (not just got registered). With `<script>` inside `<body>` (as in
  //      every fixture here), `document.readyState === "loading"` at script
  //      execution time, so `index.tsx:175-179` takes the
  //      `addEventListener('DOMContentLoaded', bootstrap)` branch — bootstrap
  //      is DEFERRED, not synchronous. The spec happens to work because
  //      `page.goto`'s default `waitUntil: 'load'` already waits past
  //      DOMContentLoaded, but coupling the spec to that default is brittle:
  //      a maintainer switching to `waitUntil: 'domcontentloaded'` or
  //      `'commit'`, or moving this wait outside a `page.goto` call site,
  //      would race against bootstrap. Asserting host presence directly
  //      decouples the spec from `page.goto`'s waitUntil semantics.
  //
  // Once the host is queryable, `applyTheme()` has run synchronously inside
  // `bootstrap()` (index.tsx:94 creates the host, line 110 calls applyTheme
  // — same JS task), so `data-theme` is already set (or deliberately absent).
  await waitForBundleBoot(page)
  await page.waitForSelector('[data-cortex-host]', { timeout: 2000 })
  return page.locator('[data-cortex-host]').getAttribute('data-theme')
}

test.describe('detectTheme luminance fallback (ZF0-1562) @fast-ci', () => {
  // Force prefers-color-scheme=light at browser-context creation. Without
  // this, matchMedia('(prefers-color-scheme: dark)') at index.tsx:40 can
  // short-circuit the cascade BEFORE the luminance branch runs — tests
  // would pass for the wrong reason on dark-themed CI runners.
  //
  // NOTE: only `colorScheme` is currently pinned. If `detectTheme()` ever
  // grows a `prefers-contrast` or `forced-colors` branch (this version of
  // Playwright's `test.use` doesn't accept `forcedColors`/`reducedMotion`
  // keys — those are emulateMedia-only on this release), this spec needs
  // to be revisited or those features pinned via `page.emulateMedia` in
  // the helper.
  test.use({ colorScheme: 'light' })

  test('dark body background applies blueprint theme via real-Chromium getComputedStyle', async ({ page }) => {
    // Positive case: body bg rgb(10,10,10) → luminance ≈ 0.04 → blueprint.
    // The falsifiability proof in the docblock witnesses this test
    // actually exercises the luminance branch (not matchMedia, not an
    // explicit signal). Without that proof, this assertion could pass
    // for the wrong reason.
    const themeAttr = await readHostThemeForFixture(page, THEME_FIXTURE_URL_DARK)
    expect(themeAttr).toBe('blueprint')
  })

  test('light body background leaves data-theme unset (luminance above threshold)', async ({ page }) => {
    // Negative control: body bg rgb(250,250,250) → luminance ≈ 0.97 → no theme.
    // Proves the threshold side of the branch isn't biased toward blueprint
    // (i.e. luminance > 0.4 must NOT apply the dark theme).
    const themeAttr = await readHostThemeForFixture(page, THEME_FIXTURE_URL_LIGHT)
    expect(themeAttr).toBeNull()
  })

  test('transparent body background leaves data-theme unset (alpha guard fires before luminance)', async ({ page }) => {
    // Alpha-guard control: body bg rgba(0,0,0,0) → alpha < 0.01 short-circuits
    // before luminance is computed. Without this case, the alpha branch is
    // uncovered in real browser even though it's the most common state in
    // production (Tailwind reset, raw user pages).
    const themeAttr = await readHostThemeForFixture(page, THEME_FIXTURE_URL_TRANSPARENT)
    expect(themeAttr).toBeNull()
  })
})
