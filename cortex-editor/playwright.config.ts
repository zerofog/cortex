/**
 * Playwright config for the cortex-editor e2e harness.
 *
 * Business purpose: runs Playwright as a separate test surface (not a
 * vitest project) because it needs a real Chromium process. Specs use
 * route interception against a synthetic origin to load the IIFE
 * bundle — no dev server, no user-app dependency, no network.
 *
 * `fullyParallel: false` + `workers: 1` is deliberate: the specs share
 * an in-memory fixture (the built bundle is read once per worker), and
 * the override-lifecycle behavior we assert on is sequential by nature
 * (Tasks 2–4 exercise timing-sensitive code). Parallelism offers no
 * speedup until we have >1 foundation scenario per worker.
 */
import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 10_000,
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: isCI ? 'on-first-retry' : 'off',
    screenshot: isCI ? 'only-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // Use the default chromium channel; the harness is not browser-
        // matrix-aware yet. If we ever add firefox/webkit, do it in a
        // follow-up that also fans out the CI matrix.
        browserName: 'chromium',
      },
    },
  ],
})
