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
  try {
    // ESM: use import.meta.url
    const dir = path.dirname(fileURLToPath(import.meta.url))
    return path.join(dir, 'next-source-loader.cjs')
  } catch {
    // CJS fallback: __dirname is available
    return path.join(__dirname, 'next-source-loader.cjs')
  }
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

      // Add source transform loader for .jsx/.tsx files
      config.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: /\/node_modules\//,
        use: [{
          loader: resolveLoaderPath(),
          options: { projectRoot: context.dir },
        }],
      })

      return config
    },
  }
}
