import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/cli/**', 'src/browser/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      { test: { name: 'server', environment: 'node', include: ['tests/adapters/**/*.test.ts', 'tests/core/**/*.test.ts', 'tests/cli/**/*.test.ts'] } },
      { test: { name: 'browser', environment: 'happy-dom', include: ['tests/browser/**/*.test.ts', 'tests/browser/**/*.test.tsx'] } },
      { test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } },
      // ZF0-1293: jsdom environment for tests that need real CSSOM behavior
      // (shorthand expansion, computed style cascade). happy-dom — used by
      // the `browser` project above — skips shorthand expansion, so claims
      // like "padding shorthand clobbers paddingBottom longhand" cannot be
      // exercised there. Keep this project's scope narrow (directory-based)
      // so the default `browser` project stays on happy-dom for speed.
      { test: { name: 'cssom', environment: 'jsdom', include: ['tests/cssom/**/*.test.ts'] } },
    ],
  },
})
