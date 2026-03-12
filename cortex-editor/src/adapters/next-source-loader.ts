import { createSourceTransform } from './source-transform.js'

interface LoaderOptions {
  projectRoot: string
}

interface LoaderContext {
  resourcePath: string
  getOptions: () => LoaderOptions
  callback: (err: Error | null, content?: string, sourceMap?: unknown) => void
  cacheable: (flag?: boolean) => void
}

// Cache the transform function at module scope.
// Webpack calls the loader function per file, but the factory only
// needs to be created once (it captures projectRoot in a closure).
let cachedTransform: ReturnType<typeof createSourceTransform> | null = null
let cachedRoot: string | null = null

/**
 * Reset module-level state. Exposed for testing only.
 * @internal
 */
export function _resetForTesting(): void {
  cachedTransform = null
  cachedRoot = null
}

// Webpack loader function — `this` is the webpack LoaderContext.
// tsup emits `module.exports = { default: fn, ... }` in CJS; webpack's
// loader-runner falls back to `module.default` when the export is not a function.
export default function cortexSourceLoader(this: LoaderContext, source: string) {
  this.cacheable()

  const { projectRoot } = this.getOptions()

  // Re-create transform if projectRoot changed (shouldn't happen in practice)
  if (!cachedTransform || cachedRoot !== projectRoot) {
    cachedTransform = createSourceTransform(projectRoot)
    cachedRoot = projectRoot
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
