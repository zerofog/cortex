import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  withCortex,
  _setBridgeFactoryForTesting,
  type NextConfig,
  type NextConfigPhaseContext,
  type NextPhaseConfigFunction,
} from '../../src/adapters/next.js'

// withCortex returns the PHASE-FUNCTION config form — `(phase, ctx) => config`
// — because the phase argument is Next's only public, version-stable dev-server
// signal (no env var carries it at config-eval time; the `__NEXT_DEV_SERVER`
// env var the previous implementation keyed on only exists from Next ~16.2).
// These tests exercise withCortex exactly the way Next's config loader does:
// call the returned function with a phase. NO test may stub NEXT_PHASE /
// __NEXT_DEV_SERVER — that was the self-certifying harness that let a
// dead-on-16.1 detection ship.
const DEV_PHASE = 'phase-development-server'
const BUILD_PHASE = 'phase-production-build'
const PROD_SERVER_PHASE = 'phase-production-server'
// A real non-dev, non-production phase (next-jest evaluates config with it):
// transforms must apply, the bridge must not start.
const TEST_PHASE = 'phase-test'

const phaseContext: NextConfigPhaseContext = { defaultConfig: {} }

/** Evaluate the phase function expecting the SYNC path (object/sync-fn input
 *  must never yield a Promise — ecosystem consumers of a resolved config would
 *  break on an unexpected thenable). */
function evalPhase(fn: NextPhaseConfigFunction, phase: string): NextConfig {
  const result = fn(phase, phaseContext)
  if (result instanceof Promise) throw new Error('expected a synchronous config, got a Promise')
  return result
}

// The bridge is constructed ASYNCHRONOUSLY (the factory lazy-imports
// webpack.ts — 3F), so factory/start calls land on a later microtask. Flush the
// microtask + macrotask queues before asserting on them. The config return for
// object inputs stays synchronous; only bridge startup is deferred.
const flushAsync = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function stubBridge() {
  const start = vi.fn(async () => {})
  const dispose = vi.fn(async () => {})
  const factory = vi.fn((opts: { runtimeId: string }) => ({ start, dispose, runtimeId: opts.runtimeId }))
  _setBridgeFactoryForTesting(factory)
  return { start, dispose, factory }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  _setBridgeFactoryForTesting(null)
})

describe('withCortex phase contract', () => {
  it('returns the phase-function config form', () => {
    expect(withCortex({})).toBeTypeOf('function')
  })

  it('yields a SYNCHRONOUS config for a plain object input (never an unexpected Promise)', () => {
    const result = withCortex({})(TEST_PHASE, phaseContext)
    expect(result instanceof Promise).toBe(false)
  })

  it('calls a function-shaped user config with the ORIGINAL phase and context', () => {
    const userConfig = vi.fn(() => ({ basePath: '/shop' }))
    const context: NextConfigPhaseContext = { defaultConfig: { distDir: '.next' } }

    const config = withCortex(userConfig)(TEST_PHASE, context) as NextConfig

    expect(userConfig).toHaveBeenCalledExactlyOnceWith(TEST_PHASE, context)
    expect(config.basePath).toBe('/shop')
  })

  it('preserves a sync function config result synchronously', () => {
    const result = withCortex(() => ({}))(TEST_PHASE, phaseContext)
    expect(result instanceof Promise).toBe(false)
  })

  it('resolves an async function config and wraps its result', async () => {
    const result = withCortex(async () => ({ basePath: '/async' }))(TEST_PHASE, phaseContext)
    expect(result).toBeInstanceOf(Promise)
    const config = await result
    expect(config.basePath).toBe('/async')
    expect(config.turbopack).toBeDefined()
  })

  it('resolves a promise-valued user config (export default (async () => cfg)())', async () => {
    const config = await withCortex(Promise.resolve({ basePath: '/p' }))(TEST_PHASE, phaseContext)
    expect(config.basePath).toBe('/p')
    expect(config.turbopack).toBeDefined()
  })

  it('preserves custom properties attached to the user config', () => {
    // RUNTIME passthrough contract: keys outside Next's NextConfig type still
    // survive the wrap (the spread copies everything). The double cast is
    // required — and correct — because the input TYPE is now Next's real
    // NextConfig (no index signature), so unknown keys are a compile error by
    // design; this test intentionally smuggles one past the compiler to pin
    // the runtime behavior.
    const userConfig = { myCustomKey: { nested: true }, env: { FLAG: '1' } } as unknown as Parameters<typeof withCortex>[0]
    const config = evalPhase(withCortex(userConfig), TEST_PHASE) as Record<string, unknown>
    expect(config.myCustomKey).toEqual({ nested: true })
    expect(config.env).toEqual({ FLAG: '1' })
  })

  it('propagates a sync user-config throw unchanged and never starts the bridge', () => {
    const { factory } = stubBridge()
    const fn = withCortex(() => { throw new Error('user config broke') })

    expect(() => fn(DEV_PHASE, phaseContext)).toThrow('user config broke')
    expect(factory).not.toHaveBeenCalled()
  })

  it('propagates an async user-config rejection unchanged and never starts the bridge', async () => {
    const { factory } = stubBridge()
    const fn = withCortex(async () => { throw new Error('async config broke') })

    await expect(fn(DEV_PHASE, phaseContext)).rejects.toThrow('async config broke')
    await flushAsync()
    expect(factory).not.toHaveBeenCalled()
  })

  it('starts the bridge only AFTER an async user config resolves successfully', async () => {
    const { factory } = stubBridge()
    let resolveUser!: (cfg: NextConfig) => void
    const userConfig = () => new Promise<NextConfig>((res) => { resolveUser = res })

    const pending = withCortex(userConfig)(DEV_PHASE, phaseContext)
    await flushAsync()
    expect(factory).not.toHaveBeenCalled()

    resolveUser({ reactStrictMode: true })
    const config = await pending
    await flushAsync()
    expect(factory).toHaveBeenCalledOnce()
    expect(config.reactStrictMode).toBe(true)
  })
})

