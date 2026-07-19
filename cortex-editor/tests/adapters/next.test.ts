import { afterEach, describe, expect, it, vi } from 'vitest'
import { withCortex, _setBridgeFactoryForTesting, type NextConfig } from '../../src/adapters/next.js'

// Any phase other than PHASE_DEVELOPMENT_SERVER: resolves the config object
// without touching the bridge.
const PHASE_TEST = 'phase-export'

async function resolved(config: ReturnType<typeof withCortex>): Promise<NextConfig> {
  return typeof config === 'function' ? config(PHASE_TEST) : config
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

  it('returns original config object (not a function) in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const original = { reactStrictMode: true }
    const result = withCortex(original as any)
    expect(result).toBe(original)
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
  it('returns a config function in dev', () => {
    expect(typeof withCortex({})).toBe('function')
  })

  it('starts the bridge only for the development-server phase', async () => {
    const start = vi.fn(async () => {})
    const dispose = vi.fn(async () => {})
    _setBridgeFactoryForTesting(() => ({ start, dispose }))

    const config = withCortex({}) as (phase: string) => Promise<NextConfig>

    await config('phase-production-build')
    await config('phase-export')
    expect(start).not.toHaveBeenCalled()

    await config('phase-development-server')
    expect(start).toHaveBeenCalledOnce()
  })

  it('reuses one bridge across repeated dev-server evaluations', async () => {
    const start = vi.fn(async () => {})
    const factory = vi.fn(() => ({ start, dispose: vi.fn(async () => {}) }))
    _setBridgeFactoryForTesting(factory)

    const config = withCortex({}) as (phase: string) => Promise<NextConfig>
    await config('phase-development-server')
    await config('phase-development-server')

    expect(factory).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledTimes(2) // start() itself memoizes internally
  })

  it('does not take down the dev server when bridge start throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    _setBridgeFactoryForTesting(() => ({
      start: async () => { throw new Error('EADDRINUSE') },
      dispose: async () => {},
    }))

    const config = withCortex({}) as (phase: string) => Promise<NextConfig>
    const resolvedConfig = await config('phase-development-server')

    expect(resolvedConfig.webpack).toBeTypeOf('function')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Bridge failed to start'), 'EADDRINUSE')
  })

  it('passes port, toggleShortcut, and projectRoot through to the bridge', async () => {
    const factory = vi.fn(() => ({ start: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }))
    _setBridgeFactoryForTesting(factory)

    const config = withCortex({}, { port: 4141, toggleShortcut: '$mod+Shift+Comma', projectRoot: '/my/app' }) as (
      phase: string,
    ) => Promise<NextConfig>
    await config('phase-development-server')

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
