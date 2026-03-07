import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'server', environment: 'node', include: ['tests/server/**/*.test.ts'] } },
      { test: { name: 'client', environment: 'happy-dom', include: ['tests/client/**/*.test.ts'] } },
      { test: { name: 'integration', environment: 'node', include: ['tests/integration/**/*.test.ts'] } },
    ],
  },
});
