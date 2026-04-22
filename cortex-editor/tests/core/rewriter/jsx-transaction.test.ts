import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createJsxTransaction } from '../../../src/core/rewriter/jsx-transaction.js'
import { TailwindRewriter } from '../../../src/core/rewriter/tailwind.js'
import { InlineStyleRewriter } from '../../../src/core/rewriter/inline-style.js'

/**
 * ZF0-1215 C2 scaffold tests.
 *
 * JsxTransaction is the shared in-memory source that lets TailwindRewriter
 * and InlineStyleRewriter both mutate the SAME ts-morph SourceFile during
 * a compound edit (classOp + inlineSets + inlineRemoves). These tests
 * exercise the transaction primitive directly and the transactional
 * methods on both rewriters, without going through the EditPipeline.
 *
 * End-to-end compound-edit pipeline tests land in Commit 9 / edit-pipeline.
 */

describe('createJsxTransaction', () => {
  it('returns a handle exposing the initial content and a live source file', async () => {
    const content = 'export const A = () => <div className="flex" />\n'
    const txn = await createJsxTransaction('/virtual/A.tsx', content)
    expect(txn.filePath).toBe('/virtual/A.tsx')
    expect(txn.initialContent).toBe(content)
    expect(txn.getCurrentContent()).toBe(content)  // no mutations yet
    expect(txn.sourceFile.getFullText()).toBe(content)
    expect(txn.SK).toBeDefined()
  })

  it('does NOT write to disk; the transaction is memory-only', async () => {
    // Transaction creation with a non-existent path must not error.
    // ts-morph Project is configured with useInMemoryFileSystem: false
    // BUT we use createSourceFile(..., { overwrite: true }) which stages
    // the source in-memory only. Disk I/O is the caller's responsibility.
    const txn = await createJsxTransaction(
      '/definitely/does/not/exist/Nope.tsx',
      'export const Z = () => <div />\n',
    )
    expect(txn.getCurrentContent()).toContain('export const Z')
  })

  it('getCurrentContent reflects direct ts-morph mutations', async () => {
    const content = 'export const A = () => <div className="flex" />\n'
    const txn = await createJsxTransaction('/virtual/A.tsx', content)
    // Find the className literal directly and mutate.
    const jsx = txn.sourceFile.getDescendantsOfKind(txn.SK.JsxSelfClosingElement)[0]
    const attr = jsx?.getAttribute('className')?.asKind(txn.SK.JsxAttribute)
    const init = attr?.getInitializer()?.asKind(txn.SK.StringLiteral)
    init?.setLiteralValue('heading-1')
    expect(txn.getCurrentContent()).toContain('className="heading-1"')
    // Initial content is preserved for undo bookkeeping.
    expect(txn.initialContent).toBe(content)
  })
})

describe('TailwindRewriter.rewriteClassListInTransaction', () => {
  let rewriter: TailwindRewriter

  beforeEach(() => { rewriter = new TailwindRewriter() })
  afterEach(() => { rewriter.dispose() })

  it('mutates the transaction source file (no disk write)', async () => {
    const content = 'export const A = () => <div className="body-md" />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1, col: 25, remove: 'body-md', add: 'heading-1',
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).toContain('className="heading-1"')
    expect(txn.initialContent).toBe(content)  // preserved for undo
  })

  it('returns success=true and unchanged content for an idempotent add', async () => {
    const content = 'export const A = () => <div className="body-md" />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1, col: 25, add: 'body-md',
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).toBe(content)
  })

  it('returns success=false with reason when the element is not found', async () => {
    const content = 'export const A = () => <div className="body-md" />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 99, col: 99, add: 'foo',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.reason).toMatch(/No JSX element found/)
    expect(txn.getCurrentContent()).toBe(content)  // no mutation on failure
  })

  it('returns success=false for template literals (routes to AI)', async () => {
    const content = 'export const A = ({x}:{x:string}) => <div className={`body-md ${x}`} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.rewriteClassListInTransaction(txn, {
      line: 1, col: 40, remove: 'body-md',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.reason.toLowerCase()).toMatch(/template literal/)
  })
})

