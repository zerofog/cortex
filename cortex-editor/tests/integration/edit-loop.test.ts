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
      await waitFor(() => channel.sent.some(m => m.type === 'undo_sync_status'))
      expect(readFileSync(cssPath, 'utf-8')).toContain('padding-top: 8px')
      expect((channel.sent.find(m => m.type === 'undo_sync_status') as { status: string }).status).toBe('done')

      // Step 3: Redo
      channel.sent.length = 0
      await pipeline.handleRedo()
      await waitFor(() => channel.sent.some(m => m.type === 'redo_sync_status'))
      expect(readFileSync(cssPath, 'utf-8')).toContain('padding-top: 16px')
      expect((channel.sent.find(m => m.type === 'redo_sync_status') as { status: string }).status).toBe('done')

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
      await waitFor(() => channel.sent.some(m => m.type === 'undo_sync_status'))
      const undoMsg = channel.sent.find(m => m.type === 'undo_sync_status') as { status: string; reason?: string }
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

// ── V4 theme integration: full pipeline with parsed v4 theme ─────────
describe('V4 Tailwind edit loop integration', () => {
  it('v4 theme: spacing edit (padding-top) → file write with correct class', async () => {
    const tempDir = join(tmpdir(), `cortex-v4-spacing-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      writeFileSync(filePath, `export function App() {\n  return <div className="pt-2 text-base">Hello</div>\n}`)

      const channel = mockChannel()
      // Use a v4-style theme (spacing from 0.25rem base, converted to px during invertTheme)
      const resolver = TailwindResolver.fromTheme({
        spacing: {
          '0': '0px', 'px': '1px',
          '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem',
          '5': '1.25rem', '6': '1.5rem', '8': '2rem', '10': '2.5rem',
        },
      })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
        detector: { hasCSSModules: false, hasTailwind: true },
      })

      // Seed (baseline)
      pipeline.handleEdit({
        editId: 'v4-seed',
        source: `${filePath}:2:10`,
        property: 'padding-top',
        value: '8px',
        elementSelector: 'div',
      })
      await new Promise(r => setTimeout(r, 100))
      channel.sent.length = 0

      // Actual edit: 8px → 16px
      pipeline.handleEdit({
        editId: 'v4-edit-1',
        source: `${filePath}:2:10`,
        property: 'padding-top',
        value: '16px',
        elementSelector: 'div',
      })

      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))

      const newSource = readFileSync(filePath, 'utf-8')
      expect(newSource).toContain('pt-4')
      expect(newSource).not.toContain('pt-2')

      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })

  it('v4 theme: color edit (background-color) → file write with correct class', async () => {
    const tempDir = join(tmpdir(), `cortex-v4-color-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      const filePath = join(tempDir, 'App.tsx')
      writeFileSync(filePath, `export function App() {\n  return <div className="bg-white p-4">Hello</div>\n}`)

      const channel = mockChannel()
      const resolver = TailwindResolver.fromTheme({
        colors: {
          white: '#ffffff',
          black: '#000000',
          red: { 500: '#ef4444' },
          blue: { 500: '#3b82f6' },
        },
      })
      const rewriter = new TailwindRewriter()
      const verifier = new HMRVerifier(channel)

      const pipeline = new EditPipeline({
        channel, resolver, rewriter, verifier,
        writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
        projectRoot: tempDir,
        debounceMs: 50,
        detector: { hasCSSModules: false, hasTailwind: true },
      })

      // Seed with current bg color (white)
      pipeline.handleEdit({
        editId: 'v4-color-seed',
        source: `${filePath}:2:10`,
        property: 'background-color',
        value: '#ffffff',
        elementSelector: 'div',
      })
      await new Promise(r => setTimeout(r, 100))
      channel.sent.length = 0

      // Change to red-500
      pipeline.handleEdit({
        editId: 'v4-color-edit',
        source: `${filePath}:2:10`,
        property: 'background-color',
        value: '#ef4444',
        elementSelector: 'div',
      })

      await waitFor(() => channel.sent.some(
        m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
      ))

      const newSource = readFileSync(filePath, 'utf-8')
      expect(newSource).toContain('bg-red-500')
      expect(newSource).not.toContain('bg-white')

      rewriter.dispose()
      verifier.dispose()
      pipeline.dispose()
    } finally {
      try { rmSync(tempDir, { recursive: true }) } catch {}
    }
  })
})

