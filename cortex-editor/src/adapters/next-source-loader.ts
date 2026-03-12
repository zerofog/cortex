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
// Uses `export default` which tsup converts to `module.exports = exports.default`
// in CJS output, making it compatible with webpack's loader resolution.
export default function cortexSourceLoader(this: LoaderContext, source: string) {
  this.cacheable()

  const { projectRoot } = this.getOptions()

  // Re-create transform if projectRoot changed (shouldn't happen in practice)
  if (!cachedTransform || cachedRoot !== projectRoot) {
    cachedTransform = createSourceTransform(projectRoot)
    cachedRoot = projectRoot
  }

  const result = cachedTransform(source, this.resourcePath)
  if (result) {
    this.callback(null, result.code, result.map ?? undefined)
  } else {
    this.callback(null, source)
  }
}
