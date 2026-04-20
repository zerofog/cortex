import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { EditRequest, WriteIntent } from '../../src/core/edit-pipeline.js'
import { UndoStack } from '../../src/core/session/undo-stack.js'
import type { TransactionRewriteResult } from '../../src/core/rewriter/jsx-transaction.js'

/**
 * ZF0-1215 C2 integration tests for compound edits.
 *
 * A compound edit carries classOp + inlineSets + inlineRemoves in ONE
 * WebSocket message. The pipeline's handleCompoundEdit routes these
 * through a shared JsxTransaction so the full gesture (e.g., "unlink
 * text bundle" = class removal + preserve fontSize/weight/etc. as
 * inline styles) produces:
 *   - ONE file read
 *   - ONE disk write
 *   - ONE UndoFileChange (so Ctrl+Z restores the whole gesture atomically)
 *
 * These tests mock the rewriter transaction methods to inspect the
 * pipeline's orchestration logic. The rewriters' own transactional
 * correctness is covered by tests/core/rewriter/jsx-transaction.test.ts.
 */

const stubChannel = () => ({
  send: vi.fn(),
  broadcast: vi.fn(),
  onMessage: vi.fn(() => () => {}),
  dispose: vi.fn(async () => {}),
})

const stubRewriter = () => ({
  rewrite: vi.fn(),
  rewriteClassList: vi.fn(),
  rewriteClassListInTransaction:
    vi.fn<(...args: unknown[]) => TransactionRewriteResult>(() => ({ success: true })),
  dispose: vi.fn(() => {}),
})

const stubInlineStyleRewriter = () => ({
  rewrite: vi.fn(),
  removeProperty: vi.fn(),
  removeProperties: vi.fn(),
  setAndRemoveInTransaction:
    vi.fn<(...args: unknown[]) => TransactionRewriteResult>(() => ({ success: true })),
  dispose: vi.fn(() => {}),
})

const stubAIWriter = () => ({
  write: vi.fn(async () => ({ success: true, newContent: 'AI NEW', reason: undefined })),
})

const stubUndoStack = () => ({
  push: vi.fn(),
  popUndo: vi.fn(),
  popRedo: vi.fn(),
})

const stubResolver = () => ({
  findClass: vi.fn(() => null),
})

