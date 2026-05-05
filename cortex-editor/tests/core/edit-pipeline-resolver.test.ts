/**
 * ZF0-1540: EditPipeline resolver Map + emitTerminal + mechanism wiring tests.
 *
 * Tests the new Promise-based EditResult API on EditPipeline:
 *   - registerApplyResolver returns a Promise<EditResult>
 *   - emitTerminal resolves the pending Promise AND sends browser channel message
 *   - dispose() rejects all pending Promises
 *   - Mechanism field is correct per writer (tailwind | css-module | inline-style)
 *   - Timeout resolves with failed + reason_code: 'apply_timeout'
 *   - Independent resolvers for different editIds are isolated
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import type { EditResult } from '../../src/core/edit-pipeline.js'
import type { WriteIntent } from '../../src/core/edit-pipeline.js'
import type { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import type { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import type { HMRVerifier } from '../../src/core/hmr-verifier.js'
import type { InlineStyleRewriter } from '../../src/core/rewriter/inline-style.js'
import type { CSSModulesRewriter } from '../../src/core/rewriter/css-modules.js'

// ── Stubs ────────────────────────────────────────────────────────────────────

const stubChannel = () => ({
  send: vi.fn(),
  broadcast: vi.fn(),
  onMessage: vi.fn(() => () => {}),
  dispose: vi.fn(async () => {}),
})

const stubResolver = (mapping: Record<string, Record<string, string>> = {}): TailwindResolver =>
  ({
    findClass(property: string, value: string) {
      return mapping[property]?.[value] ?? null
    },
    getSnapPoints() { return [] },
  }) as unknown as TailwindResolver

const stubRewriter = (result: { success: boolean; newContent?: string; reason?: string } = { success: true, newContent: 'new-content' }): TailwindRewriter & { rewriteClassList: ReturnType<typeof vi.fn> } =>
  ({
    async rewrite() {
      if (result.success) return { success: true, filePath: '/tmp/proj/App.tsx', oldContent: 'old', newContent: result.newContent ?? 'new-content' }
      return { success: false, filePath: '/tmp/proj/App.tsx', reason: result.reason ?? 'failed' }
    },
    rewriteClassList: vi.fn(),
    dispose() {},
  }) as unknown as TailwindRewriter & { rewriteClassList: ReturnType<typeof vi.fn> }

const stubVerifier = (): HMRVerifier => ({
  trackEdit: vi.fn(),
  onHMRUpdate() {},
  dispose() {},
}) as unknown as HMRVerifier

const stubInlineStyleRewriter = (result: { success: boolean; newContent?: string; reason?: string } = { success: true, newContent: 'inline-new' }): InlineStyleRewriter =>
  ({
    async rewrite() {
      if (result.success) return { success: true, filePath: '/tmp/proj/App.tsx', oldContent: 'old', newContent: result.newContent ?? 'inline-new' }
      return { success: false, filePath: '/tmp/proj/App.tsx', reason: result.reason ?? 'failed' }
    },
    removeProperty: vi.fn(),
    removeProperties: vi.fn(),
    setAndRemoveInTransaction: vi.fn(),
    dispose() {},
  }) as unknown as InlineStyleRewriter

const stubCSSModulesRewriter = (result: { success: boolean; newContent?: string; reason?: string } = { success: true, newContent: 'css-new' }): CSSModulesRewriter =>
  ({
    async rewrite() {
      if (result.success) return { success: true, filePath: '/tmp/proj/src/Hero.module.css', oldContent: '.hero {}', newContent: result.newContent ?? 'css-new' }
      return { success: false, filePath: '/tmp/proj/src/Hero.module.css', reason: result.reason ?? 'failed' }
    },
    dispose() {},
  }) as unknown as CSSModulesRewriter

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Common edit request that resolves to inline-style path (no Tailwind token found). */
function makeInlineEdit(editId: string): Parameters<EditPipeline['handleEdit']>[0] {
  return {
    editId,
    source: '/tmp/proj/App.tsx:2:10',
    property: 'padding-top',
    value: '16px',
    elementSelector: 'div',
    scope: 'instance',
  }
}

/** Common edit request that resolves to Tailwind path. */
function makeTailwindEdit(editId: string): Parameters<EditPipeline['handleEdit']>[0] {
  return {
    editId,
    source: '/tmp/proj/App.tsx:2:10',
    property: 'padding-top',
    value: '16px',
    elementSelector: 'div',
    currentClass: 'pt-4',
  }
}

