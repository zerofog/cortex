import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { EditRequest, WriteIntent } from '../../src/core/edit-pipeline.js'

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

  it('writes new content to disk on rewriteClassList success', async () => {
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'OLD',
      newContent: 'NEW CONTENT',
    })

    pipeline.handleEdit(baseEdit({ classOp: { remove: 'body-md' } }))
    await flush()

    expect(writes).toHaveLength(1)
    expect(writes[0]?.content).toBe('NEW CONTENT')
  })

  it('pushes undo entry with captured oldContent on success', async () => {
    readFile.mockResolvedValue('OLD CONTENT SNAPSHOT')
    rewriter.rewriteClassList.mockResolvedValue({
      success: true,
      filePath: '/tmp/proj/App.tsx',
      oldContent: 'IGNORED',
      newContent: 'NEW',
    })

    pipeline.handleEdit(baseEdit({ classOp: { remove: 'body-md' } }))
    await flush()

    expect(undoStack.push).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            filePath: '/tmp/proj/App.tsx',
            previousContent: 'OLD CONTENT SNAPSHOT',
            currentContent: 'NEW',
          }),
        ],
      }),
    )
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
