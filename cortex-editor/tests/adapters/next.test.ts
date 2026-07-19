import { afterEach, describe, expect, it, vi } from 'vitest'
import { withCortex, _setBridgeFactoryForTesting, type NextConfig } from '../../src/adapters/next.js'

// withCortex always returns a plain NextConfig object now (fix 2A) — never a
// phase function. This thin passthrough keeps the existing call sites uniform.
async function resolved(config: NextConfig): Promise<NextConfig> {
  return config
}

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

  it('starts the bridge when NEXT_PHASE is the development-server phase', () => {
    const start = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({})

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

  it('does not start the bridge when NEXT_PHASE is unset', () => {
    const start = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    // NEXT_PHASE deliberately not stubbed

    const config = withCortex({})

    expect(start).not.toHaveBeenCalled()
    expect(config.webpack).toBeTypeOf('function')
  })

  it('reuses one bridge across repeated dev-server evaluations', () => {
    const start = vi.fn(async () => {})
    const factory = vi.fn(() => ({ start, dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({})
    withCortex({})

    expect(factory).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledTimes(2) // start() itself memoizes internally
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

  it('passes port, toggleShortcut, and projectRoot through to the bridge', () => {
    const factory = vi.fn(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}), runtimeId: 'rt-1' }))
    _setBridgeFactoryForTesting(factory)
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    withCortex({}, { port: 4141, toggleShortcut: '$mod+Shift+Comma', projectRoot: '/my/app' })

    expect(factory).toHaveBeenCalledWith({
      root: '/my/app',
      mode: 'development',
      port: 4141,
      toggleShortcut: '$mod+Shift+Comma',
    })
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

  it('threads the running bridge runtimeId into turbopack + webpack loader options', () => {
    // The lock-refusal gate (source-loader isRuntimeDisabled) keys on runtimeId.
    // Both loader entry points must carry the SAME id the bridge was given, or a
    // second `next dev` that loses the .cortex/ lock keeps instrumenting and its
    // <CortexDevScripts/> injects the other server's port/token (split-brain).
    _setBridgeFactoryForTesting(() => ({
      start: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
      runtimeId: 'rt-abc',
    }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const config = withCortex({})

    const rules = (config.turbopack as { rules: Record<string, TurbopackRuleForTest> }).rules
    const turbopackItem = rules['*.tsx']!.loaders[0] as { options: Record<string, unknown> }
    expect(turbopackItem.options.runtimeId).toBe('rt-abc')

    const webpackConfig = { module: { rules: [] as unknown[] } }
    config.webpack!(webpackConfig as any, { dir: '/project', dev: true, isServer: false } as any)
    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { runtimeId?: string } }> }
    expect(rule.use[0]!.options.runtimeId).toBe('rt-abc')
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

  // Adding a SIGINT/SIGTERM listener suppresses Node's default die-on-signal, so
  // the handler MUST re-raise termination itself — otherwise the first Ctrl+C in
  // a programmatic dev server (next({ dev: true }) with no other handler) only
  // disposes and the process survives until a second press.
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('disposes the bridge then exits on %s (code %i)', (signal, code) => {
    const dispose = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start: vi.fn(async () => {}), dispose, runtimeId: 'rt-1' }))
    vi.stubEnv('NEXT_PHASE', DEV_PHASE)

    const exit = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`exit:${c}`)
    }) as never)

    const before = process.listeners(signal)
    withCortex({})
    const added = process.listeners(signal).filter((l) => !before.includes(l))
    expect(added).toHaveLength(1)

    expect(() => (added[0] as () => void)()).toThrow(`exit:${code}`)
    expect(dispose).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(code)
  })
})