/** Common edit request that resolves to CSS Modules path. */
function makeCssModulesEdit(editId: string): Parameters<EditPipeline['handleEdit']>[0] {
  return {
    editId,
    source: '/tmp/proj/App.tsx:2:10',
    property: 'padding-top',
    value: '16px',
    elementSelector: '.hero',
    cssMapping: 'src/Hero.module.css:.hero',
  }
}

describe('EditPipeline — registerApplyResolver + emitTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Test 1: registerApplyResolver resolves on emitTerminal (via handleEdit happy path) ──

  it('registerApplyResolver resolves when inline-style write completes', async () => {
    const channel = stubChannel()
    const writes: WriteIntent[] = []
    const inlineStyleRewriter = stubInlineStyleRewriter({ success: true, newContent: 'new-inline' })

    const pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver(),
      rewriter: stubRewriter({ success: false }),
      verifier: stubVerifier(),
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      inlineStyleRewriter,
      detector: { hasCSSModules: false, hasTailwind: false },
    })

    const edit = makeInlineEdit('edit-1')
    const resultPromise = pipeline.registerApplyResolver('edit-1')

    pipeline.handleEdit(edit)
    await vi.runAllTimersAsync()

    const result = await resultPromise
    expect(result).toEqual({ status: 'applied', mechanism: 'inline-style' })

    pipeline.dispose()
  })

  // ── Test 2: Mechanism per writer (it.each) ──

  it.each([
    ['tailwind', 'tailwind', 'tailwind-happy-path'] as const,
    ['css-module', 'css-module', 'css-modules-happy-path'] as const,
    ['inline-style', 'inline-style', 'inline-style-happy-path'] as const,
  ])('mechanism=%s resolves with correct mechanism field', async (mechanism, _label, _testId) => {
    const channel = stubChannel()
    const writes: WriteIntent[] = []

    let pipeline: EditPipeline
    let edit: Parameters<EditPipeline['handleEdit']>[0]

    if (mechanism === 'tailwind') {
      pipeline = new EditPipeline({
        channel: channel as never,
        resolver: stubResolver({ 'padding-top': { '16px': 'pt-4' } }),
        rewriter: stubRewriter({ success: true, newContent: 'tw-new' }),
        verifier: stubVerifier(),
        writeFile: async (intent) => { writes.push(intent) },
        projectRoot: '/tmp/proj',
      })
      edit = makeTailwindEdit('edit-mech')
    } else if (mechanism === 'css-module') {
      pipeline = new EditPipeline({
        channel: channel as never,
        resolver: stubResolver(),
        rewriter: stubRewriter({ success: false }),
        verifier: stubVerifier(),
        writeFile: async (intent) => { writes.push(intent) },
        projectRoot: '/tmp/proj',
        cssModulesRewriter: stubCSSModulesRewriter({ success: true, newContent: 'css-new' }),
        detector: { hasCSSModules: true, hasTailwind: false },
      })
      edit = makeCssModulesEdit('edit-mech')
    } else {
      // inline-style
      pipeline = new EditPipeline({
        channel: channel as never,
        resolver: stubResolver(),
        rewriter: stubRewriter({ success: false }),
        verifier: stubVerifier(),
        writeFile: async (intent) => { writes.push(intent) },
        projectRoot: '/tmp/proj',
        inlineStyleRewriter: stubInlineStyleRewriter({ success: true }),
        detector: { hasCSSModules: false, hasTailwind: false },
      })
      edit = makeInlineEdit('edit-mech')
    }

    const resultPromise = pipeline.registerApplyResolver('edit-mech')
    pipeline.handleEdit(edit)
    await vi.runAllTimersAsync()

    const result = await resultPromise
    expect(result.status).toBe('applied')
    expect((result as Extract<EditResult, { status: 'applied' }>).mechanism).toBe(mechanism)

    pipeline.dispose()
  })

  // ── Test 3: Timeout ──

  it('registerApplyResolver times out and resolves with failed + reason_code apply_timeout', async () => {
    const channel = stubChannel()
    const pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver(),
      rewriter: stubRewriter({ success: false }),
      verifier: stubVerifier(),
      writeFile: async () => {},
      projectRoot: '/tmp/proj',
    })

    const resultPromise = pipeline.registerApplyResolver('timeout-edit', 100)

    // Advance timers past the timeout without triggering emitTerminal
    vi.advanceTimersByTime(200)

    const result = await resultPromise
    expect(result.status).toBe('failed')
    expect((result as Extract<EditResult, { status: 'failed' }>).reason).toMatch(/timeout/)
    expect((result as Extract<EditResult, { status: 'failed' }>).reason_code).toBe('apply_timeout')

    pipeline.dispose()
  })

  // ── Test 4: dispose() rejects pending promises ──

  it('dispose() rejects pending promises with "pipeline disposed"', async () => {
    const channel = stubChannel()
    const pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver(),
      rewriter: stubRewriter({ success: false }),
      verifier: stubVerifier(),
      writeFile: async () => {},
      projectRoot: '/tmp/proj',
    })

    const resultPromise = pipeline.registerApplyResolver('dispose-edit', 10_000)

    pipeline.dispose()

    await expect(resultPromise).rejects.toThrow('pipeline disposed')
  })

  // ── Test 5: Independent resolvers ──

  it('independent resolvers: emit for "a" resolves only "a", "b" stays pending', async () => {
    const channel = stubChannel()
    const writes: WriteIntent[] = []
    const inlineStyleRewriter = stubInlineStyleRewriter({ success: true })

    const pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver(),
      rewriter: stubRewriter({ success: false }),
      verifier: stubVerifier(),
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      inlineStyleRewriter,
      detector: { hasCSSModules: false, hasTailwind: false },
    })

    // 'b' uses a long timeout so it cannot fire during the small advance we
    // make for 'a's debounce + write. Without this, vi.runAllTimersAsync would
    // fire B's timer too and resolve it as a timeout, masking the independence
    // contract we want to verify.
    const resolverA = pipeline.registerApplyResolver('edit-a')
    const resolverB = pipeline.registerApplyResolver('edit-b', 60_000)

    // Only fire edit for 'a'. Advance enough for A's 400ms debounce + write
    // microtasks, but well under B's 60s timeout.
    pipeline.handleEdit(makeInlineEdit('edit-a'))
    await vi.advanceTimersByTimeAsync(2_000)

    // 'a' should resolve
    const resultA = await resolverA
    expect(resultA.status).toBe('applied')

    // 'b' should still be pending. Tap with both handlers so the eventual
    // rejection (from dispose() below) is handled and doesn't surface as an
    // unhandled rejection.
    let bResolved = false
    let bRejected = false
    void resolverB.then(
      () => { bResolved = true },
      () => { bRejected = true },
    )
    await Promise.resolve() // flush microtasks
    expect(bResolved).toBe(false)
    expect(bRejected).toBe(false)

    // Cleanup: dispose should reject 'b'
    pipeline.dispose()
    await expect(resolverB).rejects.toThrow('pipeline disposed')
  })

  // ── Test 6: Browser-channel contract preserved ──

  it('emitTerminal sends channel message with correct shape', async () => {
    const channel = stubChannel()
    const writes: WriteIntent[] = []
    const inlineStyleRewriter = stubInlineStyleRewriter({ success: true })

    const pipeline = new EditPipeline({
      channel: channel as never,
      resolver: stubResolver(),
      rewriter: stubRewriter({ success: false }),
      verifier: stubVerifier(),
      writeFile: async (intent) => { writes.push(intent) },
      projectRoot: '/tmp/proj',
      inlineStyleRewriter,
      detector: { hasCSSModules: false, hasTailwind: false },
    })

    const resultPromise = pipeline.registerApplyResolver('edit-channel')
    pipeline.handleEdit(makeInlineEdit('edit-channel'))
    await vi.runAllTimersAsync()

    // The Promise resolves with the rich EditResult (carries mechanism for the
    // MCP RPC path). The wire message stays in the existing 'done' shape so the
    // browser reducer at cortex-app-reducer.ts:216 keeps working unchanged.
    const result = await resultPromise
    expect(result).toEqual({ status: 'applied', mechanism: 'inline-style' })

    // Wire-shape contract: terminal message is status:'done', strategy:'immediate'
    // (NOT status:'applied'). mechanism stays out of the wire by design.
    const terminalMsg = channel.send.mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .find(m => m['type'] === 'edit_status' && m['status'] === 'done')

    expect(terminalMsg).toBeDefined()
    expect(terminalMsg!['editId']).toBe('edit-channel')
    expect(terminalMsg!['status']).toBe('done')
    expect(terminalMsg!['strategy']).toBe('immediate')
    expect(terminalMsg!['mechanism']).toBeUndefined()

    pipeline.dispose()
  })
})