describe('withCortex webpack instrumentation', () => {
  it('adds webpack loader rule for .jsx/.tsx files', () => {
    const config = evalPhase(withCortex({}), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
    const rule = webpackConfig.module.rules[0] as { test: RegExp; exclude: (resourcePath: string) => boolean }
    expect(rule.test).toEqual(/\.[jt]sx$/)
    expect(rule.exclude('/project/src/App.tsx')).toBe(false)
    expect(rule.exclude('/project/node_modules/react/index.jsx')).toBe(true)
  })

  it('lets explicitly included node_modules packages reach the shared loader', () => {
    const config = evalPhase(withCortex({}, { includeNodeModules: ['@acme/ui'] }), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as {
      exclude: (resourcePath: string) => boolean
      use: Array<{ options: { includeNodeModules?: string[] } }>
    }
    expect(rule.exclude('/project/node_modules/react/index.jsx')).toBe(true)
    expect(rule.exclude('/project/node_modules/@acme/ui/Button.tsx')).toBe(false)
    expect(rule.use[0]!.options.includeNodeModules).toEqual(['@acme/ui'])
  })

  it('passes resolve aliases through to the shared loader', () => {
    const config = evalPhase(withCortex({}, { resolveAlias: { '@': '/project/src' } }), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { resolveAlias?: Record<string, string> } }> }
    expect(rule.use[0]!.options.resolveAlias).toEqual({ '@': '/project/src' })
  })

  it('preserves existing webpack config', () => {
    const existingRule = { test: /\.css$/, use: ['style-loader'] }
    const originalWebpack = vi.fn((config: any) => {
      config.module.rules.push(existingRule)
      return config
    })

    const config = evalPhase(withCortex({ webpack: originalWebpack }), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(originalWebpack).toHaveBeenCalledOnce()
    expect(webpackConfig.module.rules).toHaveLength(2)
  })

  it('accepts webpack: null (the type Next actually declares) and installs only the cortex rule', () => {
    // Next's NextConfig types webpack as `NextJsWebpackConfig | null | undefined`.
    // A null value must typecheck AND be skipped at runtime — only function
    // values are invoked.
    const config = evalPhase(withCortex({ webpack: null }), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }

    config.webpack!(webpackConfig as any, { dir: '/project', dev: true, isServer: false } as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
  })

  it('passes projectRoot from context.dir to loader options', () => {
    const config = evalPhase(withCortex({}), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/my/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { projectRoot: string } }> }
    expect(rule.use[0]!.options.projectRoot).toBe('/my/project')
  })

  it('sets loader path to a string ending in next-source-loader', () => {
    const config = evalPhase(withCortex({}), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ loader: string }> }
    expect(typeof rule.use[0]!.loader).toBe('string')
    expect(rule.use[0]!.loader).toMatch(/next-source-loader/)
  })

  it('adds the loader for server-side builds too (symmetric instrumentation)', () => {
    // Next prerenders client components on the server; client-only
    // instrumentation makes SSR HTML and the client render disagree about
    // data-cortex-* attributes, and React does not guarantee mismatched
    // attributes get patched. Both sides must be instrumented identically.
    const config = evalPhase(withCortex({}), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: true }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
  })

  it('sets enforce: "pre" on the loader rule', () => {
    const config = evalPhase(withCortex({}), TEST_PHASE)
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { enforce: string }
    expect(rule.enforce).toBe('pre')
  })
})

describe('withCortex production behavior', () => {
  it('under NODE_ENV=production, externalizes cortex-editor without turbopack rules or the webpack hook', () => {
    // `cortex init` leaves a permanent <CortexDevScripts/> import in the layout,
    // so a production `next build` still pulls the bridge module graph into the
    // RSC server graph. Externalizing cortex-editor keeps it resolvable (esp. for
    // symlinked file:/link: installs) without instrumenting or starting anything.
    vi.stubEnv('NODE_ENV', 'production')
    const result = evalPhase(withCortex({ reactStrictMode: true }), TEST_PHASE)
    expect(result.serverExternalPackages).toContain('cortex-editor')
    expect(result.reactStrictMode).toBe(true)
    expect(result.turbopack).toBeUndefined()
    expect(result.webpack).toBeUndefined()
  })

  it.each([[BUILD_PHASE], [PROD_SERVER_PHASE]])(
    'treats %s as production even when NODE_ENV is forced to development',
    (phase) => {
      // Belt-and-braces both ways: a NODE_ENV=development `next build` must not
      // bake data-cortex-source attributes (leaking source paths) into
      // production output.
      vi.stubEnv('NODE_ENV', 'development')
      const { factory } = stubBridge()

      const result = evalPhase(withCortex({}), phase)

      expect(result.serverExternalPackages).toContain('cortex-editor')
      expect(result.turbopack).toBeUndefined()
      expect(result.webpack).toBeUndefined()
      expect(factory).not.toHaveBeenCalled()
    },
  )

  it('NODE_ENV=production wins even at the development-server phase (no bridge, no transforms)', () => {
    // The belt-and-braces direction: a host that forces production while
    // evaluating with the dev phase must get the externalize-only config.
    vi.stubEnv('NODE_ENV', 'production')
    const { factory } = stubBridge()

    const result = evalPhase(withCortex({}), DEV_PHASE)

    expect(factory).not.toHaveBeenCalled()
    expect(result.serverExternalPackages).toContain('cortex-editor')
    expect(result.turbopack).toBeUndefined()
    expect(result.webpack).toBeUndefined()
  })

  it('does not double-add cortex-editor to serverExternalPackages in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const result = evalPhase(withCortex({ serverExternalPackages: ['cortex-editor', 'sharp'] }), TEST_PHASE)
    expect(result.serverExternalPackages).toEqual(['cortex-editor', 'sharp'])
  })

  it('warns about the specific both-arrays conflict when cortex-editor is in transpilePackages AND serverExternalPackages', () => {
    // Self-conflicting config: Next aborts config load regardless of cortex. We
    // keep fail-fast (don't silently mutate the user's config) but name the
    // conflict explicitly so the fix is obvious.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    const result = evalPhase(
      withCortex({ transpilePackages: ['cortex-editor'], serverExternalPackages: ['cortex-editor'] }),
      TEST_PHASE,
    )
    // Preserved as-is (fail-fast) — not mutated to resolve the conflict.
    expect(result.serverExternalPackages).toEqual(['cortex-editor'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BOTH serverExternalPackages and transpilePackages'))
  })

  it('does NOT add cortex-editor to serverExternalPackages when it is in transpilePackages (review [4])', () => {
    // Next rejects a package in both lists, aborting config load. Respect the
    // user's transpile choice and warn instead of forcing the conflict.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    const result = evalPhase(withCortex({ transpilePackages: ['cortex-editor'] }), TEST_PHASE)
    expect(result.serverExternalPackages).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('transpilePackages'))
  })
})

