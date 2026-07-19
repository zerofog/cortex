import path from 'path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'url'
import { shouldExcludeCortexSource } from './source-loader-utils.js'
// Only the LEAF injection-snippet module is imported statically here — it has no
// heavy deps. webpack.ts (ws, zod, CortexSession, the edit pipeline) is loaded
// LAZILY inside the bridge factory (see defaultBridgeFactory) so importing this
// module — e.g. `import { CortexDevScripts } from 'cortex-editor/next'` in a
// user's root layout — never evaluates the bridge graph in an RSC worker. (3F)
import { DEFAULT_TOGGLE_SHORTCUT, validateToggleShortcut } from './injection-snippet.js'

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
function buildLoaderOptions(
  projectRoot: string,
  options: CortexNextOptions,
  runtimeId?: string,
): Record<string, unknown> {
  const loaderOptions: Record<string, unknown> = { projectRoot }
  if (options.resolveAlias !== undefined) loaderOptions.resolveAlias = options.resolveAlias
  if (options.includeNodeModules !== undefined) loaderOptions.includeNodeModules = options.includeNodeModules
  // ZF0-1851: only present when a bridge is active (dev-server phase). Absent
  // otherwise so isRuntimeDisabled(undefined) short-circuits to false — and so
  // the serializability contract (no undefined-valued keys) holds.
  if (runtimeId !== undefined) loaderOptions.runtimeId = runtimeId
  return loaderOptions
}

function isTurbopackRuleObject(value: unknown): value is TurbopackRuleObject {
  return typeof value === 'object' && value !== null && Array.isArray((value as TurbopackRuleObject).loaders)
}

/** Globs cortex instruments. Turbopack rules have no function-valued `exclude`,
 *  so node_modules filtering happens inside the loader (shouldExcludeCortexSource). */
const CORTEX_TURBOPACK_GLOBS = ['*.tsx', '*.jsx'] as const

