import fs from 'fs'
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
// cortex-lock is dependency-light (node:fs/path/crypto) — safe for this
// config-eval module; the heavy bridge graph stays behind the lazy import.
import { advertiseLockFamilyNonce, inheritedLockFamilyNonce } from '../core/cortex-lock.js'

export { CortexDevScripts, type CortexDevScriptsProps } from './next-dev-scripts.js'

/**
 * Minimal subset of next's NextConfig sufficient for wrapping.
 * Avoids a hard dev dependency on the `next` package (it is an optional peer).
 * When users have next installed the real NextConfig is assignment-compatible
 * with this interface since we only declare what we actually use.
 */
export interface NextConfig {
  /** `| null` is load-bearing: Next's own NextConfig declares webpack as
   *  `NextJsWebpackConfig | null | undefined`, so without it
   *  `withCortex(realNextConfig)` fails tsc in strict host repos. Only a
   *  function value is ever invoked (buildWrappedConfig type-guards). */
  webpack?: ((config: WebpackConfig, context: WebpackContext) => WebpackConfig) | null
  turbopack?: TurbopackConfig
  serverExternalPackages?: string[]
  [key: string]: unknown
}

/** Context Next passes to a phase-function config (`(phase, { defaultConfig }) => cfg`). */
export interface NextConfigPhaseContext {
  defaultConfig: Record<string, unknown>
  [key: string]: unknown
}

/** The phase-function config form — Next's public contract for phase-aware
 *  configuration. withCortex RETURNS this shape, and ACCEPTS it as input so an
 *  already-function-shaped user config keeps working. */
export type NextPhaseConfigFunction = (
  phase: string,
  context: NextConfigPhaseContext,
) => NextConfig | Promise<NextConfig>

/** Everything withCortex accepts: a plain config object, a promise of one
 *  (`export default (async () => cfg)()`), or the phase-function form — the
 *  same three shapes Next's own config loader awaits. */
export type NextConfigInput = NextConfig | Promise<NextConfig> | NextPhaseConfigFunction

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

/** Phase values from next/constants — hardcoded (not imported) because `next`
 *  is an optional peer and this module must load without it. These are public,
 *  frozen API strings: every phase-function next.config in the ecosystem
 *  matches on them, so Next cannot change them without breaking all of those.
 *
 *  History (do not regress): 0.3.0 originally detected the dev server via
 *  `process.env.__NEXT_DEV_SERVER === '1' || process.env.NEXT_PHASE === ...`.
 *  Probe-verified on a real Next 16.1.6 app: NEITHER var exists at config-eval
 *  time — `__NEXT_DEV_SERVER` was only introduced around Next 16.2 and
 *  NEXT_PHASE is never exported to the environment. The phase arrives solely as
 *  the ARGUMENT to a phase-function config, which is why withCortex now returns
 *  that form. */
const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'
const PHASE_PRODUCTION_BUILD = 'phase-production-build'
const PHASE_PRODUCTION_SERVER = 'phase-production-server'

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

/** Per-project bridge singleton state.
 *
 *  runtimeId is memoized alongside the bridge: the ONE id shared by the bridge
 *  and the loader options. Regenerating per evaluation would hand the loaders a
 *  fresh id while the memoized bridge keeps the first, defeating the ZF0-1851
 *  lock-refusal gate. `terminating` is set when a termination signal arrives —
 *  read by startBridge so a bridge whose async construction was in flight when
 *  the signal fired is disposed instead of started. */
interface BridgeState {
  runtimeId: string | null
  bridge: BridgeHandle | null
  startup: Promise<BridgeHandle | null> | null
  terminating: boolean
  signalHandlersInstalled: boolean
  registeredSignalHandlers: Array<[NodeJS.Signals, () => void]>
}

/** Bridge state lives on globalThis (NOT module scope), keyed by canonicalized
 *  project root. Next can evaluate next.config through BOTH package builds in
 *  one process — the CJS build (config loader) and the ESM build — giving each
 *  module instance its own module scope. Module-scoped memoization then misses,
 *  a second bridge constructs, and its lock acquire races the first (the
 *  nondeterministic "[cortex] Another cortex instance (pid N)…" warning seen on
 *  real Next 16 boots). Symbol.for + globalThis is the one per-realm scope both
 *  module instances share. The symbol is deliberately versionless: the
 *  realistic dual-instance is the CJS+ESM pair of ONE installed version, whose
 *  state shapes are identical. */
