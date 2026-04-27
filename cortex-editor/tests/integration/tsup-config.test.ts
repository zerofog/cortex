/**
 * Structural test for the `browserBundleBase` factory (ZF0-1326 Task 3).
 *
 * The factory exists to enforce the security-critical invariants
 * (`minifySyntax: true` and the `__CORTEX_TEST_BUILD__` esbuild define)
 * by construction across every browser-IIFE bundle entry. The test calls
 * the factory with arbitrary inputs and asserts the invariants survive,
 * proving "by construction" is real and not just discipline.
 *
 * If a future contributor adds a second IIFE entry without the spread, this
 * test does NOT catch it directly — but the factory's existence makes the
 * spread the path of least resistance, and a per-entry inline duplication
 * would be visible in tsup.config.ts diffs as a deviation from the established
 * pattern. The architectural review for the second entry would catch it.
 */
import { describe, it, expect } from 'vitest'
import type { BuildOptions } from 'esbuild'
import { browserBundleBase } from '../../tsup.config.js'

describe('browserBundleBase factory (ZF0-1326 Task 3)', () => {
  it('returns a config with iife format, browser platform, and the expected basics', () => {
    const config = browserBundleBase('src/foo.ts', 'dist/foo')
    expect(config.entry).toEqual(['src/foo.ts'])
    expect(config.format).toEqual(['iife'])
    expect(config.platform).toBe('browser')
    expect(config.outDir).toBe('dist/foo')
    expect(config.target).toBe('es2020')
    expect(config.sourcemap).toBe(false)
    expect(config.outExtension()).toEqual({ js: '.js' })
    expect(config.loader).toEqual({ '.css': 'text' })
  })

  it('factory enforces minifySyntax: true (security invariant)', () => {
    // Required for esbuild to physically strip `if (false && ...)` blocks
    // emitted by the __CORTEX_TEST_BUILD__ define. Without minifySyntax,
    // the dead branch survives in the prod bundle and the bridge could be
    // re-armed at runtime — full ZF0-1298 regression. Verify the factory
    // sets it on every callable config.
    const config = browserBundleBase('src/foo.ts', 'dist/foo')
    const fakeOptions: BuildOptions = {}
    config.esbuildOptions(fakeOptions)
    expect(fakeOptions.minifySyntax).toBe(true)
  })

  it('factory injects __CORTEX_TEST_BUILD__ define (security invariant)', () => {
    const config = browserBundleBase('src/foo.ts', 'dist/foo')
    const fakeOptions: BuildOptions = {}
    config.esbuildOptions(fakeOptions)
    expect(fakeOptions.define).toBeDefined()
    expect(fakeOptions.define!.__CORTEX_TEST_BUILD__).toBe(
      process.env.CORTEX_TEST_BUILD === 'true' ? 'true' : 'false',
    )
  })

  it('factory preserves tsup-pre-populated define entries (load-bearing spread)', () => {
    // tsup pre-populates `options.define` with `TSUP_FORMAT` and env-derived
    // `process.env.*` entries before calling the esbuildOptions hook. The
    // factory's `{ ...options.define, __CORTEX_TEST_BUILD__: ... }` spread
    // preserves them. If a future refactor accidentally drops the spread
    // (e.g., assigns `options.define = { __CORTEX_TEST_BUILD__: ... }`),
    // tsup's format detection silently breaks. This test pins the spread
    // contract.
    const config = browserBundleBase('src/foo.ts', 'dist/foo')
    const fakeOptions: BuildOptions = {
      define: { TSUP_FORMAT: '"iife"', 'process.env.NODE_ENV': '"production"' },
    }
    config.esbuildOptions(fakeOptions)
    expect(fakeOptions.define!.TSUP_FORMAT).toBe('"iife"')
    expect(fakeOptions.define!['process.env.NODE_ENV']).toBe('"production"')
    expect(fakeOptions.define!.__CORTEX_TEST_BUILD__).toBeDefined()
  })

  it('a second factory call with different inputs still enforces the invariants (by construction)', () => {
    // Simulates the "future second browser bundle entry" scenario from the
    // ticket. The factory must produce the same security guarantees for any
    // entry/outDir pair — this is what "enforced by construction" means in
    // practice.
    const widget = browserBundleBase('src/widget/index.tsx', 'dist/widget')
    expect(widget.entry).toEqual(['src/widget/index.tsx'])
    expect(widget.outDir).toBe('dist/widget')

    const fakeOptions: BuildOptions = {}
    widget.esbuildOptions(fakeOptions)
    expect(fakeOptions.minifySyntax).toBe(true)
    expect(fakeOptions.define!.__CORTEX_TEST_BUILD__).toBeDefined()
  })

  it('factory sets jsx automatic + preact import source (Preact baseline)', () => {
    const config = browserBundleBase('src/foo.tsx', 'dist/foo')
    const fakeOptions: BuildOptions = {}
    config.esbuildOptions(fakeOptions)
    expect(fakeOptions.jsx).toBe('automatic')
    expect(fakeOptions.jsxImportSource).toBe('preact')
  })
})
