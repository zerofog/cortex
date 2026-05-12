import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSourceTransform } from '../../src/adapters/source-transform.js'

const PROJECT_ROOT = '/project'
const transformSource = createSourceTransform(PROJECT_ROOT)

function transform(code: string, id = '/project/src/App.tsx'): string {
  const result = transformSource(code, id)
  return result?.code ?? code
}

/** Returns the raw TransformResult | null — use when you need to distinguish null from unchanged. */
function transformRaw(code: string, id = '/project/src/App.tsx') {
  return transformSource(code, id)
}

describe('transformSource', () => {
  describe('basic JSX instrumentation', () => {
    it('instruments a simple HTML tag', () => {
      const result = transform('<div className="foo">x</div>')
      expect(result).toContain('<div data-cortex-source="src/App.tsx:1:1"')
      expect(result).toContain('className="foo"')
    })

    it('instruments multiple tags', () => {
      const result = transform('<div><span>hello</span></div>')
      expect(result).toContain('<div data-cortex-source=')
      expect(result).toContain('<span data-cortex-source=')
    })

    it('instruments self-closing tags', () => {
      const result = transform('<input type="text" />')
      expect(result).toContain('<input data-cortex-source=')
    })

    it('instruments nested elements across lines', () => {
      const code = `<div>
  <span>
    <p>nested</p>
  </span>
</div>`
      const result = transform(code)
      expect(result).toContain('data-cortex-source="src/App.tsx:1:')
      expect(result).toContain('data-cortex-source="src/App.tsx:2:')
      expect(result).toContain('data-cortex-source="src/App.tsx:3:')
    })
  })

  describe('custom elements', () => {
    it('handles kebab-case custom elements', () => {
      const result = transform('<my-card />')
      expect(result).toContain('<my-card data-cortex-source=')
      expect(result).not.toMatch(/<my\s.*-card/)
    })

    it('handles multi-segment kebab-case elements', () => {
      const result = transform('<my-super-card />')
      expect(result).toContain('<my-super-card data-cortex-source=')
    })
  })

  describe('TypeScript generics (must not instrument)', () => {
    it('skips generic type parameters like Array<string>', () => {
      const code = 'const arr: Array<string> = []'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips useState<number>()', () => {
      const code = 'const [val, setVal] = useState<number>(0)'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips function generics like foo<type>()', () => {
      const code = 'function parse<T>(input: string): T { return input as T }'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips Map<string, number>', () => {
      const code = 'const m: Map<string, number> = new Map()'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('instruments real JSX after a generic type', () => {
      const code = 'const arr: Array<string> = []\nconst el = <div>hello</div>'
      const result = transform(code)
      expect(result).not.toMatch(/Array<string data-cortex/)
      expect(result).toContain('<div data-cortex-source=')
    })
  })

  describe('regex literals (must not instrument)', () => {
    it('skips tags inside regex literals', () => {
      const code = 'const re = /<div>/g'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('instruments real JSX after a regex literal', () => {
      const code = 'const re = /<br>/g\nconst el = <span>hi</span>'
      const result = transform(code)
      expect(result).not.toMatch(/<br data-cortex/)
      expect(result).toContain('<span data-cortex-source=')
    })

    it('skips regex in assignment with complex pattern', () => {
      const code = 'const tagRe = /<([a-z]+)\\b/g'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips regex after opening paren', () => {
      const code = 'if (/<div>/.test(s)) {}'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('handles regex with escaped bracket', () => {
      const code = 'const re = /\\[/;\nconst el = <div />'
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
    })

    it('handles regex with d and v flags', () => {
      const code = 'const re = /<div>/dv\nconst el = <span />'
      const result = transform(code)
      expect(result).not.toMatch(/<div data-cortex/)
      expect(result).toContain('<span data-cortex-source=')
    })
  })

  describe('template literal expressions', () => {
    it('skips tags in template literal string portions', () => {
      const code = 'const s = `<div class="test">`'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })

    it('instruments JSX inside ${}', () => {
      const code = 'const el = `${<div>hello</div>}`'
      const result = transform(code, '/project/src/App.tsx')
      expect(result).toContain('<div data-cortex-source=')
    })

    it('handles nested objects in expressions like style={{}}', () => {
      const code = 'const el = `${<div style={{color: "red"}}>hi</div>}`'
      const result = transform(code, '/project/src/App.tsx')
      expect(result).toContain('<div data-cortex-source=')
    })

    it('handles string with brace inside template expression', () => {
      const code = 'const x = `${fn("}")}`\nconst el = <div />'
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
    })

    it('handles comment inside template expression', () => {
      const code = 'const x = `${/* } */ val}`\nconst el = <div />'
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
    })

    it('skips tags in template string between expressions', () => {
      const code = 'const s = `before <div> ${expr} after <span>`'
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })
  })

  describe('idempotency', () => {
    it('is idempotent — AST-level check prevents double-instrument', () => {
      const first = transformRaw('<div className="foo">x</div>')
      expect(first).not.toBeNull()
      expect(first!.code).toContain('data-cortex-source')
      // Second pass: AST-level check detects existing attribute, returns null
      const second = transformRaw(first!.code)
      expect(second).toBeNull()
    })

    it('still instruments when data-cortex-source= appears in a string literal', () => {
      const code = `const s = 'data-cortex-source="foo"'\nconst el = <div>real</div>`
      const result = transformRaw(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<div data-cortex-source=')
    })
  })

  describe('skip ranges — strings', () => {
    it('skips tags inside single-quoted strings', () => {
      const result = transform(`const s = '<div class="test">'`)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips tags inside double-quoted strings', () => {
      const result = transform(`const s = "<div class='test'>"`)
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips tags inside strings with escaped quotes', () => {
      const result = transform(`const s = 'it\\'s a <div>'`)
      expect(result).not.toContain('data-cortex-source')
    })
  })

  describe('skip ranges — comments', () => {
    it('skips tags inside single-line comments', () => {
      const result = transform('// <div className="test">')
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips tags inside block comments', () => {
      const result = transform('/* <div className="test"> */')
      expect(result).not.toContain('data-cortex-source')
    })

    it('skips tags inside multi-line block comments', () => {
      const code = `/*
 * <div>
 *   <span>comment</span>
 * </div>
 */`
      const result = transform(code)
      expect(result).not.toContain('data-cortex-source')
    })
  })

  describe('mixed real JSX and skip ranges', () => {
    it('instruments real JSX next to a string containing tags', () => {
      const code = `const s = '<div>'; const el = <span>hello</span>`
      const result = transform(code)
      expect(result).not.toMatch(/<div data-cortex-source/)
      expect(result).toContain('<span data-cortex-source=')
    })

    it('instruments real JSX after a comment containing tags', () => {
      const code = `// <div> not real\n<span>real</span>`
      const result = transform(code)
      expect(result).not.toMatch(/<div data-cortex-source/)
      expect(result).toContain('<span data-cortex-source=')
    })
  })

  describe('JSX patterns — loops and fragments', () => {
    it('instruments tags inside map callbacks', () => {
      const code = `items.map(item => <li key={item.id}>{item.name}</li>)`
      const result = transform(code)
      expect(result).toContain('<li data-cortex-source=')
    })

    it('does not instrument uppercase components', () => {
      const code = `<MyComponent><div>inside</div></MyComponent>`
      const result = transform(code)
      expect(result).not.toMatch(/<MyComponent data-cortex-source/)
      expect(result).toContain('<div data-cortex-source=')
    })

    it('does not instrument React fragments (<>)', () => {
      const code = `<><div>a</div><span>b</span></>`
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
      expect(result).toContain('<span data-cortex-source=')
      expect(result.startsWith('<>')).toBe(true)
    })
  })

  describe('file filtering', () => {
    it('returns null for .ts files (not JSX)', () => {
      expect(transformSource('<div />', '/project/src/App.ts')).toBeNull()
    })

    it('returns null for .js files (not JSX)', () => {
      expect(transformSource('<div />', '/project/src/App.js')).toBeNull()
    })

    it('transforms .jsx files', () => {
      const result = transformSource('<div />', '/project/src/App.jsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('data-cortex-source')
    })

    it('transforms .tsx files', () => {
      const result = transformSource('<div />', '/project/src/App.tsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('data-cortex-source')
    })

    it('returns null for node_modules files', () => {
      expect(transformSource('<div />', '/project/node_modules/pkg/App.tsx')).toBeNull()
    })

    it('returns null for cortex-editor package in node_modules', () => {
      expect(transformSource('<div />', '/project/node_modules/cortex-editor/src/App.tsx')).toBeNull()
    })

    it('does NOT filter user files that happen to contain cortex-editor in path', () => {
      const result = transformSource('<div />', '/project/cortex-editor/src/App.tsx')
      // This is a user's own file (not in node_modules), should be transformed
      expect(result).not.toBeNull()
    })

    it('does not skip files in directories containing node_modules substring', () => {
      const result = transformSource('<div />', '/project/not_node_modules/App.tsx')
      expect(result).not.toBeNull()
    })

    it('returns null when no JSX tags are found', () => {
      expect(transformSource('const x = 1', '/project/src/App.tsx')).toBeNull()
    })

    it('transforms files with Vite HMR query params', () => {
      const result = transformSource('<div />', '/project/src/App.tsx?v=abc123')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('data-cortex-source="src/App.tsx:')
    })

    it('transforms files with multiple query params', () => {
      const result = transformSource('<div />', '/project/src/App.tsx?t=123&v=abc')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('data-cortex-source="src/App.tsx:')
    })

    it('still filters non-JSX files with query params', () => {
      expect(transformSource('<div />', '/project/src/App.ts?v=abc')).toBeNull()
    })

    it('still filters node_modules with query params', () => {
      expect(transformSource('<div />', '/project/node_modules/pkg/App.tsx?v=abc')).toBeNull()
    })

    it('transforms included node_modules packages', () => {
      const t = createSourceTransform('/project', { includeNodeModules: ['@test-lib'] })
      const result = t('<div />', '/project/node_modules/@test-lib/Button.tsx')
      expect(result).not.toBeNull()
      expect(result!.code).toContain('data-cortex-source')
    })

    it('still skips non-included node_modules when includeNodeModules is set', () => {
      const t = createSourceTransform('/project', { includeNodeModules: ['@test-lib'] })
      expect(t('<div />', '/project/node_modules/other-pkg/App.tsx')).toBeNull()
    })

    it('uses segment matching for includeNodeModules (no substring false positives)', () => {
      const t = createSourceTransform('/project', { includeNodeModules: ['lib'] })
      // 'my-lib' contains 'lib' as substring but not as a path segment
      expect(t('<div />', '/project/node_modules/my-lib/App.tsx')).toBeNull()
      // 'lib' as exact segment should match
      const result = t('<div />', '/project/node_modules/lib/App.tsx')
      expect(result).not.toBeNull()
    })
  })

  describe('source location accuracy', () => {
    it('tracks correct line numbers across multiple lines', () => {
      const code = `const x = 1
const y = 2
const el = <div>
  <span />
</div>`
      const result = transform(code)
      expect(result).toContain('data-cortex-source="src/App.tsx:3:')
      expect(result).toContain('data-cortex-source="src/App.tsx:4:')
    })

    it('uses forward slashes in file paths on all platforms', () => {
      const result = transformSource(
        '<div />',
        '/project/src/components/Button.tsx',
      )
      expect(result!.code).toContain('src/components/Button.tsx')
      expect(result!.code).not.toContain('\\')
    })
  })

  describe('exact output format', () => {
    it('places attribute immediately after tag name', () => {
      const result = transform('<div className="foo">x</div>')
      expect(result).toMatch(/<div data-cortex-source="src\/App\.tsx:1:1" className="foo">/)
    })

    it('produces correct format for self-closing tag', () => {
      const result = transform('<input />')
      expect(result).toMatch(/<input data-cortex-source="src\/App\.tsx:1:1" \/>/)
    })

    it('produces correct line:col for multi-line input', () => {
      const code = 'const x = 1\nconst el = <div />'
      const result = transform(code)
      expect(result).toContain('data-cortex-source="src/App.tsx:2:12"')
    })
  })

  describe('column number accuracy', () => {
    it('reports column 1 for tag at start of line', () => {
      const result = transform('<div />')
      expect(result).toContain(':1:1"')
    })

    it('reports correct column for indented tag', () => {
      const result = transform('    <div />')
      expect(result).toContain(':1:5"')
    })

    it('reports correct column on second line', () => {
      const code = 'const x = 1\nconst el = <span />'
      const result = transform(code)
      expect(result).toContain(':2:12"')
    })

    it('reports correct column after inline content', () => {
      const code = 'const el = (<div />)'
      const result = transform(code)
      expect(result).toContain(':1:13"')
    })
  })

  describe('JSX member expressions', () => {
    it('instruments motion.div', () => {
      const result = transform('<motion.div />')
      expect(result).toContain('data-cortex-source=')
    })

    it('instruments styled.button with attributes', () => {
      const result = transform('<styled.button className="x" />')
      expect(result).toContain('data-cortex-source=')
    })

    it('skips uppercase terminal like Motion.Header', () => {
      const result = transform('<Motion.Header />')
      expect(result).not.toContain('data-cortex-source')
    })

    it('instruments deeply nested a.b.c (lowercase terminal)', () => {
      const result = transform('<a.b.c />')
      expect(result).toContain('data-cortex-source=')
    })
  })

  describe('JSX namespaced names', () => {
    it('instruments namespaced elements like svg:rect', () => {
      const result = transform('<svg:rect />')
      expect(result).toContain('data-cortex-source=')
    })
  })

  describe('non-ASCII character handling', () => {
    it('correct offset after emoji content', () => {
      const code = 'const x = "🎉"\nconst el = <div />'
      const result = transform(code)
      expect(result).toContain('data-cortex-source="src/App.tsx:2:')
    })

    it('correct offset after CJK characters', () => {
      const code = 'const label = "你好世界"\nconst el = <span>{label}</span>'
      const result = transform(code)
      expect(result).toContain('data-cortex-source="src/App.tsx:2:12"')
    })

    it('preserves emoji in attributes', () => {
      const code = '<div title="🎉🎊">text</div>'
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
      expect(result).toContain('title="🎉🎊"')
    })

    it('correct column after multi-byte chars mid-line', () => {
      const code = 'const a = "café"; const el = <div />'
      const result = transform(code)
      expect(result).toContain('<div data-cortex-source=')
    })
  })

  describe('HTML attribute escaping', () => {
    it('escapes special characters in file paths', () => {
      const result = transformSource(
        '<div />',
        '/project/src/com"po<nent>.tsx',
      )
      expect(result).not.toBeNull()
      expect(result!.code).toContain('&quot;')
      expect(result!.code).toContain('&lt;')
      expect(result!.code).toContain('&gt;')
      expect(result!.code).not.toContain('com"po')
    })
  })

  describe('edge cases', () => {
    it('returns null for files with only uppercase components (no lowercase tags)', () => {
      const result = transformRaw('<Component />')
      expect(result).toBeNull()
    })

    it('returns null for empty string input', () => {
      expect(transformRaw('')).toBeNull()
    })

    it('returns null when file has no lowercase JSX (lazy MagicString)', () => {
      const result = transformRaw('<MyApp><Section><Header /></Section></MyApp>')
      expect(result).toBeNull()
    })

    it('instruments JSX inside decorated class', () => {
      const code = `function dec(target: any) { return target }
@dec class App { render() { return <div>hello</div> } }`
      const result = transformRaw(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<div data-cortex-source=')
    })

    it('instruments JSX alongside explicitResourceManagement syntax', () => {
      const code = `function test() {
  using handle = getResource()
  return <div>{String(handle)}</div>
}`
      const result = transformRaw(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('<div data-cortex-source=')
    })
  })

  describe('performance', () => {
    // ZF0-1566: skip under V8 coverage. performance.now() under coverage
    // instrumentation measures the cost of hooked branches/statements, not
    // the transform itself — observed median ballooned to ~214.5ms against
    // a 50ms local budget. Relaxing the budget to fit would lose regression
    // signal entirely. The test still runs in normal `npm test` and CI
    // (without --coverage), where wall-clock timing is meaningful.
    // VITEST_COVERAGE is set by vitest.config.ts when --coverage is detected
    // in argv (NODE_V8_COVERAGE is not set by @vitest/coverage-v8 directly).
    // Compare === '1' explicitly so a stray `VITEST_COVERAGE=0` shell export
    // does not silently skip the assertion. See `tests/COVERAGE.md` for the
    // detection contract.
    it.skipIf(process.env.VITEST_COVERAGE === '1')('transforms a 1000-element file in under 50ms (median of 3)', () => {
      const lines: string[] = []
      for (let i = 0; i < 1000; i++) {
        lines.push(`  <div className="item-${i}">Item ${i}</div>`)
      }
      const code = `function App() {\n  return (\n    <main>\n${lines.join('\n')}\n    </main>\n  )\n}`

      // Warmup JIT
      transformSource(code, '/project/src/Warmup.tsx')

      const times: number[] = []
      for (let run = 0; run < 3; run++) {
        const start = performance.now()
        const result = transformSource(code, '/project/src/App.tsx')
        times.push(performance.now() - start)
        expect(result).not.toBeNull()
      }

      times.sort((a, b) => a - b)
      const median = times[1]!
      // GitHub Actions ubuntu-latest runners are ~2× slower than dev machines
      // under contention; 50ms is too tight in CI (observed 60-65ms).
      // Keep the dev budget tight so real regressions are caught locally.
      const BUDGET_MS = process.env.CI ? 100 : 50
      expect(median).toBeLessThan(BUDGET_MS)
    })
  })
})

describe('source map generation', () => {
  it('returns a valid source map', () => {
    const result = transformSource('<div />', '/project/src/App.tsx')
    expect(result).not.toBeNull()
    expect(result!.map).not.toBeNull()
    expect(result!.map!.version).toBe(3)
    expect(result!.map!.mappings).toBeTruthy()
  })

  it('source map includes source file and content', () => {
    const code = '<div />'
    const result = transformSource(code, '/project/src/App.tsx')
    const map = result!.map!
    expect(map.version).toBe(3)
    expect(map.sources).toHaveLength(1)
    expect(map.sources![0]).toBe('App.tsx') // relative to file's directory
    expect(map.sourcesContent).toEqual([code])
    expect(map.file).toBe('App.tsx')
    expect(map.mappings).toBeTruthy()
  })

  it('source map uses basename for outside-root files (safePath)', () => {
    const t = createSourceTransform('/project')
    const result = t('<div />', '/etc/secrets/App.tsx')
    expect(result).not.toBeNull()
    const map = result!.map!
    expect(map.sources![0]).toBe('App.tsx')
    expect(map.file).toBe('App.tsx')
    expect(map.sources![0]).not.toContain('..')
  })
})

describe('syntax error handling', () => {
  it('returns null for unparseable code', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = transformSource('const x = {', '/project/src/App.tsx')
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})

describe('production mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when mode is production', () => {
    const t = createSourceTransform('/project', { mode: 'production' })
    expect(t('<div />', '/project/src/App.tsx')).toBeNull()
  })

  it('transforms when mode is development', () => {
    const t = createSourceTransform('/project', { mode: 'development' })
    expect(t('<div />', '/project/src/App.tsx')).not.toBeNull()
  })

  it('transforms by default (no options)', () => {
    expect(transformSource('<div />', '/project/src/App.tsx')).not.toBeNull()
  })

  it('returns null when NODE_ENV=production and no explicit mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const t = createSourceTransform('/project')
    expect(t('<div />', '/project/src/App.tsx')).toBeNull()
  })

  it('explicit mode=development overrides NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const t = createSourceTransform('/project', { mode: 'development' })
    expect(t('<div />', '/project/src/App.tsx')).not.toBeNull()
  })
})

describe('parse error handling', () => {
  it('calls onParseError when parsing fails (and does not warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errors: Array<{ id: string; error: unknown }> = []
    const t = createSourceTransform('/project', {
      onParseError: (id, error) => errors.push({ id, error }),
    })
    t('const x = {', '/project/src/App.tsx')
    expect(errors).toHaveLength(1)
    expect(errors[0].id).toBe('/project/src/App.tsx')
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('still returns null on parse error without callback (warns to console)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(transformSource('const x = {', '/project/src/App.tsx')).toBeNull()
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]![0]).toContain('[cortex]')
    spy.mockRestore()
  })
})

describe('sequential call regression', () => {
  it('produces correct offsets across sequential calls', () => {
    const t = createSourceTransform('/project')
    const r1 = t('<div />', '/project/src/A.tsx')
    const r2 = t('<span />', '/project/src/B.tsx')
    expect(r1!.code).toContain(':1:1"')
    expect(r2!.code).toContain(':1:1"')
  })
})

describe('path traversal safety', () => {
  it('uses basename for files outside project root', () => {
    const t = createSourceTransform('/project')
    const result = t('<div />', '/etc/secrets/App.tsx')
    expect(result).not.toBeNull()
    expect(result!.code).toContain('data-cortex-source="App.tsx:')
    expect(result!.code).not.toContain('..')
  })

  it('uses relative path for files inside project root', () => {
    const t = createSourceTransform('/project')
    const result = t('<div />', '/project/src/deep/Component.tsx')
    expect(result).not.toBeNull()
    expect(result!.code).toContain('data-cortex-source="src/deep/Component.tsx:')
  })
})

// ---------------------------------------------------------------------------
// CSS Module annotation
// ---------------------------------------------------------------------------

describe('CSS Module annotation', () => {
  it('annotates styles.hero with data-cortex-css', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={styles.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('does not annotate static string classNames', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className="static">test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).not.toContain('data-cortex-css')
  })

  it('annotates bracket access styles["hero"]', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={styles['hero']}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('annotates dynamic access styles[variant] as wildcard', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={styles[variant]}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:*"')
  })

  it('annotates clsx(styles.a, styles.b) with multiple selectors', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={clsx(styles.a, styles.b)}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.a,.b"')
  })

  it('annotates clsx with object syntax { [styles.active]: isActive }', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={clsx(styles.hero, { [styles.active]: isActive })}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero,.active"')
  })

  it('does not annotate className={computeClass()} without binding reference', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={computeClass()}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).not.toContain('data-cortex-css')
  })

  it('handles named default import { default as s }', () => {
    const result = transform(
      `import { default as s } from './Hero.module.css'\nconst C = () => <div className={s.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('resolves relative paths from importing file directory', () => {
    const result = transform(
      `import styles from '../styles/Hero.module.css'\nconst C = () => <div className={styles.hero}>test</div>`,
      '/project/src/pages/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/styles/Hero.module.css:.hero"')
  })

  it('skips elements that already have data-cortex-css (idempotency)', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div data-cortex-css="existing" className={styles.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    // Should have the existing one, but not a second one
    const matches = result.match(/data-cortex-css/g)
    expect(matches?.length).toBe(1)
  })

  it('does not annotate non-CSS-module imports', () => {
    const result = transform(
      `import styles from './Hero.module.scss'\nconst C = () => <div className={styles.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).not.toContain('data-cortex-css')
  })

  it('handles aliased imports via resolveAlias callback', () => {
    const t = createSourceTransform('/project', {
      resolveAlias: (spec) => {
        if (spec.startsWith('@/')) return spec.replace('@/', 'src/')
        return null
      },
    })
    const result = t(
      `import styles from '@/styles/Hero.module.css'\nconst C = () => <div className={styles.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain('data-cortex-css="src/styles/Hero.module.css:.hero"')
  })

  it('deduplicates selectors from the same binding', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={clsx(styles.hero, styles.hero)}>test</div>`,
      '/project/src/Hero.tsx',
    )
    // Should contain just .hero once, not .hero,.hero
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('still adds data-cortex-source alongside data-cortex-css', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={styles.hero}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-source="src/Hero.tsx:')
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('annotates cn() wrapper the same as clsx()', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={cn(styles.hero)}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('handles template literal with CSS module reference', () => {
    const result = transform(
      `import styles from './Hero.module.css'\nconst C = () => <div className={\`\${styles.hero} extra\`}>test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).toContain('data-cortex-css="src/Hero.module.css:.hero"')
  })

  it('ignores side-effect-only CSS module imports', () => {
    const result = transform(
      `import './Hero.module.css'\nconst C = () => <div className="static">test</div>`,
      '/project/src/Hero.tsx',
    )
    expect(result).not.toContain('data-cortex-css')
  })
})