const BRIDGE_REGISTRY_KEY = Symbol.for('cortex-editor.next-bridge-registry')

function bridgeRegistry(): Map<string, BridgeState> {
  const holder = globalThis as unknown as Record<symbol, Map<string, BridgeState> | undefined>
  return (holder[BRIDGE_REGISTRY_KEY] ??= new Map())
}

/** realpath so the same project reached via a symlink dedupes to one bridge;
 *  resolve-only fallback keeps this best-effort (a vanished cwd must not throw
 *  during config evaluation). */
function canonicalProjectRoot(projectRoot: string): string {
  try {
    return fs.realpathSync(projectRoot)
  } catch {
    return path.resolve(projectRoot)
  }
}

function bridgeStateFor(canonicalRoot: string): BridgeState {
  const registry = bridgeRegistry()
  let state = registry.get(canonicalRoot)
  if (!state) {
    state = {
      runtimeId: null,
      bridge: null,
      startup: null,
      terminating: false,
      signalHandlersInstalled: false,
      registeredSignalHandlers: [],
    }
    registry.set(canonicalRoot, state)
  }
  return state
}

/** Swap the bridge implementation and reset singleton state. Pass null to
 *  restore the real lazy-loaded CortexWebpackRuntime. @internal */
export function _setBridgeFactoryForTesting(factory: BridgeFactory | null): void {
  bridgeFactory = factory ?? defaultBridgeFactory
  // Detach any signal handlers a prior test installed so each test starts from a
  // clean process, and so no re-raising handler is left registered to exit the
  // vitest process on a real signal during the run. Inert in production (this is
  // never called there).
  for (const state of bridgeRegistry().values()) {
    for (const [signal, handler] of state.registeredSignalHandlers) process.removeListener(signal, handler)
  }
  bridgeRegistry().clear()
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
function handleTerminationSignal(signal: 'SIGINT' | 'SIGTERM', state: BridgeState): void {
  // Flag first so a bridge still under async construction (startBridge awaiting
  // the lazy import) is disposed rather than started — see startBridge.
  state.terminating = true
  state.bridge?.dispose().catch(() => {})
  // Remove our own listener(s) for this signal so the re-raise below reaches the
  // default/next handler instead of looping back into us. (process.once does not
  // auto-remove when the unwrapped listener is invoked directly, so this explicit
  // removal is load-bearing, not just belt-and-suspenders.)
  state.registeredSignalHandlers = state.registeredSignalHandlers.filter(([sig, handler]) => {
    if (sig !== signal) return true
    process.removeListener(signal, handler)
    return false
  })
  // Re-raise ONLY when no other handler remains. Peer handlers (Next's own
  // graceful-shutdown handler, a user's) already received the ORIGINAL signal in
  // this same dispatch, so re-raising would deliver it to them a second time —
  // potentially escalating a graceful shutdown into a forced one. We re-raise
  // solely to cover the case where cortex was the ONLY listener (a programmatic
  // dev server), where suppressing Node's default die-on-signal would otherwise
  // hang the process until a second Ctrl+C.
  if (process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal)
  }
}

function installSignalHandlers(state: BridgeState): void {
  if (state.signalHandlersInstalled) return
  state.signalHandlersInstalled = true
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => handleTerminationSignal(signal, state)
    state.registeredSignalHandlers.push([signal, handler])
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
  state: BridgeState,
): Promise<BridgeHandle | null> {
  if (!state.startup) {
    state.startup = Promise.resolve(
      bridgeFactory({
        root: options.projectRoot ?? process.cwd(),
        mode: 'development',
        port: options.port,
        toggleShortcut,
        runtimeId,
      }),
    ).then((constructed) => {
      state.bridge = constructed
      return constructed
    })
  }
  return state.startup
}

