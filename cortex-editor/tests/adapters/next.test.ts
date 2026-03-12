import { afterEach, describe, expect, it, vi } from 'vitest'
import { withCortex } from '../../src/adapters/next.js'

describe('withCortex', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('adds webpack loader rule for .jsx/.tsx files', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
    const rule = webpackConfig.module.rules[0] as { test: RegExp; exclude: RegExp }
    expect(rule.test).toEqual(/\.[jt]sx$/)
    expect(rule.exclude).toEqual(/\/node_modules\//)
  })

  it('preserves existing webpack config', () => {
    const existingRule = { test: /\.css$/, use: ['style-loader'] }
    const originalWebpack = vi.fn((config: any) => {
      config.module.rules.push(existingRule)
      return config
    })

    const config = withCortex({ webpack: originalWebpack })
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(originalWebpack).toHaveBeenCalledOnce()
    expect(webpackConfig.module.rules).toHaveLength(2)
  })

  it('returns original config in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const original = { reactStrictMode: true }
    const result = withCortex(original as any)
    expect(result).toBe(original)
  })

  it('passes projectRoot from context.dir to loader options', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/my/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { projectRoot: string } }> }
    expect(rule.use[0]!.options.projectRoot).toBe('/my/project')
  })

  it('sets loader path to a string ending in next-source-loader', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ loader: string }> }
    expect(typeof rule.use[0]!.loader).toBe('string')
    expect(rule.use[0]!.loader).toMatch(/next-source-loader/)
  })
})
