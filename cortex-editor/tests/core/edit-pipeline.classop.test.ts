import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { EditRequest, WriteIntent } from '../../src/core/edit-pipeline.js'
import { UndoStack } from '../../src/core/session/undo-stack.js'

/**
 * ZF0-1215 Task 11 pipeline tests. Covers the seven invariants the
 * property-keyed path gives us that classOp must preserve:
 *   1. Routes to handleClassOp when classOp is present
 *   2. Writes new content on success
 *   3. Captures oldContent + pushes undo entry on success
 *   4. Surfaces a 'failed' status when rewriter fails (no AI escalation — ZF0-1546)
 *   5. classOp takes precedence when both classOp and property are present
 *   6. Serializes concurrent classOps on the same file via withFileLock
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
  dispose: vi.fn(() => {}),
})

const stubUndoStack = () => ({
  push: vi.fn(),
  popUndo: vi.fn(),
  popRedo: vi.fn(),
})

const stubResolver = () => ({
  findClass: vi.fn(() => null),
})

// Flush pending debounce timers + microtasks so executeEdit actually runs.
async function flush(): Promise<void> {
  await vi.runAllTimersAsync()
  await Promise.resolve()
}

describe('EditPipeline — classOp routing', () => {
  let channel: ReturnType<typeof stubChannel>
  let rewriter: ReturnType<typeof stubRewriter>
  let writes: WriteIntent[]
  let readFile: ReturnType<typeof vi.fn>
  let undoStack: ReturnType<typeof stubUndoStack>
  let pipeline: EditPipeline

  beforeEach(() => {
    vi.useFakeTimers()
    channel = stubChannel()
    rewriter = stubRewriter()
    writes = []
    readFile = vi.fn(async () => 'OLD CONTENT SNAPSHOT')
    undoStack = stubUndoStack()
    pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver() as never,
      rewriter: rewriter as never,
      verifier: { verify: vi.fn(), trackEdit: vi.fn() } as never,
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      readFile,
      undoStack: undoStack as never,
    })
  })

  const baseEdit = (overrides?: Partial<EditRequest>): EditRequest => ({
    editId: 'e1',
    source: '/tmp/proj/App.tsx:10:5',
    property: '',
    value: '',
    elementSelector: 'div',
    ...overrides,
  })

  it('routes edits with classOp to the rewriter.rewriteClassList (skips property resolution)', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW',
    })

    pipeline.handleEdit(baseEdit({ classOp: { kind: 'swap', remove: 'body-md', add: 'heading-1' } }))
    await flush()

    expect(rewriter.rewriteClassList).toHaveBeenCalledWith(
      expect.objectContaining({ remove: 'body-md', add: 'heading-1' }),
    )
    expect(rewriter.rewrite).not.toHaveBeenCalled()
  })

  it('writes new content to disk with suppressHmr:false so the browser re-renders', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW CONTENT',
    })

    pipeline.handleEdit(baseEdit({ classOp: { kind: 'remove', remove: 'text-body-md' } }))
    await flush()

    expect(writes).toHaveLength(1)
    // suppressHmr:false is the load-bearing invariant for ZF0-1215 Bug 3:
    // classOp writes have no browser-side override layer, so HMR must fire
    // for the DOM className to update. A regression here resurfaces the
    // stale-Panel bug where every subsequent click dispatches against the
    // pre-edit className.
    expect(writes[0]).toMatchObject({
      kind: 'immediate',
      suppressHmr: false,
      content: 'NEW CONTENT',
    })
  })

  it('pushes undo entry with requiresHmr=true so undo also re-renders the DOM', async () => {
    readFile.mockResolvedValue('OLD CONTENT SNAPSHOT')
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'IGNORED',
      newContent: 'NEW',
    })

    pipeline.handleEdit(baseEdit({ classOp: { kind: 'remove', remove: 'text-body-md' } }))
    await flush()

    // requiresHmr=true is read by _doUndo/_doRedo to derive suppressHmr=false
    // per change. Without this tag, the kind:'undo'/'redo' default restores
    // the disk but leaves the DOM stale — the undo twin of Bug 3.
    expect(undoStack.push).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            filePath: '/tmp/proj/App.tsx',
            previousContent: 'OLD CONTENT SNAPSHOT',
            currentContent: 'NEW',
            requiresHmr: true,
          }),
        ],
      }),
    )
  })

  it('_doUndo of a classOp write passes suppressHmr:false to writeFile (undo twin of Bug 3)', async () => {
    // Invariant under test: when _doUndo replays an UndoFileChange with
    // requiresHmr:true, it must derive suppressHmr:false for the writeFile
    // call — NOT fall back to kind:'undo's default (suppress). That fallback
    // would leave the DOM stale after undo, resurfacing Bug 3 on every undo.
    //
    // We push a change directly onto a real UndoStack so the test isolates
    // the undo-execution path. Forward-push behavior is covered above.
    const realUndo = new UndoStack()
    realUndo.push({
      changes: [
        {
          filePath: '/tmp/proj/App.tsx',
          previousContent: 'PREVIOUS',
          currentContent: 'CURRENT ON DISK',
          requiresHmr: true,
        },
      ],
    })

    const undoWrites: WriteIntent[] = []
    const undoPipeline = new EditPipeline({
      channel: stubChannel() as never,
      resolver: stubResolver() as never,
      rewriter: stubRewriter() as never,
      verifier: { verify: vi.fn(), trackEdit: vi.fn() } as never,
      writeFile: async (intent) => { undoWrites.push(intent) },
      projectRoot: '/tmp/proj',
      // Disk matches entry.currentContent — not stale, undo proceeds.
      readFile: async () => 'CURRENT ON DISK',
      undoStack: realUndo,
    })

    await undoPipeline.handleUndo()
    await flush()

    const undoWrite = undoWrites.find(w => w.kind === 'undo')
    expect(undoWrite).toBeDefined()
    expect(undoWrite).toMatchObject({
      kind: 'undo',
      suppressHmr: false,
      content: 'PREVIOUS',
    })
  })

  it('_doUndo of a property-edit write keeps suppressHmr:true (no re-render needed)', async () => {
    // Symmetric to the above: property edits paint via the browser-side
    // !important override layer, so undo suppresses HMR to avoid flicker.
    // This test guards the policy from being collapsed into "always allow".
    const realUndo = new UndoStack()
    realUndo.push({
      changes: [
        {
          filePath: '/tmp/proj/App.tsx',
          previousContent: 'PREVIOUS',
          currentContent: 'CURRENT ON DISK',
          requiresHmr: false,
        },
      ],
    })

    const undoWrites: WriteIntent[] = []
    const undoPipeline = new EditPipeline({
      channel: stubChannel() as never,
      resolver: stubResolver() as never,
      rewriter: stubRewriter() as never,
      verifier: { verify: vi.fn(), trackEdit: vi.fn() } as never,
      writeFile: async (intent) => { undoWrites.push(intent) },
      projectRoot: '/tmp/proj',
      readFile: async () => 'CURRENT ON DISK',
      undoStack: realUndo,
    })

    await undoPipeline.handleUndo()
    await flush()

    const undoWrite = undoWrites.find(w => w.kind === 'undo')
    expect(undoWrite).toMatchObject({ kind: 'undo', suppressHmr: true })
  })

  it('sends edit_status failed with reason_code:rewriter_failed when rewriteClassList fails (SF-M-1, no AI escalation — ZF0-1546)', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: false,
      filePath: '/tmp/proj/App.tsx',
      reason: 'template literal not supported',
    })

    pipeline.handleEdit(baseEdit({ classOp: { kind: 'add', add: 'body-md' } }))
    await flush()

    // Exactly one failed status message (not zero, not duplicate).
    const failedCalls = channel.send.mock.calls.filter(
      ([m]) => (m as { status?: string }).status === 'failed',
    )
    expect(failedCalls.length).toBe(1)

    // Structured rejection: rewriter failures are discriminable from
    // other terminal failures (write_failed, invalid_class_token,
    // read_failed, parse_failed). Without this, the browser can't
    // distinguish "the rewriter doesn't support this JSX shape" from
    // "the file couldn't be written" — identical UX for two very
    // different root causes.
    expect(failedCalls[0]?.[0]).toMatchObject({
      type: 'edit_status',
      status: 'failed',
      reason_code: 'rewriter_failed',
      reason: expect.stringContaining('template literal not supported'),
    })
  })

  // ─── SF-H-1: handleClassOp fails fast on readFile error ───────────
  //
  // Before this fix, the catch at handleClassOp swallowed read errors
  // silently and let the write proceed without an undo entry. The user
  // would see edit_status: 'done', attempt Ctrl+Z, and nothing happens —
  // no error, no log, no recovery path. By failing fast with a
  // dedicated reason_code, the browser + analytics can distinguish
  // a read failure from every other failure mode, and the user
  // learns their edit didn't land instead of silently losing undo.
  it('fails with reason_code:read_failed when readFile throws before the rewrite (SF-H-1)', async () => {
    readFile.mockRejectedValue(new Error("ENOENT: no such file, open '/tmp/proj/App.tsx'"))

    pipeline.handleEdit(baseEdit({ classOp: { kind: 'add', add: 'body-md' } }))
    await flush()

    // No side effects: the rewriter never ran, no write hit disk, no undo push.
    expect(rewriter.rewriteClassList).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(undoStack.push).not.toHaveBeenCalled()

    // Structured rejection mechanism: caller can discriminate this path.
    const failedCall = channel.send.mock.calls.find(
      ([m]) => (m as { status?: string }).status === 'failed',
    )?.[0] as { reason?: string; reason_code?: string } | undefined
    expect(failedCall?.reason_code).toBe('read_failed')
    expect(failedCall?.reason).toContain('Cannot read file')

    // Path sanitization: the absolute path must not leak to the browser.
    expect(failedCall?.reason).not.toContain('/tmp/proj/App.tsx')
    expect(failedCall?.reason).toContain('<path>')
  })

  it('classOp takes precedence when both classOp and property are present', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW',
    })

    pipeline.handleEdit(
      baseEdit({ property: 'font-size', value: '14px', classOp: { kind: 'remove', remove: 'body-md' } }),
    )
    await flush()

    expect(rewriter.rewriteClassList).toHaveBeenCalled()
    expect(rewriter.rewrite).not.toHaveBeenCalled()
  })

  it('serializes concurrent classOps on the same file via withFileLock', async () => {
    const deferred: Array<() => void> = []
    rewriter.rewriteClassList.mockImplementation(
      () =>
        new Promise<{ success: true; filePath: string; oldContent: string; newContent: string }>((resolve) => {
          deferred.push(() =>
            resolve({
              success: true,
              filePath: '/tmp/proj/App.tsx',
              oldContent: 'OLD',
              newContent: 'NEW',
            }),
          )
        }),
    )

    pipeline.handleEdit(baseEdit({ editId: 'e1', classOp: { kind: 'add', add: 'body-md' } }))
    pipeline.handleEdit(baseEdit({ editId: 'e2', classOp: { kind: 'add', add: 'heading-1' } }))

    // Drain microtasks until the first handler has called rewriteClassList
    // (entering the lock) and the second is blocked behind the lock.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(deferred.length).toBe(1)

    // Release first holder; drain microtasks long enough for the post-
    // rewriteClassList work (writeFile, undoStack.push, channel.send) AND
    // lock release AND second holder entry to complete.
    deferred[0]?.()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(deferred.length).toBe(2)

    deferred[1]?.()
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })

  // ─── C3: validator enforcement at the pipeline boundary ────────────
  //
  // The class-op-validator is unit-tested exhaustively in
  // tests/core/class-op-validator.test.ts. These tests prove the
  // PIPELINE actually invokes it before any fs or rewriter work —
  // i.e., that a regression that deletes the validation block in
  // handleEdit would be caught here, not go undetected because the
  // validator still exists as a separate module.
  //
  // CLAUDE.md anti-pattern 4: "Security assertions must prove
  // enforcement." Each test asserts:
  //   1. rewriter.rewriteClassList NOT called (validator short-circuits)
  //   2. writeFile NOT called (no fs side effects)
  //   3. channel.send called with structured reason_code — NOT just
  //      "some error happened" (falsifiable rejection mechanism)
  describe('— validator enforcement at pipeline boundary (C3)', () => {
    const expectRejection = (field: 'remove' | 'add'): void => {
      expect(rewriter.rewriteClassList).not.toHaveBeenCalled()
      expect(writes).toHaveLength(0)
      expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'edit_status',
        editId: 'bad',
        status: 'failed',
        reason_code: 'invalid_class_token',
      }))
      // Also verify the field name propagates into reason for debuggability.
      const call = channel.send.mock.calls.find(
        (args) => (args[0] as { reason?: string }).reason?.includes(`classOp.${field}`),
      )
      expect(call).toBeDefined()
    }

    it('rejects url() payload before rewriter or writeFile — the H1 bypass class', async () => {
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'add', add: 'bg-[url(javascript%3Aalert(1))]' },
      }))
      await flush()
      expectRejection('add')
    })

    it('rejects percent-encoded url() bypass at pipeline boundary', async () => {
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'add', add: 'bg-[url(data%3Aimage/svg+xml;base64,PHN2Zz4K)]' },
      }))
      await flush()
      expectRejection('add')
    })

    it('rejects invalid shape (angle brackets) on the remove side', async () => {
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'remove', remove: 'content-[<img>]' },
      }))
      await flush()
      expectRejection('remove')
    })

    it('rejects whitespace tokens', async () => {
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'add', add: 'text-body md' },  // space in middle
      }))
      await flush()
      expectRejection('add')
    })

    it('rejects overlong tokens (>128 chars)', async () => {
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'add', add: 'a'.repeat(200) },
      }))
      await flush()
      expectRejection('add')
    })

    it('validates both fields when both are present; first failure short-circuits', async () => {
      // remove is VALID, add is INVALID. The loop iterates
      // ['remove', 'add'] in that order, so validation fails on the
      // 'add' field and no write should occur. Importantly, the
      // rewriter must not be called even partially.
      pipeline.handleEdit(baseEdit({
        editId: 'bad',
        classOp: { kind: 'swap', remove: 'text-valid', add: 'bg-[url(x)]' },
      }))
      await flush()
      expectRejection('add')
    })
  })
})
