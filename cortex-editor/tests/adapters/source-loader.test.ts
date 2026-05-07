import { afterEach, describe, expect, it, vi } from 'vitest'
import cortexSourceLoader, { _resetForTesting } from '../../src/adapters/source-loader.js'

afterEach(() => {
  _resetForTesting()
})

function fakeContext(overrides: {
  resourcePath?: string
  projectRoot?: string
  resolveAlias?: Record<string, string>
  includeNodeModules?: string[]
} = {}) {
  return {
    resourcePath: overrides.resourcePath ?? '/project/src/App.tsx',
    getOptions: () => ({
      projectRoot: overrides.projectRoot ?? '/project',
      resolveAlias: overrides.resolveAlias,
      includeNodeModules: overrides.includeNodeModules,
    }),
    callback: vi.fn(),
    cacheable: vi.fn(),
  }
}

describe('shared cortex source loader', () => {
  it('transforms JSX and calls callback with code + map', () => {
    const ctx = fakeContext()
    const source = 'export default function App() { return <div>hello</div> }'

    cortexSourceLoader.call(ctx, source)

    expect(ctx.cacheable).toHaveBeenCalled()
    const [err, code, map] = ctx.callback.mock.calls[0]!
    expect(err).toBeNull()
    expect(code).toContain('data-cortex-source="src/App.tsx:')
    expect(map).toBeDefined()
  })

  it('passes alias options through so CSS Module imports are annotated', () => {
    const ctx = fakeContext({
      resourcePath: '/project/src/components/Card.tsx',
      resolveAlias: { '@': '/project/src' },
    })
    const source = [
      "import styles from '@/styles/Card.module.css'",
      'export function Card() { return <div className={styles.root}>hello</div> }',
    ].join('\n')

    cortexSourceLoader.call(ctx, source)

    const [, code] = ctx.callback.mock.calls[0]!
    expect(code).toContain('data-cortex-css="src/styles/Card.module.css:.root"')
  })

  it('uses the longest matching alias for overlapping CSS Module aliases', () => {
    const ctx = fakeContext({
      resourcePath: '/project/src/components/Card.tsx',
      resolveAlias: {
        '@': '/project/src',
        '@ui': '/project/src/ui',
      },
    })
    const source = [
      "import styles from '@ui/Card.module.css'",
      'export function Card() { return <div className={styles.root}>hello</div> }',
    ].join('\n')

    cortexSourceLoader.call(ctx, source)

    const [, code] = ctx.callback.mock.calls[0]!
    expect(code).toContain('data-cortex-css="src/ui/Card.module.css:.root"')
  })

  it('instruments explicitly included node_modules packages', () => {
    const ctx = fakeContext({
      resourcePath: '/project/node_modules/@acme/ui/Button.tsx',
      includeNodeModules: ['@acme/ui'],
    })
    const source = 'export function Button() { return <button>ok</button> }'

    cortexSourceLoader.call(ctx, source)

    const [, code] = ctx.callback.mock.calls[0]!
    expect(code).toContain('data-cortex-source="node_modules/@acme/ui/Button.tsx:')
  })
})