function withCortexTurbopack(
  existing: TurbopackConfig | undefined,
  options: CortexNextOptions,
  runtimeId?: string,
): TurbopackConfig {
  const projectRoot = options.projectRoot ?? process.cwd()
  const cortexLoader = {
    loader: resolveLoaderPath(),
    options: buildLoaderOptions(projectRoot, options, runtimeId),
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

/** Value of PHASE_DEVELOPMENT_SERVER in next/constants — hardcoded because
 *  `next` is an optional peer and this module must load without it. */
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'

/** True when THIS process is the Next dev server evaluating next.config.
 *
 *  `next dev` does NOT set NEXT_PHASE in the environment at config-eval time
 *  (verified empirically on Next 16.2: NEXT_PHASE is only passed as the argument
 *  to the phase-FUNCTION config form). We avoid the phase-function form on
 *  purpose — it would make withCortex return a function, which breaks
 *  composition with wrappers that spread the config (withBundleAnalyzer(...),
 *  withPWA(...)). The reliable eval-time signal the dev server DOES set is the
 *  internal `__NEXT_DEV_SERVER=1`; NEXT_PHASE is also accepted so the unit tests
 *  (which stub it) and any Next build that does export it still work. The
 *  production early-return in withCortex short-circuits before this is consulted,
 *  so a stray var cannot start the bridge during `next build`.
 *
 *  Reliance note: `__NEXT_DEV_SERVER` is a private Next internal. If a future
 *  Next renames it, cortex would go inert on `next dev` (the exact failure this
 *  whole effort fixed) — so this predicate is the first thing to check when a
 *  Next upgrade breaks activation. Tracked for the re-review as a fragility. */
function isNextDevServer(): boolean {
  return (
    process.env.__NEXT_DEV_SERVER === '1' ||
    process.env.NEXT_PHASE === PHASE_DEVELOPMENT_SERVER
  )
}

interface BridgeHandle {
  /** ZF0-1851: per-runtime id keyed by the source-loader's isRuntimeDisabled
   *  gate. next.ts generates this id up front and PASSES it into the factory
   *  (so the same id can be threaded into the loader options synchronously,
   *  before the async bridge construction resolves); the bridge uses it. */
  readonly runtimeId: string
  start(): Promise<void>
  dispose(): Promise<void>
}

interface BridgeFactoryOptions {
  root: string
  mode: string
  port?: number
  toggleShortcut: string
  /** Generated in next.ts and passed in so the loader options and the bridge
   *  share ONE id — the ZF0-1851 lock-refusal gate keys on it. */
  runtimeId: string
}

type BridgeFactory = (opts: BridgeFactoryOptions) => BridgeHandle | Promise<BridgeHandle>

/** Default factory: lazily import webpack.ts so its heavy graph (ws, zod, the
 *  session/edit pipeline) is only evaluated in the dev-server process that
 *  actually constructs a bridge — never in an RSC worker that merely imports
 *  <CortexDevScripts/>. Only reached under the dev-server gate. (3F) */
async function defaultBridgeFactory(opts: BridgeFactoryOptions): Promise<BridgeHandle> {
  const { CortexWebpackRuntime } = await import('./webpack.js')
  return new CortexWebpackRuntime(opts)
}

let bridgeFactory: BridgeFactory = defaultBridgeFactory
let bridge: BridgeHandle | null = null
let bridgeStartup: Promise<BridgeHandle | null> | null = null
let signalHandlersInstalled = false
let registeredSignalHandlers: Array<[NodeJS.Signals, () => void]> = []

/** Swap the bridge implementation and reset singleton state. Pass null to
 *  restore the real lazy-loaded CortexWebpackRuntime. @internal */
export function _setBridgeFactoryForTesting(factory: BridgeFactory | null): void {
  bridgeFactory = factory ?? defaultBridgeFactory
  bridge = null
  bridgeStartup = null
  // Detach any signal handlers a prior test installed so each test starts from a
  // clean process, and so no re-raising handler is left registered to exit the
  // vitest process on a real signal during the run. Inert in production (this is
  // never called there).
  for (const [signal, handler] of registeredSignalHandlers) process.removeListener(signal, handler)
  registeredSignalHandlers = []
  signalHandlersInstalled = false
}

/** Dispose the bridge, then COOPERATIVELY re-raise the signal. Registering a
 *  SIGINT/SIGTERM listener suppresses Node's default die-on-signal, so without
 *  re-raising, the first Ctrl+C in a programmatic dev server (next({dev:true})
 *  with no other handler) would only kick dispose and leave the process alive
 *  until a second press.
 *
 *  We deliberately do NOT process.exit here: a synchronous exit preempts Next's
 *  own async graceful shutdown (Turbopack engine / child teardown) on every
 *  Ctrl+C. Instead we remove OUR listener and process.kill(pid, signal) so the
 *  next handler in line — Node's default, or Next's own graceful handler — runs
 *  normally. This also makes an inert (lock-refused) bridge's handler harmless:
 *  dispose is a no-op and the re-raise simply passes through.
 *
 *  Dispose is async and best-effort — we do not block termination on it (a hard
 *  signal leaves the .cortex/ lock behind; staleness detection recovers it on
 *  next start). */
function handleTerminationSignal(signal: 'SIGINT' | 'SIGTERM'): void {
  bridge?.dispose().catch(() => {})
  // Remove our own listener(s) for this signal so the re-raise below reaches the
  // default/next handler instead of looping back into us. (process.once does not
  // auto-remove when the unwrapped listener is invoked directly, so this explicit
  // removal is load-bearing, not just belt-and-suspenders.)
  for (const [sig, handler] of registeredSignalHandlers) {
    if (sig === signal) process.removeListener(signal, handler)
  }
  registeredSignalHandlers = registeredSignalHandlers.filter(([sig]) => sig !== signal)
  process.kill(process.pid, signal)
}

function installSignalHandlers(): void {
  if (signalHandlersInstalled) return
  signalHandlersInstalled = true
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => handleTerminationSignal(signal)
    registeredSignalHandlers.push([signal, handler])
    process.once(signal, handler)
  }
}

/** Validate the toggle shortcut defensively. validateToggleShortcut THROWS on a
 *  malformed shortcut; letting that propagate out of withCortex during
 *  next.config evaluation would abort `next dev` with a stack trace — the exact
 *  opposite of the adapter's resilience contract (startBridge deliberately
 *  swallows port/EACCES so cortex "must not take down the user's dev server").
 *  So a bad shortcut degrades to the default with a visible warning instead. */
function resolveToggleShortcut(input: string | undefined): string {
  const candidate = input ?? DEFAULT_TOGGLE_SHORTCUT
  try {
    return validateToggleShortcut(candidate)
  } catch {
    console.warn(
      `[cortex] Invalid toggleShortcut ${JSON.stringify(candidate)} — falling back to the default ` +
      `${DEFAULT_TOGGLE_SHORTCUT}. Expected tinykeys syntax like "$mod+Shift+Period".`,
    )
    return DEFAULT_TOGGLE_SHORTCUT
  }
}

/** Construct the singleton bridge exactly once, memoizing the (async) factory
 *  call so repeated dev-server evaluations of next.config reuse one bridge even
 *  before the first construction resolves. The factory is async now because the
 *  default one lazy-imports webpack.ts (3F); the runtimeId is generated up front
 *  in withCortex and passed in, so the config object can still carry it into the
 *  loader options SYNCHRONOUSLY without waiting on this. */
function ensureBridge(
  options: CortexNextOptions,
  runtimeId: string,
  toggleShortcut: string,
): Promise<BridgeHandle | null> {
  if (!bridgeStartup) {
    bridgeStartup = Promise.resolve(
      bridgeFactory({
        root: options.projectRoot ?? process.cwd(),
        mode: 'development',
        port: options.port,
        toggleShortcut,
        runtimeId,
      }),
    ).then((constructed) => {
      bridge = constructed
      return constructed
    })
  }
  return bridgeStartup
}

/** Fire-and-forget bridge startup. Anything that goes wrong (lazy-import
 *  failure, port collision, EACCES, lock-refused) must NOT take down the user's
 *  dev server — cortex degrades to inert with a visible error. start() memoizes;
 *  a lock-refused start logs and returns cleanly without throwing. */
async function startBridge(
  options: CortexNextOptions,
  runtimeId: string,
  toggleShortcut: string,
): Promise<void> {
  let handle: BridgeHandle | null
  try {
    handle = await ensureBridge(options, runtimeId, toggleShortcut)
  } catch (err) {
    console.error('[cortex] Bridge failed to construct — editor disabled:', err instanceof Error ? err.message : err)
    return
  }
  if (!handle) return
  try {
    await handle.start()
  } catch (err) {
    console.error('[cortex] Bridge failed to start — editor disabled:', err instanceof Error ? err.message : err)
  }
}

/** Idempotently add `cortex-editor` to serverExternalPackages. <CortexDevScripts/>
 *  pulls in server-only bridge machinery (ws, edit pipeline, fs) that must
 *  resolve via Node at runtime rather than be bundled into the RSC module graph
 *  — this is also the only way resolution works when cortex-editor is a
 *  symlinked (file:/link:) dependency outside the project root. Applied on BOTH
 *  the production and the dev path so a `next build` of a project that imports
 *  <CortexDevScripts/> still resolves. */
function mergeCortexServerExternals(existing: string[] | undefined): string[] {
  return existing?.includes('cortex-editor') ? existing : [...(existing ?? []), 'cortex-editor']
}

export function withCortex(nextConfig: NextConfig = {}, options: CortexNextOptions = {}): NextConfig {
  // Production `next build`: `cortex init` leaves a permanent <CortexDevScripts/>
  // import in the layout, so the bridge module graph (ws, edit pipeline) is
  // still pulled into the RSC server graph. Externalize cortex-editor so it
  // resolves at runtime — but add NO turbopack rules, NO webpack hook, and
  // start NO bridge in production.
  if (process.env.NODE_ENV === 'production') {
    return { ...nextConfig, serverExternalPackages: mergeCortexServerExternals(nextConfig.serverExternalPackages) }
  }

  // withCortex must ALWAYS return a plain object so it composes with wrappers
  // that spread the result — withBundleAnalyzer(withCortex(cfg)), withPWA(...):
  // spreading a function yields {} and silently drops the entire config. Gate
  // the bridge on a reliable dev-server signal (isNextDevServer) instead of the
  // return shape. start() is fire-and-forget (it already swallows/logs its own
  // errors) so config return stays synchronous — the .cortex/ discovery files
  // being ready before first render is best-effort (<CortexDevScripts/> renders
  // null + warns when they are absent).
  //
  // The bridge is now constructed ASYNCHRONOUSLY (the factory lazy-imports
  // webpack.ts — 3F), so we can't read runtimeId back off the instance
  // synchronously. Instead we GENERATE it here and pass it into the factory, and
  // use the same id for the loader options built below. Both loader entry points
  // must carry the SAME id the bridge was given so the ZF0-1851 lock-refusal gate
  // (source-loader isRuntimeDisabled) can key on it — a second `next dev` that
  // loses the .cortex/ lock then goes inert instead of injecting the other
  // server's port/token. Non-dev-server processes start no bridge, so there is no
  // lock to refuse and runtimeId is left undefined.
  //
  // Toggle validation + signal-handler install stay SYNCHRONOUS (they don't need
  // the heavy module) so a bad shortcut warns and signal handlers are armed
  // immediately, regardless of when the async bridge construction resolves.
  let runtimeId: string | undefined
  if (isNextDevServer()) {
    runtimeId = randomUUID()
    const toggleShortcut = resolveToggleShortcut(options.toggleShortcut)
    installSignalHandlers()
    void startBridge(options, runtimeId, toggleShortcut)
  }

  return buildWrappedConfig(nextConfig, options, runtimeId)
}

function buildWrappedConfig(nextConfig: NextConfig, options: CortexNextOptions, runtimeId?: string): NextConfig {
  return {
    ...nextConfig,

    serverExternalPackages: mergeCortexServerExternals(nextConfig.serverExternalPackages),

    // Turbopack path — `next dev` default since Next 16. The webpack() hook
    // below is never called there; these rules are the equivalent entry point.
    //
    // KNOWN LIMITATION (3G, documented — do not "fix"): the runtimeId threaded
    // here is BEST-EFFORT under Turbopack. The next-source-loader runs in a
    // separate Turbopack worker process, so its module-global `disabledRuntimes`
    // Set is never the one markRuntimeDisabled() mutates in THIS (dev-server)
    // process — the ZF0-1851 lock-refusal gate cannot disable loader transforms
    // across the Turbopack worker boundary (a lock-refused second `next dev`
    // degrades to attributes-without-editor). The threading IS kept because it
    // still works for the single-process webpack path. See
    // thoughts/shared/research/2026-07-18-nextjs-analysis-review-addendum.md.
    turbopack: withCortexTurbopack(nextConfig.turbopack, options, runtimeId),

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
          options: buildLoaderOptions(context.dir, options, runtimeId),
        }],
      })

      return config
    },
  }
}
