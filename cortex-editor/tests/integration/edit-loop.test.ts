import { describe, it, expect } from 'vitest'
import { EditPipeline } from '../../src/core/edit-pipeline.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { TailwindRewriter } from '../../src/core/rewriter/tailwind.js'
import { HMRVerifier } from '../../src/core/hmr-verifier.js'
import type { ServerChannel, ServerToBrowser, BrowserToServer } from '../../src/adapters/types.js'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { writeFile as fsWriteFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

function mockChannel(): ServerChannel & { sent: ServerToBrowser[] } {
  const sent: ServerToBrowser[] = []
  return {
    sent,
    send(msg: ServerToBrowser) { sent.push(msg) },
    broadcast(msg: ServerToBrowser) { sent.push(msg) },
    onMessage(_handler: (msg: BrowserToServer) => void) { return () => {} },
    async dispose() {},
  }
}

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
        writeFile: (path, content) => fsWriteFile(path, content, 'utf-8'),
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