/** Fire-and-forget bridge startup. Anything that goes wrong (lazy-import
 *  failure, port collision, EACCES, lock-refused) must NOT take down the user's
 *  dev server — cortex degrades to inert with a visible error. start() memoizes;
 *  a lock-refused start logs and returns cleanly without throwing. */
async function startBridge(
  options: CortexNextOptions,
  runtimeId: string,
  toggleShortcut: string,
  state: BridgeState,
): Promise<void> {
  let handle: BridgeHandle | null
  try {
    handle = await ensureBridge(options, runtimeId, toggleShortcut, state)
  } catch (err) {
    console.error('[cortex] Bridge failed to construct — editor disabled:', err instanceof Error ? err.message : err)
    return
  }
  if (!handle) return
  // A termination signal may have fired during the async construction above
  // (the lazy import + factory). Starting now would boot a server mid-shutdown;
  // dispose what we constructed instead.
  if (state.terminating) {
    handle.dispose().catch(() => {})
    return
  }
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
 *  <CortexDevScripts/> still resolves.
 *
 *  Skips the add if the user already lists cortex-editor in transpilePackages:
 *  Next throws "can't be both in serverExternalPackages and transpilePackages" at
 *  config load, which would abort `next dev`/`next build`. Their explicit
 *  transpile choice wins; we warn so the RSC-externalization expectation is clear. */
function withCortexServerExternals(nextConfig: NextConfig): string[] | undefined {
  const existing = nextConfig.serverExternalPackages
  if (Array.isArray(nextConfig.transpilePackages) && nextConfig.transpilePackages.includes('cortex-editor')) {
    console.warn(
      '[cortex] cortex-editor is in transpilePackages, so it was NOT added to ' +
      'serverExternalPackages (Next rejects a package in both). If a Next build ' +
      'fails resolving the cortex-editor bridge, remove it from transpilePackages.'
    )
    return existing
  }
  return existing?.includes('cortex-editor') ? existing : [...(existing ?? []), 'cortex-editor']
}

/**
 * Wrap a Next config with cortex source instrumentation + the dev bridge.
 *
 * Returns the PHASE-FUNCTION config form — `(phase, ctx) => finalConfig` —
 * because the phase is Next's only public, version-stable signal for "this
 * process is the dev server" (probe-verified: no env var carries it at
 * config-eval time on Next 13–16.1; `__NEXT_DEV_SERVER` only exists from
 * ~16.2). Consequences:
 *
 * - withCortex must be the OUTERMOST wrapper. Object-spreading wrappers
 *   (withBundleAnalyzer(withCortex(cfg))) would spread a function into `{}` and
 *   silently drop the config. Compose as withCortex(withBundleAnalyzer(cfg))
 *   instead — the `cortex init` codemod already places it outermost.
 * - A function-shaped user config is called with the ORIGINAL (phase, ctx) and
 *   its sync/async shape is preserved: an object or sync-function input yields
 *   a sync result (never an unexpected Promise); a Promise-returning input
 *   yields a Promise. Exceptions/rejections propagate unchanged, and the
 *   bridge only starts after the user config resolves successfully.
 *
 * The bridge is gated on PHASE_DEVELOPMENT_SERVER (+ a NODE_ENV=production
 * belt-and-braces), which keeps it out of `next build`/`next start`, next-jest
 * (PHASE_TEST), and every other non-dev phase. Some hosts DO evaluate the
 * config with the dev phase without being the dev server — Next's detached
 * telemetry flusher, the exiting `next dev` CLI parent, Storybook's nextjs
 * framework. Two mitigations: the bridge's handles are unref'd (cortex never
 * pins a process's event loop, so short-lived evaluators drain, exit, and
 * release the lock — no zombie can hold `.cortex/` hostage), and
 * `CORTEX_BRIDGE=0` is the explicit opt-out for long-lived non-dev-server
 * hosts. Instrumentation transforms still apply under the opt-out (they are
 * pure config); only the bridge is suppressed.
 */
export function withCortex(nextConfig: NextConfigInput = {}, options: CortexNextOptions = {}): NextPhaseConfigFunction {
  return function cortexPhaseConfig(phase: string, phaseContext: NextConfigPhaseContext): NextConfig | Promise<NextConfig> {
    // Do not evaluate a function-shaped user config early, and do not catch its
    // errors — a broken user config must fail `next dev`/`next build` exactly
    // as it would without cortex.
    const resolved = typeof nextConfig === 'function' ? nextConfig(phase, phaseContext) : nextConfig
    if (isPromiseLike(resolved)) {
      return resolved.then((config) => finalizePhaseConfig(config, options, phase))
    }
    return finalizePhaseConfig(resolved, options, phase)
  }
}

function isPromiseLike(value: NextConfig | Promise<NextConfig>): value is Promise<NextConfig> {
  return typeof (value as { then?: unknown }).then === 'function'
}

function finalizePhaseConfig(nextConfig: NextConfig, options: CortexNextOptions, phase: string): NextConfig {
  // Production (`next build` / `next start`): `cortex init` leaves a permanent
  // <CortexDevScripts/> import in the layout, so the bridge module graph (ws,
  // edit pipeline) is still pulled into the RSC server graph. Externalize
  // cortex-editor so it resolves at runtime — but add NO turbopack rules, NO
  // webpack hook, and start NO bridge. Gated on BOTH the phase and NODE_ENV:
  // Next forces NODE_ENV=production for build/start, but an explicitly forced
  // NODE_ENV=development build must still not bake data-cortex-source
  // attributes (leaking source paths) into production output.
  if (
    process.env.NODE_ENV === 'production' ||
    phase === PHASE_PRODUCTION_BUILD ||
    phase === PHASE_PRODUCTION_SERVER
  ) {
    return { ...nextConfig, serverExternalPackages: withCortexServerExternals(nextConfig) }
  }

  // Instrumentation transforms apply on EVERY non-production phase — only the
  // bridge below is phase-gated. Phase-gating the transforms too would let the
  // dev server's multiple config evaluations disagree about the module graph.
  //
  // The bridge is constructed ASYNCHRONOUSLY (the factory lazy-imports
  // webpack.ts — 3F), so runtimeId can't be read back off the instance
  // synchronously. It is GENERATED here, memoized in the per-project global
  // state, and passed both into the factory and into the loader options so the
  // ZF0-1851 lock-refusal gate (source-loader isRuntimeDisabled) keys on ONE
  // shared id. Non-dev-server phases start no bridge, so there is no lock to
  // refuse and runtimeId stays undefined.
  //
  // Toggle validation + signal-handler install stay SYNCHRONOUS (they don't
  // need the heavy module) so a bad shortcut warns and signal handlers are
  // armed immediately, regardless of when the async construction resolves.
  let runtimeId: string | undefined
  if (phase === PHASE_DEVELOPMENT_SERVER && process.env.CORTEX_BRIDGE !== '0') {
    const state = bridgeStateFor(canonicalProjectRoot(options.projectRoot ?? process.cwd()))
    // ADOPT an inherited family nonce when one exists (we were spawned by a
    // cortex-advertising process — the same boot): using the SAME nonce as
    // our lock nonce makes family classification direction-independent. A
    // fresh id is minted only at the family root. See inheritedLockFamilyNonce.
    runtimeId = state.runtimeId ??= inheritedLockFamilyNonce() ?? randomUUID()
    // Advertise SYNCHRONOUSLY, before Next can spawn any sibling/child process:
    // the bridge uses this same id as its lock nonce (lockOwnerNonce), so a
    // same-boot process that loses the lock race classifies the holder as
    // sameFamily (silent inert) even when it was spawned before the async
    // bridge construction below finished acquiring.
    advertiseLockFamilyNonce(runtimeId)
    const toggleShortcut = resolveToggleShortcut(options.toggleShortcut)
    installSignalHandlers(state)
    void startBridge(options, runtimeId, toggleShortcut, state)
  }

  return buildWrappedConfig(nextConfig, options, runtimeId)
}

function buildWrappedConfig(nextConfig: NextConfig, options: CortexNextOptions, runtimeId?: string): NextConfig {
  return {
    ...nextConfig,

    serverExternalPackages: withCortexServerExternals(nextConfig),

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
