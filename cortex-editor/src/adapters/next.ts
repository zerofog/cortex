import path from 'path'
import { fileURLToPath } from 'url'
import { shouldExcludeCortexSource } from './source-loader-utils.js'
import { CortexWebpackRuntime, DEFAULT_TOGGLE_SHORTCUT, validateToggleShortcut } from './webpack.js'

export { CortexDevScripts, type CortexDevScriptsProps } from './next-dev-scripts.js'

/**
 * Minimal subset of next's NextConfig sufficient for wrapping.
 * Avoids a hard dev dependency on the `next` package (it is an optional peer).
 * When users have next installed the real NextConfig is assignment-compatible
 * with this interface since we only declare what we actually use.
 */
export interface NextConfig {
  webpack?: (config: WebpackConfig, context: WebpackContext) => WebpackConfig
  turbopack?: TurbopackConfig
  serverExternalPackages?: string[]
  [key: string]: unknown
}

export interface TurbopackConfig {
  rules?: Record<string, unknown>
  [key: string]: unknown
}

/** A `turbopack.rules` entry in its object form. Next also accepts a bare
 *  loader array as shorthand; both shapes are handled when merging. */
export interface TurbopackRuleObject {
  loaders: TurbopackLoaderItem[]
  [key: string]: unknown
}

export type TurbopackLoaderItem = string | { loader: string; options?: Record<string, unknown> }

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
  /** Resolve JSX CSS Module aliases. Example: { '@': '/abs/project/src' }. */
  resolveAlias?: Record<string, string>
  /** Package names in node_modules to instrument. */
  includeNodeModules?: string[]
  /** Absolute project root used to relativize data-cortex-source paths for the
   *  Turbopack rules (the webpack hook gets the root from its build context).
   *  Defaults to process.cwd(), which is correct when `next dev` runs from the
   *  app root. Pass explicitly for `next dev <dir>` or monorepo invocations
   *  where cwd differs from the app directory. */
  projectRoot?: string
  /** Fixed port for the cortex bridge server. Defaults to an ephemeral port
   *  (discovered by clients via .cortex/port). */
  port?: number
  /** Editor toggle shortcut, tinykeys syntax. Defaults to '$mod+Shift+Period'. */
  toggleShortcut?: string
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

/** Turbopack requires loader options to be serializable — no functions, and no
 *  `undefined`-valued properties. Absent options are omitted entirely. */
function buildLoaderOptions(projectRoot: string, options: CortexNextOptions): Record<string, unknown> {
  const loaderOptions: Record<string, unknown> = { projectRoot }
  if (options.resolveAlias !== undefined) loaderOptions.resolveAlias = options.resolveAlias
  if (options.includeNodeModules !== undefined) loaderOptions.includeNodeModules = options.includeNodeModules
  return loaderOptions
}

function isTurbopackRuleObject(value: unknown): value is TurbopackRuleObject {
  return typeof value === 'object' && value !== null && Array.isArray((value as TurbopackRuleObject).loaders)
}

/** Globs cortex instruments. Turbopack rules have no function-valued `exclude`,
 *  so node_modules filtering happens inside the loader (shouldExcludeCortexSource). */
const CORTEX_TURBOPACK_GLOBS = ['*.tsx', '*.jsx'] as const

function withCortexTurbopack(existing: TurbopackConfig | undefined, options: CortexNextOptions): TurbopackConfig {
  const projectRoot = options.projectRoot ?? process.cwd()
  const cortexLoader = {
    loader: resolveLoaderPath(),
    options: buildLoaderOptions(projectRoot, options),
  }

  const rules: Record<string, unknown> = { ...(existing?.rules ?? {}) }
  for (const glob of CORTEX_TURBOPACK_GLOBS) {
    const current = rules[glob]
    if (current === undefined) {
      // No `as` on purpose: `as` renames the virtual module (tsx → tsx.tsx),
      // which breaks relative-import resolution. Same-format transforms omit it.
      rules[glob] = { loaders: [cortexLoader] }
    } else if (isTurbopackRuleObject(current)) {
      // Webpack-compat loader chains execute right-to-left, so appending last
      // runs cortex first — on raw source, before user loaders transform it.
      rules[glob] = { ...current, loaders: [...current.loaders, cortexLoader] }
    } else if (Array.isArray(current)) {
      rules[glob] = [...current, cortexLoader]
    } else {
      console.warn(
        `[cortex] turbopack.rules['${glob}'] has an unrecognized shape; leaving it untouched — ` +
        `cortex source instrumentation is disabled for ${glob} files.`
      )
    }
  }

  return { ...(existing ?? {}), rules }
}

/** Next's config-function form: `export default (phase, ctx) => config`.
 *  Returned by withCortex in dev so the bridge starts only in the process
 *  that actually runs the dev server. */
