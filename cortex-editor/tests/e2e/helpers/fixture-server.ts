/**
 * Route-interception "server" for e2e specs.
 *
 * Business purpose: we need a deterministic host origin that loads the
 * built IIFE bundle without standing up a real dev server. Playwright's
 * `page.route()` lets us fulfill every request for a synthetic origin
 * from disk, so specs are hermetic (no network, no user-app dependency)
 * and reproduce on any contributor's machine regardless of which ports
 * are free.
 *
 * Resolution rules are intentionally strict — the only URLs we answer
 * are the fixture HTML and the bundle. Any other hit is a bug (usually
 * a stray <link>/<img> in a fixture or the bundle reaching for the
 * Vite HMR endpoint) and routes `continue()` so it fails noisily.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Page } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Synthetic origin — never actually hits the network; all requests are
 * fulfilled by `page.route()`. Using a `.test` TLD avoids any accidental
 * DNS resolution even if route interception misfires. */
export const FIXTURE_ORIGIN = 'https://cortex-fixture.test'
export const FIXTURE_URL = `${FIXTURE_ORIGIN}/`

/** The single seed element rendered in `fixtures/basic.html`. Its selector
 *  (`#center`) and data-cortex-source identifier (`fixture:1:1`) are shared
 *  across every e2e spec — keep them here so specs stay DRY and future
 *  fixture changes propagate through one import. */
export const FIXTURE_SEED_SELECTOR = '#center'
export const FIXTURE_SEED_SOURCE = 'fixture:1:1'

/** Module-scoped file cache. The IIFE bundle is built once via
 *  `npm run build` before `npm run test:e2e` and doesn't change mid-run,
 *  so reading 22 times across specs+workers just wastes syscalls. A
 *  per-worker cache (module state is per-worker under Playwright's
 *  process model) makes the second+ `installFixtureServer` call O(0)
 *  on disk. */
const fileCache = new Map<string, string>()

function readCached(p: string): string {
  const hit = fileCache.get(p)
  if (hit !== undefined) return hit
  const content = readFileSync(p, 'utf8')
  fileCache.set(p, content)
  return content
}

/**
 * Install `page.route()` handlers that serve the fixture HTML and IIFE
 * bundle for requests under `FIXTURE_ORIGIN`. Call BEFORE `page.goto`.
 */
export async function installFixtureServer(page: Page): Promise<void> {
  // Resolution is relative to this file: tests/e2e/helpers → up two
  // levels to tests/e2e, then into fixtures/. Bundle lives at
  // cortex-editor/dist/browser/index.js (repo root of the package).
  const fixturePath = resolve(__dirname, '..', 'fixtures', 'basic.html')
  const bundlePath = resolve(__dirname, '..', '..', '..', 'dist', 'browser', 'index.js')

  if (!existsSync(bundlePath)) {
    throw new Error(
      `[fixture-server] bundle not found at ${bundlePath}. Did you run \`npm run build\`?`,
    )
  }
  if (!existsSync(fixturePath)) {
    throw new Error(`[fixture-server] fixture HTML not found at ${fixturePath}`)
  }

  // Read once per worker — specs don't rebuild between requests.
  const fixtureHtml = readCached(fixturePath)
  const bundleJs = readCached(bundlePath)

  await page.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/' || url.pathname === '/index.html') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml,
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
    // Any other request under the fixture origin is unexpected — 404
    // explicitly so mistakes are loud.
    await route.fulfill({ status: 404, body: `not found: ${url.pathname}` })
  })
}
