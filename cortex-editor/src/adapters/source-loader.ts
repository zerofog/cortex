import { createSourceTransform } from './source-transform.js'
import { isRuntimeDisabled } from './source-loader-utils.js'
import type { SourceTransformOptions } from './types.js'

export interface SourceLoaderOptions {
  projectRoot: string
  resolveAlias?: Record<string, string>
  includeNodeModules?: string[]
  /** ZF0-1851: plugin-instance id from the CortexWebpackRuntime that installed
   *  this loader. Checked against the disabledRuntimes registry to skip
   *  transformation when that plugin instance was refused the lock — keeps a
   *  lock-refused plugin's transforms inert without affecting other plugin
   *  instances (MultiCompiler). */
  runtimeId?: string
}

interface LoaderContext {
  resourcePath: string
  getOptions: () => SourceLoaderOptions
  callback: (err: Error | null, content?: string, sourceMap?: unknown) => void
  cacheable: (flag?: boolean) => void
}

let cachedTransform: ReturnType<typeof createSourceTransform> | null = null
let cachedKey: string | null = null

function cacheKey(options: SourceLoaderOptions): string {
  return JSON.stringify({
    projectRoot: options.projectRoot,
    resolveAlias: options.resolveAlias ?? null,
    includeNodeModules: options.includeNodeModules ?? [],
  })
}

function toTransformOptions(options: SourceLoaderOptions): SourceTransformOptions {
  const aliasMap = options.resolveAlias ?? {}
  const aliases = Object.entries(aliasMap).sort((a, b) => b[0].length - a[0].length)
  return {
    includeNodeModules: options.includeNodeModules,
    resolveAlias(specifier: string): string | null {
      for (const [key, replacement] of aliases) {
        if (specifier === key || specifier.startsWith(key + '/')) {
          return replacement + specifier.slice(key.length)
        }
      }
      return null
    },
  }
}

/**
 * Reset module-level state. Exposed for testing only.
 * @internal
 */
export function _resetForTesting(): void {
  cachedTransform = null
  cachedKey = null
}

// Webpack loader function — `this` is the webpack LoaderContext.
// tsup emits `module.exports = { default: fn, ... }` in CJS; webpack's
// loader-runner falls back to `module.default` when the export is not a function.
export default function cortexSourceLoader(this: LoaderContext, source: string) {
  this.cacheable()

  const options = this.getOptions()

  // ZF0-1851: when the plugin instance that installed this loader was refused
  // the .cortex/ lock, pass through source unchanged. Symmetric to Vite's
  // cortexDisabledByLock gate. Per-runtime keying so MultiCompiler with one
  // lock-refused plugin doesn't disable the other's transforms.
  if (isRuntimeDisabled(options.runtimeId)) {
    this.callback(null, source)
    return
  }

  const key = cacheKey(options)

  if (!cachedTransform || cachedKey !== key) {
    cachedTransform = createSourceTransform(options.projectRoot, toTransformOptions(options))
    cachedKey = key
  }

  try {
    const result = cachedTransform(source, this.resourcePath)
    if (result) {
      this.callback(null, result.code, result.map ?? undefined)
    } else {
      this.callback(null, source)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    this.callback(new Error(`[cortex] Source transform failed for ${this.resourcePath}: ${message}`))
  }
}
