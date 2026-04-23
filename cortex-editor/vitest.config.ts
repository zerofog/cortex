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
      {
        test: {
          name: 'browser',
          environment: 'happy-dom',
          include: ['tests/browser/**/*.test.ts', 'tests/browser/**/*.test.tsx'],
          // Fork pool with isolation per file: prevents cross-file DOM/global
          // contamination (document.head style leaks, persistent mocks on
          // getComputedStyle, module-scoped state in override-bus, etc.).
          // Without this, tests that pass in isolation flake when run together
          // under CI load. Trade-off: slightly slower startup per file, but
          // eliminates a whole class of flaky-under-load failures.
          pool: 'forks',
          poolOptions: {
            forks: {
              isolate: true,
            },
          },
        },
      },
      { test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } },
    ],
  },
})
