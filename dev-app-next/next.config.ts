import path from 'path'
import type { NextConfig } from 'next'
import { withCortex } from 'cortex-editor/next'

// Typed as Next's REAL NextConfig and passed to withCortex with NO cast — the
// exact shape that failed tsc on 0.3.0 (webpack context) and on the first
// 0.3.1 build (turbopack index signature). If `next build` typechecks this
// file, the type-derivation contract holds against a real strict Next app —
// this is the fixture-level mirror of tests/adapters/next-type-contract.test.ts.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // cortex-editor is a symlinked file: dependency living one directory up;
    // widen Turbopack's resolution root so the symlink target is inside it.
    // Real npm installs don't need this — the package sits inside node_modules.
    root: path.resolve(process.cwd(), '..'),
    // Object-form rule with as + mixed loaders — exercises Next's full
    // TurbopackRuleConfigCollection breadth through withCortex's merge.
    rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.tsx' } },
  },
  serverExternalPackages: ['some-external-pkg'],
  webpack(config, context) {
    // Reads that only exist on Next's real WebpackConfigContext — a hand-rolled
    // narrower context type rejects this callback at compile time.
    if (context.isServer && context.buildId) config.cache = false
    return config
  },
}

// The load-bearing line: no cast, no suppression.
export default withCortex(nextConfig)