describe('withCortex bridge lifecycle', () => {
  it('starts the bridge when Next evaluates the config with the development-server phase', async () => {
    const { start, factory } = stubBridge()

    evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()

    expect(factory).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
  })

  it.each([[TEST_PHASE], ['phase-export'], [BUILD_PHASE]])(
    'does not start the bridge for %s, but still returns a usable config',
    async (phase) => {
      const { start, factory } = stubBridge()

      const config = evalPhase(withCortex({}), phase)
      await flushAsync()

      expect(factory).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(config.serverExternalPackages).toContain('cortex-editor')
    },
  )

  it('honors the CORTEX_BRIDGE=0 opt-out: no bridge, instrumentation still applied', async () => {
    // Escape hatch for unusual hosts that evaluate the config with the dev
    // phase but must not get a WS sidecar. Transforms are pure config and stay.
    vi.stubEnv('CORTEX_BRIDGE', '0')
    const { factory } = stubBridge()

    const config = evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()

    expect(factory).not.toHaveBeenCalled()
    expect(config.turbopack).toBeDefined()
    expect(config.webpack).toBeTypeOf('function')
    const rules = (config.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
    const item = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(item.options).not.toHaveProperty('runtimeId')
  })

  it('ADOPTS an inherited family nonce as its runtimeId (direction-independent classification)', async () => {
    // A config evaluator spawned by a cortex-advertising parent must lock with
    // the PARENT's nonce, not a fresh one — env flows parent→child only, so a
    // child that wins the lock race with a fresh nonce would be classified
    // foreign by the parent (warn + instrumentation disabled in whichever
    // process compiles). Codex P1.
    vi.stubEnv('__CORTEX_LOCK_FAMILY', 'inherited-boot-nonce-a1')
    const { factory } = stubBridge()

    const config = evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()

    const runtimeId = (config.turbopack as { rules: Record<string, { loaders: Array<{ options: Record<string, unknown> }> }> })
      .rules['*.tsx']!.loaders[0]!.options.runtimeId
    expect(runtimeId).toBe('inherited-boot-nonce-a1')
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'inherited-boot-nonce-a1' }))
  })

  it('advertises the runtimeId in __CORTEX_LOCK_FAMILY synchronously at config-eval time', () => {
    // The bridge acquires its lock ASYNCHRONOUSLY with runtimeId as the lock
    // nonce. Advertising must happen before that — synchronously during config
    // evaluation — so a sibling process Next spawns in the interim inherits
    // the nonce and classifies the eventual holder as sameFamily.
    const familyBackup = process.env.__CORTEX_LOCK_FAMILY
    delete process.env.__CORTEX_LOCK_FAMILY
    // Factory intentionally never resolves: only the SYNCHRONOUS side effects
    // of the evaluation may be observed.
    _setBridgeFactoryForTesting(() => new Promise(() => {}))
    try {
      const config = evalPhase(withCortex({}), DEV_PHASE)
      const runtimeId = (config.turbopack as { rules: Record<string, { loaders: Array<{ options: Record<string, unknown> }> }> })
        .rules['*.tsx']!.loaders[0]!.options.runtimeId as string
      expect((process.env.__CORTEX_LOCK_FAMILY ?? '').split(',')).toContain(runtimeId)
    } finally {
      if (familyBackup === undefined) delete process.env.__CORTEX_LOCK_FAMILY
      else process.env.__CORTEX_LOCK_FAMILY = familyBackup
    }
  })

  it('reuses one bridge across repeated dev-server evaluations', async () => {
    const { start, factory } = stubBridge()

    evalPhase(withCortex({}), DEV_PHASE)
    evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()

    // Construction is memoized synchronously (state.startup) so two evaluations
    // share ONE bridge even before the first construction resolves...
    expect(factory).toHaveBeenCalledOnce()
    // ...but each evaluation still calls start() (which memoizes internally).
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('shares ONE runtimeId between the bridge and the loader options across repeated evaluations', async () => {
    // Regression: runtimeId was generated per evaluation while the bridge is
    // memoized, so a second evaluation handed the loaders a fresh id while the
    // bridge kept the first — defeating the ZF0-1851 lock-refusal gate. The id
    // must be memoized alongside the bridge.
    let factoryRuntimeId: string | undefined
    const factory = vi.fn((opts: { runtimeId: string }) => {
      factoryRuntimeId = opts.runtimeId
      return { start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: opts.runtimeId }
    })
    _setBridgeFactoryForTesting(factory)

    const loaderRuntimeId = (config: NextConfig): unknown =>
      (config.turbopack as { rules: Record<string, { loaders: Array<{ options: Record<string, unknown> }> }> })
        .rules['*.tsx']!.loaders[0]!.options.runtimeId

    const config1 = evalPhase(withCortex({}), DEV_PHASE)
    const config2 = evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()

    expect(factory).toHaveBeenCalledOnce()
    expect(factoryRuntimeId).toBeTruthy()
    // Both evaluations' loader options carry the SAME id, and it matches the
    // bridge's.
    expect(loaderRuntimeId(config1)).toBe(factoryRuntimeId)
    expect(loaderRuntimeId(config2)).toBe(factoryRuntimeId)
  })

  it('shares one bridge across dual module instances via the globalThis registry', async () => {
    // Next loads next.config through the package's CJS build while other
    // imports can evaluate the ESM build — two module instances in ONE process,
    // each with its own module scope. Module-scoped memoization missed there,
    // constructing a second bridge whose lock acquire raced the first (the
    // nondeterministic "Another cortex instance" warning on real Next boots).
    // The registry lives on globalThis, so a FRESH module instance must find
    // the first instance's startup promise and construct nothing.
    const { start, factory } = stubBridge()
    const config1 = evalPhase(withCortex({}), DEV_PHASE)
    await flushAsync()
    expect(factory).toHaveBeenCalledOnce()

    vi.resetModules()
    const second = await import('../../src/adapters/next.js')
    const config2 = second.withCortex({})(DEV_PHASE, phaseContext) as NextConfig
    await flushAsync()

    // The second instance's own (real) factory never ran — no second bridge…
    expect(factory).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledTimes(2)
    // …and both instances hand the loaders the SAME runtimeId.
    const idOf = (config: NextConfig): unknown =>
      (config.turbopack as { rules: Record<string, { loaders: Array<{ options: Record<string, unknown> }> }> })
        .rules['*.tsx']!.loaders[0]!.options.runtimeId
    expect(idOf(config2)).toBe(idOf(config1))
  })

  it('does not throw out of config building when the bridge fails to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    _setBridgeFactoryForTesting((opts) => ({
      start: async () => { throw new Error('EADDRINUSE') },
      dispose: async () => {},
      runtimeId: opts.runtimeId,
    }))

    const config = evalPhase(withCortex({}), DEV_PHASE)

    expect(config.webpack).toBeTypeOf('function')
    // start() is fire-and-forget; let its internal catch run.
    await flushAsync()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bridge failed to start'), 'EADDRINUSE')
  })

  it('degrades to the default toggle shortcut instead of aborting when the shortcut is invalid', () => {
    // validateToggleShortcut THROWS on a bad shortcut; if that propagates out of
    // withCortex during next.config evaluation, `next dev` aborts with a stack
    // trace. The adapter's resilience contract (startBridge swallows port/EACCES)
    // must extend here: warn, fall back to the default, never take down dev.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { factory } = stubBridge()

    const config = evalPhase(withCortex({}, { toggleShortcut: 'Cmd+.' }), DEV_PHASE)

    expect(typeof config).toBe('object')
    expect(config.webpack).toBeTypeOf('function')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid toggleShortcut'))
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ toggleShortcut: '$mod+Shift+Period' }))
  })

  it('passes port, toggleShortcut, and projectRoot through to the bridge', async () => {
    const { factory } = stubBridge()

    evalPhase(withCortex({}, { port: 4141, toggleShortcut: '$mod+Shift+Comma', projectRoot: '/my/app' }), DEV_PHASE)
    await flushAsync()

    // runtimeId is generated in next.ts and passed into the factory so the loader
    // options and the bridge share one id (ZF0-1851).
    expect(factory).toHaveBeenCalledWith({
      root: '/my/app',
      mode: 'development',
      port: 4141,
      toggleShortcut: '$mod+Shift+Comma',
      runtimeId: expect.any(String),
    })
  })
})

