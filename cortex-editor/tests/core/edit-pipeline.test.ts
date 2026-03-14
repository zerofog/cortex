import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import type { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import type { HMRVerifier } from '../../src/core/hmr-verifier.js'
import { mockChannel } from '../helpers/mock-channel.js'

function mockResolver(mapping: Record<string, Record<string, string>> = {}): TailwindResolver {
  return {
    findClass(property: string, value: string) {
      return mapping[property]?.[value] ?? null
    },
    getSnapPoints() { return [] },
  } as unknown as TailwindResolver
}

function mockRewriter(result: { success: boolean; newContent?: string; reason?: string } = { success: true, newContent: 'new' }): TailwindRewriter & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    async rewrite(req: unknown) {
      calls.push(req)
      if (result.success) {
        return { success: true as const, filePath: 'test.tsx', oldContent: 'old', newContent: result.newContent ?? 'new' }
      }
      return { success: false as const, filePath: 'test.tsx', reason: result.reason ?? 'failed' }
    },
    dispose() {},
  } as unknown as TailwindRewriter & { calls: unknown[] }
}

function mockVerifier(): HMRVerifier & { tracked: unknown[] } {
  const tracked: unknown[] = []
  return {
    tracked,
    trackEdit(edit: unknown) { tracked.push(edit) },
    onHMRUpdate() {},
    dispose() {},
  } as unknown as HMRVerifier & { tracked: unknown[] }
}

describe('EditPipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires edit after 400ms debounce', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Establish baseline value (browser reads initial computed style)
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0
    rewriter.calls.length = 0

    // Now the real edit
    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    // Before 400ms — nothing should happen
    vi.advanceTimersByTime(399)
    expect(rewriter.calls).toHaveLength(0)

    // At 400ms — edit should fire
    vi.advanceTimersByTime(1)
    await vi.runAllTimersAsync()

    expect(rewriter.calls).toHaveLength(1)
  })

  it('cancels previous debounce on rapid edits', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4', '24px': 'pt-6' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(200)

    // New edit cancels previous
    pipeline.handleEdit({
      editId: 'edit-2',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '24px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // Only one rewrite call (the second edit)
    expect(rewriter.calls).toHaveLength(1)
  })

  it('routes to AI path when resolver returns null', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({}) // no mappings
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // No rewrite attempted
    expect(rewriter.calls).toHaveLength(0)

    // Should send failed status (AI path not yet implemented)
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
  })

  it('sends writing then done status on successful edit', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Establish baseline
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    const statusMessages = channel.sent.filter(m => m.type === 'edit_status')
    expect(statusMessages).toHaveLength(2)
    expect((statusMessages[0] as { status: string }).status).toBe('writing')
    expect((statusMessages[1] as { status: string }).status).toBe('done')
    expect((statusMessages[1] as { newToken?: string }).newToken).toBe('pt-4')
  })

  it('writes file and tracks HMR on successful edit', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Establish baseline
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    writeFile.mockClear()

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).toHaveBeenCalledWith('/project/src/App.tsx', 'new content')
    expect(verifier.tracked).toHaveLength(1)
  })

  it('routes to AI when rewriter returns success: false', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: false, reason: 'Template literal' })
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Establish baseline
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()

    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
  })

  it('rejects file paths outside project root', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Establish baseline with legitimate path
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/etc/passwd:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/etc/passwd:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    expect(rewriter.calls).toHaveLength(0)

    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('File path outside project root')
  })

  it('rejects sibling directory with matching prefix', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project-evil/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project-evil/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    expect(rewriter.calls).toHaveLength(0)

    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('File path outside project root')
  })

  it('rejects NaN line/col values', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:abc:def',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()

    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toContain('Invalid line/col')
  })

  it('rejects path traversal attempts', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/../etc/passwd:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/../etc/passwd:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()

    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('File path outside project root')
  })

  it('resolves relative source paths against projectRoot', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    // Baseline with relative path (as source-transform emits)
    pipeline.handleEdit({
      editId: 'edit-0',
      source: 'src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    channel.sent.length = 0

    pipeline.handleEdit({
      editId: 'edit-1',
      source: 'src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // Should resolve relative path against projectRoot, not reject it
    expect(writeFile).toHaveBeenCalled()
    expect(rewriter.calls).toHaveLength(1)
    expect(rewriter.calls[0]).toMatchObject({ filePath: '/project/src/App.tsx' })
  })
})
