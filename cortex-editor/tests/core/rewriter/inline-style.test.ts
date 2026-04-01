import { describe, it, expect } from 'vitest'
import { InlineStyleRewriter } from '../../../src/core/rewriter/inline-style.js'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

function createTempFile(content: string, ext = '.tsx'): string {
  const dir = join(tmpdir(), `cortex-inline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `Component${ext}`)
  writeFileSync(filePath, content)
  return filePath
}

function cleanupTempFile(filePath: string): void {
  try { rmSync(filePath) } catch {}
  try { rmSync(dirname(filePath), { recursive: true }) } catch {}
}

describe('InlineStyleRewriter', () => {
  it('adds style prop when element has none', async () => {
    const source = `export function App() {
  return <div className="hero">Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.oldContent).toBe(source)
        expect(result.newContent).toContain('style={{ paddingTop: "16px" }}')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('merges into existing style object literal', async () => {
    const source = `export function App() {
  return <div style={{ color: "red" }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('color: "red"')
        expect(result.newContent).toContain('paddingTop: "16px"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('updates existing property value', async () => {
    const source = `export function App() {
  return <div style={{ paddingTop: "8px" }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('paddingTop: "16px"')
        expect(result.newContent).not.toContain('"8px"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('bails on style={variable}', async () => {
    const source = `export function App() {
  return <div style={myStyles}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toContain('not an object literal')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('bails on style={condition ? a : b}', async () => {
    const source = `export function App({ isActive }: { isActive: boolean }) {
  return <div style={isActive ? active : inactive}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(false)
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('handles self-closing elements', async () => {
    const source = `export function App() {
  return <img src="logo.png" />
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('style={{ paddingTop: "16px" }}')
        expect(result.newContent).toContain('src="logo.png"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('converts kebab-case to camelCase', async () => {
    const source = `export function App() {
  return <div>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'background-color',
        value: '#ff0000',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('backgroundColor: "#ff0000"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('bails on non-literal property initializer', async () => {
    const source = `export function App() {
  return <div style={{ paddingTop: theme.spacing.md }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toContain('non-literal')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('handles spread in style object — adds property after spread', async () => {
    const source = `export function App() {
  return <div style={{ ...baseStyle }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('...baseStyle')
        expect(result.newContent).toContain('paddingTop: "16px"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('returns failure when no JSX element at position', async () => {
    const source = `const x = 42\n`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 1,
        col: 1,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toContain('No JSX element found')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('returns failure when disposed', async () => {
    const rewriter = new InlineStyleRewriter()
    rewriter.dispose()

    const result = await rewriter.rewrite({
      filePath: '/some/file.tsx',
      line: 1,
      col: 1,
      property: 'padding-top',
      value: '16px',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('Rewriter is disposed')
    }
  })

  it('uses JSON.stringify for value safety', async () => {
    const source = `export function App() {
  return <div>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'content',
        value: `it's "quoted"`,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // JSON.stringify produces: "it's \"quoted\""
        // The value in source should be properly escaped
        expect(result.newContent).toContain('content:')
        expect(result.newContent).toContain(`it's`)
        expect(result.newContent).toContain(`\\"quoted\\"`)
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('handles CSS custom property as quoted key', async () => {
    const source = `export function App() {
  return <div>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: '--my-spacing',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Custom property key must be quoted
        expect(result.newContent).toContain('"--my-spacing": "16px"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('adds property when style has shorthand for a different property', async () => {
    const source = `export function App({ color }: { color: string }) {
  return <div style={{ color }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Shorthand for 'color' preserved, new property added
        expect(result.newContent).toContain('color')
        expect(result.newContent).toContain('paddingTop: "16px"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('updates numeric literal to string (CSS values are always strings)', async () => {
    const source = `export function App() {
  return <div style={{ zIndex: 1 }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'z-index',
        value: '2',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // CSS values from browser are always strings; React accepts both
        expect(result.newContent).toContain('zIndex: "2"')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  it('bails on shorthand property assignment', async () => {
    const source = `export function App({ paddingTop }: { paddingTop: string }) {
  return <div style={{ paddingTop }}>Hello</div>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toContain('shorthand')
      }
      rewriter.dispose()
    } finally {
      cleanupTempFile(filePath)
    }
  })

  // --- removeProperty ---

  describe('removeProperty', () => {
    it('removes an existing property from the style object', async () => {
      const source = `export function App() {
  return <div style={{ paddingTop: "20px", color: "red" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toContain('color: "red"')
          expect(result.newContent).not.toContain('paddingTop')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('removes entire style attribute when last property removed', async () => {
      const source = `export function App() {
  return <div style={{ paddingTop: "20px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('style')
          expect(result.newContent).toContain('<div>Hello</div>')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('returns unchanged content when property does not exist', async () => {
      const source = `export function App() {
  return <div style={{ color: "red" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toBe(result.oldContent)
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('returns unchanged content when no style attribute exists', async () => {
      const source = `export function App() {
  return <div className="hero">Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).toBe(result.oldContent)
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })
  })
})
