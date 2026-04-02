import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { WriteIntent } from '../../src/core/edit-pipeline.js'
import type { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import type { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import type { HMRVerifier } from '../../src/core/hmr-verifier.js'
import type { AIWriteResult } from '../../src/core/ai-writer.js'
import type { DeferredWriter, DeferredEdit, BatchedWriteRequest } from '../../src/core/deferred-writer.js'
import type { InlineStyleRewriter } from '../../src/core/rewriter/inline-style.js'
import type { RewriteResult } from '../../src/core/rewriter/types.js'

import { UndoStack } from '../../src/core/session/undo-stack.js'
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

function mockCSSModulesRewriter(result = { success: true as const, filePath: '/project/src/Hero.module.css', oldContent: 'old-css', newContent: 'new-css' }): any {
  return { rewrite: vi.fn().mockResolvedValue(result), dispose: vi.fn() }
}

function mockRuntimeResolver(result: { cssFilePath: string; selector: string } | null = null): any {
  return { resolve: vi.fn().mockResolvedValue(result), dispose: vi.fn() }
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

    // Seed edit — establishes baseline (no previousValue, silently returns)
    pipeline.handleEdit({
      editId: 'edit-0',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '8px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // Actual edit — resolver returns null, should fail
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

    expect(writeFile).toHaveBeenCalledWith({ kind: 'immediate', filePath: '/project/src/App.tsx', content: 'new content' })
    // Immediate writes have HMR suppressed — verifier.trackEdit is NOT called
    expect(verifier.tracked).toHaveLength(0)
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

  // --- CSS Modules routing (Layer 1) ---

  it('routes edit with cssMapping to CSS Modules rewriter', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const cssRewriter = mockCSSModulesRewriter()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
      cssMapping: 'src/Hero.module.css:.hero',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(cssRewriter.rewrite).toHaveBeenCalledWith({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
      elementSelector: 'div',
    })
    expect(writeFile).toHaveBeenCalledWith({ kind: 'immediate', filePath: '/project/src/Hero.module.css', content: 'new-css' })
    const doneStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
    )
    expect(doneStatus).toBeDefined()
  })

  it('rejects cssMapping with path traversal', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()
    const cssRewriter = mockCSSModulesRewriter()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
      cssMapping: '../../etc/passwd.module.css:.target',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('CSS file path outside project root')
  })

  it('rejects cssMapping targeting non-module CSS file', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()
    const cssRewriter = mockCSSModulesRewriter()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
      cssMapping: 'src/Hero.module.scss:.hero',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toContain('Modules editing not yet supported')
  })

  it('rejects SCSS modules with specific error message', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()
    const cssRewriter = mockCSSModulesRewriter()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
      cssMapping: 'src/Hero.module.scss:.hero',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toContain('.scss Modules editing not yet supported')
  })

  // --- CSS value validation ---

  it('rejects CSS value containing url()', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'background',
      value: 'url(evil)',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('Invalid CSS value')
  })

  it('rejects CSS value containing comment injection', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2' },
    })
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()

    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'color',
      value: '/* injection */ red',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toBe('Invalid CSS value')
  })

  // --- Layer 2: Runtime CSS resolver fallback ---

  it('falls back to runtime resolver when no cssMapping but CSS Modules detected', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const cssRewriter = mockCSSModulesRewriter()
    const runtimeResolver = mockRuntimeResolver({ cssFilePath: '/project/src/Hero.module.css', selector: '.hero' })

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
      detector: { hasCSSModules: true, hasTailwind: false },
      runtimeResolver,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(runtimeResolver.resolve).toHaveBeenCalled()
    expect(cssRewriter.rewrite).toHaveBeenCalledWith({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.hero',
      property: 'padding-top',
      newValue: '16px',
      elementSelector: 'div',
    })
    expect(writeFile).toHaveBeenCalledWith({ kind: 'immediate', filePath: '/project/src/Hero.module.css', content: 'new-css' })
  })

  it('fails with CSS module message on CSS Modules-only project when resolution fails', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()
    const cssRewriter = mockCSSModulesRewriter()
    const runtimeResolver = mockRuntimeResolver(null)

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
      detector: { hasCSSModules: true, hasTailwind: false },
      runtimeResolver,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
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
    expect((failedStatus as { reason: string }).reason).toContain('Could not resolve CSS module mapping')
  })

  // --- Undo stack integration ---

  it('pushes to undo stack after successful Tailwind edit', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
    })

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

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(undoStack.canUndo).toBe(true)
    expect(undoStack.undoCount).toBe(1)
  })

  it('pushes to undo stack after successful CSS Modules edit', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()
    const cssRewriter = mockCSSModulesRewriter()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      cssModulesRewriter: cssRewriter,
      undoStack,
    })

    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/Hero.tsx:5:3',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
      cssMapping: 'src/Hero.module.css:.hero',
    })

    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    expect(undoStack.canUndo).toBe(true)
    expect(undoStack.undoCount).toBe(1)
  })

  // --- Undo/Redo handlers ---

  it('handleUndo restores previous content', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
      readFile: vi.fn().mockResolvedValue('new content'),
    })

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

    // Make an edit
    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    writeFile.mockClear()

    // Undo
    await pipeline.handleUndo()

    expect(writeFile).toHaveBeenCalledWith({ kind: 'undo', filePath: '/project/src/App.tsx', content: 'old' })
    const undoStatus = channel.sent.find(m => m.type === 'undo_status' && (m as { status: string }).status === 'done')
    expect(undoStatus).toBeDefined()
  })

  it('handleUndo with empty stack is a no-op', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({})
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn()
    const undoStack = new UndoStack()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
    })

    await pipeline.handleUndo()

    expect(writeFile).not.toHaveBeenCalled()
  })

  it('handleUndo detects stale file and removes entry', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
      readFile: vi.fn().mockResolvedValue('externally modified content'),
    })

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

    // Make an edit
    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()
    writeFile.mockClear()

    // Undo should detect stale file
    await pipeline.handleUndo()

    expect(writeFile).not.toHaveBeenCalled()
    const failedStatus = channel.sent.find(
      m => m.type === 'undo_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toContain('File was modified outside cortex')
    expect(undoStack.canUndo).toBe(false)
  })

  it('handleUndo cancels pending debounced edits', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
      readFile: vi.fn().mockResolvedValue('new content'),
    })

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

    // Make an edit that gets undo-tracked
    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // Start a new debounced edit (not yet fired)
    pipeline.handleEdit({
      editId: 'edit-2',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '24px',
      elementSelector: 'div',
    })

    // Undo before debounce fires — should cancel pending edit
    writeFile.mockClear()
    rewriter.calls.length = 0
    await pipeline.handleUndo()

    // The pending edit-2 should have been cancelled
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // writeFile was called once for the undo, not for the cancelled edit
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledWith({ kind: 'undo', filePath: '/project/src/App.tsx', content: 'old' })
  })

  it('handleRedo re-applies change after undo', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'new content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const undoStack = new UndoStack()
    // Track what the last written content was, so readFile returns the right thing
    let lastWritten = 'new content'
    writeFile.mockImplementation(async (intent: WriteIntent) => { lastWritten = intent.content })
    const readFile = vi.fn().mockImplementation(async () => lastWritten)

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      undoStack,
      readFile,
    })

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

    // Make an edit
    pipeline.handleEdit({
      editId: 'edit-1',
      source: '/project/src/App.tsx:2:10',
      property: 'padding-top',
      value: '16px',
      elementSelector: 'div',
    })
    vi.advanceTimersByTime(400)
    await vi.runAllTimersAsync()

    // Undo (writes previousContent = 'old')
    await pipeline.handleUndo()
    writeFile.mockClear()

    // Redo (should verify file matches previousContent, then write currentContent)
    await pipeline.handleRedo()

    expect(writeFile).toHaveBeenCalledWith({ kind: 'redo', filePath: '/project/src/App.tsx', content: 'new content' })
    const redoStatus = channel.sent.find(m => m.type === 'redo_status' && (m as { status: string }).status === 'done')
    expect(redoStatus).toBeDefined()
  })

  // --- Backward compatibility ---

  it('existing Tailwind-only path works without new optional deps', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({
      'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
    })
    const rewriter = mockRewriter({ success: true, newContent: 'updated content' })
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    // No cssModulesRewriter, no detector, no runtimeResolver, no undoStack
    const pipeline = new EditPipeline({ channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project' })

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

    expect(writeFile).toHaveBeenCalledWith({ kind: 'immediate', filePath: '/project/src/App.tsx', content: 'updated content' })
    const doneStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
    )
    expect(doneStatus).toBeDefined()
  })

  it('sends edit_status for every debounced edit, not just the first failure', async () => {
    const channel = mockChannel()
    const resolver = mockResolver({}) // empty resolver — no classes found
    const rewriter = mockRewriter()
    const verifier = mockVerifier()
    const writeFile = vi.fn().mockResolvedValue(undefined)

    const pipeline = new EditPipeline({
      channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
    })

    // Seed edit — establishes baseline (silently returns)
    pipeline.handleEdit({
      editId: 'e0', source: '/project/src/App.tsx:5:10',
      property: 'padding-top', value: '8px', elementSelector: '.app',
    })
    await vi.advanceTimersByTimeAsync(500)

    // First real edit — should get 'failed' status (resolver can't resolve)
    pipeline.handleEdit({
      editId: 'e1', source: '/project/src/App.tsx:5:10',
      property: 'padding-top', value: '16px', elementSelector: '.app',
    })
    await vi.advanceTimersByTimeAsync(500)
    const first = channel.sent.find(
      (m: any) => m.type === 'edit_status' && m.editId === 'e1',
    )
    expect(first).toBeDefined()
    expect(first!.status).toBe('failed')

    // Seed second property
    pipeline.handleEdit({
      editId: 'e1b', source: '/project/src/App.tsx:5:10',
      property: 'color', value: 'rgb(0,0,0)', elementSelector: '.app',
    })
    await vi.advanceTimersByTimeAsync(500)

    // Second edit — must ALSO get 'failed' status (not silently dropped)
    pipeline.handleEdit({
      editId: 'e2', source: '/project/src/App.tsx:5:10',
      property: 'color', value: 'rgb(255,0,0)', elementSelector: '.app',
    })
    await vi.advanceTimersByTimeAsync(500)
    const second = channel.sent.find(
      (m: any) => m.type === 'edit_status' && m.editId === 'e2',
    )
    expect(second).toBeDefined()
    expect(second!.status).toBe('failed')

    pipeline.dispose()
  })

  // --- AI writer integration ---

  describe('AI writer integration', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    it('calls aiWriter.write() when resolver returns null (Point A)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null for any lookup
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
      })

      // Seed edit — establishes baseline
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

      // Real edit — resolver returns null, triggers AI writer
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(aiWriter.write).toHaveBeenCalledTimes(1)
      expect(aiWriter.write).toHaveBeenCalledWith(expect.objectContaining({
        filePath: '/project/src/App.tsx',
        property: 'padding-top',
        value: '16px',
        failureReason: expect.stringContaining('Cannot resolve'),
      }))

      // Should send writing then done
      const statuses = channel.sent.filter(m => m.type === 'edit_status')
      expect(statuses).toHaveLength(2)
      expect((statuses[0] as { status: string }).status).toBe('writing')
      expect((statuses[1] as { status: string }).status).toBe('done')
    })

    it('calls executeAIWrite when rewriter fails (Point B — deadlock prevention)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: false, reason: 'AST rewrite failed' })
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
      })

      // Seed edit
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

      // Real edit — resolves tokens but rewriter fails
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // AI writer called exactly once (no double-lock)
      expect(aiWriter.write).toHaveBeenCalledTimes(1)
      expect(aiWriter.write).toHaveBeenCalledWith(expect.objectContaining({
        failureReason: 'AST rewrite failed',
      }))

      // Test completes without hanging — deadlock prevention works
      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
    })

    it('calls aiWriter when CSS Modules runtime resolver fails (Point C)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver(null) // resolve returns null
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: false },
        runtimeResolver,
        aiWriter: aiWriter as any,
      })

      // No seed needed — Point C occurs before the pipeline's seed/baseline check
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(aiWriter.write).toHaveBeenCalledTimes(1)
      expect(aiWriter.write).toHaveBeenCalledWith(expect.objectContaining({
        filePath: '/project/src/Hero.tsx',
        property: 'padding-top',
        value: '16px',
        failureReason: expect.stringContaining('Could not resolve CSS module mapping'),
      }))
    })

    it('sends done status + writes file after successful AI write', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // triggers Point A
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter({
        success: true, filePath: '/project/src/App.tsx', oldContent: 'original', newContent: 'ai-modified',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
      })

      // Seed
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
      writeFile.mockClear()

      // Real edit
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(writeFile).toHaveBeenCalledWith({ kind: 'deferred', filePath: '/project/src/App.tsx', content: 'ai-modified' })

      // commitAIWrite tracks with kind: 'deferred' — AI writes need double-rAF deferral
      expect(verifier.tracked).toHaveLength(1)
      expect((verifier.tracked[0] as any).kind).toBe('deferred')

      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
    })

    it('sends failed status when AI write fails', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // triggers Point A
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter({
        success: false, filePath: '/project/src/App.tsx', reason: 'Parse check failed',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
      })

      // Seed
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

      // Real edit — AI writer will fail
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
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('Parse check failed')
    })

    it('pushes to undo stack after successful AI write', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // triggers Point A
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const aiWriter = mockAIWriter({
        success: true, filePath: '/project/src/App.tsx', oldContent: 'before-ai', newContent: 'after-ai',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack,
        aiWriter: aiWriter as any,
      })

      // Seed
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Real edit
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(undoStack.canUndo).toBe(true)
      expect(undoStack.undoCount).toBe(1)

      // Verify undo restores the AI's old content
      const entry = undoStack.peekUndo()
      expect(entry).toBeDefined()
      expect(entry!.previousContent).toBe('before-ai')
      expect(entry!.currentContent).toBe('after-ai')
    })

    it('does NOT call aiWriter when deterministic Tailwind succeeds', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: true, newContent: 'new content' })
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
      })

      // Seed
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Real edit — deterministic Tailwind succeeds
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // AI writer should NEVER be called
      expect(aiWriter.write).not.toHaveBeenCalled()

      // Deterministic path should still succeed
      expect(writeFile).toHaveBeenCalled()
      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
    })
  })

  // --- classifyEdit routing ---

  describe('classifyEdit routing', () => {
    function mockAIWriterForClassify(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    function mockDeferredWriterForClassify(): DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean } {
      const enqueued: DeferredEdit[] = []
      return {
        enqueued,
        disposed: false,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        dispose() { this.disposed = true },
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean }
    }

    it('routes to deferred when strategy is deferred (CSS Modules only, no Tailwind)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriterForClassify()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: true, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Should route to deferredWriter (deferred strategy — CSS Modules only project)
      expect(deferredWriter.enqueued).toHaveLength(1)
      const writingStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'writing',
      )
      expect(writingStatus).toBeDefined()
    })

    it('sends unsupported when strategy is unsupported (no AI, no Tailwind, no CSS Modules)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        // No deferredWriter, no aiWriter
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason?: string }).reason).toContain('No supported editing strategy')
    })

    it('falls through from immediate to deferred when Tailwind resolution fails', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // resolver exists but returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriterForClassify()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: true },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Strategy is 'immediate' (hasTailwind + resolverAvailable) but resolver.findClass
      // returns null, so it falls through to deferredWriter
      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        filePath: '/project/src/App.tsx',
        property: 'padding-top',
        value: '8px',
        failureReason: expect.stringContaining('Cannot resolve'),
      })
    })

    it('CSS Modules annotation path bypasses classifyEdit entirely', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()

      // Even with detector saying no CSS Modules (unlikely but tests bypass),
      // annotation path should still work
      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: false, hasTailwind: false },
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
      expect((doneStatus as { strategy?: string }).strategy).toBe('immediate')
    })
  })

  // --- DeferredWriter integration ---

  describe('DeferredWriter integration', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    function mockDeferredWriter(): DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean } {
      const enqueued: DeferredEdit[] = []
      return {
        enqueued,
        disposed: false,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        dispose() { this.disposed = true },
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean }
    }

    it('routes to deferredWriter.enqueue when resolver returns null (Tailwind Point C)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        deferredWriter: deferredWriter as any,
      })

      // Seed edit — with deferredWriter, seed should still flow through
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Should have enqueued the seed edit (resolver returns null, deferredWriter catches it)
      expect(deferredWriter.enqueued.length).toBeGreaterThanOrEqual(1)
      const firstEnqueue = deferredWriter.enqueued[0]!
      expect(firstEnqueue).toMatchObject({
        filePath: '/project/src/App.tsx',
        property: 'padding-top',
        value: '8px',
        failureReason: expect.stringContaining('Cannot resolve'),
      })

      // Channel should have received a 'writing' status
      const writingStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'writing',
      )
      expect(writingStatus).toBeDefined()
    })

    it('routes to deferredWriter.enqueue when rewriter fails (Point B)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: false, reason: 'Template literal' })
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        deferredWriter: deferredWriter as any,
      })

      // Seed
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()
      deferredWriter.enqueued.length = 0

      // Real edit — tokens resolve but rewriter fails
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        filePath: '/project/src/App.tsx',
        property: 'padding-top',
        value: '16px',
        failureReason: 'Template literal',
      })
    })

    it('routes to deferredWriter.enqueue when CSS Modules runtime fails (Point A)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver(null)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: false },
        runtimeResolver,
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        filePath: '/project/src/Hero.tsx',
        property: 'padding-top',
        value: '16px',
        failureReason: expect.stringContaining('Could not resolve CSS module mapping'),
      })

      // Channel should have received 'writing' status
      const writingStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'writing',
      )
      expect(writingStatus).toBeDefined()
    })

    it('seed edit proceeds when deferredWriter is injected', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null, will route to deferred
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        deferredWriter: deferredWriter as any,
      })

      // First edit (no previousValue) — should NOT be skipped when deferredWriter is present
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Should have enqueued (resolver returns null, so it routes to deferred)
      expect(deferredWriter.enqueued).toHaveLength(1)
    })

    it('strategy: immediate included in deterministic Tailwind done message', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: true, newContent: 'new content' })
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
      })

      // Seed
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

      // Real edit — deterministic success
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
      expect((doneStatus as { strategy?: string }).strategy).toBe('immediate')
    })

    it('strategy: immediate included in CSS Modules done message', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
      expect((doneStatus as { strategy?: string }).strategy).toBe('immediate')
    })

    it('falls back to aiWriter when deferredWriter not injected (backward compat)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        // NO deferredWriter
      })

      // Seed
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

      // Real edit
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // aiWriter should be called (not deferredWriter)
      expect(aiWriter.write).toHaveBeenCalledTimes(1)
    })

    it('calls deferredWriter.dispose() on pipeline dispose', () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn()
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        deferredWriter: deferredWriter as any,
      })

      pipeline.dispose()

      expect(deferredWriter.disposed).toBe(true)
    })

    it('deferredWriter takes priority over aiWriter when both injected', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        deferredWriter: deferredWriter as any,
      })

      // Seed — flows through because deferredWriter is present
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // deferredWriter used, aiWriter NOT called
      expect(deferredWriter.enqueued.length).toBeGreaterThanOrEqual(1)
      expect(aiWriter.write).not.toHaveBeenCalled()
    })
  })

  // --- executeDeferredBatch ---

  describe('executeDeferredBatch', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    it('happy path: reads file, calls AI, pushes undo, writes file, sends done', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const aiWriter = mockAIWriter()
      const readFile = vi.fn().mockResolvedValue('old content')

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack,
        readFile,
        aiWriter: aiWriter as any,
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1', 'e2'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(true)
      expect(readFile).toHaveBeenCalledWith('/project/src/App.tsx')
      expect(aiWriter.write).toHaveBeenCalledTimes(1)
      expect(aiWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/project/src/App.tsx',
          line: 14,
          col: 7,
          changes: [{ property: 'padding-top', value: '16px' }],
        }),
        expect.objectContaining({ fileContent: 'old content', signal: ac.signal }),
      )
      expect(undoStack.canUndo).toBe(true)
      expect(writeFile).toHaveBeenCalledWith({ kind: 'deferred', filePath: '/project/src/App.tsx', content: 'new' })
      // done status for all editIds
      const doneStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'done',
      )
      expect(doneStatuses).toHaveLength(2)
    })

    it('user-initiated abort (undo/redo) sends cancelled status', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        readFile: vi.fn(),
      })

      const ac = new AbortController()
      ac.abort() // generic abort (no reason) — simulates undo/redo cancelForFile

      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('aborted')
      expect(aiWriter.write).not.toHaveBeenCalled()
      // User-initiated cancel sends explicit 'cancelled' status (not 'failed')
      const cancelledStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'cancelled',
      )
      expect(cancelledStatuses).toHaveLength(1)
    })

    it('coalescing supersede abort is silent — no status sent', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        readFile: vi.fn(),
      })

      const ac = new AbortController()
      ac.abort('superseded') // coalescing abort — should be silent

      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('aborted')
      // Coalescing supersede: NO status sent — browser TTL handles cleanup
      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status')
      expect(statusMsgs).toHaveLength(0)
    })

    it('AI failure sends failed status for all editIds', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter({
        success: false, filePath: '/project/src/App.tsx', reason: 'AI parse error',
      })
      const readFile = vi.fn().mockResolvedValue('old content')

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        readFile,
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1', 'e2', 'e3'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('AI parse error')
      const failedStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'failed',
      )
      expect(failedStatuses).toHaveLength(3)
      for (const s of failedStatuses) {
        expect((s as any).reason).toBe('AI parse error')
      }
    })

    it('returns failure when AI writer is not configured', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        // NO aiWriter
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(false)
      expect(result.reason).toContain('AI writer is not configured')
    })

    it('returns failure when readFile is not configured', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const aiWriter = mockAIWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        aiWriter: aiWriter as any,
        // NO readFile
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      expect(result.success).toBe(false)
      expect(result.reason).toContain('Failed to read file')
    })
  })

  // --- Undo/Redo cancels deferred writes ---

  describe('undo/redo cancels deferred writes', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    function mockDeferredWriterWithCancel(): DeferredWriter & { enqueued: DeferredEdit[]; cancelledFiles: string[] } {
      const enqueued: DeferredEdit[] = []
      const cancelledFiles: string[] = []
      return {
        enqueued,
        cancelledFiles,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        cancelForFile(filePath: string) { cancelledFiles.push(filePath) },
        dispose() {},
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; cancelledFiles: string[] }
    }

    it('_doUndo cancels deferred writes for the target file', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: true, newContent: 'new content' })
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const deferredWriter = mockDeferredWriterWithCancel()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack,
        readFile: vi.fn().mockResolvedValue('new content'),
        deferredWriter: deferredWriter as any,
      })

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

      // Make an edit that gets undo-tracked
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Undo — should cancel deferred writes for App.tsx
      await pipeline.handleUndo()

      expect(deferredWriter.cancelledFiles).toContain('/project/src/App.tsx')
    })

    it('_doRedo cancels deferred writes for the target file', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: true, newContent: 'new content' })
      const verifier = mockVerifier()
      let lastWritten = 'new content'
      const writeFile = vi.fn().mockImplementation(async (intent: WriteIntent) => { lastWritten = intent.content })
      const readFile = vi.fn().mockImplementation(async () => lastWritten)
      const undoStack = new UndoStack()
      const deferredWriter = mockDeferredWriterWithCancel()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack,
        readFile,
        deferredWriter: deferredWriter as any,
      })

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

      // Make an edit that gets undo-tracked
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Undo first
      await pipeline.handleUndo()
      deferredWriter.cancelledFiles.length = 0 // reset to only observe redo

      // Redo — should cancel deferred writes for App.tsx
      await pipeline.handleRedo()

      expect(deferredWriter.cancelledFiles).toContain('/project/src/App.tsx')
    })
  })

  // --- Debounce bypass for pure AI projects ---

  describe('debounce bypass', () => {
    function mockDeferredWriter(): DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean } {
      const enqueued: DeferredEdit[] = []
      return {
        enqueued,
        disposed: false,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        dispose() { this.disposed = true },
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean }
    }

    it('bypasses debounce for pure AI projects', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Should be enqueued IMMEDIATELY — no timer advancement needed
      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        editId: 'edit-1',
        filePath: '/project/src/App.tsx',
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })

      // edit_status: writing should have been sent before enqueue
      const writingStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'writing',
      )
      expect(writingStatus).toBeDefined()
      expect((writingStatus as { editId: string }).editId).toBe('edit-1')
    })

    it('does not bypass debounce for Tailwind projects', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({ 'padding-top': { '8px': 'pt-2', '16px': 'pt-4' } })
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: true },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Should NOT be immediately enqueued — still goes through debounce
      expect(deferredWriter.enqueued).toHaveLength(0)

      // After debounce fires, routing happens through executeEdit
      await vi.advanceTimersByTimeAsync(400)
      // With deferredWriter + no seed, the Tailwind resolver returns a token
      // so it goes through the Tailwind rewrite path (not deferred)
    })

    it('does not bypass debounce for CSS Modules annotated edits', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
      })

      // Should NOT be immediately enqueued — cssMapping forces debounce path
      expect(deferredWriter.enqueued).toHaveLength(0)
    })

    it('does not bypass debounce when no deferredWriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        // No deferredWriter
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // No immediate effect — goes through debounce
      expect(channel.sent).toHaveLength(0)
    })

    it('sends failed status when bypass path gets invalid source format', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-bad',
        source: 'bad-source',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Should not enqueue
      expect(deferredWriter.enqueued).toHaveLength(0)

      // Should send failed status
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('Invalid source format')
    })

    it('sends failed status when bypass path gets path outside project root', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-bad',
        source: '/etc/passwd:1:1',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      expect(deferredWriter.enqueued).toHaveLength(0)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('outside project root')
    })
  })

  // --- Fix 1: cancelForFile sends status for cancelled editIds ---

  describe('undo/redo sends status for cancelled deferred editIds', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    it('undo sends cancelled status for cancelled deferred editIds', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const readFile = vi.fn().mockResolvedValue('new-content')
      const aiWriter = mockAIWriter()

      // Real DeferredWriter so cancelForFile returns real editIds
      const { DeferredWriter } = await import('../../src/core/deferred-writer.js')
      const deferredWriter = new DeferredWriter({
        coalescingMs: 5000, // long window so it stays pending
        writeFn: vi.fn().mockResolvedValue({ success: true }),
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack, readFile,
        aiWriter: aiWriter as any,
        deferredWriter,
        detector: { hasCSSModules: false, hasTailwind: false },
      })

      // Push an undo entry manually so we have something to undo
      undoStack.push({ filePath: '/project/src/App.tsx', previousContent: 'old-content', currentContent: 'new-content' })

      // Enqueue a deferred edit that's still pending (5s coalescing)
      deferredWriter.enqueue({
        editId: 'deferred-1',
        filePath: '/project/src/App.tsx',
        line: 2, col: 10,
        property: 'padding-top',
        value: '16px',
        failureReason: 'no class',
      })

      // Undo — should cancel deferred and send 'cancelled' status for deferred-1
      await pipeline.handleUndo()

      const cancelledStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'cancelled' && (m as any).editId === 'deferred-1',
      )
      expect(cancelledStatuses).toHaveLength(1)
      expect((cancelledStatuses[0] as any).reason).toContain('Cancelled by undo')

      deferredWriter.dispose()
    })

    it('redo sends cancelled status for cancelled deferred editIds', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      let lastWritten = 'new-content'
      const writeFile = vi.fn().mockImplementation(async (intent: WriteIntent) => { lastWritten = intent.content })
      const readFile = vi.fn().mockImplementation(async () => lastWritten)
      const undoStack = new UndoStack()
      const aiWriter = mockAIWriter()

      const { DeferredWriter } = await import('../../src/core/deferred-writer.js')
      const deferredWriter = new DeferredWriter({
        coalescingMs: 5000,
        writeFn: vi.fn().mockResolvedValue({ success: true }),
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack, readFile,
        aiWriter: aiWriter as any,
        deferredWriter,
        detector: { hasCSSModules: false, hasTailwind: false },
      })

      // Push an undo entry and undo it so we can redo
      undoStack.push({ filePath: '/project/src/App.tsx', previousContent: 'old-content', currentContent: 'new-content' })
      await pipeline.handleUndo()
      channel.sent.length = 0 // reset

      // Enqueue a deferred edit that's still pending
      deferredWriter.enqueue({
        editId: 'deferred-2',
        filePath: '/project/src/App.tsx',
        line: 2, col: 10,
        property: 'padding-top',
        value: '24px',
        failureReason: 'no class',
      })

      // Redo — should cancel deferred and send 'cancelled' status for deferred-2
      await pipeline.handleRedo()

      const cancelledStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'cancelled' && (m as any).editId === 'deferred-2',
      )
      expect(cancelledStatuses).toHaveLength(1)
      expect((cancelledStatuses[0] as any).reason).toContain('Cancelled by redo')

      deferredWriter.dispose()
    })
  })

  // --- Fix 2: HMR verifier tracks last editId for coalesced batches ---

  describe('executeDeferredBatch tracks correct editId for HMR', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    it('tracks the last editId (not the first) for coalesced batches', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const aiWriter = mockAIWriter()
      const readFile = vi.fn().mockResolvedValue('old content')

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack, readFile,
        aiWriter: aiWriter as any,
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [
          { property: 'padding-top', value: '16px' },
          { property: 'margin-left', value: '8px' },
        ],
        editIds: ['e-first', 'e-middle', 'e-last'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      await pipeline.executeDeferredBatch(batch)

      expect(verifier.tracked).toHaveLength(1)
      // Must be the LAST editId, matching the last change
      expect((verifier.tracked[0] as any).editId).toBe('e-last')
      expect((verifier.tracked[0] as any).property).toBe('margin-left')
      expect((verifier.tracked[0] as any).expectedValue).toBe('8px')
      expect((verifier.tracked[0] as any).kind).toBe('deferred')
    })
  })

  // --- Fix 3: Side effects after writeFile in executeDeferredBatch ---

  describe('executeDeferredBatch side-effect ordering', () => {
    function mockAIWriter(result: AIWriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): { write: ReturnType<typeof vi.fn> } {
      return { write: vi.fn().mockResolvedValue(result) }
    }

    it('does not push undo or track HMR when writeFile rejects', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockRejectedValue(new Error('disk full'))
      const undoStack = new UndoStack()
      const aiWriter = mockAIWriter()
      const readFile = vi.fn().mockResolvedValue('old content')

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        undoStack, readFile,
        aiWriter: aiWriter as any,
      })

      const ac = new AbortController()
      const batch: BatchedWriteRequest = {
        filePath: '/project/src/App.tsx',
        line: 14,
        col: 7,
        changes: [{ property: 'padding-top', value: '16px' }],
        editIds: ['e1', 'e2'],
        failureReason: 'no class',
        signal: ac.signal,
      }

      const result = await pipeline.executeDeferredBatch(batch)

      // Write failed
      expect(result.success).toBe(false)

      // Undo stack must NOT have a phantom entry
      expect(undoStack.canUndo).toBe(false)

      // Verifier must NOT be tracking a non-existent file change
      expect(verifier.tracked).toHaveLength(0)

      // All editIds get failed status
      const failedStatuses = channel.sent.filter(
        m => m.type === 'edit_status' && (m as any).status === 'failed',
      )
      expect(failedStatuses).toHaveLength(2)
      for (const s of failedStatuses) {
        expect((s as any).reason).toContain('disk full')
      }
    })
  })

  // --- InlineStyleRewriter integration (Layer 3.5) ---

  describe('InlineStyleRewriter integration', () => {
    function mockInlineStyleRewriter(result: RewriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } {
      return {
        rewrite: vi.fn().mockResolvedValue(result),
        dispose: vi.fn(),
      } as unknown as InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
    }

    function mockDeferredWriterForInline(): DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean } {
      const enqueued: DeferredEdit[] = []
      return {
        enqueued,
        disposed: false,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        dispose() { this.disposed = true },
        cancelForFile() { return [] },
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean }
    }

    it('routes to InlineStyleRewriter when Tailwind rewrite fails on non-Tailwind project', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null — no Tailwind tokens
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        inlineStyleRewriter: inlineRewriter as any,
      })

      // First edit — no seed skip when inlineStyleRewriter is present
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.rewrite).toHaveBeenCalledWith({
        filePath: '/project/src/App.tsx',
        line: 2,
        col: 10,
        property: 'padding-top',
        value: '16px',
      })
      expect(writeFile).toHaveBeenCalledWith({ kind: 'jsx-immediate', filePath: '/project/src/App.tsx', content: 'new' })

      // InlineStyleRewriter tracks with kind: 'jsx-immediate'
      expect(verifier.tracked).toHaveLength(1)
      expect((verifier.tracked[0] as any).kind).toBe('jsx-immediate')

      const doneStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
      )
      expect(doneStatus).toBeDefined()
      expect((doneStatus as { strategy?: string }).strategy).toBe('immediate')
    })

    it('does NOT route to InlineStyleRewriter on Tailwind projects', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null — would normally trigger fallback
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()
      const deferredWriter = mockDeferredWriterForInline()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: true },
        inlineStyleRewriter: inlineRewriter as any,
        deferredWriter: deferredWriter as any,
      })

      // Seed edit — with deferredWriter present, proceeds through
      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should NOT be called — Tailwind projects don't use inline styles
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()
      // Should fall through to deferredWriter instead
      expect(deferredWriter.enqueued.length).toBeGreaterThanOrEqual(1)
    })

    it('falls through to AI when InlineStyleRewriter bails', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter({
        success: false, filePath: '/project/src/App.tsx', reason: 'style is not an object literal',
      })
      const deferredWriter = mockDeferredWriterForInline()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        inlineStyleRewriter: inlineRewriter as any,
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // Should fall through to deferredWriter
      expect(deferredWriter.enqueued).toHaveLength(1)
    })

    it('uses jsx-immediate WriteIntent kind', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(writeFile).toHaveBeenCalledTimes(1)
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jsx-immediate' }))
    })

    it('pushes to undo stack on success', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const undoStack = new UndoStack()
      const inlineRewriter = mockInlineStyleRewriter({
        success: true, filePath: '/project/src/App.tsx', oldContent: 'before-inline', newContent: 'after-inline',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        undoStack,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(undoStack.canUndo).toBe(true)
      expect(undoStack.undoCount).toBe(1)
      const entry = undoStack.peekUndo()
      expect(entry).toBeDefined()
      expect(entry!.previousContent).toBe('before-inline')
      expect(entry!.currentContent).toBe('after-inline')
    })

    it('bypass debounce disabled when InlineStyleRewriter available', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()
      const deferredWriter = mockDeferredWriterForInline()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        inlineStyleRewriter: inlineRewriter as any,
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Should NOT be immediately enqueued — debounce bypass is disabled
      expect(deferredWriter.enqueued).toHaveLength(0)

      // Should go through debounce timer instead
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should have been called (via debounce, not bypass)
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
    })

    it('allows first edit through (no seed skip) when InlineStyleRewriter available', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        // No detector — no deferredWriter — no previousValue
        // Previously this would skip silently (seed skip)
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Rewrite should be attempted — not silently skipped
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
    })

    it('tries InlineStyleRewriter at Point A (CSS Modules-only, resolver failed, non-Tailwind)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver(null) // resolver fails
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: false },
        runtimeResolver,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should be tried as fallback
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jsx-immediate' }))
    })

    it('calls dispose on InlineStyleRewriter when pipeline disposes', () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.dispose()

      expect(inlineRewriter.dispose).toHaveBeenCalledTimes(1)
    })

    it('sends failed status when inline style write fails', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockRejectedValue(new Error('disk full'))
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('disk full')
    })
  })

  // --- Instance scope routing (ZF0-1017) ---

  describe('scope routing', () => {
    function mockInlineStyleRewriter(result: RewriteResult = {
      success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new',
    }): InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> } {
      return {
        rewrite: vi.fn().mockResolvedValue(result),
        removeProperty: vi.fn().mockResolvedValue({ success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new-cleaned' }),
        dispose: vi.fn(),
      } as unknown as InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> }
    }

    function mockDeferredWriterForScope(): DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean } {
      const enqueued: DeferredEdit[] = []
      return {
        enqueued,
        disposed: false,
        enqueue(edit: DeferredEdit) { enqueued.push(edit) },
        dispose() { this.disposed = true },
        cancelForFile() { return [] },
      } as unknown as DeferredWriter & { enqueued: DeferredEdit[]; disposed: boolean }
    }

    it('scope=instance + cssMapping routes to InlineStyleRewriter, NOT CSSModulesRewriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should be called with the JSX file coords
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.rewrite).toHaveBeenCalledWith({
        filePath: '/project/src/Hero.tsx',
        line: 5,
        col: 3,
        property: 'padding-top',
        value: '16px',
      })
      // CSSModulesRewriter should NOT be called
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // Should write the JSX file, not the CSS file
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jsx-immediate' }))
    })

    it('scope=all + cssMapping routes to CSSModulesRewriter (existing behavior)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'all',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(cssRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()
    })

    it('scope=undefined + cssMapping routes to CSSModulesRewriter (backward compat)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        // no scope field
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      expect(cssRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()
    })

    it('scope=instance without InlineStyleRewriter falls through to deferredWriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const deferredWriter = mockDeferredWriterForScope()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        // NO inlineStyleRewriter
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // CSSModulesRewriter should NOT be called — instance scope
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // Should fall through to deferredWriter
      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        editId: 'edit-1',
        property: 'padding-top',
        value: '16px',
      })
    })

    it('scope=instance + InlineStyleRewriter fails falls through to deferredWriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter({
        success: false, filePath: '/project/src/Hero.tsx', reason: 'style is not an object literal',
      })
      const deferredWriter = mockDeferredWriterForScope()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter was attempted
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // CSSModulesRewriter was NOT called
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // Should fall through to deferredWriter
      expect(deferredWriter.enqueued).toHaveLength(1)
      expect(deferredWriter.enqueued[0]).toMatchObject({
        editId: 'edit-1',
        failureReason: expect.stringContaining('Inline style rewrite failed'),
      })
    })

    it('scope=instance does not bypass debounce', () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const deferredWriter = mockDeferredWriterForScope()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        scope: 'instance',
      })

      // Should NOT be immediately enqueued — instance scope needs debounced path
      expect(deferredWriter.enqueued).toHaveLength(0)
    })

    it('scope=instance + Layer 2 runtime resolver routes to InlineStyleRewriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver({ cssFilePath: '/project/src/Hero.module.css', selector: '.hero' })
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: false },
        runtimeResolver,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should be called instead of CSSModulesRewriter
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
    })

    it('scope=instance + Layer 2 without InlineStyleRewriter falls through to deferredWriter', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver({ cssFilePath: '/project/src/Hero.module.css', selector: '.hero' })
      const deferredWriter = mockDeferredWriterForScope()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: false },
        runtimeResolver,
        // NO inlineStyleRewriter — must NOT fall to commitCSSModulesRewrite
        deferredWriter: deferredWriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // CSSModulesRewriter must NOT be called for instance scope
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // Should fall through to deferredWriter
      expect(deferredWriter.enqueued).toHaveLength(1)
    })

    it('scope=instance without InlineStyleRewriter and without deferredWriter sends failed', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        // NO inlineStyleRewriter, NO deferredWriter, NO aiWriter
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'instance',
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('Instance-scoped editing requires')
    })

    it('scope=all with instanceSources cleans up inline styles on ALL shared elements', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'all',
        instanceSources: ['/project/src/Hero.tsx:5:3', '/project/src/Hero.tsx:12:3'],
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // CSS rewrite should be called
      expect(cssRewriter.rewrite).toHaveBeenCalledTimes(1)
      // removeProperty should be called for BOTH sources (cleanup all shared elements)
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled() // rewrite is for setting, not removing
      // The removeProperty is on the inlineStyleRewriter mock — check via the dispose mock pattern
      // Since our mock doesn't track removeProperty calls directly, verify via writeFile calls:
      // CSS write (immediate) + 2 JSX cleanup writes (jsx-immediate)
      const jsxWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.kind === 'jsx-immediate',
      )
      expect(jsxWrites).toHaveLength(2)
    })

    it('scope=all without instanceSources falls back to edit.source for cleanup', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'all',
        // NO instanceSources — backward compat
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // CSS write + 1 JSX cleanup (just edit.source)
      const jsxWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.kind === 'jsx-immediate',
      )
      expect(jsxWrites).toHaveLength(1)
    })
  })
})
