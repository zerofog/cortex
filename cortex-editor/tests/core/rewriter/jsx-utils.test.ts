import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { SourceFile, SyntaxKind as SyntaxKindEnum } from 'ts-morph'
import { ensureTsMorph, findJsxElementAt, cssPropertyToCamelCase } from '../../../src/core/rewriter/jsx-utils.js'

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

  it('returns null when position is in element body text (not the opening tag)', async () => {
    // data-cortex-source points at the opening tag, not the body.
    // This documents that positions inside text content (after >) return null.
    const { sourceFile, SK, filePath } = await parseSource(
      `export function App() {\n  return <div>Hello World</div>\n}`,
    )
    try {
      // col 17 points at "World" — inside the text content, outside <div> opening tag
      const element = findJsxElementAt(sourceFile, 2, 17, SK)
      expect(element).toBeNull()
    } finally {
      cleanupTempFile(filePath)
    }
  })
})
