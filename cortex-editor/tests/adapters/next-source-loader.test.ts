import { afterEach, describe, expect, it, vi } from 'vitest'
import cortexSourceLoader, { _resetForTesting } from '../../src/adapters/next-source-loader.js'

afterEach(() => {
  _resetForTesting()
})

// Create a fake webpack LoaderContext
function fakeContext(overrides: { resourcePath?: string; projectRoot?: string } = {}) {
  const ctx = {
    resourcePath: overrides.resourcePath ?? '/project/src/App.tsx',
    getOptions: () => ({ projectRoot: overrides.projectRoot ?? '/project' }),
    callback: vi.fn(),
    cacheable: vi.fn(),
  }
  return ctx
}

describe('cortexSourceLoader', () => {
  it('transforms JSX and calls callback with code + map', () => {
    const ctx = fakeContext()
    const source = 'export default function App() { return <div>hello</div> }'
    cortexSourceLoader.call(ctx, source)

    expect(ctx.cacheable).toHaveBeenCalled()
    expect(ctx.callback).toHaveBeenCalledOnce()
    const [err, code, map] = ctx.callback.mock.calls[0]!
    expect(err).toBeNull()
    expect(code).toContain('data-cortex-source="src/App.tsx:')
    expect(map).toBeDefined()
  })

  it('returns original source unchanged for non-JSX files', () => {
    const ctx = fakeContext({ resourcePath: '/project/src/utils.ts' })
    const source = 'const x = 1'
    cortexSourceLoader.call(ctx, source)

    expect(ctx.callback).toHaveBeenCalledOnce()
    const [err, code, map] = ctx.callback.mock.calls[0]!
    expect(err).toBeNull()
    expect(code).toBe(source)
    expect(map).toBeUndefined()
  })

  it('caches transform across multiple calls with same projectRoot', () => {
    const ctx1 = fakeContext()
    const ctx2 = fakeContext()
    const source = 'export default function A() { return <div /> }'

    cortexSourceLoader.call(ctx1, source)
    cortexSourceLoader.call(ctx2, source)

    // Both should produce identical output (same cached transform)
    const code1 = ctx1.callback.mock.calls[0]![1]
    const code2 = ctx2.callback.mock.calls[0]![1]
    expect(code1).toBe(code2)
  })

  it('re-creates transform when projectRoot changes', () => {
    const ctx1 = fakeContext({ projectRoot: '/project-a' })
    const ctx2 = fakeContext({ projectRoot: '/project-b', resourcePath: '/project-b/src/App.tsx' })
    const source = 'export default function A() { return <div /> }'

    cortexSourceLoader.call(ctx1, source)
    cortexSourceLoader.call(ctx2, source)

    // Different roots → different relative paths in the output
    const code1 = ctx1.callback.mock.calls[0]![1] as string
    const code2 = ctx2.callback.mock.calls[0]![1] as string
    expect(code1).toContain('data-cortex-source="')
    expect(code2).toContain('data-cortex-source="')
  })
})
