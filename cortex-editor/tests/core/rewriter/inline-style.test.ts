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

  // ZF0-1215 Bug A repro: h1 in cortex-test has a multi-line style with
  // 4 properties (textAlign, display, flexDirection, alignItems). User
  // edited textAlign left → center but source stayed "left", preview
  // showed center (override), control read "left" from source. If this
  // test fails, the rewriter's update-existing-property loop doesn't
  // handle multi-line object literals correctly. If it passes, the bug
  // is in the Panel's dispatch path, not the rewriter.
  it('updates textAlign on a multi-line style with multiple properties (Bug A repro)', async () => {
    const source = `export function App() {
  return <h1 className="text-heading-1 text-gray-900" style={{
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  }}>Scenario 1</h1>
}`
    const filePath = createTempFile(source)
    try {
      const rewriter = new InlineStyleRewriter()
      const result = await rewriter.rewrite({
        filePath,
        line: 2,
        col: 10,
        property: 'text-align',
        value: 'center',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.newContent).toContain('textAlign: "center"')
        expect(result.newContent).not.toContain('textAlign: "left"')
        // Other properties must be preserved — no accidental deletion.
        expect(result.newContent).toContain('display: "flex"')
        expect(result.newContent).toContain('flexDirection: "column"')
        expect(result.newContent).toContain('alignItems: "center"')
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

  // ── ZF0-1293: shorthand-clobber guard ──────────────────────────
  //
  // React iterates the style object literal in insertion order and applies
  // each key via `el.style[key] = value`. CSS shorthand properties (`padding`,
  // `margin`, etc.) EXPAND into longhands when set. So if a JSX element's
  // style has `{ paddingBottom: X, padding: Y }` in that order, React will:
  //   1. set el.style.paddingBottom = X
  //   2. set el.style.padding = Y   ← expands and OVERWRITES paddingBottom
  // The user's paddingBottom edit is silently clobbered by the shorthand.
  //
  // Guard: after updating/adding a longhand, ensure it appears AFTER any
  // parent shorthand in the object literal. If the ordering is unsafe,
  // move the longhand to the end.

  describe('shorthand-clobber guard (ZF0-1293)', () => {
    it('re-orders longhand after shorthand when source has longhand first (unsafe)', async () => {
      // The bug scenario: a human-authored source has paddingBottom BEFORE
      // padding. Updating paddingBottom without re-ordering leaves it
      // clobbered by the subsequent padding shorthand.
      const source = `export function App() {
  return <div style={{ paddingBottom: "10px", padding: "30px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-bottom',
          value: '16px',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          // paddingBottom must now appear AFTER padding in source order —
          // React will then set padding first, paddingBottom second, so the
          // longhand wins.
          const idxPadding = result.newContent.indexOf('padding:')
          const idxPaddingBottom = result.newContent.indexOf('paddingBottom:')
          expect(idxPadding).toBeGreaterThan(-1)
          expect(idxPaddingBottom).toBeGreaterThan(-1)
          expect(idxPaddingBottom).toBeGreaterThan(idxPadding)
          // And the value must be the newly-written one.
          expect(result.newContent).toContain('paddingBottom: "16px"')
          // The shorthand must still be preserved (we don't silently remove it).
          expect(result.newContent).toContain('padding: "30px"')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('preserves order when shorthand already precedes longhand (safe, no re-order)', async () => {
      // Safe starting order — no re-order needed. Must not churn whitespace or
      // introduce unnecessary diffs.
      const source = `export function App() {
  return <div style={{ padding: "24px", paddingBottom: "10px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-bottom',
          value: '16px',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          const idxPadding = result.newContent.indexOf('padding:')
          const idxPaddingBottom = result.newContent.indexOf('paddingBottom:')
          expect(idxPaddingBottom).toBeGreaterThan(idxPadding)
          expect(result.newContent).toContain('paddingBottom: "16px"')
          expect(result.newContent).toContain('padding: "24px"')
          // No duplicate paddingBottom keys (a naive "always move to end" that
          // forgot to remove the old one would leave two).
          expect(result.newContent.match(/paddingBottom/g)?.length).toBe(1)
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('appends longhand safely when only shorthand is present', async () => {
      // Mirrors the dev-app `<ul id="verify" style={{ padding: "24px", ... }}>`
      // case. No existing longhand — just append, which naturally goes after
      // the shorthand. This test guards against a future "re-order everything"
      // refactor from breaking the trivially-safe case.
      const source = `export function App() {
  return <div style={{ padding: "24px", border: "1px solid" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-bottom',
          value: '16px',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          const idxPadding = result.newContent.indexOf('padding:')
          const idxPaddingBottom = result.newContent.indexOf('paddingBottom:')
          expect(idxPaddingBottom).toBeGreaterThan(idxPadding)
          expect(result.newContent).toContain('paddingBottom: "16px"')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('no shorthand present: longhand behavior unchanged (regression guard)', async () => {
      // Pure safety test: if no parent shorthand exists, the guard must not
      // touch the ordering. Prevents over-eager re-ordering churn.
      const source = `export function App() {
  return <div style={{ color: "red", paddingBottom: "10px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'padding-bottom',
          value: '16px',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          const idxColor = result.newContent.indexOf('color:')
          const idxPaddingBottom = result.newContent.indexOf('paddingBottom:')
          // Order preserved — color before paddingBottom as authored.
          expect(idxColor).toBeLessThan(idxPaddingBottom)
          expect(result.newContent).toContain('paddingBottom: "16px"')
          // paddingBottom appears exactly once.
          expect(result.newContent.match(/paddingBottom/g)?.length).toBe(1)
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('margin parent re-orders marginBottom — guard is generic to all shorthands', async () => {
      // SHORTHAND_LONGHANDS contains margin/padding/borderRadius/etc. Prove
      // the guard treats them uniformly rather than special-casing padding.
      const source = `export function App() {
  return <div style={{ marginBottom: "8px", margin: "24px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.rewrite({
          filePath,
          line: 2,
          col: 10,
          property: 'margin-bottom',
          value: '12px',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          const idxMargin = result.newContent.search(/\bmargin:/)
          const idxMarginBottom = result.newContent.indexOf('marginBottom:')
          expect(idxMarginBottom).toBeGreaterThan(idxMargin)
          expect(result.newContent).toContain('marginBottom: "12px"')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })
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

    it('removes both longhand AND shorthand parent when both present', async () => {
      const source = `export function App() {
  return <div style={{ padding: "16px", paddingTop: "20px", color: "red" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('paddingTop')
          expect(result.newContent).not.toContain('padding:')
          expect(result.newContent).not.toContain("padding\"")
          expect(result.newContent).toContain('color: "red"')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('removes shorthand parent when longhand target is not found', async () => {
      const source = `export function App() {
  return <div style={{ padding: "16px", color: "red" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('padding')
          expect(result.newContent).toContain('color: "red"')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('removes ShorthandPropertyAssignment (style={{ padding }})', async () => {
      const source = `export function App({ padding }: { padding: string }) {
  return <div style={{ padding }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          // padding shorthand inside style should be removed (it's in LONGHAND_TO_SHORTHAND)
          // The style attribute itself should be gone since padding was the only property
          expect(result.newContent).not.toContain('style={{')
          expect(result.newContent).not.toContain('style={')
          expect(result.newContent).toContain('<div>Hello</div>')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('removes ShorthandPropertyAssignment but keeps other properties', async () => {
      const source = `export function App({ padding }: { padding: string }) {
  return <div style={{ padding, color: "red" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperty({ filePath, line: 2, col: 10, property: 'padding-top' })
        expect(result.success).toBe(true)
        if (result.success) {
          // padding shorthand removed from the style object, but color remains
          expect(result.newContent).not.toContain('{{ padding')
          expect(result.newContent).toContain('color: "red"')
          expect(result.newContent).toContain('style')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })
  })

  // --- removeProperties (batch) ---

  describe('removeProperties', () => {
    it('removes properties from multiple elements in the same file', async () => {
      const source = `export function App() {
  return (
    <div>
      <div style={{ paddingTop: "20px" }}>Card A</div>
      <div style={{ paddingTop: "24px" }}>Card B</div>
    </div>
  )
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [
            { line: 4, col: 7, property: 'padding-top' },
            { line: 5, col: 7, property: 'padding-top' },
          ],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('paddingTop')
          expect(result.newContent).not.toContain('style')
          expect(result.newContent).toContain('Card A')
          expect(result.newContent).toContain('Card B')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('handles multi-line JSX where single-element removal would shift lines', async () => {
      const source = `export function App() {
  return (
    <div>
      <div
        className="card"
        style={{ paddingTop: "20px" }}
      >Card A</div>
      <div
        className="card"
        style={{ paddingTop: "24px" }}
      >Card B</div>
    </div>
  )
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [
            { line: 4, col: 7, property: 'padding-top' },
            { line: 8, col: 7, property: 'padding-top' },
          ],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('paddingTop')
          expect(result.newContent).not.toContain('style')
          expect(result.newContent).toContain('Card A')
          expect(result.newContent).toContain('Card B')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('removes shorthand parent during batch cleanup', async () => {
      const source = `export function App() {
  return (
    <div>
      <div style={{ padding: "16px" }}>Card A</div>
      <div style={{ padding: "24px" }}>Card B</div>
    </div>
  )
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [
            { line: 4, col: 7, property: 'padding-top' },
            { line: 5, col: 7, property: 'padding-top' },
          ],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('padding')
          expect(result.newContent).not.toContain('style')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('succeeds with partial matches — some elements have the property, some do not', async () => {
      const source = `export function App() {
  return (
    <div>
      <div style={{ paddingTop: "20px" }}>Card A</div>
      <div className="card">Card B</div>
    </div>
  )
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [
            { line: 4, col: 7, property: 'padding-top' },
            { line: 5, col: 7, property: 'padding-top' },
          ],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('paddingTop')
          expect(result.newContent).toContain('Card A')
          expect(result.newContent).toContain('Card B')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('avoids stale-node crash when first target empties object via shorthand removal', async () => {
      // Bug #7: When removePropertyFromObject removes both longhand + shorthand
      // parent, it can empty the object and trigger styleAttr.remove(). A second
      // target for the same element then operates on detached nodes.
      const source = `export function App() {
  return <div style={{ padding: "16px", paddingTop: "20px" }}>Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [
            // First target: padding-top removes paddingTop + padding → empties object
            { line: 2, col: 10, property: 'padding-top' },
            // Second target: padding-bottom has nothing to remove, but
            // collected entry references the same now-detached styleAttr
            { line: 2, col: 10, property: 'padding-bottom' },
          ],
        })
        // Must succeed — the first target removes everything, second is a no-op
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.newContent).not.toContain('padding')
          expect(result.newContent).not.toContain('style')
        }
        rewriter.dispose()
      } finally {
        cleanupTempFile(filePath)
      }
    })

    it('returns unchanged content when no targets match', async () => {
      const source = `export function App() {
  return <div className="card">Hello</div>
}`
      const filePath = createTempFile(source)
      try {
        const rewriter = new InlineStyleRewriter()
        const result = await rewriter.removeProperties({
          filePath,
          targets: [{ line: 2, col: 10, property: 'padding-top' }],
        })
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
