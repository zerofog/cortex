import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { withCortex, _setBridgeFactoryForTesting, type NextConfig } from '../../src/adapters/next.js'

// withCortex always returns a plain NextConfig object now (fix 2A) — never a
// phase function. This thin passthrough keeps the existing call sites uniform.
async function resolved(config: NextConfig): Promise<NextConfig> {
  return config
}

// The bridge is constructed ASYNCHRONOUSLY now (the factory lazy-imports
// webpack.ts — 3F), so factory/start calls land on a later microtask. Flush the
// microtask + macrotask queues before asserting on them. The config RETURN stays
// synchronous; only bridge startup is deferred.
const flushAsync = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  _setBridgeFactoryForTesting(null)
})

describe('withCortex', () => {
  it('adds webpack loader rule for .jsx/.tsx files', async () => {
    const config = await resolved(withCortex({}))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
    const rule = webpackConfig.module.rules[0] as { test: RegExp; exclude: (resourcePath: string) => boolean }
    expect(rule.test).toEqual(/\.[jt]sx$/)
    expect(rule.exclude('/project/src/App.tsx')).toBe(false)
    expect(rule.exclude('/project/node_modules/react/index.jsx')).toBe(true)
  })

  it('lets explicitly included node_modules packages reach the shared loader', async () => {
    const config = await resolved(withCortex({}, { includeNodeModules: ['@acme/ui'] }))
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

  it('passes resolve aliases through to the shared loader', async () => {
    const config = await resolved(withCortex({}, { resolveAlias: { '@': '/project/src' } }))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { resolveAlias?: Record<string, string> } }> }
    expect(rule.use[0]!.options.resolveAlias).toEqual({ '@': '/project/src' })
  })

  it('preserves existing webpack config', async () => {
    const existingRule = { test: /\.css$/, use: ['style-loader'] }
    const originalWebpack = vi.fn((config: any) => {
      config.module.rules.push(existingRule)
      return config
    })

    const config = await resolved(withCortex({ webpack: originalWebpack }))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(originalWebpack).toHaveBeenCalledOnce()
    expect(webpackConfig.module.rules).toHaveLength(2)
  })

  it('in production, externalizes cortex-editor without adding turbopack rules or the webpack hook', () => {
    // `cortex init` leaves a permanent <CortexDevScripts/> import in the layout,
    // so a production `next build` still pulls the bridge module graph into the
    // RSC server graph. Externalizing cortex-editor keeps it resolvable (esp. for
    // symlinked file:/link: installs) without instrumenting or starting anything.
    vi.stubEnv('NODE_ENV', 'production')
    const result = withCortex({ reactStrictMode: true } as any)
    expect(result.serverExternalPackages).toContain('cortex-editor')
    expect(result.reactStrictMode).toBe(true)
    expect(result.turbopack).toBeUndefined()
    expect(result.webpack).toBeUndefined()
  })

  it('does not double-add cortex-editor to serverExternalPackages in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const result = withCortex({ serverExternalPackages: ['cortex-editor', 'sharp'] } as any)
    expect(result.serverExternalPackages).toEqual(['cortex-editor', 'sharp'])
  })

  it('does NOT add cortex-editor to serverExternalPackages when it is in transpilePackages (review [4])', () => {
    // Next rejects a package in both lists, aborting config load. Respect the
    // user's transpile choice and warn instead of forcing the conflict.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    const result = withCortex({ transpilePackages: ['cortex-editor'] } as any)
    expect(result.serverExternalPackages).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('transpilePackages'))
  })

  it('passes projectRoot from context.dir to loader options', async () => {
    const config = await resolved(withCortex({}))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/my/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { projectRoot: string } }> }
    expect(rule.use[0]!.options.projectRoot).toBe('/my/project')
  })

  it('sets loader path to a string ending in next-source-loader', async () => {
    const config = await resolved(withCortex({}))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ loader: string }> }
    expect(typeof rule.use[0]!.loader).toBe('string')
    expect(rule.use[0]!.loader).toMatch(/next-source-loader/)
  })

  it('adds the loader for server-side builds too (symmetric instrumentation)', async () => {
    // Next prerenders client components on the server; client-only
    // instrumentation makes SSR HTML and the client render disagree about
    // data-cortex-* attributes, and React does not guarantee mismatched
    // attributes get patched. Both sides must be instrumented identically.
    const config = await resolved(withCortex({}))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: true }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
  })

  it('sets enforce: "pre" on the loader rule', async () => {
    const config = await resolved(withCortex({}))
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { enforce: string }
    expect(rule.enforce).toBe('pre')
  })
})

