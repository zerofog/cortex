import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Minimal subset of next's NextConfig sufficient for wrapping.
 * Avoids a hard dev dependency on the `next` package (it is an optional peer).
 * When users have next installed the real NextConfig is assignment-compatible
 * with this interface since we only declare what we actually use.
 */
export interface NextConfig {
  webpack?: (config: WebpackConfig, context: WebpackContext) => WebpackConfig
  [key: string]: unknown
}

interface WebpackConfig {
  module: { rules: unknown[] }
  [key: string]: unknown
}

interface WebpackContext {
  dir: string
  dev: boolean
  isServer: boolean
  [key: string]: unknown
}

export interface CortexNextOptions {
  // Reserved for future options
}

// Resolve loader path relative to this file's compiled location.
// Both next.ts and next-source-loader.ts compile to the same dist/ directory.
function resolveLoaderPath(): string {
  // CJS: __dirname is reliable. ESM: use import.meta.url.
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, 'next-source-loader.cjs')
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'next-source-loader.cjs')
}

export function withCortex(nextConfig: NextConfig = {}, _options?: CortexNextOptions): NextConfig {
  if (process.env.NODE_ENV === 'production') return nextConfig

  return {
    ...nextConfig,

    webpack(config: WebpackConfig, context: WebpackContext) {
      // Apply user's webpack config first
      if (typeof nextConfig.webpack === 'function') {
        config = nextConfig.webpack(config, context)
      }

      // Only instrument client-side builds — server bundle doesn't need source attributes
      if (context.isServer) return config

      // enforce: 'pre' ensures this runs before SWC/Babel strip JSX syntax
      config.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: /\/node_modules\//,
        enforce: 'pre' as const,
        use: [{
          loader: resolveLoaderPath(),
          options: { projectRoot: context.dir },
        }],
      })

      return config
    },
  }
}