describe('withCortex termination handling', () => {
  let onceHandlers: Partial<Record<string, () => void>>
  let killSpy: MockInstance

  beforeEach(() => {
    onceHandlers = {}
    // Capture the SIGINT/SIGTERM handlers cortex installs, without letting them
    // reach the real process. process.kill is spied to a no-op so a re-raise
    // never terminates the vitest process.
    vi.spyOn(process, 'once').mockImplementation(((sig: string, handler: () => void) => {
      if (sig === 'SIGINT' || sig === 'SIGTERM') onceHandlers[sig] = handler
      return process
    }) as typeof process.once)
    vi.spyOn(process, 'removeListener').mockReturnValue(process)
    killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    _setBridgeFactoryForTesting(null)
  })

  it('re-raises the signal only when cortex is the last handler', () => {
    stubBridge()
    evalPhase(withCortex({}), DEV_PHASE)

    // Peers remain → do NOT re-raise (they already received the original signal).
    vi.spyOn(process, 'listenerCount').mockReturnValue(1)
    onceHandlers['SIGINT']!()
    expect(killSpy).not.toHaveBeenCalled()

    // No peers remain → re-raise so Node's default termination runs.
    vi.spyOn(process, 'listenerCount').mockReturnValue(0)
    onceHandlers['SIGTERM']!()
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
  })

  it('re-raises on first signal when TWO project roots each installed a cortex handler (cubic P1)', () => {
    // A process running bridges for two roots installs two cortex handlers. The
    // second must NOT count the first as an external peer — otherwise both
    // self-remove on dispatch, both see a "peer", neither re-raises, and the
    // process survives its first Ctrl+C. The LAST cortex handler must re-raise.
    vi.spyOn(process, 'listenerCount').mockReturnValue(0) // no external peers, ever
    stubBridge()
    evalPhase(withCortex({}, { projectRoot: '/root-a' }), DEV_PHASE)
    evalPhase(withCortex({}, { projectRoot: '/root-b' }), DEV_PHASE)

    // Both cortex handlers fire in one dispatch. Fire both captured handlers?
    // installSignalHandlers is once-guarded PER STATE, and both states share
    // the SIGINT slot in onceHandlers (last write wins), so drive the coordinator
    // directly by invoking the captured handler twice — each decrements the live
    // cortex-handler count; the last one re-raises.
    onceHandlers['SIGINT']!()
    expect(killSpy).not.toHaveBeenCalled() // first of two handlers — not last
    onceHandlers['SIGINT']!()
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT') // last handler re-raises
  })

  it('does NOT re-raise when a peer was present at install even if it self-removed by dispatch (cubic P2)', () => {
    // A peer's process.once handler self-removes (Node onceWrapper) BEFORE our
    // handler runs, so listenerCount at DISPATCH reads 0 — which would make us
    // wrongly re-raise and force-escalate the peer's graceful shutdown. The fix
    // snapshots peer presence at INSTALL. Simulate: 1 peer at install, 0 at
    // dispatch → cortex must NOT re-raise.
    const listenerCount = vi.spyOn(process, 'listenerCount').mockReturnValue(1)
    stubBridge()
    evalPhase(withCortex({}), DEV_PHASE) // installs handlers; snapshots peers=1

    listenerCount.mockReturnValue(0) // the once-peer self-removed this dispatch
    onceHandlers['SIGINT']!()
    expect(killSpy).not.toHaveBeenCalled()
  })

  it('disposes rather than starts a bridge whose async construction was in flight at termination', async () => {
    vi.spyOn(process, 'listenerCount').mockReturnValue(1) // suppress re-raise
    const start = vi.fn(async () => {})
    const dispose = vi.fn(async () => {})
    let resolveFactory!: (h: { start: typeof start; dispose: typeof dispose; runtimeId: string }) => void
    // Async factory we hold open to simulate the lazy-import window.
    _setBridgeFactoryForTesting(() => new Promise((res) => { resolveFactory = res }))

    evalPhase(withCortex({}), DEV_PHASE)
    // Signal fires while construction is still pending (bridge is null here).
    onceHandlers['SIGINT']!()
    // Construction now resolves — must dispose, not start.
    resolveFactory({ start, dispose, runtimeId: 'rt-1' })
    await flushAsync()

    expect(start).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })
})