describe('InlineStyleRewriter.setAndRemoveInTransaction', () => {
  let rewriter: InlineStyleRewriter

  beforeEach(() => { rewriter = new InlineStyleRewriter() })
  afterEach(() => { rewriter.dispose() })

  it('adds a style prop when none exists (sets only)', async () => {
    const content = 'export const A = () => <div />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [{ property: 'font-size', value: '14px' }],
      removes: [],
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).toContain('style={{')
    expect(txn.getCurrentContent()).toContain('fontSize: "14px"')
  })

  it('sets multiple properties in one call', async () => {
    const content = 'export const A = () => <div />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [
        { property: 'font-size', value: '14px' },
        { property: 'font-weight', value: '600' },
        { property: 'line-height', value: '1.4' },
      ],
      removes: [],
    })
    expect(res.success).toBe(true)
    const out = txn.getCurrentContent()
    expect(out).toContain('fontSize: "14px"')
    expect(out).toContain('fontWeight: "600"')
    expect(out).toContain('lineHeight: "1.4"')
  })

  it('removes properties from an existing style object', async () => {
    const content = 'export const A = () => <div style={{ fontSize: "14px", color: "red" }} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [],
      removes: [{ property: 'font-size' }],
    })
    expect(res.success).toBe(true)
    const out = txn.getCurrentContent()
    expect(out).not.toContain('fontSize')
    expect(out).toContain('color: "red"')
  })

  it('removes the entire style attribute when the object becomes empty', async () => {
    const content = 'export const A = () => <div style={{ fontSize: "14px" }} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [],
      removes: [{ property: 'font-size' }],
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).not.toContain('style=')
  })

  it('removes-first-then-sets ordering when a property appears in both (set wins)', async () => {
    const content = 'export const A = () => <div style={{ fontSize: "14px" }} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [{ property: 'font-size', value: '24px' }],
      removes: [{ property: 'font-size' }],
    })
    expect(res.success).toBe(true)
    // The set wins — value should be 24px (not removed and then missing).
    expect(txn.getCurrentContent()).toContain('fontSize: "24px"')
  })

  it('is a no-op success when sets and removes are both empty', async () => {
    const content = 'export const A = () => <div style={{ color: "red" }} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25, sets: [], removes: [],
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).toBe(content)
  })

  it('fails without mutation when a set targets a non-literal existing value (all-or-nothing)', async () => {
    // The existing fontSize value is a variable reference. The rewriter
    // must bail BEFORE touching the AST — no partial mutation.
    const content = 'export const A = ({s}:{s:string}) => <div style={{ fontSize: s, color: "red" }} />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 40,
      sets: [{ property: 'font-size', value: '14px' }],
      removes: [{ property: 'color' }],  // this would succeed on its own
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.reason).toMatch(/non-literal/)
    // Critical: the color property was NOT removed despite being a
    // separate removal target. All-or-nothing: either every requested
    // mutation lands, or none do.
    expect(txn.getCurrentContent()).toBe(content)
  })

  it('treats removes as no-op when the element has no style attr', async () => {
    const content = 'export const A = () => <div />\n'
    const txn = await createJsxTransaction('/v/A.tsx', content)
    const res = rewriter.setAndRemoveInTransaction(txn, {
      line: 1, col: 25,
      sets: [],
      removes: [{ property: 'font-size' }],
    })
    expect(res.success).toBe(true)
    expect(txn.getCurrentContent()).toBe(content)
  })

  // ── ZF0-1293: shorthand-clobber guard (transaction path) ──────
  //
  // Shared guard scenarios (family-specific inputs, same `needsShorthandReorder`
  // branch) are covered in inline-style.test.ts. These two tests cover the
  // DISTINCT behavior of `setAndRemoveInTransaction` — the collect-move-verify
  // fix-up pass that runs AFTER the sets loop, which handles cases the per-set
  // guard in `rewrite()` cannot reach.

  describe('shorthand-clobber fix-up pass in setAndRemoveInTransaction (ZF0-1293)', () => {
    it('fix-up pass re-orders a longhand set when a shorthand exists later in the literal', async () => {
      // Basic transaction-path coverage — proves the fix-up pass runs for
      // the same unsafe-order scenario as rewrite(). If this fails while
      // inline-style.test.ts passes, the fix-up pass is broken independently.
      const content = 'export const A = () => <div style={{ paddingBottom: "10px", padding: "30px" }} />\n'
      const txn = await createJsxTransaction('/v/A.tsx', content)
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1, col: 25,
        sets: [{ property: 'padding-bottom', value: '16px' }],
        removes: [],
      })
      expect(res.success).toBe(true)
      const out = txn.getCurrentContent()
      expect(out.indexOf('paddingBottom:')).toBeGreaterThan(out.indexOf('padding:'))
      expect(out).toContain('paddingBottom: "16px"')
      expect(out).toContain('padding: "30px"')
    })

    it('triple-shorthand chain: border + borderWidth + borderTopWidth stabilize to correct cascade order', async () => {
      // Adversarial-review finding: the fix-up pass previously used
      // collect-then-apply-in-collection-order which produced the wrong
      // final order for multi-level chains. After moving borderTopWidth
      // to the end, borderWidth still needed moving past border — but
      // the original algorithm had already committed its decisions and
      // appended borderWidth AFTER borderTopWidth, re-introducing the
      // clobber. The iterate-until-stable algorithm handles this by
      // restarting the scan after each move.
      //
      // Required final order: border → borderWidth → borderTopWidth so
      // React applies them in CSS-cascade-correct specificity order
      // (border sets all 4 sides thick; borderWidth overrides all 4
      // widths to 2px; borderTopWidth overrides top-width only).
      const content = 'export const A = () => <div style={{ borderTopWidth: "1px", borderWidth: "2px", border: "thick solid red" }} />\n'
      const txn = await createJsxTransaction('/v/A.tsx', content)
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1, col: 25,
        // Update the most-specific longhand. Forces the fix-up to reorder
        // the full three-level chain.
        sets: [{ property: 'border-top-width', value: '4px' }],
        removes: [],
      })
      expect(res.success).toBe(true)
      const out = txn.getCurrentContent()
      const idxBorder = out.search(/\bborder:/)
      const idxBorderWidth = out.search(/\bborderWidth:/)
      const idxBorderTopWidth = out.indexOf('borderTopWidth:')
      expect(idxBorder).toBeGreaterThan(-1)
      expect(idxBorderWidth).toBeGreaterThan(-1)
      expect(idxBorderTopWidth).toBeGreaterThan(-1)
      // Final order: border → borderWidth → borderTopWidth
      expect(idxBorderWidth).toBeGreaterThan(idxBorder)
      expect(idxBorderTopWidth).toBeGreaterThan(idxBorderWidth)
      expect(out).toContain('borderTopWidth: "4px"')
      expect(out).toContain('borderWidth: "2px"')  // preserved, now safely ordered
      expect(out).toContain('border: "thick solid red"')
    })

    it('compound sets: fix-up pass handles shorthand-AFTER-longhand added in same call (bidirectional)', async () => {
      // The unique-to-transaction branch: the caller adds BOTH a longhand
      // and its parent shorthand in one `sets` array. Each `set` individually
      // looks safe (no existing longhand before shorthand, or vice versa),
      // but the combined insertion order puts longhand before shorthand.
      // The rewrite() path can't hit this branch — only the fix-up pass
      // catches it.
      const content = 'export const A = () => <div style={{ color: "red" }} />\n'
      const txn = await createJsxTransaction('/v/A.tsx', content)
      const res = rewriter.setAndRemoveInTransaction(txn, {
        line: 1, col: 25,
        sets: [
          { property: 'padding-bottom', value: '16px' },  // would land first
          { property: 'padding', value: '30px' },          // would land after → unsafe
        ],
        removes: [],
      })
      expect(res.success).toBe(true)
      const out = txn.getCurrentContent()
      expect(out.indexOf('paddingBottom:')).toBeGreaterThan(out.search(/\bpadding:/))
      expect(out).toContain('paddingBottom: "16px"')
      expect(out).toContain('padding: "30px"')
    })
  })
})

