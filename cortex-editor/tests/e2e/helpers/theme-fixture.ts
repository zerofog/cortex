/**
 * Route-interception "server" for the ZF0-1562 luminance-fallback specs.
 *
 * Business purpose: the luminance branch of detectTheme() reads
 * `getComputedStyle(document.body).backgroundColor` and applies the
 * blueprint theme when luminance < 0.4. Happy-dom does not return
 * meaningful computed background colors, so the unit-test layer had to
 * skip this branch (the "falls back to background luminance when no other
 * signals present" test in bootstrap.test.ts, removed in this PR — see
 * git history; Layer-4 audit ZF0-1494). These specs run against real
 * Chromium with three minimal body-bg fixtures (dark / light /
 * transparent) to exercise the positive, negative, and alpha-guard cases.
 *
 * Mirrors the structure of `installFixtureServer` (basic.html spec harness)
 * but uses a distinct synthetic origin so route patterns never collide
 * with the existing harness. The body bg is baked into each HTML file
 * inline so it's applied at parse time, before any script runs and well
 * before bootstrap()'s applyTheme() sampling.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { blockExternalFonts, readCached } from './fixture-server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Synthetic origin distinct from `installFixtureServer`'s `cortex-fixture.test`.
 *  Using a separate `.test` TLD keeps route-interception patterns from
 *  shadowing each other and makes it obvious in network traces which
 *  harness served a request. */
export const THEME_FIXTURE_ORIGIN = 'https://cortex-theme-fixture.test'

/** Dark body bg (rgb(10,10,10) — luminance ≈ 0.04): luminance branch fires,
 *  host receives data-theme="blueprint". */
export const THEME_FIXTURE_URL_DARK = `${THEME_FIXTURE_ORIGIN}/dark`

/** Light body bg (rgb(250,250,250) — luminance ≈ 0.97): luminance branch fires,
 *  threshold not met, host stays without data-theme. */
export const THEME_FIXTURE_URL_LIGHT = `${THEME_FIXTURE_ORIGIN}/light`

/** Transparent body bg (rgba(0,0,0,0)): alpha-guard at index.tsx:48 fires
 *  BEFORE the luminance computation, host stays without data-theme. */
export const THEME_FIXTURE_URL_TRANSPARENT = `${THEME_FIXTURE_ORIGIN}/transparent`

const FIXTURE_FILES = {
  '/dark': 'theme-luminance-dark.html',
  '/light': 'theme-luminance-light.html',
  '/transparent': 'theme-luminance-transparent.html',
} as const

/**
 * Install `page.route()` handlers that serve the three luminance-fallback
 * fixture HTMLs and the IIFE bundle for requests under `THEME_FIXTURE_ORIGIN`.
 * Also blocks external font requests so the harness stays hermetic (same
 * pattern as `installFixtureServer`). Call BEFORE `page.goto`.
 */
export async function installThemeFixture(page: Page): Promise<void> {
  // Resolution mirrors `fixture-server.ts`: this file lives at
  // tests/e2e/helpers → up one to tests/e2e, then into fixtures/. Bundle
  // is at cortex-editor/dist/browser/index.js (repo root of the package).
  const fixturesDir = resolve(__dirname, '..', 'fixtures')
  const bundlePath = resolve(__dirname, '..', '..', '..', 'dist', 'browser', 'index.js')

  if (!existsSync(bundlePath)) {
    throw new Error(
      `[theme-fixture] bundle not found at ${bundlePath}. Did you run \`npm run build\`?`,
    )
  }
  for (const file of Object.values(FIXTURE_FILES)) {
    const p = resolve(fixturesDir, file)
    if (!existsSync(p)) {
      throw new Error(`[theme-fixture] fixture HTML not found at ${p}`)
    }
  }

  const bundleJs = readCached(bundlePath)

  await page.route(`${THEME_FIXTURE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    const fixtureFile = FIXTURE_FILES[url.pathname as keyof typeof FIXTURE_FILES]
    if (fixtureFile) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: readCached(resolve(fixturesDir, fixtureFile)),
      })
      return
    }
    if (url.pathname === '/cortex-bundle.js') {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: bundleJs,
      })
      return
    }
    // Any other path under the theme-fixture origin is unexpected. The
    // 404 body itself lists the legal paths so the spec failure surfaces
    // actionable triage without polluting CI stdout with a console.error
    // side effect that survives test boundaries.
    const allowed = Object.keys(FIXTURE_FILES).join(', ')
    await route.fulfill({
      status: 404,
      body: `[theme-fixture] unexpected request: ${url.pathname}\nLegal paths under ${THEME_FIXTURE_ORIGIN}: ${allowed}, /cortex-bundle.js`,
    })
  })

  await blockExternalFonts(page)
}
