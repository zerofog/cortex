import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import type { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import type { HMRVerifier } from '../../src/core/hmr-verifier.js'
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
    expect(writeFile).toHaveBeenCalledWith('/project/src/Hero.module.css', 'new-css')
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
    expect(writeFile).toHaveBeenCalledWith('/project/src/Hero.module.css', 'new-css')
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

    expect(writeFile).toHaveBeenCalledWith('/project/src/App.tsx', 'old')
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
    expect(writeFile).toHaveBeenCalledWith('/project/src/App.tsx', 'old')
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
    writeFile.mockImplementation(async (_p: string, content: string) => { lastWritten = content })
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

    expect(writeFile).toHaveBeenCalledWith('/project/src/App.tsx', 'new content')
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

    expect(writeFile).toHaveBeenCalledWith('/project/src/App.tsx', 'updated content')
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

    // First edit — should get 'failed' status
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
})