describe('compound transaction: classOp + inline ops on the same element', () => {
  let tw: TailwindRewriter
  let is: InlineStyleRewriter

  beforeEach(() => { tw = new TailwindRewriter(); is = new InlineStyleRewriter() })
  afterEach(() => { tw.dispose(); is.dispose() })

  it('applies classOp then inline sets then inline removes on one source', async () => {
    // This is the end-to-end compound-edit shape: user unlinks a text
    // bundle. Pipeline does:
    //   1. remove className token 'text-body-md'
    //   2. set inline font-size/font-weight/line-height (preserved look)
    //   3. remove inline color (no longer needed)
    // All mutations apply to ONE source file, retrieved once from
    // txn.getCurrentContent() at the end.
    const content = `export const H1 = () => (
  <h1 className="text-body-md flex" style={{ color: "red" }}>Hello</h1>
)\n`
    const txn = await createJsxTransaction('/v/H1.tsx', content)

    const r1 = tw.rewriteClassListInTransaction(txn, {
      line: 2, col: 3, remove: 'text-body-md',
    })
    expect(r1.success).toBe(true)

    const r2 = is.setAndRemoveInTransaction(txn, {
      line: 2, col: 3,
      sets: [
        { property: 'font-size', value: '14px' },
        { property: 'font-weight', value: '600' },
      ],
      removes: [{ property: 'color' }],
    })
    expect(r2.success).toBe(true)

    const final = txn.getCurrentContent()
    expect(final).toContain('className="flex"')
    expect(final).not.toContain('text-body-md')
    expect(final).toContain('fontSize: "14px"')
    expect(final).toContain('fontWeight: "600"')
    expect(final).not.toContain('color:')
    // initialContent is preserved for the pipeline's UndoFileChange.
    expect(txn.initialContent).toBe(content)
  })
})
