import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractTextComponents } from '../../src/core/text-components.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'

describe('extractTextComponents', () => {
  it('returns bundle when size + line-height + letter-spacing + weight all present', () => {
    const props = new Map([
      ['--text-body-md', '14px'],
      ['--text-body-md--line-height', '21px'],
      ['--text-body-md--letter-spacing', '0px'],
      ['--text-body-md--font-weight', '400'],
    ])
    expect(extractTextComponents(props)).toEqual([
      {
        name: 'body-md',
        fontSize: '14px',
        lineHeight: '21px',
        letterSpacing: '0px',
        fontWeight: '400',
        fontFamily: undefined,
      },
    ])
  })

  it('skips partial bundles that lack any required sub-property', () => {
    const props = new Map([
      ['--text-sm', '14px'],
      ['--text-sm--line-height', '21px'],
      // missing letter-spacing and font-weight
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('includes font-family when --text-{name}--font-family is present', () => {
    const props = new Map([
      ['--text-heading-1', '32px'],
      ['--text-heading-1--line-height', '40px'],
      ['--text-heading-1--letter-spacing', '-0.5px'],
      ['--text-heading-1--font-weight', '700'],
      ['--text-heading-1--font-family', 'Inter, sans-serif'],
    ])
    const result = extractTextComponents(props)
    expect(result[0]?.fontFamily).toBe('Inter, sans-serif')
  })

  it('ignores non-text properties', () => {
    const props = new Map([
      ['--color-gray-900', '#111827'],
      ['--spacing', '0.25rem'],
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('ignores --text-shadow-* properties (they are not typography bundles)', () => {
    const props = new Map([
      ['--text-shadow-sm', '0 1px 2px rgba(0,0,0,0.05)'],
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('returns multiple bundles sorted by font-size ascending', () => {
    const props = new Map([
      ['--text-lg', '18px'],
      ['--text-lg--line-height', '28px'],
      ['--text-lg--letter-spacing', '0px'],
      ['--text-lg--font-weight', '400'],
      ['--text-sm', '14px'],
      ['--text-sm--line-height', '20px'],
      ['--text-sm--letter-spacing', '0px'],
      ['--text-sm--font-weight', '400'],
    ])
    const names = extractTextComponents(props).map(b => b.name)
    expect(names).toEqual(['sm', 'lg'])
  })
})

describe('TailwindResolver.resolveTextComponents', () => {
  it('returns null when no v4 entry CSS is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-tc-none-'))
    // No CSS file at all
    const result = await TailwindResolver.resolveTextComponents(dir)
    expect(result).toBeNull()
  })

  it('returns empty array when @theme has no text-component bundles', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-tc-empty-'))
    writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
    const result = await TailwindResolver.resolveTextComponents(dir)
    expect(result).toEqual([])
  })

  it('returns bundles from user @theme', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-tc-'))
    writeFileSync(
      join(dir, 'app.css'),
      `@import "tailwindcss";
@theme {
  --text-body-md: 14px;
  --text-body-md--line-height: 21px;
  --text-body-md--letter-spacing: 0px;
  --text-body-md--font-weight: 400;
}
`,
    )
    const result = await TailwindResolver.resolveTextComponents(dir)
    expect(result?.map(b => b.name)).toEqual(['body-md'])
    expect(result?.[0]).toMatchObject({
      fontSize: '14px',
      lineHeight: '21px',
      letterSpacing: '0px',
      fontWeight: '400',
    })
  })

  it('omits partial bundles even when user defines them in @theme', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-tc-partial-'))
    writeFileSync(
      join(dir, 'app.css'),
      `@import "tailwindcss";
@theme {
  --text-partial: 14px;
  --text-partial--line-height: 20px;
  /* missing letter-spacing and font-weight → not a bundle */
}
`,
    )
    const result = await TailwindResolver.resolveTextComponents(dir)
    expect(result).toEqual([])
  })
})

describe('TailwindResolver.resolveColorChips', () => {
  it('returns null when no v4 entry CSS is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-none-'))
    const result = await TailwindResolver.resolveColorChips(dir)
    expect(result).toBeNull()
  })

  it('returns named chips from @theme --color-* entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-'))
    writeFileSync(
      join(dir, 'app.css'),
      `@import "tailwindcss";
@theme {
  --color-brand-500: #3b82f6;
  --color-gray-900: #111827;
}
`,
    )
    const result = await TailwindResolver.resolveColorChips(dir)
    expect(result).toEqual([
      { name: 'brand-500', hex: '#3b82f6', source: 'theme' },
      { name: 'gray-900', hex: '#111827', source: 'theme' },
    ])
  })

  it('returns empty array when @theme has no color entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-empty-'))
    writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
    const result = await TailwindResolver.resolveColorChips(dir)
    expect(result).toEqual([])
  })

  it('keeps current theme colors in resolved palette order without source-scanning files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-theme-'))
    mkdirSync(join(dir, 'node_modules', 'tailwindcss'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss"}')
    writeFileSync(
      join(dir, 'node_modules', 'tailwindcss', 'theme.css'),
      `@theme default {
  --color-white: #fff;
  --color-slate-200: #e2e8f0;
  --color-slate-900: #0f172a;
  --color-blue-500: #3b82f6;
  --color-blue-700: #1d4ed8;
  --color-red-500: #ef4444;
}
`,
    )
    writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
    writeFileSync(
      join(dir, 'src', 'App.tsx'),
      `export function App() {
  return (
    <section className="bg-white border border-slate-200 text-slate-900 hover:bg-blue-700 focus:ring-blue-500">
      hello
    </section>
  )
}
`,
    )

    const result = await TailwindResolver.resolveColorChips(dir)

    expect(result).toEqual([
      { name: 'white', hex: '#ffffff', source: 'theme' },
      { name: 'slate-200', hex: '#e2e8f0', source: 'theme' },
      { name: 'slate-900', hex: '#0f172a', source: 'theme' },
      { name: 'blue-500', hex: '#3b82f6', source: 'theme' },
      { name: 'blue-700', hex: '#1d4ed8', source: 'theme' },
      { name: 'red-500', hex: '#ef4444', source: 'theme' },
    ])
  })

  it('does not split color families by source usage order', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-theme-order-'))
    mkdirSync(join(dir, 'node_modules', 'tailwindcss'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss"}')
    writeFileSync(
      join(dir, 'node_modules', 'tailwindcss', 'theme.css'),
      `@theme default {
  --color-blue-300: #91c5ff;
  --color-blue-600: #155dfc;
  --color-emerald-50: #ecfdf5;
  --color-emerald-300: #5ee9b5;
  --color-emerald-700: #007857;
  --color-emerald-900: #004e3b;
  --color-amber-50: #fffbeb;
  --color-amber-300: #ffd237;
  --color-amber-700: #b55200;
  --color-amber-900: #7b3306;
}
`,
    )
    writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
    writeFileSync(
      join(dir, 'src', 'App.tsx'),
      `export function App() {
  return (
    <section className="bg-blue-300 text-emerald-50 border-emerald-900 ring-emerald-700 outline-emerald-300 decoration-amber-50 caret-amber-900 accent-amber-700 fill-amber-300 stroke-blue-600">
      hello
    </section>
  )
}
`,
    )

    const result = await TailwindResolver.resolveColorChips(dir)

    expect(result?.map((chip) => chip.name)).toEqual([
      'blue-300',
      'blue-600',
      'emerald-50',
      'emerald-300',
      'emerald-700',
      'emerald-900',
      'amber-50',
      'amber-300',
      'amber-700',
      'amber-900',
    ])
    expect(new Set(result?.map((chip) => chip.source))).toEqual(new Set(['theme']))
  })

  it('deduplicates same-value colors and prefers app theme names', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-theme-dedupe-'))
    mkdirSync(join(dir, 'node_modules', 'tailwindcss'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss"}')
    writeFileSync(
      join(dir, 'node_modules', 'tailwindcss', 'theme.css'),
      `@theme default {
  --color-white: #fff;
  --color-slate-200: #e2e8f0;
  --color-red-500: #ef4444;
}
`,
    )
    writeFileSync(
      join(dir, 'app.css'),
      `@import "tailwindcss";
@theme {
  --color-surface: #ffffff;
  --color-border-muted: #e2e8f0;
}
`,
    )
    writeFileSync(
      join(dir, 'src', 'App.tsx'),
      `export function App() {
  return <section className="bg-white border border-slate-200 text-red-500">hello</section>
}
`,
    )

    const result = await TailwindResolver.resolveColorChips(dir)

    expect(result).toEqual([
      { name: 'surface', hex: '#ffffff', aliases: ['white'], source: 'theme' },
      { name: 'border-muted', hex: '#e2e8f0', aliases: ['slate-200'], source: 'theme' },
      { name: 'red-500', hex: '#ef4444', source: 'theme' },
    ])
  })

  it('uses the resolved theme subset when the app clears Tailwind default colors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cc-theme-subset-'))
    mkdirSync(join(dir, 'node_modules', 'tailwindcss'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss"}')
    writeFileSync(
      join(dir, 'node_modules', 'tailwindcss', 'theme.css'),
      `@theme default {
  --color-red-500: #ef4444;
  --color-blue-500: #3b82f6;
}
`,
    )
    writeFileSync(
      join(dir, 'app.css'),
      `@import "tailwindcss";
@theme {
  --color-*: initial;
  --color-brand: #2563eb;
}
`,
    )
    writeFileSync(
      join(dir, 'src', 'App.tsx'),
      `export function App() {
  return <section className="bg-red-500 text-brand">hello</section>
}
`,
    )

    const result = await TailwindResolver.resolveColorChips(dir)

    expect(result).toEqual([
      { name: 'brand', hex: '#2563eb', source: 'theme' },
    ])
  })
})
