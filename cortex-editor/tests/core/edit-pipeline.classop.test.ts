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
 *   4. Falls back to AI writer when the rewriter can't handle the shape
 *   5. Surfaces a 'failed' status when rewriter fails AND no AI writer
 *   6. classOp takes precedence when both classOp and property are present
 *   7. Serializes concurrent classOps on the same file via withFileLock
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
  let aiWriter: ReturnType<typeof stubAIWriter>
  let pipeline: EditPipeline

  beforeEach(() => {
    vi.useFakeTimers()
    channel = stubChannel()
    rewriter = stubRewriter()
    writes = []
    readFile = vi.fn(async () => 'OLD CONTENT SNAPSHOT')
    undoStack = stubUndoStack()
    aiWriter = stubAIWriter()
    pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver() as never,
      rewriter: rewriter as never,
      verifier: { verify: vi.fn() } as never,
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      readFile,
      undoStack: undoStack as never,
      aiWriter: aiWriter as never,
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

    pipeline.handleEdit(baseEdit({ classOp: { remove: 'body-md', add: 'heading-1' } }))
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

    pipeline.handleEdit(baseEdit({ classOp: { remove: 'text-body-md' } }))
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

    pipeline.handleEdit(baseEdit({ classOp: { remove: 'text-body-md' } }))
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
      verifier: { verify: vi.fn() } as never,
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
      verifier: { verify: vi.fn() } as never,
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

  it('falls back to AI writer when rewriteClassList fails with an unsupported shape', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: false,
      filePath: '/tmp/proj/App.tsx',
      reason: 'template literal not supported',
    })

    pipeline.handleEdit(baseEdit({ classOp: { add: 'body-md' } }))
    await flush()

    expect(aiWriter.write).toHaveBeenCalled()
    const callArg = aiWriter.write.mock.calls[0]?.[0] as { value: string } | undefined
    expect(callArg?.value).toContain('body-md')
  })

  it('sends edit_status failed when rewriteClassList fails AND no AI writer is wired', async () => {
    const bareChannel = stubChannel()
    const bareRewriter = stubRewriter()
    const barePipeline = new EditPipeline({
      channel: bareChannel as never,
      resolver: stubResolver() as never,
      rewriter: bareRewriter as never,
      verifier: { verify: vi.fn() } as never,
      writeFile: async () => {},
      projectRoot: '/tmp/proj',
    })
    bareRewriter.rewriteClassList.mockResolvedValue({
      success: false,
      filePath: '/tmp/proj/App.tsx',
      reason: 'x',
    })

    barePipeline.handleEdit(baseEdit({ classOp: { remove: 'y' } }))
    await flush()

    const failedCalls = bareChannel.send.mock.calls.filter(
      ([m]) => (m as { status?: string }).status === 'failed',
    )
    expect(failedCalls.length).toBe(1)
  })

  it('classOp takes precedence when both classOp and property are present', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW',
    })

    pipeline.handleEdit(
      baseEdit({ property: 'font-size', value: '14px', classOp: { remove: 'body-md' } }),
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

    pipeline.handleEdit(baseEdit({ editId: 'e1', classOp: { add: 'body-md' } }))
    pipeline.handleEdit(baseEdit({ editId: 'e2', classOp: { add: 'heading-1' } }))

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
})