type TurbopackRuleForTest = {
  loaders: Array<string | { loader: string; options: Record<string, unknown> }>
  [key: string]: unknown
}

function turbopackRules(fn: NextPhaseConfigFunction): Record<string, TurbopackRuleForTest> {
  const config = evalPhase(fn, TEST_PHASE)
  return (config.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
}

describe('withCortex turbopack rules', () => {
  it('adds loader rules for *.tsx and *.jsx globs pointing at next-source-loader', () => {
    const rules = turbopackRules(withCortex({}))
    for (const glob of ['*.tsx', '*.jsx']) {
      const rule = rules[glob]!
      expect(rule.loaders).toHaveLength(1)
      const item = rule.loaders[0] as { loader: string }
      expect(item.loader).toMatch(/next-source-loader/)
    }
  })

  it('omits `as` from generated rules', () => {
    // `as` renames the virtual module (App.tsx → App.tsx.tsx under as:'*.tsx'),
    // which breaks relative-import resolution. Verified empirically in the
    // 2026-07-18 Turbopack spike — same-format transforms must omit it.
    const rules = turbopackRules(withCortex({}))
    expect(rules['*.tsx']).not.toHaveProperty('as')
    expect(rules['*.jsx']).not.toHaveProperty('as')
  })

  it('produces serializable loader options and omits absent optionals entirely', () => {
    const rules = turbopackRules(withCortex({}))
    const item = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    // Turbopack rejects undefined-valued keys; absent options must be omitted,
    // not passed as { resolveAlias: undefined }.
    expect(Object.keys(item.options)).toEqual(['projectRoot'])
    expect(JSON.parse(JSON.stringify(item.options))).toEqual(item.options)
  })

  it('passes resolveAlias and includeNodeModules through when provided', () => {
    const rules = turbopackRules(
      withCortex({}, { resolveAlias: { '@': '/project/src' }, includeNodeModules: ['@acme/ui'] })
    )
    const item = rules['*.jsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(item.options.resolveAlias).toEqual({ '@': '/project/src' })
    expect(item.options.includeNodeModules).toEqual(['@acme/ui'])
  })

  it('uses options.projectRoot for rule options, defaulting to process.cwd()', () => {
    const explicit = turbopackRules(withCortex({}, { projectRoot: '/my/app' }))
    const explicitItem = explicit['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(explicitItem.options.projectRoot).toBe('/my/app')

    const defaulted = turbopackRules(withCortex({}))
    const defaultedItem = defaulted['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(defaultedItem.options.projectRoot).toBe(process.cwd())
  })

  it('preserves unrelated turbopack config keys and rules', () => {
    const svgRule = { loaders: ['@svgr/webpack'], as: '*.js' }
    const config = evalPhase(
      withCortex({ turbopack: { resolveAlias: { underscore: 'lodash' }, rules: { '*.svg': svgRule } } }),
      TEST_PHASE,
    )
    expect((config.turbopack as Record<string, unknown>).resolveAlias).toEqual({ underscore: 'lodash' })
    expect((config.turbopack as { rules: Record<string, unknown> }).rules['*.svg']).toEqual(svgRule)
  })

  it('appends the cortex loader after existing loaders on a colliding rule object', () => {
    // Webpack-compat loader chains execute right-to-left: appending last means
    // cortex runs first, on raw source, before user loaders transform it.
    // `foo` is outside Next's rule type on purpose: pins that the object-form
    // spread preserves unknown keys (future Next rule fields) at runtime. The
    // cast smuggles it past the (correctly) strict input type.
    const collidingConfig = {
      turbopack: { rules: { '*.tsx': { loaders: ['user-loader'], foo: 'bar' } } },
    } as unknown as Parameters<typeof withCortex>[0]
    const rules = turbopackRules(withCortex(collidingConfig))
    const rule = rules['*.tsx']!
    expect(rule.loaders[0]).toBe('user-loader')
    expect((rule.loaders[1] as { loader: string }).loader).toMatch(/next-source-loader/)
    expect(rule.foo).toBe('bar')
  })

  it('appends to loader-array shorthand rules', () => {
    const rules = turbopackRules(withCortex({ turbopack: { rules: { '*.jsx': ['user-loader'] } } }))
    const rule = rules['*.jsx'] as unknown as Array<string | { loader: string }>
    expect(rule[0]).toBe('user-loader')
    expect((rule[1] as { loader: string }).loader).toMatch(/next-source-loader/)
  })

  it('warns and leaves unrecognized rule shapes untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const weird = { as: '*.js' } // object without a loaders array — intentionally
    // invalid per Next's rule type (cast smuggles it in) to pin the defensive
    // warn-and-skip branch against malformed user configs at runtime.
    const weirdConfig = { turbopack: { rules: { '*.tsx': weird } } } as unknown as Parameters<typeof withCortex>[0]
    const rules = turbopackRules(withCortex(weirdConfig))
    expect(rules['*.tsx']).toEqual(weird)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("turbopack.rules['*.tsx']"))
  })

  it('does not mutate the caller-supplied config object', () => {
    const originalRules = { '*.tsx': { loaders: ['user-loader'] } }
    const original = { turbopack: { rules: originalRules } }
    evalPhase(withCortex(original), TEST_PHASE)
    expect(originalRules['*.tsx'].loaders).toEqual(['user-loader'])
    expect(Object.keys(originalRules)).toEqual(['*.tsx'])
  })
})

describe('withCortex loader runtimeId threading (ZF0-1851)', () => {
  it('threads one generated runtimeId into turbopack + webpack loader options AND the bridge factory', async () => {
    // The lock-refusal gate (source-loader isRuntimeDisabled) keys on runtimeId.
    // next.ts generates ONE id and threads it into both loader entry points AND
    // the bridge factory (so the bridge uses it), or a second `next dev` that
    // loses the .cortex/ lock keeps instrumenting and its <CortexDevScripts/>
    // injects the other server's port/token (split-brain).
    let capturedRuntimeId: string | undefined
    _setBridgeFactoryForTesting((opts) => {
      capturedRuntimeId = opts.runtimeId
      return { start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: opts.runtimeId }
    })

    const config = evalPhase(withCortex({}), DEV_PHASE)

    const rules = (config.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
    const turbopackItem = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    const loaderRuntimeId = turbopackItem.options.runtimeId
    expect(typeof loaderRuntimeId).toBe('string')
    expect((loaderRuntimeId as string).length).toBeGreaterThan(0)

    const webpackConfig = { module: { rules: [] as unknown[] } }
    config.webpack!(webpackConfig as any, { dir: '/project', dev: true, isServer: false } as any)
    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { runtimeId?: string } }> }
    expect(rule.use[0]!.options.runtimeId).toBe(loaderRuntimeId)

    // The very same id was passed into the bridge factory (async construction).
    await flushAsync()
    expect(capturedRuntimeId).toBe(loaderRuntimeId)
  })

  it('omits runtimeId from loader options when no bridge is active (non-dev phase)', () => {
    // No bridge means no lock to refuse — isRuntimeDisabled(undefined) is always
    // false, which is correct here.
    const config = evalPhase(withCortex({}), TEST_PHASE)

    const rules = (config.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
    const turbopackItem = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(turbopackItem.options).not.toHaveProperty('runtimeId')

    const webpackConfig = { module: { rules: [] as unknown[] } }
    config.webpack!(webpackConfig as any, { dir: '/project', dev: true, isServer: false } as any)
    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: Record<string, unknown> }> }
    expect(rule.use[0]!.options).not.toHaveProperty('runtimeId')
  })
})

