import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/cli.ts', 'src/browser/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      { test: { name: 'server', environment: 'node', include: ['tests/adapters/**/*.test.ts', 'tests/core/**/*.test.ts'] } },
      { test: { name: 'browser', environment: 'happy-dom', include: ['tests/browser/**/*.test.ts', 'tests/browser/**/*.test.tsx'] } },
      { test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } },
    ],
  },
})
