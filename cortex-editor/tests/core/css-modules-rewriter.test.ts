import { describe, it, expect } from 'vitest'
import { CSSModulesRewriter } from '../../src/core/rewriter/css-modules.js'
import type { CSSModulesRewriteRequest } from '../../src/core/rewriter/css-modules.js'

function mockReadFile(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    if (path in files) return files[path]!
    throw new Error(`ENOENT: no such file or directory, open '${path}'`)
  }
}

describe('CSSModulesRewriter', () => {
  it('basic longhand update', async () => {
    const css = `.hero {\n  padding-top: 8px;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('padding-top: 16px')
    }
    rewriter.dispose()
  })

  it('missing selector returns failure', async () => {
    const css = `.hero {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.missing',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('.missing')
    }
    rewriter.dispose()
  })

  it('shorthand to shorthand rewrite', async () => {
    const css = `.hero {\n  padding: 8px;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('padding: 16px 8px 8px')
    }
    rewriter.dispose()
  })

  it('longhand to longhand update', async () => {
    const css = `.hero {\n  padding-top: 8px;\n  padding-right: 12px;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('padding-top: 16px')
      expect(result.newContent).toContain('padding-right: 12px')
    }
    rewriter.dispose()
  })

  it('new property adds longhand', async () => {
    const css = `.hero {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('color: red')
      expect(result.newContent).toContain('padding-top: 16px')
    }
    rewriter.dispose()
  })

  it('var() guard adds longhand override', async () => {
    const css = `.hero {\n  padding: var(--spacing);\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('padding-top: 16px')
      expect(result.newContent).toContain('var(--spacing)')
    }
    rewriter.dispose()
  })

  it('@apply guard returns failure', async () => {
    const css = `.hero {\n  @apply p-4;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('@apply')
    }
    rewriter.dispose()
  })

  it('comma-separated selectors match', async () => {
    const css = `.hero, .heroLarge {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('color: blue')
    }
    rewriter.dispose()
  })

  it('wildcard selector with single match', async () => {
    const css = `.hero {\n  padding: 8px;\n}\n.other {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '*',
      property: 'padding',
      newValue: '16px',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('padding: 16px')
    }
    rewriter.dispose()
  })

  it('wildcard selector with ambiguous matches returns failure', async () => {
    const css = `.hero {\n  padding: 8px;\n}\n.other {\n  padding: 4px;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '*',
      property: 'padding',
      newValue: '16px',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('Ambiguous')
    }
    rewriter.dispose()
  })

  it('border shorthand rewrite', async () => {
    const css = `.hero {\n  border: 1px solid black;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'border-color',
      newValue: 'red',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('border: 1px solid red')
    }
    rewriter.dispose()
  })

  it('pseudo-class selector matches base class', async () => {
    const css = `.hero:hover {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('color: blue')
    }
    rewriter.dispose()
  })

  it('returns old and new content on success', async () => {
    const css = `.hero {\n  color: red;\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.oldContent).toBe(css)
      expect(result.newContent).toContain('color: blue')
      expect(result.filePath).toBe('/app/hero.module.css')
    }
    rewriter.dispose()
  })

  it('PostCSS parse error returns failure', async () => {
    const css = `.hero { color: red; `
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/bad.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/bad.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('parse error')
    }
    rewriter.dispose()
  })

  it('@media rule: base rule preferred over @media variant', async () => {
    const css = `.hero {\n  color: red;\n}\n@media (min-width: 768px) {\n  .hero {\n    color: green;\n  }\n}\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/hero.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/hero.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Base rule should be edited, not the @media one
      const lines = result.newContent.split('\n')
      const baseColorLine = lines.findIndex(l => l.includes('color: blue'))
      const mediaLine = lines.findIndex(l => l.includes('@media'))
      expect(baseColorLine).toBeLessThan(mediaLine)
      // @media rule should still have original color
      expect(result.newContent).toContain('color: green')
    }
    rewriter.dispose()
  })

  it('hyphenated custom element matches exact tag only, not longer names', async () => {
    // Longer name FIRST — the buggy \b regex matches my-component inside my-component-wrapper
    const css = `.card my-component-wrapper { color: blue; }\n.card my-component { color: red; }\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/card.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/card.module.css',
      selector: '.card',
      property: 'color',
      newValue: 'green',
      elementSelector: 'my-component',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Should edit .card my-component, NOT .card my-component-wrapper
      expect(result.newContent).toContain('.card my-component { color: green')
      expect(result.newContent).toContain('.card my-component-wrapper { color: blue')
    }
    rewriter.dispose()
  })

  it('regular HTML element still matches descendant selector', async () => {
    const css = `.card { color: red; }\n.card h3 { color: blue; }\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/card.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/card.module.css',
      selector: '.card',
      property: 'color',
      newValue: 'green',
      elementSelector: 'h3',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Should prefer .card h3 over .card
      expect(result.newContent).toContain('.card h3 { color: green')
      // Base rule should remain unchanged
      expect(result.newContent).toContain('.card { color: red')
    }
    rewriter.dispose()
  })

  it('custom element x-button matches exactly in descendant selector', async () => {
    const css = `.panel { padding: 8px; }\n.panel x-button { color: red; }\n`
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({ '/app/panel.module.css': css }) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/panel.module.css',
      selector: '.panel',
      property: 'color',
      newValue: 'blue',
      elementSelector: 'x-button',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.newContent).toContain('.panel x-button { color: blue')
    }
    rewriter.dispose()
  })

  it('file not found returns failure', async () => {
    const rewriter = new CSSModulesRewriter({ readFile: mockReadFile({}) })
    const result = await rewriter.rewrite({
      cssFilePath: '/app/missing.module.css',
      selector: '.hero',
      property: 'color',
      newValue: 'blue',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toContain('CSS file not found')
    }
    rewriter.dispose()
  })
})
