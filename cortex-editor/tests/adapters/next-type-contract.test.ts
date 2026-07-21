import { describe, it, expect } from 'vitest'
import type { NextConfig } from 'next'
import { withCortex, type NextConfigInput } from '../../src/adapters/next.js'

/**
 * COMPILE-TIME contract: a real `next` NextConfig must be assignable to
 * withCortex's parameter. The value of this file is that it TYPECHECKS under
 * tests/tsconfig.json (next is a devDependency) — the runtime assertions are
 * incidental. This has regressed twice: the webpack callback type was
 * hand-rolled with a narrower context than Next's WebpackConfigContext, so
 * `withCortex(realNextConfig)` failed tsc in strict host repos and every fix
 * that didn't DERIVE from `next` re-introduced it. If this file stops
 * compiling, the type contract is broken again — fix the derivation in
 * src/adapters/next.ts, do not add a cast here.
 */
describe('withCortex NextConfig type contract', () => {
  it('accepts a real next NextConfig with a webpack callback (no cast)', () => {
    // A config shaped exactly like a strict Next+TS app's: a webpack callback
    // whose context is Next's full WebpackConfigContext (buildId, defaultLoaders,
    // etc.), which a hand-rolled narrower type would reject.
    const nextConfig: NextConfig = {
      reactStrictMode: true,
      // turbopack + serverExternalPackages exercised too — the same
      // narrower-than-Next incompatibility class could bite any declared prop.
      turbopack: { rules: { '*.svg': { loaders: ['@svgr/webpack'] } } },
      serverExternalPackages: ['some-pkg'],
      webpack(config, context) {
        // Reads that only exist on Next's real context type — proves the
        // derived signature carries the full shape, not a narrowed subset.
        if (context.isServer && context.buildId) config.cache = false
        return config
      },
    }

    // The load-bearing line: this must typecheck WITHOUT a cast.
    const fn = withCortex(nextConfig)
    expect(typeof fn).toBe('function')
  })

  it('accepts a phase-function next config and a plain object (NextConfigInput surface)', () => {
    const asPhaseFn: NextConfigInput = (phase: string) => ({ basePath: phase === 'x' ? '/x' : '/' })
    const asObject: NextConfigInput = { reactStrictMode: true } satisfies NextConfig
    expect(typeof withCortex(asPhaseFn)).toBe('function')
    expect(typeof withCortex(asObject)).toBe('function')
  })
})
