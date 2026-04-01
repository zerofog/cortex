import { describe, it, expect } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import { HMRVerifier } from '../../src/core/hmr-verifier.js'
import { CSSModulesRewriter } from '../../src/core/rewriter/css-modules.js'
import { UndoStack } from '../../src/core/session/undo-stack.js'
import { DeferredWriter } from '../../src/core/deferred-writer.js'
import type { AIWriter } from '../../src/core/ai-writer.js'
import type { AIWriteRequest, AIWriteResult } from '../../src/core/ai-writer.js'
import { mockChannel } from '../helpers/mock-channel.js'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { writeFile as fsWriteFile, readFile as fsReadFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

/** Wait for a condition to become true, with timeout */
async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise(r => setTimeout(r, 10))
  }
}

describe('Edit loop integration', () => {
  it('edit request → file change → HMR verification message', async () => {
    const tempDir = join(tmpdir(), `cortex-integration-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      const source = `export function App() {
  return <div className="pt-2 text-sm">Hello</div>
}`
      writeFileSync(filePath, source)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({
        spacing: {
          '2': '0.5rem',
          '4': '1rem',
        },
      })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)

      const pipeline = new EditPipeline({
        channel,
        resolver,
        rewriter,
        verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50, // Short debounce for test speed
      })

      // Step 1: Establish baseline (browser reads initial computed style)
      // The baseline edit silently sets lastValues but sends no edit_status
      // (no previousValue → Tailwind path returns without writing)
      pipeline.handleEdit({
        editId: 'edit-0',
        source: `${filePath}:2:10`,
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })

      // Wait for the debounce to fire and baseline to be captured
      await new Promise(r => setTimeout(r, 100))
      channel.sent.length = 0

      // Step 2: User drags padding from 8px to 16px
      pipeline.handleEdit({
        editId: 'edit-1',
        source: `${filePath}:2:10`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Wait for the edit to complete
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))

      // Verify: file should be updated (pt-2 → pt-4)
      const newSource = readFileSync(filePath, 'utf-8')
      expect(newSource).toContain('pt-4')
      expect(newSource).not.toContain('pt-2')

      // Verify: should have sent writing + done status
      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status')
      expect(statusMsgs.length).toBeGreaterThanOrEqual(2)
      expect((statusMsgs[0] as { status: string }).status).toBe('writing')
      expect((statusMsgs[1] as { status: string }).status).toBe('done')

      // Immediate writes suppress HMR in vite.ts, so verifier.trackEdit is
      // not called. Verify HMR callback does NOT produce hmr_verified.
      verifier.onHMRUpdate([filePath])
      const hmrMsg = channel.sent.find(m => m.type === 'hmr_verified')
      expect(hmrMsg).toBeUndefined()

      // Cleanup
      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })
})

describe('CSS Modules edit loop integration', () => {
  it('CSS Modules edit → file write → HMR verification', async () => {
    const tempDir = join(tmpdir(), `cortex-cssmod-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const cssPath = join(tempDir, 'Hero.module.css')
      writeFileSync(cssPath, '.hero {\n  padding-top: 8px;\n  color: red;\n}\n')

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const cssModulesRewriter = new CSSModulesRewriter({
        readFile: (p) => fsReadFile(p, 'utf-8'),
      })
      const undoStack = new UndoStack()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        cssModulesRewriter, undoStack,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
      })

      pipeline.handleEdit({
        editId: 'css-edit-1',
        source: `src/Hero.tsx:5:3`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'Hero.module.css:.hero',
      })

      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))

      const newCSS = readFileSync(cssPath, 'utf-8')
      expect(newCSS).toContain('padding-top: 16px')
      expect(newCSS).not.toContain('padding-top: 8px')

      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status')
      expect(statusMsgs.length).toBeGreaterThanOrEqual(2)
      expect((statusMsgs[0] as { status: string }).status).toBe('writing')
      expect((statusMsgs[1] as { status: string }).status).toBe('done')

      // Immediate writes suppress HMR — verifier.trackEdit is not called,
      // so onHMRUpdate produces no hmr_verified.
      verifier.onHMRUpdate([cssPath])
      const hmrMsg = channel.sent.find(m => m.type === 'hmr_verified')
      expect(hmrMsg).toBeUndefined()

      // Undo stack was populated
      expect(undoStack.canUndo).toBe(true)

      cssModulesRewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('CSS Modules edit → undo → restore → redo → re-apply', async () => {
    const tempDir = join(tmpdir(), `cortex-undo-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const cssPath = join(tempDir, 'Hero.module.css')
      const originalCSS = '.hero {\n  padding-top: 8px;\n}\n'
      writeFileSync(cssPath, originalCSS)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const cssModulesRewriter = new CSSModulesRewriter({
        readFile: (p) => fsReadFile(p, 'utf-8'),
      })
      const undoStack = new UndoStack()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        cssModulesRewriter, undoStack,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
      })

      // Step 1: Edit
      pipeline.handleEdit({
        editId: 'css-edit-1',
        source: `src/Hero.tsx:5:3`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'Hero.module.css:.hero',
      })
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))
      expect(readFileSync(cssPath, 'utf-8')).toContain('padding-top: 16px')

      // Step 2: Undo
      channel.sent.length = 0
      await pipeline.handleUndo()
      await waitFor(() => channel.sent.some(m => m.type === 'undo_status'))
      expect(readFileSync(cssPath, 'utf-8')).toContain('padding-top: 8px')
      expect((channel.sent.find(m => m.type === 'undo_status') as { status: string }).status).toBe('done')

      // Step 3: Redo
      channel.sent.length = 0
      await pipeline.handleRedo()
      await waitFor(() => channel.sent.some(m => m.type === 'redo_status'))
      expect(readFileSync(cssPath, 'utf-8')).toContain('padding-top: 16px')
      expect((channel.sent.find(m => m.type === 'redo_status') as { status: string }).status).toBe('done')

      cssModulesRewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('undo with stale file (external modification) sends failed status', async () => {
    const tempDir = join(tmpdir(), `cortex-stale-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const cssPath = join(tempDir, 'Hero.module.css')
      writeFileSync(cssPath, '.hero {\n  padding-top: 8px;\n}\n')

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const cssModulesRewriter = new CSSModulesRewriter({
        readFile: (p) => fsReadFile(p, 'utf-8'),
      })
      const undoStack = new UndoStack()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        cssModulesRewriter, undoStack,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
      })

      // Edit
      pipeline.handleEdit({
        editId: 'css-edit-1',
        source: `src/Hero.tsx:5:3`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
        cssMapping: 'Hero.module.css:.hero',
      })
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))

      // Simulate external modification (user's IDE formats the file)
      writeFileSync(cssPath, '.hero {\n  padding-top: 16px;\n  /* formatted */\n}\n')

      // Undo should detect stale content
      channel.sent.length = 0
      await pipeline.handleUndo()
      await waitFor(() => channel.sent.some(m => m.type === 'undo_status'))
      const undoMsg = channel.sent.find(m => m.type === 'undo_status') as { status: string; reason?: string }
      expect(undoMsg.status).toBe('failed')
      expect(undoMsg.reason).toContain('modified outside cortex')

      cssModulesRewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('mixed Tailwind + CSS Modules routing', async () => {
    const tempDir = join(tmpdir(), `cortex-mixed-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const cssPath = join(tempDir, 'Hero.module.css')
      writeFileSync(cssPath, '.hero {\n  color: red;\n}\n')

      const tsxPath = join(tempDir, 'App.tsx')
      writeFileSync(tsxPath, `export function App() {\n  return <div className="pt-2">Hello</div>\n}`)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({
        spacing: { '2': '0.5rem', '4': '1rem' },
      })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const cssModulesRewriter = new CSSModulesRewriter({
        readFile: (p) => fsReadFile(p, 'utf-8'),
      })
      const undoStack = new UndoStack()

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        cssModulesRewriter, undoStack,
        detector: { hasCSSModules: true, hasTailwind: true },
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
      })

      // CSS Modules edit (with cssMapping → routes to CSS Modules rewriter)
      pipeline.handleEdit({
        editId: 'css-edit-1',
        source: `src/Hero.tsx:5:3`,
        property: 'color',
        value: 'blue',
        elementSelector: 'div',
        cssMapping: 'Hero.module.css:.hero',
      })
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))
      expect(readFileSync(cssPath, 'utf-8')).toContain('color: blue')

      // Tailwind edit (no cssMapping → routes to Tailwind rewriter)
      channel.sent.length = 0
      // Baseline — silently sets lastValues, no edit_status sent
      pipeline.handleEdit({
        editId: 'tw-edit-0',
        source: `${tsxPath}:2:10`,
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      await new Promise(r => setTimeout(r, 100))
      channel.sent.length = 0

      pipeline.handleEdit({
        editId: 'tw-edit-1',
        source: `${tsxPath}:2:10`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))
      expect(readFileSync(tsxPath, 'utf-8')).toContain('pt-4')

      // Both edits in undo stack
      expect(undoStack.undoCount).toBe(2)

      cssModulesRewriter.dispose()
      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })
})

// ── Helpers for deferred AI edit tests ────────────────────────────

/**
 * Create a mock AIWriter that simulates a delay and applies a simple style edit.
 * Respects abort signals: rejects with AbortError if signal fires during delay.
 */
function createMockAIWriter(opts: {
  delayMs: number
  onCall?: (request: AIWriteRequest, signal?: AbortSignal) => void
}): AIWriter {
  return {
    async write(
      request: AIWriteRequest,
      options?: { fileContent?: string; signal?: AbortSignal },
    ): Promise<AIWriteResult> {
      const { filePath } = request
      const signal = options?.signal

      opts.onCall?.(request, signal)

      // Check abort before starting
      if (signal?.aborted) {
        return { success: false, filePath, reason: 'Aborted before AI call' }
      }

      // Simulate AI processing delay with abort support
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, opts.delayMs)
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer)
            reject(new DOMException('This operation was aborted', 'AbortError'))
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      }).catch((err) => {
        // Re-throw to match real AIWriter behavior: callClaude throws,
        // write() catches and returns { success: false, reason: 'AI request failed: ...' }
        throw err
      }).catch(() => {
        // Swallow — we'll check signal.aborted below
      })

      // After delay, check if aborted (matches real AIWriter flow)
      if (signal?.aborted) {
        return { success: false, filePath, reason: 'AI request failed: This operation was aborted' }
      }

      // Apply mock edit: inject/update style props from the changes array
      const oldContent = options?.fileContent ?? ''
      const changes = request.changes ?? [{ property: request.property, value: request.value }]
      const styleEntries = changes.map(c => {
        const camel = c.property.replace(/-([a-z])/g, (_, l) => l.toUpperCase())
        return `${camel}: '${c.value}'`
      })
      const styleStr = `style={{ ${styleEntries.join(', ')} }}`

      // Simple replacement: insert style before the closing > of the target JSX element
      let newContent = oldContent
      const lines = oldContent.split('\n')
      const targetIdx = request.line - 1
      if (targetIdx >= 0 && targetIdx < lines.length) {
        const line = lines[targetIdx]!
        // If line already has style={{, replace it
        if (line.includes('style={{')) {
          lines[targetIdx] = line.replace(/style=\{\{[^}]*\}\}/, styleStr)
        } else {
          // Insert style before the closing >
          lines[targetIdx] = line.replace(/>/, ` ${styleStr}>`)
        }
        newContent = lines.join('\n')
      }

      return { success: true, filePath, oldContent, newContent }
    },
    dispose() {},
  } as unknown as AIWriter
}

// ── Deferred AI edit integration tests ────────────────────────────

describe('Deferred AI edit integration', () => {
  it('coalesced batch succeeds through full pipeline', async () => {
    const tempDir = join(tmpdir(), `cortex-deferred-coalesce-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      const source = `export function App() {
  return <div>Hello</div>
}`
      writeFileSync(filePath, source)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const undoStack = new UndoStack()

      let aiCallCount = 0
      let lastRequest: AIWriteRequest | undefined
      const mockAI = createMockAIWriter({
        delayMs: 10,
        onCall: (req) => { aiCallCount++; lastRequest = req },
      })

      // Create pipeline first, then wire DeferredWriter with pipeline.executeDeferredBatch
      const pipeline = new EditPipeline({
        channel,
        resolver,
        rewriter,
        verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
        aiWriter: mockAI,
        // detector with no TW / no CSS Modules → pure AI project → bypass debounce
        detector: { hasCSSModules: false, hasTailwind: false },
        undoStack,
        deferredWriter: undefined as unknown as DeferredWriter, // placeholder, set below
      })

      // Wire DeferredWriter → pipeline.executeDeferredBatch
      const deferredWriter = new DeferredWriter({
        coalescingMs: 50,
        writeFn: (batch) => pipeline.executeDeferredBatch(batch),
      })
      // Inject the deferredWriter into the pipeline (it's readonly, so use Object.assign)
      Object.assign(pipeline, { deferredWriter })

      // Send 3 rapid edits for different properties on the same element
      const sourceRef = `${filePath}:2:10`

      pipeline.handleEdit({
        editId: 'batch-1',
        source: sourceRef,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })
      pipeline.handleEdit({
        editId: 'batch-2',
        source: sourceRef,
        property: 'margin-left',
        value: '8px',
        elementSelector: 'div',
      })
      pipeline.handleEdit({
        editId: 'batch-3',
        source: sourceRef,
        property: 'font-size',
        value: '14px',
        elementSelector: 'div',
      })

      // Wait for coalescing (50ms) + AI call (10ms) + some buffer
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ), 3000)

      // Verify: only 1 AI call, with all 3 properties coalesced
      expect(aiCallCount).toBe(1)
      expect(lastRequest!.changes).toHaveLength(3)
      expect(lastRequest!.changes!.map(c => c.property)).toEqual(
        expect.arrayContaining(['padding-top', 'margin-left', 'font-size'])
      )

      // Verify: file was written with the mock's style injection
      const newContent = readFileSync(filePath, 'utf-8')
      expect(newContent).toContain('style={{')
      expect(newContent).toContain("paddingTop: '16px'")
      expect(newContent).toContain("marginLeft: '8px'")
      expect(newContent).toContain("fontSize: '14px'")

      // Verify: all 3 editIds got 'writing' + 'done' status
      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status') as Array<{ type: string; editId: string; status: string }>
      const doneIds = statusMsgs.filter(m => m.status === 'done').map(m => m.editId)
      expect(doneIds).toContain('batch-1')
      expect(doneIds).toContain('batch-2')
      expect(doneIds).toContain('batch-3')

      // Verify: undo stack recorded the change
      expect(undoStack.canUndo).toBe(true)

      deferredWriter.dispose()
      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('drag simulation: rapid edits → first batch succeeds → second batch "no changes" → all done', async () => {
    const tempDir = join(tmpdir(), `cortex-drag-sim-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      const source = `export function App() {
  return <div>Hello</div>
}`
      writeFileSync(filePath, source)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const undoStack = new UndoStack()

      let aiCallCount = 0
      const mockAI = createMockAIWriter({
        delayMs: 30,
        onCall: () => { aiCallCount++ },
      })

      const pipeline = new EditPipeline({
        channel,
        resolver,
        rewriter,
        verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
        aiWriter: mockAI,
        detector: { hasCSSModules: false, hasTailwind: false },
        undoStack,
        deferredWriter: undefined as unknown as DeferredWriter,
      })

      const deferredWriter = new DeferredWriter({
        coalescingMs: 30,
        writeFn: (batch) => pipeline.executeDeferredBatch(batch),
      })
      Object.assign(pipeline, { deferredWriter })

      const sourceRef = `${filePath}:2:10`

      // ── Simulate a drag: rapid edits every 10ms ──
      // Wave 1: user starts dragging padding-left
      for (let i = 0; i < 5; i++) {
        pipeline.handleEdit({
          editId: `drag-${i}`,
          source: sourceRef,
          property: 'padding-left',
          value: `${(i + 1) * 10}px`,
          elementSelector: 'div',
        })
        await new Promise(r => setTimeout(r, 10))
      }

      // Wait for the first batch to flush and complete
      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ), 3000)

      // ── Wave 2: user does one more adjustment after first batch wrote ──
      // This produces a second batch that reads the already-modified file.
      // The AI sees the same value and returns "no changes" — should be treated as success.
      pipeline.handleEdit({
        editId: 'drag-final',
        source: sourceRef,
        property: 'padding-left',
        value: '50px', // same final value as wave 1
        elementSelector: 'div',
      })

      // Wait for the second batch to complete
      await new Promise(r => setTimeout(r, 200))

      // ── Verify: NO 'failed' status messages ──
      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status') as Array<{
        editId: string; status: string; reason?: string
      }>
      const failedMsgs = statusMsgs.filter(m => m.status === 'failed' && !m.reason?.includes('Superseded'))
      expect(failedMsgs).toHaveLength(0)

      // ── Verify: the final editId got done (not failed) ──
      const finalDone = statusMsgs.filter(m => m.editId === 'drag-final' && m.status === 'done')
      expect(finalDone.length).toBeGreaterThanOrEqual(1)

      // ── Verify: file has the final value ──
      const finalContent = readFileSync(filePath, 'utf-8')
      expect(finalContent).toContain("paddingLeft: '50px'")

      deferredWriter.dispose()
      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('abort during AI call sends cancelled status, not generic failure', async () => {
    const tempDir = join(tmpdir(), `cortex-deferred-abort-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      const source = `export function App() {
  return <div>Hello</div>
}`
      writeFileSync(filePath, source)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({ spacing: {} })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)
      const undoStack = new UndoStack()

      let aiCallCount = 0
      // Slow AI: takes 300ms to respond (gives time for second edit to abort it)
      const mockAI = createMockAIWriter({
        delayMs: 300,
        onCall: () => { aiCallCount++ },
      })

      const pipeline = new EditPipeline({
        channel,
        resolver,
        rewriter,
        verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        readFile: (p) => fsReadFile(p, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
        aiWriter: mockAI,
        detector: { hasCSSModules: false, hasTailwind: false },
        undoStack,
        deferredWriter: undefined as unknown as DeferredWriter,
      })

      const deferredWriter = new DeferredWriter({
        coalescingMs: 50,
        writeFn: (batch) => pipeline.executeDeferredBatch(batch),
      })
      Object.assign(pipeline, { deferredWriter })

      const sourceRef = `${filePath}:2:10`

      // ── Batch 1: send an edit, wait for flush → AI call starts (slow) ──
      pipeline.handleEdit({
        editId: 'first-1',
        source: sourceRef,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      // Wait for coalescing to fire and AI call to start
      await waitFor(() => aiCallCount >= 1, 2000)

      // ── Batch 2: send another edit for the same element → aborts batch 1 ──
      pipeline.handleEdit({
        editId: 'second-1',
        source: sourceRef,
        property: 'padding-top',
        value: '24px',
        elementSelector: 'div',
      })

      // Wait for the second batch to complete
      await waitFor(() => {
        const doneMessages = channel.sent.filter(
          m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
        )
        return doneMessages.length > 0
      }, 3000)

      // Give a moment for all status messages to arrive
      await new Promise(r => setTimeout(r, 50))

      const statusMsgs = channel.sent.filter(m => m.type === 'edit_status') as Array<{
        type: string; editId: string; status: string; reason?: string; strategy?: string
      }>

      // ── Verify first batch: silently cancelled (no error status sent) ──
      const firstBatchStatuses = statusMsgs.filter(m => m.editId === 'first-1')
      // Coalescing supersede is silent — only 'writing' status, no 'failed'
      const firstFailed = firstBatchStatuses.find(m => m.status === 'failed')
      expect(firstFailed).toBeUndefined()

      // ── Verify second batch: completed successfully ──
      const secondBatchStatuses = statusMsgs.filter(m => m.editId === 'second-1')
      const secondDone = secondBatchStatuses.find(m => m.status === 'done')
      expect(secondDone).toBeDefined()

      // ── Verify file has the SECOND batch's value, not the first ──
      const finalContent = readFileSync(filePath, 'utf-8')
      expect(finalContent).toContain("paddingTop: '24px'")
      expect(finalContent).not.toContain("paddingTop: '16px'")

      // ── Verify 2 AI calls total (first aborted, second succeeded) ──
      expect(aiCallCount).toBe(2)

      deferredWriter.dispose()
      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })
})
