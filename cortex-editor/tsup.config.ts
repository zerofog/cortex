import { defineConfig } from 'tsup'

export default defineConfig([
  // Server-side: adapters, rewriter, transport
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: ['vite', 'next', 'tailwindcss'],
  },
  // Browser-side: Preact UI bundled as IIFE for Shadow DOM injection
  // Note: src/browser/index.tsx created in Phase 2
  // {
  //   entry: ['src/browser/index.tsx'],
  //   format: ['iife'],
  //   target: 'es2020',
  //   platform: 'browser',
  //   outDir: 'dist/browser',
  //   sourcemap: false,
  //   globalName: 'CortexEditor',
  //   outExtension: () => ({ js: '.js' }),
  //   esbuildOptions(options) {
  //     options.jsx = 'automatic'
  //     options.jsxImportSource = 'preact'
  //   },
  //   loader: { '.css': 'text' },
  // },
])
