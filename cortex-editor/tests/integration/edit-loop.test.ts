import { describe, it, expect } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import { HMRVerifier } from '../../src/core/hmr-verifier.js'
import { CSSModulesRewriter } from '../../src/core/rewriter/css-modules.js'
import { UndoStack } from '../../src/core/session/undo-stack.js'
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
      pipeline.handleEdit({
        editId: 'edit-0',
        source: `${filePath}:2:10`,
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })

      // Wait for baseline to resolve (will fail since no oldToken, but sets lastValues)
      await waitFor(() => channel.sent.some(m => m.type === 'edit_status'))
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

      // Step 3: Simulate HMR firing (dev server detects file change)
      verifier.onHMRUpdate([filePath])

      // Verify: should send hmr_verified
      const hmrMsg = channel.sent.find(m => m.type === 'hmr_verified')
      expect(hmrMsg).toBeDefined()
      expect((hmrMsg as { match: boolean }).match).toBe(true)

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

      // HMR fires for CSS file
      verifier.onHMRUpdate([cssPath])
      const hmrMsg = channel.sent.find(m => m.type === 'hmr_verified')
      expect(hmrMsg).toBeDefined()

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
      // Baseline
      pipeline.handleEdit({
        editId: 'tw-edit-0',
        source: `${tsxPath}:2:10`,
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      await waitFor(() => channel.sent.some(m => m.type === 'edit_status'))
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