describe('withCortex termination signal handling', () => {
  // Adding a SIGINT/SIGTERM listener suppresses Node's default die-on-signal.
  // The handler must NOT call process.exit — a synchronous exit preempts Next's
  // own async graceful shutdown (Turbopack engine / child teardown) on EVERY
  // Ctrl+C. Instead it disposes (fire-and-forget), removes OUR listener, and
  // re-raises the signal so Node's default (or Next's own handler) proceeds.
  it.each([['SIGINT'], ['SIGTERM']] as const)(
    'disposes then re-raises %s (removing our listener) rather than process.exit',
    async (signal) => {
      const dispose = vi.fn(async () => {})
      _setBridgeFactoryForTesting((opts) => ({ start: vi.fn(async () => {}), dispose, runtimeId: opts.runtimeId }))

      // Spy the re-raise so it does not actually signal the vitest process.
      const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as never)
      // A stray process.exit would end the test run — assert it is never used.
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      const before = process.listeners(signal)
      evalPhase(withCortex({}), DEV_PHASE)
      // Signal handlers are installed synchronously, but the bridge is
      // constructed asynchronously (lazy webpack import) — let it resolve so the
      // handler's bridge?.dispose() actually reaches the bridge.
      await flushAsync()
      const added = process.listeners(signal).filter((l) => !before.includes(l))
      expect(added).toHaveLength(1)

      // Invoke our handler directly (process.once does not auto-remove on a
      // direct call of the unwrapped listener, so the explicit removeListener
      // inside the handler is what must clear it).
      ;(added[0] as () => void)()

      expect(dispose).toHaveBeenCalledOnce()
      // Our listener removed itself so the re-raise isn't caught by us again.
      expect(process.listeners(signal).filter((l) => !before.includes(l))).toHaveLength(0)
      // Cooperative re-raise of the same signal — NOT process.exit.
      expect(kill).toHaveBeenCalledWith(process.pid, signal)
      expect(exit).not.toHaveBeenCalled()
    },
  )
})
