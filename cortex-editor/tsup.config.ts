import { defineConfig } from 'tsup'

// Externalized packages: optional peer deps + heavy runtime deps (lazy-loaded)
const externals = ['vite', 'next', 'webpack', 'tailwindcss', 'ts-morph', 'ws']

export default defineConfig([
  // Server-side: core types + source transform
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // Vite adapter
  {
    entry: ['src/adapters/vite.ts'],
    outDir: 'dist/vite',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // Next.js adapter
  {
    entry: ['src/adapters/next.ts'],
    outDir: 'dist/next',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // Next.js webpack loader — CJS only (webpack requires CJS loaders)
  {
    entry: ['src/adapters/next-source-loader.ts'],
    outDir: 'dist/next',
    format: ['cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: externals,
  },
  // Browser-side: Preact UI bundled as IIFE for Shadow DOM injection
  {
    entry: ['src/browser/index.tsx'],
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    outDir: 'dist/browser',
    sourcemap: false,
    globalName: 'CortexEditor',
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options) {
      options.jsx = 'automatic'
      options.jsxImportSource = 'preact'
    },
    loader: { '.css': 'text' },
  },
])
