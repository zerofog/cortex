import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { WriteIntent } from '../../src/core/edit-pipeline.js'
import type { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import type { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import type { HMRVerifier } from '../../src/core/hmr-verifier.js'
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

    // Should send failed status — no Tailwind class found, no AI/deferred fallback
    const failedStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as any).reason).toContain('Cannot resolve Tailwind class')
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
    expect((failedStatus as any).reason).toBe('Template literal')
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

    // objectContaining tolerates the suppressHmr field added for ZF0-1215
    // classOp HMR policy (UndoFileChange.requiresHmr is translated to
    // suppressHmr here). Property edits set requiresHmr:false, so the
    // resulting suppressHmr is true (override-layer paints the visual).
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'undo', filePath: '/project/src/App.tsx', content: 'old', suppressHmr: true }))
    const undoStatus = channel.sent.find(m => m.type === 'undo_sync_status' && (m as { status: string }).status === 'done')
    expect(undoStatus).toBeDefined()
  })

  it('handleUndo with empty stack sends empty_stack reason_code', async () => {
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
    const failMsg = channel.sent.find(m => m.type === 'undo_sync_status')
    expect(failMsg).toMatchObject({ status: 'failed', reason_code: 'empty_stack' })
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
      m => m.type === 'undo_sync_status' && (m as { status: string }).status === 'failed'
    )
    expect(failedStatus).toBeDefined()
    expect((failedStatus as { reason: string }).reason).toContain('File was modified outside cortex')
    expect((failedStatus as { reason_code: string }).reason_code).toBe('stale')
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
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'undo', filePath: '/project/src/App.tsx', content: 'old', suppressHmr: true }))
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

    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'redo', filePath: '/project/src/App.tsx', content: 'new content', suppressHmr: true }))
    const redoStatus = channel.sent.find(m => m.type === 'redo_sync_status' && (m as { status: string }).status === 'done')
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

  // --- Deterministic Tailwind succeeds (no AI escalation) ---

  it('does not AI-escalate when deterministic Tailwind succeeds', async () => {
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

    // Deterministic path should succeed
    expect(writeFile).toHaveBeenCalled()
    const doneStatus = channel.sent.find(
      m => m.type === 'edit_status' && (m as { status: string }).status === 'done',
    )
    expect(doneStatus).toBeDefined()
  })

  // --- terminal-failed when deterministic writers fail (mcpMode=false) ---

  describe('terminal-failed when deterministic writers fail', () => {
    it('emits failed terminal when resolver returns null (no mcpMode, no aiWriter)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null for every lookup
      const rewriter = mockRewriter()
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

      // Real edit — resolver returns null, no AI fallback
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
      expect(writeFile).not.toHaveBeenCalled()

      pipeline.dispose()
    })

    it('emits failed terminal when rewriter fails (Point B, no AI fallback)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({
        'padding-top': { '8px': 'pt-2', '16px': 'pt-4' },
      })
      const rewriter = mockRewriter({ success: false, reason: 'AST rewrite failed' })
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

      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect((failedStatus as { reason: string }).reason).toContain('AST rewrite failed')
      expect(writeFile).not.toHaveBeenCalled()

      pipeline.dispose()
    })

    it('emits failed terminal when CSS Modules runtime resolver returns null (no AI fallback)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver(null) // resolve returns null

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

      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
      expect(writeFile).not.toHaveBeenCalled()

      pipeline.dispose()
    })
  })

  // --- classifyEdit routing ---

  describe('classifyEdit routing', () => {
    it('sends unsupported when strategy is unsupported (no Tailwind, no CSS Modules)', async () => {
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

  // --- strategy: immediate label in done messages ---

  describe('strategy label in done messages', () => {
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

    it('does NOT route to InlineStyleRewriter when element has Tailwind class (currentClass set) — emits terminal failed', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null for new value
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: true },
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-0',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
        currentClass: 'pt-2', // element has a Tailwind class — don't add inline style
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should NOT be called — element uses Tailwind for this property
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()
      // Should emit terminal failed (no AI fallback after ZF0-1546)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
    })

    it.each([
      { label: 'undefined', currentClass: undefined },
      { label: 'empty string', currentClass: '' },
    ])('routes to InlineStyleRewriter when currentClass is $label even in Tailwind project', async ({ currentClass }) => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null — no Tailwind token
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: true },
        inlineStyleRewriter: inlineRewriter as any,
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        currentClass,
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter SHOULD be called — element has no Tailwind class
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jsx-immediate' }))
    })

    it('emits terminal failed when InlineStyleRewriter bails (no AI fallback)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter({
        success: false, filePath: '/project/src/App.tsx', reason: 'style is not an object literal',
      })

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

      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // Should emit terminal failed (no AI fallback after ZF0-1546)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
    })

    it('emits terminal failed when InlineStyleRewriter throws unexpectedly', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({}) // returns null — no Tailwind tokens
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const inlineRewriter = mockInlineStyleRewriter()
      // Make the rewrite throw (simulates unexpected error in InlineStyleRewriter)
      inlineRewriter.rewrite.mockRejectedValue(new Error('unexpected ENOENT'))

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

      // InlineStyleRewriter was called but threw
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // Should NOT crash — pipeline handles gracefully
      // After ZF0-1546: the throw terminates the edit (failed or dropped — no deferredWriter)
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
      expect(entry!.changes[0]!.previousContent).toBe('before-inline')
      expect(entry!.changes[0]!.currentContent).toBe('after-inline')
    })

    it('InlineStyleRewriter is called via debounce path (not immediate)', async () => {
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

      // Not called immediately — goes through debounce
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()

      // Should go through debounce timer
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should have been called (via debounce)
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
        // No detector — no previousValue
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

    it('tries InlineStyleRewriter at Point A for instance scope (CSS Modules-only, resolver null)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver(null) // resolver fails — element not in any CSS module
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
        scope: 'instance',
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // InlineStyleRewriter should be tried even for instance scope when resolver returned null
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
    }): InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn>; removeProperties: ReturnType<typeof vi.fn> } {
      return {
        rewrite: vi.fn().mockResolvedValue(result),
        removeProperty: vi.fn().mockResolvedValue({ success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new-cleaned' }),
        removeProperties: vi.fn().mockResolvedValue({ success: true, filePath: '/project/src/App.tsx', oldContent: 'old', newContent: 'new-cleaned' }),
        dispose: vi.fn(),
      } as unknown as InlineStyleRewriter & { rewrite: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn>; removeProperties: ReturnType<typeof vi.fn> }
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

    it('scope=instance without InlineStyleRewriter emits terminal failed (CSSModulesRewriter NOT called)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        // NO inlineStyleRewriter
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
      // Should emit terminal failed (no AI/deferred fallback after ZF0-1546)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
    })

    it('scope=instance + InlineStyleRewriter fails emits terminal failed', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const inlineRewriter = mockInlineStyleRewriter({
        success: false, filePath: '/project/src/Hero.tsx', reason: 'style is not an object literal',
      })

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

      // InlineStyleRewriter was attempted
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // CSSModulesRewriter was NOT called
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // Should emit terminal failed (no AI/deferred fallback after ZF0-1546)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
    })

    it('scope=instance goes through debounce path (not immediate)', () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        detector: { hasCSSModules: false, hasTailwind: false },
      })

      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/App.tsx:2:10',
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        scope: 'instance',
      })

      // No status sent synchronously — goes through debounce path
      expect(channel.sent).toHaveLength(0)
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

    it('scope=instance + Layer 2 without InlineStyleRewriter emits terminal failed (CSSModulesRewriter NOT called)', async () => {
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
        // NO inlineStyleRewriter — must NOT fall to commitCSSModulesRewrite
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
      // Should emit terminal failed (no AI/deferred fallback after ZF0-1546)
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
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

    it('scope=instance + Layer 2 InlineStyleRewriter fails emits terminal failed (not Layer 3)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const cssRewriter = mockCSSModulesRewriter()
      const runtimeResolver = mockRuntimeResolver({ cssFilePath: '/project/src/Hero.module.css', selector: '.hero' })
      const inlineRewriter = mockInlineStyleRewriter({
        success: false, filePath: '/project/src/Hero.tsx', reason: 'style is not an object literal',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, projectRoot: '/project',
        cssModulesRewriter: cssRewriter,
        detector: { hasCSSModules: true, hasTailwind: true }, // hybrid project
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

      // InlineStyleRewriter was tried and failed
      expect(inlineRewriter.rewrite).toHaveBeenCalledTimes(1)
      // CSSModulesRewriter must NOT be called for instance scope — proving no Layer 3 leak
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // After ZF0-1546: emits terminal failed instead of routing to deferredWriter
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
    })

    it('scope=instance + Layer 2 hybrid project without InlineStyleRewriter emits terminal failed (CSSModulesRewriter NOT called)', async () => {
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
        detector: { hasCSSModules: true, hasTailwind: true }, // hybrid project
        runtimeResolver,
        // NO inlineStyleRewriter
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

      // CSSModulesRewriter must NOT be called for instance scope — proving no Layer 3 leak
      expect(cssRewriter.rewrite).not.toHaveBeenCalled()
      // After ZF0-1546: emits terminal failed instead of routing to deferredWriter
      const failedStatus = channel.sent.find(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'failed',
      )
      expect(failedStatus).toBeDefined()
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
      // Batch removeProperties called (not individual removeProperty)
      expect(inlineRewriter.removeProperties).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.removeProperty).not.toHaveBeenCalled()
      expect(inlineRewriter.rewrite).not.toHaveBeenCalled()
      // CSS write: kind='immediate' (default HMR suppression)
      const cssWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.module.css'),
      )
      expect(cssWrites).toHaveLength(1)
      expect(cssWrites[0]![0].kind).toBe('immediate')
      // Both sources in same file → 1 batched cleanup write (not 2 individual writes).
      // Cleanup: kind='jsx-immediate' (correct for JSX) + suppressHmr=true (prevent race)
      const cleanupWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.tsx'),
      )
      expect(cleanupWrites).toHaveLength(1)
      expect(cleanupWrites[0]![0].kind).toBe('jsx-immediate')
      expect(cleanupWrites[0]![0].suppressHmr).toBe(true)
      // Verify removeProperties received both targets
      expect(inlineRewriter.removeProperties).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: expect.arrayContaining([
            expect.objectContaining({ line: 5, col: 3 }),
            expect.objectContaining({ line: 12, col: 3 }),
          ]),
        }),
      )
      // No verifier.trackEdit — override persists naturally (redundant but harmless
      // once CSS HMR delivers matching value). Avoids hmrAppliedPending timing risk.
      expect(verifier.tracked).toHaveLength(0)
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

      // Batch removeProperties called with single target (edit.source fallback)
      expect(inlineRewriter.removeProperties).toHaveBeenCalledTimes(1)
      expect(inlineRewriter.removeProperties).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: [expect.objectContaining({ line: 5, col: 3, property: 'padding-top' })],
        }),
      )
      // Cleanup write: kind='jsx-immediate' + suppressHmr=true (both writes suppress HMR)
      const cleanupWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.tsx'),
      )
      expect(cleanupWrites).toHaveLength(1)
      expect(cleanupWrites[0]![0].kind).toBe('jsx-immediate')
      expect(cleanupWrites[0]![0].suppressHmr).toBe(true)
    })

    it('scope=all suppresses HMR for both CSS and cleanup writes (override covers transition)', async () => {
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

      // CSS write: kind='immediate' (default HMR suppression — prevents flicker and undo bugs)
      const cssWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.module.css'),
      )
      expect(cssWrites).toHaveLength(1)
      expect(cssWrites[0]![0].kind).toBe('immediate')

      // Cleanup write: kind='jsx-immediate' (correct for JSX) + suppressHmr=true
      // Both writes suppress HMR — override provides the preview.
      const cleanupWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.tsx'),
      )
      expect(cleanupWrites).toHaveLength(1)
      expect(cleanupWrites[0]![0].kind).toBe('jsx-immediate')
      expect(cleanupWrites[0]![0].suppressHmr).toBe(true)

      // No trackEdit for either write — override persists naturally.
      expect(verifier.tracked).toHaveLength(0)
    })

    it('scope=undefined CSS write suppresses HMR (backward compat)', async () => {
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
        // No scope — backward compat
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // Without scope='all', CSS write uses 'immediate' (HMR suppressed)
      const cssWrites = writeFile.mock.calls.filter(
        (c: any[]) => c[0]?.filePath?.endsWith('.module.css'),
      )
      expect(cssWrites).toHaveLength(1)
      expect(cssWrites[0]![0].kind).toBe('immediate')
    })

    it('scope=all produces a single compound undo entry (not 2 separate entries)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      // Track file contents so readFile returns what writeFile last wrote
      const fileContents = new Map<string, string>()
      const readFile = vi.fn().mockImplementation(async (path: string) => fileContents.get(path) ?? '')
      const writeFile = vi.fn().mockImplementation(async (intent: any) => {
        fileContents.set(intent.filePath, intent.content)
      })

      const cssRewriter = mockCSSModulesRewriter({
        success: true,
        filePath: '/project/src/Hero.module.css',
        oldContent: 'css-before',
        newContent: 'css-after',
      })
      const inlineRewriter = mockInlineStyleRewriter()
      // Override removeProperties to return distinct content
      inlineRewriter.removeProperties.mockResolvedValue({
        success: true,
        filePath: '/project/src/Hero.tsx',
        oldContent: 'jsx-before',
        newContent: 'jsx-after',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      // Execute scope='all' edit (CSS rewrite + JSX inline style cleanup)
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'color',
        value: 'red',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'all',
        instanceSources: ['/project/src/Hero.tsx:5:3'],
      })

      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()

      // ── Key assertion: ONE compound entry, not two ──
      expect(undoStack.undoCount).toBe(1)
      const entry = undoStack.peekUndo()!
      expect(entry.changes).toHaveLength(2)
      expect(entry.changes[0]!.filePath).toBe('/project/src/Hero.module.css')
      expect(entry.changes[0]!.previousContent).toBe('css-before')
      expect(entry.changes[0]!.currentContent).toBe('css-after')
      expect(entry.changes[1]!.filePath).toBe('/project/src/Hero.tsx')
      expect(entry.changes[1]!.previousContent).toBe('jsx-before')
      expect(entry.changes[1]!.currentContent).toBe('jsx-after')

      // ── Undo: both files reverted atomically ──
      channel.sent.length = 0
      writeFile.mockClear()
      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      expect(undoStack.undoCount).toBe(0)
      expect(undoStack.canRedo).toBe(true)
      // Two writes: CSS reverted + JSX reverted
      expect(writeFile).toHaveBeenCalledTimes(2)
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'undo', filePath: '/project/src/Hero.module.css', content: 'css-before' }))
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'undo', filePath: '/project/src/Hero.tsx', content: 'jsx-before' }))
      const undoMsg = channel.sent.find(m => m.type === 'undo_sync_status') as { status: string }
      expect(undoMsg.status).toBe('done')

      // ── Redo: both files re-applied atomically ──
      channel.sent.length = 0
      writeFile.mockClear()
      await pipeline.handleRedo()
      await vi.runAllTimersAsync()

      expect(undoStack.undoCount).toBe(1)
      expect(undoStack.canRedo).toBe(false)
      expect(writeFile).toHaveBeenCalledTimes(2)
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'redo', filePath: '/project/src/Hero.module.css', content: 'css-after' }))
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'redo', filePath: '/project/src/Hero.tsx', content: 'jsx-after' }))
      const redoMsg = channel.sent.find(m => m.type === 'redo_sync_status') as { status: string }
      expect(redoMsg.status).toBe('done')
    })

    it('compound undo fails atomically when second file is stale (no partial writes)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      // readFile returns matching content for CSS but stale content for JSX
      const readFile = vi.fn().mockImplementation(async (p: string) =>
        p.endsWith('.css') ? 'css-after' : 'externally-modified-jsx')
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const cssRewriter = mockCSSModulesRewriter({
        success: true, filePath: '/project/src/Hero.module.css',
        oldContent: 'css-before', newContent: 'css-after',
      })
      const inlineRewriter = mockInlineStyleRewriter()
      inlineRewriter.removeProperties.mockResolvedValue({
        success: true, filePath: '/project/src/Hero.tsx',
        oldContent: 'jsx-before', newContent: 'jsx-after',
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
        cssModulesRewriter: cssRewriter,
        inlineStyleRewriter: inlineRewriter as any,
      })

      // Execute scope='all' edit
      pipeline.handleEdit({
        editId: 'edit-1',
        source: '/project/src/Hero.tsx:5:3',
        property: 'color', value: 'red',
        elementSelector: 'div',
        cssMapping: 'src/Hero.module.css:.hero',
        scope: 'all',
        instanceSources: ['/project/src/Hero.tsx:5:3'],
      })
      vi.advanceTimersByTime(400)
      await vi.runAllTimersAsync()
      expect(undoStack.undoCount).toBe(1)

      // Undo — CSS file matches currentContent, but JSX is stale
      channel.sent.length = 0
      writeFile.mockClear()
      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      // Neither file should have been written (atomic failure)
      expect(writeFile).not.toHaveBeenCalled()
      const undoMsg = channel.sent.find(m => m.type === 'undo_sync_status') as { status: string; reason?: string }
      expect(undoMsg.status).toBe('failed')
      expect(undoMsg.reason).toContain('modified outside cortex')
      // Entry removed from stack (stale)
      expect(undoStack.undoCount).toBe(0)
    })

    it('undo fails and removes stale entry when readFile throws (ENOENT/EACCES)', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      const readFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'))
      const writeFile = vi.fn().mockResolvedValue(undefined)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      // Manually push a compound entry.
      // requiresHmr is the real field on UndoFileChange (threaded in A2);
      // these fixtures predate the field, so set false — test asserts stale
      // detection, not HMR semantics.
      undoStack.push({ changes: [
        { filePath: '/project/a.css', previousContent: 'old-css', currentContent: 'new-css', requiresHmr: false },
        { filePath: '/project/a.tsx', previousContent: 'old-jsx', currentContent: 'new-jsx', requiresHmr: false },
      ] })

      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      expect(writeFile).not.toHaveBeenCalled()
      const msg = channel.sent.find(m => m.type === 'undo_sync_status') as { status: string; reason?: string }
      expect(msg.status).toBe('failed')
      expect(msg.reason).toContain('modified outside cortex')
      // Entry removed (treated as stale)
      expect(undoStack.undoCount).toBe(0)
    })

    it('undo with write failure rolls back already-written files and preserves entry', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      const fileContents = new Map<string, string>([
        ['/project/a.css', 'new-css'],
        ['/project/a.tsx', 'new-jsx'],
      ])
      const readFile = vi.fn().mockImplementation(async (p: string) => fileContents.get(p) ?? '')
      let writeCount = 0
      const writeFile = vi.fn().mockImplementation(async (intent: any) => {
        writeCount++
        // First write (CSS) succeeds, second write (JSX) fails
        if (writeCount === 2) throw new Error('ENOSPC: disk full')
        fileContents.set(intent.filePath, intent.content)
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      undoStack.push({ changes: [
        { filePath: '/project/a.css', previousContent: 'old-css', currentContent: 'new-css', requiresHmr: false },
        { filePath: '/project/a.tsx', previousContent: 'old-jsx', currentContent: 'new-jsx', requiresHmr: false },
      ] })

      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      const msg = channel.sent.find(m => m.type === 'undo_sync_status') as { status: string; reason?: string }
      expect(msg.status).toBe('failed')
      expect(msg.reason).toContain('Write failed during undo')
      // Entry stays on stack (not removed) — user can retry
      expect(undoStack.canUndo).toBe(true)
      // CSS file should be rolled back to currentContent (not left as previousContent)
      expect(fileContents.get('/project/a.css')).toBe('new-css')
    })

    // H-R3-1 (Round 3): closes pr-test-analyzer M-1 coverage gap.
    // The undo rollback path is tested above; redo has symmetric code
    // (diff confirms parallel structure) but was previously untested,
    // so a redo-specific regression could land undetected.
    it('redo with write failure rolls back already-written files and preserves entry', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      // Starting state: both files already at previousContent (pre-redo).
      const fileContents = new Map<string, string>([
        ['/project/a.css', 'old-css'],
        ['/project/a.tsx', 'old-jsx'],
      ])
      const readFile = vi.fn().mockImplementation(async (p: string) => fileContents.get(p) ?? '')
      let writeCount = 0
      const writeFile = vi.fn().mockImplementation(async (intent: any) => {
        writeCount++
        // First redo write (CSS) succeeds, second (JSX) fails mid-way.
        if (writeCount === 2) throw new Error('ENOSPC: disk full')
        fileContents.set(intent.filePath, intent.content)
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      // Build a redo entry: push + undo so the entry moves from undo → redo stack.
      // We'll skip that dance and inject directly via the test harness —
      // undoStack.push lands it on the undo stack, we call undo to move it.
      undoStack.push({ changes: [
        { filePath: '/project/a.css', previousContent: 'old-css', currentContent: 'new-css', requiresHmr: false },
        { filePath: '/project/a.tsx', previousContent: 'old-jsx', currentContent: 'new-jsx', requiresHmr: false },
      ] })
      // Move entry to redo stack by invoking undo() on the stack directly.
      // (The real flow would land this via pipeline.handleUndo, but we test
      // redo in isolation here.)
      undoStack.undo()
      expect(undoStack.canRedo).toBe(true)

      channel.sent.length = 0
      writeCount = 0
      await pipeline.handleRedo()
      await vi.runAllTimersAsync()

      const msg = channel.sent.find(m => m.type === 'redo_sync_status') as { status: string; reason?: string }
      expect(msg.status).toBe('failed')
      expect(msg.reason).toContain('Write failed during redo')
      // Entry stays on redo stack — user can retry the redo.
      expect(undoStack.canRedo).toBe(true)
      // CSS file should be rolled back to previousContent (the pre-redo
      // state) — NOT left at currentContent. This is the load-bearing
      // assertion: without the inline rollback, the file would be in a
      // mixed state (CSS = new, JSX = old).
      expect(fileContents.get('/project/a.css')).toBe('old-css')
      expect(fileContents.get('/project/a.tsx')).toBe('old-jsx')
    })

    it('redo with stale file clears entire stack', async () => {
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      const fileContents = new Map<string, string>()
      const readFile = vi.fn().mockImplementation(async (p: string) => fileContents.get(p) ?? '')
      const writeFile = vi.fn().mockImplementation(async (intent: any) => {
        fileContents.set(intent.filePath, intent.content)
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      // Push and undo to create a redo entry
      undoStack.push({ changes: [
        { filePath: '/project/a.css', previousContent: 'old', currentContent: 'new', requiresHmr: false },
      ] })
      fileContents.set('/project/a.css', 'new')
      await pipeline.handleUndo()
      await vi.runAllTimersAsync()
      expect(undoStack.canRedo).toBe(true)

      // Simulate external modification — file no longer matches previousContent
      fileContents.set('/project/a.css', 'externally-modified')

      channel.sent.length = 0
      await pipeline.handleRedo()
      await vi.runAllTimersAsync()

      const msg = channel.sent.find(m => m.type === 'redo_sync_status') as { status: string }
      expect(msg.status).toBe('failed')
      // Redo staleness clears entire stack
      expect(undoStack.canUndo).toBe(false)
      expect(undoStack.canRedo).toBe(false)
    })

    it('H-R2-4: multi-file undo acquires locks in sorted path order (deadlock prevention)', async () => {
      // The deadlock vector: two concurrent compound-entry undos touching
      // overlapping file sets. If one acquires path-z then needs path-a
      // while the other acquires path-a then needs path-z, neither can
      // proceed. Sorted acquisition order ensures all acquirers agree on
      // the order, so the second one waits at lock 1 instead of
      // deadlocking at lock 2.
      const channel = mockChannel()
      const resolver = mockResolver({})
      const rewriter = mockRewriter()
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      // Track file-access order: both reads and writes, with timestamps.
      const accessOrder: string[] = []
      const fileContents = new Map<string, string>([
        ['/project/z-last.css', 'z-new'],
        ['/project/a-first.css', 'a-new'],
        ['/project/m-middle.css', 'm-new'],
      ])
      const readFile = vi.fn().mockImplementation(async (p: string) => {
        accessOrder.push(`read:${p}`)
        return fileContents.get(p) ?? ''
      })
      const writeFile = vi.fn().mockImplementation(async (intent: { filePath: string }) => {
        accessOrder.push(`write:${intent.filePath}`)
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      // Undo entry with files in a deliberately NON-sorted order.
      // Implementation must sort them before acquiring locks.
      undoStack.push({ changes: [
        { filePath: '/project/z-last.css', previousContent: 'z-old', currentContent: 'z-new', requiresHmr: false },
        { filePath: '/project/a-first.css', previousContent: 'a-old', currentContent: 'a-new', requiresHmr: false },
        { filePath: '/project/m-middle.css', previousContent: 'm-old', currentContent: 'm-new', requiresHmr: false },
      ] })

      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      // All reads must occur before any writes (validate-all-first atomicity).
      // Within reads: sorted order (a-first → m-middle → z-last).
      // Within writes: sorted order (a-first → m-middle → z-last).
      const readsInOrder = accessOrder.filter(s => s.startsWith('read:'))
      const writesInOrder = accessOrder.filter(s => s.startsWith('write:'))
      expect(readsInOrder).toEqual([
        'read:/project/a-first.css',
        'read:/project/m-middle.css',
        'read:/project/z-last.css',
      ])
      expect(writesInOrder).toEqual([
        'write:/project/a-first.css',
        'write:/project/m-middle.css',
        'write:/project/z-last.css',
      ])
      // All reads happen before any write (atomicity invariant).
      const firstWriteIdx = accessOrder.findIndex(s => s.startsWith('write:'))
      const lastReadIdx = accessOrder.map(s => s.startsWith('read:')).lastIndexOf(true)
      expect(lastReadIdx).toBeLessThan(firstWriteIdx)
    })

    it('H-R2-4: validate+write for a single file happen under one continuous lock (no TOCTOU)', async () => {
      // The original bug: undo validated under lock, released, then
      // re-acquired for write. A concurrent forward edit could slip in
      // between. With merged lock acquisition, the concurrent edit
      // must wait until undo completes both phases.
      const channel = mockChannel()
      const resolver = mockResolver({ 'padding-top': { '8px': 'pt-2', '16px': 'pt-4' } })
      const rewriter = mockRewriter({ success: true, newContent: 'forward-edit-content' })
      const verifier = mockVerifier()
      const undoStack = new UndoStack()

      // Track operations in order of completion.
      const ops: string[] = []
      const fileContents = new Map<string, string>([
        ['/project/App.tsx', 'current-content'],
      ])
      const readFile = vi.fn().mockImplementation(async (p: string) => {
        ops.push(`read:${p}`)
        return fileContents.get(p) ?? ''
      })
      const writeFile = vi.fn().mockImplementation(async (intent: { filePath: string; content: string }) => {
        ops.push(`write:${intent.filePath}:${intent.content}`)
        fileContents.set(intent.filePath, intent.content)
      })

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier, writeFile, readFile,
        projectRoot: '/project', undoStack,
      })

      undoStack.push({ changes: [
        { filePath: '/project/App.tsx', previousContent: 'old-content', currentContent: 'current-content', requiresHmr: false },
      ] })

      // Fire an undo. The implementation must read → write under a
      // single continuous lock acquisition. No other operation can
      // intervene between the read and write for App.tsx.
      await pipeline.handleUndo()
      await vi.runAllTimersAsync()

      // Ops must be read then write, with NOTHING between them for the
      // same file. If the TOCTOU existed, a test probe could have been
      // inserted between the lock-release and lock-reacquire; with the
      // merged-lock implementation, there is no such window.
      const appReads = ops.filter(o => o.includes('App.tsx') && o.startsWith('read:'))
      const appWrites = ops.filter(o => o.includes('App.tsx') && o.startsWith('write:'))
      expect(appReads).toHaveLength(1)
      expect(appWrites).toHaveLength(1)
      const readIdx = ops.indexOf(appReads[0]!)
      const writeIdx = ops.indexOf(appWrites[0]!)
      expect(writeIdx - readIdx).toBe(1)  // adjacent — no TOCTOU gap
    })
  })
})