export type NextConfigFunction = (
  phase: string,
  context?: { defaultConfig?: NextConfig },
) => Promise<NextConfig>

/** Value of PHASE_DEVELOPMENT_SERVER in next/constants — hardcoded because
 *  `next` is an optional peer and this module must load without it. */
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'

interface BridgeHandle {
  start(): Promise<void>
  dispose(): Promise<void>
}

type BridgeFactory = (opts: { root: string; mode: string; port?: number; toggleShortcut: string }) => BridgeHandle

let bridgeFactory: BridgeFactory = (opts) => new CortexWebpackRuntime(opts)
let bridge: BridgeHandle | null = null
let signalHandlersInstalled = false

/** Swap the bridge implementation and reset singleton state. Pass null to
 *  restore the real CortexWebpackRuntime. @internal */
export function _setBridgeFactoryForTesting(factory: BridgeFactory | null): void {
  bridgeFactory = factory ?? ((opts) => new CortexWebpackRuntime(opts))
  bridge = null
}

async function startBridge(options: CortexNextOptions): Promise<void> {
  if (!bridge) {
    bridge = bridgeFactory({
      root: options.projectRoot ?? process.cwd(),
      mode: 'development',
      port: options.port,
      toggleShortcut: validateToggleShortcut(options.toggleShortcut ?? DEFAULT_TOGGLE_SHORTCUT),
    })
    if (!signalHandlersInstalled) {
      signalHandlersInstalled = true
      // Best-effort cleanup on Ctrl+C / kill. Next installs its own handlers
      // that exit the process; these run alongside. A hard kill leaves the
      // .cortex/ lock behind — its staleness detection recovers on next start.
      const disposeBridge = () => { bridge?.dispose().catch(() => {}) }
      process.once('SIGINT', disposeBridge)
      process.once('SIGTERM', disposeBridge)
    }
  }
  // start() memoizes; a lock-refused start logs and returns cleanly without
  // throwing. Anything else (port collision, EACCES) must not take down the
  // user's dev server — cortex degrades to inert with a visible error.
  try {
    await bridge.start()
  } catch (err) {
    console.error('[cortex] Bridge failed to start — editor disabled:', err instanceof Error ? err.message : err)
  }
}

export function withCortex(nextConfig: NextConfig = {}, options: CortexNextOptions = {}): NextConfig | NextConfigFunction {
  if (process.env.NODE_ENV === 'production') return nextConfig

  const wrapped = buildWrappedConfig(nextConfig, options)

  // Function form so we learn the phase: next.config is evaluated in more than
  // one process (CLI, dev server, build), and only the dev-server process may
  // own the bridge. Awaiting start() here also guarantees the .cortex/
  // discovery files exist before the first render — <CortexDevScripts/> never
  // races the bridge.
  return async (phase: string) => {
    if (phase === PHASE_DEVELOPMENT_SERVER) {
      await startBridge(options)
    }
    return wrapped
  }
}

function buildWrappedConfig(nextConfig: NextConfig, options: CortexNextOptions): NextConfig {
  return {
    ...nextConfig,

    // <CortexDevScripts/> pulls in the bridge machinery (ws, edit pipeline,
    // fs) — server-only code that must resolve via Node at runtime rather
    // than be bundled into the RSC module graph. This also makes resolution
    // work when cortex-editor is a symlinked (file:/link:) dependency outside
    // the project root, which the bundler otherwise fails to resolve.
    serverExternalPackages: nextConfig.serverExternalPackages?.includes('cortex-editor')
      ? nextConfig.serverExternalPackages
      : [...(nextConfig.serverExternalPackages ?? []), 'cortex-editor'],

    // Turbopack path — `next dev` default since Next 16. The webpack() hook
    // below is never called there; these rules are the equivalent entry point.
    turbopack: withCortexTurbopack(nextConfig.turbopack, options),

    webpack(config: WebpackConfig, context: WebpackContext) {
      // Apply user's webpack config first
      if (typeof nextConfig.webpack === 'function') {
        config = nextConfig.webpack(config, context)
      }

      // Instrument BOTH server and client compilations. Next prerenders client
      // components on the server, so client-only instrumentation makes SSR HTML
      // and the client render disagree about data-cortex-* attributes — React
      // does not guarantee mismatched attributes are patched, so attribution
      // could silently vanish. Symmetric instrumentation keeps them identical
      // (and matches the Turbopack rules, which apply to every environment).
      // enforce: 'pre' ensures this runs before SWC/Babel strip JSX syntax.
      config.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: (resourcePath: string) => shouldExcludeCortexSource(resourcePath, options.includeNodeModules),
        enforce: 'pre' as const,
        use: [{
          loader: resolveLoaderPath(),
          options: buildLoaderOptions(context.dir, options),
        }],
      })

      return config
    },
  }
}