// Compound tests don't rely on debounce timers — compound edits bypass
// debounce entirely. We also must NOT use fake timers here because
// createJsxTransaction does `import('ts-morph')` on the first call.
// That dynamic import needs real macrotask progress; fake timers
// (or even aggressive microtask draining) can starve it. A small
// real setTimeout gives the import enough time to resolve.
async function flush(): Promise<void> {
  // First pass: let any pending microtasks settle.
  for (let i = 0; i < 5; i++) await Promise.resolve()
  // Then a real macrotask boundary for dynamic imports. 50ms is
  // overkill for an already-cached ts-morph module (after the first
  // test loads it) but cheap and reliable cold.
  await new Promise<void>((r) => setTimeout(r, 50))
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('EditPipeline — compound edit (C2)', () => {
  let channel: ReturnType<typeof stubChannel>
  let rewriter: ReturnType<typeof stubRewriter>
  let inlineStyleRewriter: ReturnType<typeof stubInlineStyleRewriter>
  let writes: WriteIntent[]
  let readFile: ReturnType<typeof vi.fn>
  let undoStack: ReturnType<typeof stubUndoStack>
  let pipeline: EditPipeline

  beforeEach(() => {
    channel = stubChannel()
    rewriter = stubRewriter()
    inlineStyleRewriter = stubInlineStyleRewriter()
    writes = []
    // Real JSX so the mock's ts-morph traversal finds a StringLiteral
    // to mutate (otherwise getCurrentContent() === initialContent and
    // handleCompoundEdit's no-op fast path fires).
    readFile = vi.fn(async () => 'export const A = () => <div className="seed" />\n')
    undoStack = stubUndoStack()
    pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver() as never,
      rewriter: rewriter as never,
      inlineStyleRewriter: inlineStyleRewriter as never,
      verifier: { verify: vi.fn() } as never,
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      readFile,
      undoStack: undoStack as never,
      aiWriter: stubAIWriter() as never,
    })
  })

  const baseEdit = (overrides?: Partial<EditRequest>): EditRequest => ({
    editId: 'ec1',
    source: '/tmp/proj/App.tsx:10:5',
    property: '',
    value: '',
    elementSelector: 'div',
    ...overrides,
  })

  // Mutate the transaction's source file in the mock so the final
  // getCurrentContent() differs from oldContent — otherwise the no-op
  // fast path skips the write + undo push.
  const mutateTxnInClassOp = (): void => {
    rewriter.rewriteClassListInTransaction.mockImplementation((...args: unknown[]) => {
      const txn = args[0] as {
        sourceFile: { getDescendants(): Array<{ getKind(): number }> }
        SK: { StringLiteral: number }
      }
      const first = txn.sourceFile.getDescendants().find(
        (d) => d.getKind() === txn.SK.StringLiteral,
      ) as { setLiteralValue(v: string): void } | undefined
      first?.setLiteralValue('MUTATED-BY-TEST')
      return { success: true }
    })
  }

  it('routes compound edits (classOp + inlineSets) to handleCompoundEdit', async () => {
    mutateTxnInClassOp()
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [
        { property: 'font-size', value: '14px' },
        { property: 'font-weight', value: '600' },
      ],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).toHaveBeenCalledTimes(1)
    expect(inlineStyleRewriter.setAndRemoveInTransaction).toHaveBeenCalledTimes(1)
    // Legacy handleClassOp path must NOT have been invoked.
    expect(rewriter.rewriteClassList).not.toHaveBeenCalled()
  })

  it('routes compound edits (classOp + inlineRemoves) to handleCompoundEdit', async () => {
    mutateTxnInClassOp()
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'text-heading-1' },
      inlineRemoves: [{ property: 'font-size' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).toHaveBeenCalled()
    expect(inlineStyleRewriter.setAndRemoveInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sets: [],
        removes: [{ property: 'font-size' }],
      }),
    )
  })

  it('takes the classOp-only path when no inline ops are present', async () => {
    // Compound path must NOT engage without at least one inlineSet/Remove.
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW',
    })
    pipeline.handleEdit(baseEdit({ classOp: { add: 'text-heading-1' } }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(inlineStyleRewriter.setAndRemoveInTransaction).not.toHaveBeenCalled()
    expect(rewriter.rewriteClassList).toHaveBeenCalled()
  })

  it('writes ONE file with suppressHmr:false and pushes ONE compound UndoFileChange', async () => {
    mutateTxnInClassOp()
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      kind: 'immediate',
      suppressHmr: false,
      filePath: '/tmp/proj/App.tsx',
    })

    // ONE push, not N. The compound is atomic from undo's perspective.
    expect(undoStack.push).toHaveBeenCalledTimes(1)
    const pushCall = undoStack.push.mock.calls[0]?.[0]
    expect(pushCall?.changes).toHaveLength(1)
    expect(pushCall?.changes[0]).toMatchObject({
      filePath: '/tmp/proj/App.tsx',
      previousContent: 'export const A = () => <div className="seed" />\n',
      requiresHmr: true,
    })
  })

  it('fails WITHOUT writing or pushing undo when the classOp step fails', async () => {
    rewriter.rewriteClassListInTransaction.mockReturnValue({
      success: false, reason: 'Template literal in className',
    })
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'text-heading-1' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    // Inline-ops step must NOT run after classOp failure — all-or-nothing.
    expect(inlineStyleRewriter.setAndRemoveInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(undoStack.push).not.toHaveBeenCalled()
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'parse_failed',
      reason: expect.stringContaining('Template literal'),
    }))
  })

  it('fails WITHOUT writing or pushing undo when the inline-ops step fails', async () => {
    mutateTxnInClassOp()
    inlineStyleRewriter.setAndRemoveInTransaction.mockReturnValue({
      success: false, reason: "Property 'font-size' has non-literal value",
    })
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    // classOp mutation was in-memory only — never hit disk. No write.
    expect(writes).toHaveLength(0)
    expect(undoStack.push).not.toHaveBeenCalled()
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'parse_failed',
      reason: expect.stringContaining('non-literal'),
    }))
  })

  it('fails cleanly when readFile rejects', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(undoStack.push).not.toHaveBeenCalled()
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason: expect.stringContaining('Cannot read file'),
    }))
  })

  it('reports success as a no-op when compound produces no content change', async () => {
    // Both rewriter methods succeed with no mutation. content stays equal
    // to oldContent, write + undo skip. Reported status: done.
    // (rewriter.rewriteClassListInTransaction default: returns success
    //  without mutating the sourceFile.)
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'text-body-md' },  // idempotent add
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(undoStack.push).not.toHaveBeenCalled()
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'done',
    }))
  })

  it('pushes one compound undo entry that _doUndo can restore atomically', async () => {
    // Integration via real UndoStack: verify the compound entry's shape
    // is usable by _doUndo. This catches drift between what
    // handleCompoundEdit pushes and what _doUndo expects to read.
    const realUndo = new UndoStack()
    const p2 = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver() as never,
      rewriter: rewriter as never,
      inlineStyleRewriter: inlineStyleRewriter as never,
      verifier: { verify: vi.fn() } as never,
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      readFile,
      undoStack: realUndo,
      aiWriter: stubAIWriter() as never,
    })

    mutateTxnInClassOp()
    p2.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    expect(realUndo.canUndo).toBe(true)
  })

  it('rejects compound requests with empty-string inlineSets value (regression for 11066da)', async () => {
    // commit 11066da removed empty-value inline edits because they
    // triggered the AI writer with no-op intent. Compound protocol must
    // preserve that invariant — validateInlineOps rejects at the shape
    // boundary before any fs work.
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [{ property: 'font-size', value: '' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('empty value'),
    }))
  })

  it('rejects compound requests with empty-string property names', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineRemoves: [{ property: '' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'invalid_class_token',
    }))
  })

  it('rejects compound requests when the classOp token itself is invalid', async () => {
    // Compound routing happens AFTER classOp token validation, so even
    // before handleCompoundEdit runs, the classOp validator catches bad
    // tokens. This test locks that ordering.
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-[url(javascript%3Aalert(1))]' },
      inlineSets: [{ property: 'font-size', value: '14px' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'invalid_class_token',
    }))
  })

  // C-R2-2 (Round 2): validateInlineOps must apply the same url()/ //
  // defenses to compound inline values that class-op-validator already
  // applies to classOp tokens. Without this, the compound protocol
  // re-opens the H1 vector that classOp closed.

  it('rejects compound requests with url() in inlineSets value', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: 'url(javascript:alert(1))' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      editId: 'ec1',
      status: 'failed',
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('url('),
    }))
  })

  it('rejects percent-encoded url() bypass in inlineSets value', async () => {
    // The percent-encoded colon inside url() is what made this a real
    // attack — `javascript%3Aalert(1)` passes a char-level check but is
    // restored to `javascript:alert(1)` by the browser's url() parser.
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: 'url(javascript%3Aalert(1))' }],
    }))
    await flush()

    expect(rewriter.rewriteClassListInTransaction).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('url('),
    }))
  })

  it('rejects data: url() in inlineSets value (no scheme colon required to match)', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: 'url(data:image/svg+xml;base64,PHN2Zz4=)' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('url('),
    }))
  })

  it('rejects protocol-relative // in inlineSets value', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: '//evil.com/track.gif' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('protocol-relative'),
    }))
  })

  it('rejects invalid property-name charset in inlineSets', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: '"]injection', value: '#fff' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('invalid shape'),
    }))
  })

  it('rejects invalid property-name charset in inlineRemoves', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineRemoves: [{ property: 'font-size;color:red' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('invalid shape'),
    }))
  })

  it('accepts legitimate CSS values (regression check — whitelist is not over-broad)', async () => {
    // Sanity: the new checks must not reject real Tailwind/CSS usage.
    // linear-gradient(), calc(), rgba(), kebab-case properties,
    // CSS custom properties (--primary), and vendor-prefixes should
    // all pass through.
    mutateTxnInClassOp()
    pipeline.handleEdit(baseEdit({
      classOp: { remove: 'text-body-md' },
      inlineSets: [
        { property: 'font-size', value: '14px' },
        { property: 'color', value: 'rgba(255, 0, 0, 0.5)' },
        { property: '--primary', value: '#3b82f6' },
        { property: '-webkit-transform', value: 'scale(1.5)' },
        { property: 'background', value: 'linear-gradient(to right, #fff, #000)' },
      ],
    }))
    await flush()

    // Not rejected — compound edit proceeds.
    expect(channel.send).not.toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      reason_code: 'invalid_class_token',
    }))
  })

  // C-R3-1 (Round 3 Critical): validateInlineOps must reject backslash
  // and /* because the server-side REJECT_URL_IN_INLINE regex only
  // matches the literal token `url(`. CSS Unicode escapes (`\75` → 'u')
  // and comment injection (`url/**/(`) both decode to `url(...)` at
  // CSS tokenization — which runs on element.style assignment per
  // CSSOM 6.7. Blocking `\` and `/*` at the validator layer closes
  // the entire escape-decoding class, mirroring H1's whitelist
  // approach for classOp tokens.

  it('rejects backslash in inlineSets value (blocks CSS Unicode escape bypass)', async () => {
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      // `\75` is hex 0x75 = 'u'. At CSS tokenization, `\75 ` decodes
      // to 'u', so the token `\75 rl(` becomes `url(`. The server's
      // REJECT_URL_IN_INLINE regex sees the literal chars `\75 rl(`
      // and does NOT match (starts with `\`, not `u`) — which is why
      // we need a separate backslash-rejection check.
      inlineSets: [{ property: 'background-image', value: '\\75 rl(javascript:alert(1))' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('backslash'),
    }))
  })

  it('rejects 6-digit Unicode escape in inlineSets value', async () => {
    // Full 6-digit form `\000075` also decodes to 'u'. Still contains
    // a backslash so our check catches it.
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: '\\000075 rl(data:image/svg+xml,foo)' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('backslash'),
    }))
  })

  it('rejects CSS comment injection in inlineSets value (url/**/() bypass)', async () => {
    // The CSS tokenizer strips comments BEFORE function-name matching,
    // so `url/**/(evil)` becomes `url(evil)`. Blocking `/*` at the
    // validator layer closes this bypass.
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'bg-image-holder' },
      inlineSets: [{ property: 'background-image', value: 'url/**/(evil.gif)' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('/*'),
    }))
  })

  it('rejects comment-open even on non-url() values (defense-in-depth)', async () => {
    // `/*` is never legitimate inside a CSS property value regardless
    // of property; blocking it universally is defense-in-depth against
    // future CSS-parser behaviors we haven't enumerated.
    pipeline.handleEdit(baseEdit({
      classOp: { add: 'holder' },
      inlineSets: [{ property: 'color', value: 'red /* injected */ !important' }],
    }))
    await flush()

    expect(writes).toHaveLength(0)
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      reason_code: 'invalid_class_token',
      reason: expect.stringContaining('/*'),
    }))
  })
})