describe('withCortex bridge lifecycle', () => {
  const DEV_PHASE = 'phase-development-server'

  it('always returns a plain config object (never a phase function)', () => {
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)
    _setBridgeFactoryForTesting(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))

    const config = withCortex({})

    expect(typeof config).toBe('object')
    expect(config.turbopack).toBeDefined()
    expect(config.webpack).toBeTypeOf('function')
  })

  it('starts the bridge when NEXT_PHASE is the development-server phase', async () => {
    const start = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({})
    await flushAsync()

    expect(start).toHaveBeenCalledOnce()
  })

  it('starts the bridge when __NEXT_DEV_SERVER=1 (the signal real `next dev` sets)', async () => {
    // NEXT_PHASE is NOT set in the environment at config-eval time under a real
    // `next dev` (verified on Next 16.2) — the dev server sets __NEXT_DEV_SERVER
    // instead. This is the signal the e2e depends on; without it the bridge
    // never starts, no discovery files are written, and activation dead-ends.
    const start = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    vi.stubEnv('__NEXT_DEV_SERVER', '1')
    // NEXT_PHASE deliberately unset — __NEXT_DEV_SERVER alone must suffice.

    withCortex({})
    await flushAsync()

    expect(start).toHaveBeenCalledOnce()
  })

  it('does not start the bridge for a non-dev phase, but still returns a full config', () => {
    const start = vi.fn(async () => {})
    const factory = vi.fn(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    const config = withCortex({})

    expect(factory).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(config.turbopack).toBeDefined()
    expect(config.webpack).toBeTypeOf('function')
    expect(config.serverExternalPackages).toContain('cortex-editor')
  })

  it('does not start the bridge when no dev-server signal is present', () => {
    const start = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    // Neither dev-server signal present.
    vi.stubEnv('NEXT_PHASE', '')
    vi.stubEnv('__NEXT_DEV_SERVER', '')

    const config = withCortex({})

    expect(start).not.toHaveBeenCalled()
    expect(config.webpack).toBeTypeOf('function')
  })

  it('reuses one bridge across repeated dev-server evaluations', async () => {
    const start = vi.fn(async () => {})
    const factory = vi.fn(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({})
    withCortex({})
    await flushAsync()

    // Construction is memoized synchronously (bridgeStartup) so two evaluations
    // share ONE bridge even before the first construction resolves...
    expect(factory).toHaveBeenCalledOnce()
    // ...but each evaluation still calls start() (which memoizes internally).
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('shares ONE runtimeId between the bridge and the loader options across repeated evaluations', async () => {
    // Regression: runtimeId was generated per withCortex() call while the bridge
    // is memoized, so a second evaluation handed the loaders a fresh id while the
    // bridge kept the first — defeating the ZF0-1851 lock-refusal gate. The id
    // must be memoized alongside the bridge.
    let factoryRuntimeId: string | undefined
    const factory = vi.fn((opts: { runtimeId: string }) => {
      factoryRuntimeId = opts.runtimeId
      return { start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: opts.runtimeId }
    })
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const loaderRuntimeId = (config: NextConfig): unknown =>
      (config.turbopack as { rules: Record<string, { loaders: Array<{ options: Record<string, unknown> }> }> })
        .rules['*.tsx']!.loaders[0]!.options.runtimeId

    const config1 = withCortex({})
    const config2 = withCortex({})
    await flushAsync()

    expect(factory).toHaveBeenCalledOnce()
    expect(factoryRuntimeId).toBeTruthy()
    // Both evaluations' loader options carry the SAME id, and it matches the
    // bridge's.
    expect(loaderRuntimeId(config1)).toBe(factoryRuntimeId)
    expect(loaderRuntimeId(config2)).toBe(factoryRuntimeId)
  })

  it('does not throw out of config building when the bridge fails to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    _setBridgeFactoryForTesting(() => ({
      start: async () => { throw new Error('EADDRINUSE') },
      dispose: async () => {},
      runtimeId: 'rt-1',
    }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const config = withCortex({})

    expect(config.webpack).toBeTypeOf('function')
    // start() is fire-and-forget; let its internal catch run.
    await new Promise((r) => setTimeout(r, 0))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bridge failed to start'), 'EADDRINUSE')
  })

  it('degrades to the default toggle shortcut instead of aborting when the shortcut is invalid', () => {
    // validateToggleShortcut THROWS on a bad shortcut; if that propagates out of
    // withCortex during next.config evaluation, `next dev` aborts with a stack
    // trace. The adapter's resilience contract (startBridge swallows port/EACCES)
    // must extend here: warn, fall back to the default, never take down dev.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const factory = vi.fn(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const config = withCortex({}, { toggleShortcut: 'Cmd+.' })

    expect(typeof config).toBe('object')
    expect(config.webpack).toBeTypeOf('function')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid toggleShortcut'))
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ toggleShortcut: '$mod+Shift+Period' }))
  })

  it('passes port, toggleShortcut, and projectRoot through to the bridge', async () => {
    const factory = vi.fn(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({}, { port: 4141, toggleShortcut: '$mod+Shift+Comma', projectRoot: '/my/app' })
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
  const DEV_PHASE = 'phase-development-server'
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
    _setBridgeFactoryForTesting(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)
    withCortex({})

    // Peers remain → do NOT re-raise (they already received the original signal).
    vi.spyOn(process, 'listenerCount').mockReturnValue(1)
    onceHandlers['SIGINT']!()
    expect(killSpy).not.toHaveBeenCalled()

    // No peers remain → re-raise so Node's default termination runs.
    vi.spyOn(process, 'listenerCount').mockReturnValue(0)
    onceHandlers['SIGTERM']!()
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
  })

  it('disposes rather than starts a bridge whose async construction was in flight at termination', async () => {
    vi.spyOn(process, 'listenerCount').mockReturnValue(1) // suppress re-raise
    const start = vi.fn(async () => {})
    const dispose = vi.fn(async () => {})
    let resolveFactory!: (h: { start: typeof start; dispose: typeof dispose; runtimeId: string }) => void
    // Async factory we hold open to simulate the lazy-import window.
    _setBridgeFactoryForTesting(() => new Promise((res) => { resolveFactory = res }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({})
    // Signal fires while construction is still pending (bridge is null here).
    onceHandlers['SIGINT']!()
    // Construction now resolves — must dispose, not start.
    resolveFactory({ start, dispose, runtimeId: 'rt-1' })
    await new Promise((r) => setTimeout(r, 0))

    expect(start).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })
})

type TurbopackRuleForTest = {
  loaders: Array<string | { loader: string; options: Record<string, unknown> }>
  [key: string]: unknown
}

async function turbopackRules(config: ReturnType<typeof withCortex>): Promise<Record<string, TurbopackRuleForTest>> {
  const resolvedConfig = await resolved(config)
  return (resolvedConfig.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
}

describe('withCortex turbopack rules', () => {
  it('adds loader rules for *.tsx and *.jsx globs pointing at next-source-loader', async () => {
    const rules = await turbopackRules(withCortex({}))
    for (const glob of ['*.tsx', '*.jsx']) {
      const rule = rules[glob]!
      expect(rule.loaders).toHaveLength(1)
      const item = rule.loaders[0] as { loader: string }
      expect(item.loader).toMatch(/next-source-loader/)
    }
  })

  it('omits `as` from generated rules', async () => {
    // `as` renames the virtual module (App.tsx → App.tsx.tsx under as:'*.tsx'),
    // which breaks relative-import resolution. Verified empirically in the
    // 2026-07-18 Turbopack spike — same-format transforms must omit it.
    const rules = await turbopackRules(withCortex({}))
    expect(rules['*.tsx']).not.toHaveProperty('as')
    expect(rules['*.jsx']).not.toHaveProperty('as')
  })

  it('produces serializable loader options and omits absent optionals entirely', async () => {
    const rules = await turbopackRules(withCortex({}))
    const item = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    // Turbopack rejects undefined-valued keys; absent options must be omitted,
    // not passed as { resolveAlias: undefined }.
    expect(Object.keys(item.options)).toEqual(['projectRoot'])
    expect(JSON.parse(JSON.stringify(item.options))).toEqual(item.options)
  })

  it('passes resolveAlias and includeNodeModules through when provided', async () => {
    const rules = await turbopackRules(
      withCortex({}, { resolveAlias: { '@': '/project/src' }, includeNodeModules: ['@acme/ui'] })
    )
    const item = rules['*.jsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(item.options.resolveAlias).toEqual({ '@': '/project/src' })
    expect(item.options.includeNodeModules).toEqual(['@acme/ui'])
  })

  it('uses options.projectRoot for rule options, defaulting to process.cwd()', async () => {
    const explicit = await turbopackRules(withCortex({}, { projectRoot: '/my/app' }))
    const explicitItem = explicit['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(explicitItem.options.projectRoot).toBe('/my/app')

    const defaulted = await turbopackRules(withCortex({}))
    const defaultedItem = defaulted['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(defaultedItem.options.projectRoot).toBe(process.cwd())
  })

  it('preserves unrelated turbopack config keys and rules', async () => {
    const svgRule = { loaders: ['@svgr/webpack'], as: '*.js' }
    const config = await resolved(
      withCortex({ turbopack: { resolveAlias: { underscore: 'lodash' }, rules: { '*.svg': svgRule } } })
    )
    expect((config.turbopack as Record<string, unknown>).resolveAlias).toEqual({ underscore: 'lodash' })
    expect((config.turbopack as { rules: Record<string, unknown> }).rules['*.svg']).toEqual(svgRule)
  })

  it('appends the cortex loader after existing loaders on a colliding rule object', async () => {
    // Webpack-compat loader chains execute right-to-left: appending last means
    // cortex runs first, on raw source, before user loaders transform it.
    const rules = await turbopackRules(
      withCortex({ turbopack: { rules: { '*.tsx': { loaders: ['user-loader'], foo: 'bar' } } } })
    )
    const rule = rules['*.tsx']!
    expect(rule.loaders[0]).toBe('user-loader')
    expect((rule.loaders[1] as { loader: string }).loader).toMatch(/next-source-loader/)
    expect(rule.foo).toBe('bar')
  })

  it('appends to loader-array shorthand rules', async () => {
    const rules = await turbopackRules(withCortex({ turbopack: { rules: { '*.jsx': ['user-loader'] } } }))
    const rule = rules['*.jsx'] as unknown as Array<string | { loader: string }>
    expect(rule[0]).toBe('user-loader')
    expect((rule[1] as { loader: string }).loader).toMatch(/next-source-loader/)
  })

  it('warns and leaves unrecognized rule shapes untouched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const weird = { as: '*.js' } // object without a loaders array
    const rules = await turbopackRules(withCortex({ turbopack: { rules: { '*.tsx': weird } } }))
    expect(rules['*.tsx']).toEqual(weird)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("turbopack.rules['*.tsx']"))
  })

  it('does not mutate the caller-supplied config object', async () => {
    const originalRules = { '*.tsx': { loaders: ['user-loader'] } }
    const original = { turbopack: { rules: originalRules } }
    await resolved(withCortex(original))
    expect(originalRules['*.tsx'].loaders).toEqual(['user-loader'])
    expect(Object.keys(originalRules)).toEqual(['*.tsx'])
  })
})

describe('withCortex loader runtimeId threading (ZF0-1851)', () => {
  const DEV_PHASE = 'phase-development-server'

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
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const config = withCortex({})

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
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')

    const config = withCortex({})

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
  const DEV_PHASE = 'phase-development-server'

  // Adding a SIGINT/SIGTERM listener suppresses Node's default die-on-signal.
  // The handler must NOT call process.exit — a synchronous exit preempts Next's
  // own async graceful shutdown (Turbopack engine / child teardown) on EVERY
  // Ctrl+C. Instead it disposes (fire-and-forget), removes OUR listener, and
  // re-raises the signal so Node's default (or Next's own handler) proceeds.
  it.each([['SIGINT'], ['SIGTERM']] as const)(
    'disposes then re-raises %s (removing our listener) rather than process.exit',
    async (signal) => {
      const dispose = vi.fn(async () => {})
      _setBridgeFactoryForTesting(() => ({ start: vi.fn(async () => {}), dispose, runtimeId: 'rt-1' }))
      vi.stubEnv('NEXT_PHASE', DEV_PHASE)

      // Spy the re-raise so it does not actually signal the vitest process.
      const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as never)
      // A stray process.exit would end the test run — assert it is never used.
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

      const before = process.listeners(signal)
      withCortex({})
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
