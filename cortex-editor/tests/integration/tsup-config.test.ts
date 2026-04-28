/**
 * Structural test for the `browserBundleBase` factory (ZF0-1326 Task 3).
 *
 * The factory centralizes the security-critical baseline (`minifySyntax: true`
 * and the `__CORTEX_TEST_BUILD__` esbuild define) for browser-IIFE bundle
 * configs. This test calls the factory with arbitrary inputs and asserts
 * the invariants survive in the returned config object — i.e., the factory
 * itself is well-formed.
 *
 * Important scope note: this test does NOT prove that every tsup entry
 * actually uses the factory. The JS spread API allows an entry to override
 * `esbuildOptions` after spreading the factory result, which would silently
 * drop the invariants. The factory's docstring acknowledges this is "by
 * convention, audited per-entry" rather than truly "by construction" — a
 * future composer-pattern API could close that gap. Today, the architectural
 * review for any new IIFE entry catches deviations.
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

  // The "second factory call with different inputs" test was deleted in the
  // Step 4 review fix as subsumed by the per-invariant tests above (per
  // CLAUDE.md test anti-pattern #5). The invariants the deleted test
  // asserted (minifySyntax + define) are already covered for the single-call
  // case; the factory contains no input-dependent branches that could
  // silently fail for a different entry/outDir. The honest scope is:
  // "factory output invariants per call." See tsup.config.ts factory
  // docstring for the by-convention-not-by-construction caveat.

  it('factory sets jsx automatic + preact import source (Preact baseline)', () => {
    const config = browserBundleBase('src/foo.tsx', 'dist/foo')
    const fakeOptions: BuildOptions = {}
    config.esbuildOptions(fakeOptions)
    expect(fakeOptions.jsx).toBe('automatic')
    expect(fakeOptions.jsxImportSource).toBe('preact')
  })
})