// ── Direct class path: per-property tests with currentClass ──────────
// These test the "short path": browser sends the actual Tailwind class name,
// server uses it directly as oldToken. No seed, no reverse lookup, no OKLCH.
describe('Direct class path (currentClass)', () => {
  const PROPERTY_TESTS = [
    { name: 'padding-top', oldClass: 'pt-2', newClass: 'pt-4', source: 'pt-2 bg-white', expected: 'pt-4', newValue: '16px' },
    { name: 'margin-bottom', oldClass: 'mb-4', newClass: 'mb-8', source: 'mb-4 flex', expected: 'mb-8', newValue: '32px' },
    { name: 'gap', oldClass: 'gap-2', newClass: 'gap-4', source: 'flex gap-2', expected: 'gap-4', newValue: '16px' },
    { name: 'background-color', oldClass: 'bg-white', newClass: 'bg-black', source: 'bg-white p-4', expected: 'bg-black', newValue: '#000000' },
    { name: 'font-size', oldClass: 'text-sm', newClass: 'text-lg', source: 'text-sm font-bold', expected: 'text-lg', newValue: '18px' },
    { name: 'font-weight', oldClass: 'font-normal', newClass: 'font-bold', source: 'font-normal text-lg', expected: 'font-bold', newValue: '700' },
    { name: 'border-radius', oldClass: 'rounded-sm', newClass: 'rounded-lg', source: 'rounded-sm border', expected: 'rounded-lg', newValue: '8px' },
    { name: 'border-width', oldClass: 'border-0', newClass: 'border-2', source: 'border-0 border-gray-300', expected: 'border-2', newValue: '2px' },
    { name: 'opacity', oldClass: 'opacity-100', newClass: 'opacity-50', source: 'opacity-100 bg-white', expected: 'opacity-50', newValue: '0.5' },
    { name: 'display', oldClass: 'flex', newClass: 'grid', source: 'flex items-center', expected: 'grid', newValue: 'grid' },
  ] as const

  it.each(PROPERTY_TESTS)(
    '$name: currentClass=$oldClass → write $newClass (no seed, no reverse lookup)',
    async ({ name, oldClass, source, expected, newValue }) => {
      const tempDir = join(tmpdir(), `cortex-direct-${name}-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })

      try {
        const filePath = join(tempDir, 'App.tsx')
        writeFileSync(filePath, `export function App() {\n  return <div className="${source}">Hello</div>\n}`)

        const channel = mockChannel()
        const resolver = TailwindResolver.fromTheme({
          spacing: {
            '0': '0px', 'px': '1px', '1': '0.25rem', '2': '0.5rem',
            '3': '0.75rem', '4': '1rem', '5': '1.25rem', '6': '1.5rem', '8': '2rem',
          },
          colors: { white: '#ffffff', black: '#000000', gray: { 300: '#d1d5db' } },
          fontSize: { sm: '0.875rem', base: '1rem', lg: '1.125rem' },
          fontWeight: { normal: '400', bold: '700' },
          borderRadius: { sm: '0.125rem', DEFAULT: '0.25rem', lg: '0.5rem' },
          borderWidth: { '0': '0px', DEFAULT: '1px', '2': '2px' },
          opacity: { '50': '0.5', '100': '1' },
        })
        const rewriter = new TailwindRewriter()
        const verifier = new HMRVerifier(channel)

        const pipeline = new EditPipeline({
          channel, resolver, rewriter, verifier,
          writeFile: (intent) => fsWriteFile(intent.filePath, intent.content, 'utf-8'),
          projectRoot: tempDir,
          debounceMs: 50,
          detector: { hasCSSModules: false, hasTailwind: true },
        })

        // Direct class path: FIRST edit writes immediately (no seed needed!)
        pipeline.handleEdit({
          editId: `direct-${name}`,
          source: `${filePath}:2:10`,
          property: name,
          value: newValue,
          elementSelector: 'div',
          currentClass: oldClass,  // <-- the key: browser sends the actual class
        })

        await waitFor(() => channel.sent.some(
          m => m.type === 'edit_status' && (m as { status: string }).status === 'done'
        ))

        const newSource = readFileSync(filePath, 'utf-8')
        expect(newSource).toContain(expected)
        expect(newSource).not.toContain(oldClass)

        rewriter.dispose()
        verifier.dispose()
        pipeline.dispose()
      } finally {
        try { rmSync(tempDir, { recursive: true }) } catch {}
      }
    },
  )
})
