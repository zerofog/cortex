import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { SourceFile, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase, _resetTsMorphForTesting } from '../../../src/core/rewriter/jsx-utils.js'

function createTempFile(content: string): string {
  const dir = join(tmpdir(), `cortex-jsx-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'Test.tsx')
  writeFileSync(filePath, content)
  return filePath
}

function cleanupTempFile(filePath: string): void {
  try { rmSync(filePath) } catch {}
  try { rmSync(dirname(filePath), { recursive: true }) } catch {}
}

/** Create a ts-morph SourceFile from source text, returning everything findJsxElementAt needs. */
async function parseSource(source: string): Promise<{
  sourceFile: SourceFile
  SK: typeof SyntaxKindEnum
  filePath: string
}> {
  const filePath = createTempFile(source)
  const mod = await ensureTsMorph()
  const project = new mod.Project({
    useInMemoryFileSystem: false,
    compilerOptions: { jsx: 4, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  })
  const sourceFile = project.createSourceFile(filePath, source, { overwrite: true })
  return { sourceFile, SK: mod.SyntaxKind, filePath }
}

describe('cssPropertyToCamelCase', () => {
  it('converts simple kebab-case to camelCase', () => {
    expect(cssPropertyToCamelCase('padding-top')).toBe('paddingTop')
  })

  it('converts multi-segment kebab-case', () => {
    expect(cssPropertyToCamelCase('background-color')).toBe('backgroundColor')
  })

  it('converts triple-segment properties', () => {
    expect(cssPropertyToCamelCase('border-top-width')).toBe('borderTopWidth')
  })

  it('maps CSSOM exceptions (float → cssFloat)', () => {
    expect(cssPropertyToCamelCase('float')).toBe('cssFloat')
  })

  it('passes through single-word properties unchanged', () => {
    expect(cssPropertyToCamelCase('margin')).toBe('margin')
    expect(cssPropertyToCamelCase('color')).toBe('color')
    expect(cssPropertyToCamelCase('display')).toBe('display')
  })

  it('handles -ms- vendor prefix as lowercase ms', () => {
    expect(cssPropertyToCamelCase('-ms-transform')).toBe('msTransform')
    expect(cssPropertyToCamelCase('-ms-flex-align')).toBe('msFlexAlign')
  })

  it('handles -webkit- vendor prefix', () => {
    expect(cssPropertyToCamelCase('-webkit-transform')).toBe('WebkitTransform')
    expect(cssPropertyToCamelCase('-webkit-backdrop-filter')).toBe('WebkitBackdropFilter')
  })

  it('handles -moz- vendor prefix', () => {
    expect(cssPropertyToCamelCase('-moz-appearance')).toBe('MozAppearance')
  })

  it('handles -o- vendor prefix', () => {
    expect(cssPropertyToCamelCase('-o-transform')).toBe('OTransform')
  })

  it('passes through CSS custom properties unchanged', () => {
    expect(cssPropertyToCamelCase('--my-var')).toBe('--my-var')
    expect(cssPropertyToCamelCase('--spacing-lg')).toBe('--spacing-lg')
    expect(cssPropertyToCamelCase('--color-primary')).toBe('--color-primary')
  })

  it('handles already-camelCase input', () => {
    expect(cssPropertyToCamelCase('paddingTop')).toBe('paddingTop')
  })

  it('handles uppercase post-hyphen letters (malformed input)', () => {
    expect(cssPropertyToCamelCase('padding-Top')).toBe('paddingTop')
  })

  it('passes through dangerous keys unchanged (blocklist guard)', () => {
    // These keys would pass through unchanged even without the guard (no hyphens),
    // but the guard prevents future regressions if CSSOM_EXCEPTIONS or other
    // mappings ever include them. The real protection is that downstream code
    // using obj[cssPropertyToCamelCase(input)] won't pollute prototypes.
    expect(cssPropertyToCamelCase('constructor')).toBe('constructor')
    expect(cssPropertyToCamelCase('__proto__')).toBe('__proto__')
    expect(cssPropertyToCamelCase('prototype')).toBe('prototype')
  })
})

describe('ensureTsMorph', () => {
  it('returns ts-morph module with Project and SyntaxKind', async () => {
    const mod = await ensureTsMorph()
    expect(mod.Project).toBeDefined()
    expect(mod.SyntaxKind).toBeDefined()
    expect(typeof mod.SyntaxKind.JsxOpeningElement).toBe('number')
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    const mod1 = await ensureTsMorph()
    const mod2 = await ensureTsMorph()
    expect(mod1).toBe(mod2)
  })

  it('_resetTsMorphForTesting allows re-initialization', async () => {
    const promise1 = ensureTsMorph()
    const mod1 = await promise1
    expect(mod1.SyntaxKind).toBeDefined()

    _resetTsMorphForTesting()

    const promise2 = ensureTsMorph()
    const mod2 = await promise2
    expect(mod2.SyntaxKind).toBeDefined()

    // After reset, a fresh initialization occurs: the Promise instance differs
    expect(promise2).not.toBe(promise1)
  })
})

describe('findJsxElementAt', () => {
  it('finds a self-closing JSX element at line:col', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <img src="logo.png" />\n}`,
    )
    try {
      const element = findJsxElementAt(sourceFile, 2, 10, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('img')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('finds an opening JSX element at line:col', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div className="hero">Hello</div>\n}`,
    )
    try {
      const element = findJsxElementAt(sourceFile, 2, 10, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('div')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('returns null for invalid position', async () => {
    const { sourceFile, SK, filePath } = await parseSource(`const x = 42\n`)
    try {
      const element = findJsxElementAt(sourceFile, 1, 1, SK)
      expect(element).toBeNull()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('returns null for out-of-bounds line', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div>Hello</div>\n}`,
    )
    try {
      const element = findJsxElementAt(sourceFile, 999, 1, SK)
      expect(element).toBeNull()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('finds the tightest element when nested', async () => {
    const { sourceFile, SK, filePath } = await parseSource(`export function App() {
  return (
    <div className="outer">
      <span className="inner">Hello</span>
    </div>
  )
}`)
    try {
      // Point at the <span> on line 4
      const element = findJsxElementAt(sourceFile, 4, 7, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('span')
      expect(element!.getText()).not.toContain('outer')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('finds element at opening < position', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div className="x">Hi</div>\n}`,
    )
    try {
      // col 10 is the '<' of <div>
      const element = findJsxElementAt(sourceFile, 2, 10, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('div')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('finds element at closing > position of opening tag', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div className="x">Hi</div>\n}`,
    )
    try {
      // The opening tag <div className="x"> ends at the >
      // col 28 is the '>' — should still resolve to the opening element
      const element = findJsxElementAt(sourceFile, 2, 28, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('div')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('finds self-closing element at /> position', async () => {
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <img src="a.png" />\n}`,
    )
    try {
      // Position on the / of />
      const element = findJsxElementAt(sourceFile, 2, 25, SK)
      expect(element).not.toBeNull()
      expect(element!.getText()).toContain('img')
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('returns null when position is in element body text (not the opening tag)', async () => {
    // The ancestor walk from JsxText goes through JsxElement (container node),
    // not JsxOpeningElement. This is correct: data-cortex-source always points
    // at the opening tag, never at body text.
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div>Hello World</div>\n}`,
    )
    try {
      const element = findJsxElementAt(sourceFile, 2, 17, SK)
      expect(element).toBeNull()
    } finally {
      cleanupTempFile(filePath)
    }
  })
})
