import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server as HttpServer } from 'http'
import fs from 'fs'
import os from 'os'
import pathMod from 'path'
import WebSocket from 'ws'
import { cortexEditor, getChannel, onHMRUpdate, _resetForTesting, _getSessionTokenForTesting } from '../../src/adapters/vite.js'
import { AnnotationStore } from '../../src/core/annotations.js'
import type { Plugin } from 'vite'

// Mock loadEnv from vite so tests can control CORTEX_API_KEY availability
const { mockLoadEnv } = vi.hoisted(() => ({
  mockLoadEnv: vi.fn().mockReturnValue({}),
}))
vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite')
  return { ...actual, loadEnv: mockLoadEnv }
})

// Mock TailwindResolver so tests control when/how swatches resolve
vi.mock('../../src/core/tailwind-resolver.js', () => ({
  TailwindResolver: {
    resolveColors: vi.fn().mockResolvedValue(null),
    resolveColorChips: vi.fn().mockResolvedValue(null),
    resolveTextComponents: vi.fn().mockResolvedValue(null),
    fromConfig: vi.fn().mockResolvedValue(null),
    fromTheme: vi.fn().mockReturnValue({ findClass: vi.fn() }),
  },
}))

// Mock new dependencies so they don't perform real I/O during tests
vi.mock('../../src/core/rewriter/tailwind.js', () => ({
  TailwindRewriter: function() {
    this.rewrite = () => Promise.resolve({ success: false, filePath: '', reason: 'mock' })
    this.dispose = () => {}
  },
}))

vi.mock('../../src/core/hmr-verifier.js', () => ({
  HMRVerifier: function(_channel?: unknown) {
    this.trackEdit = () => {}
    this.onHMRUpdate = () => {}
    this.dispose = () => {}
  },
}))

// Capture EditPipeline constructor args for DeferredWriter wiring tests
const editPipelineConstructorArgs: any[] = []
vi.mock('../../src/core/edit-pipeline.js', () => ({
  EditPipeline: function(opts: any) {
    editPipelineConstructorArgs.push(opts)
    this.handleEdit = () => {}
    this.handleUndo = () => {}
    this.handleRedo = () => {}
    this.dispose = () => {}
    this.executeDeferredBatch = vi.fn().mockResolvedValue({ success: true })
  },
}))

vi.mock('../../src/core/rewriter/detector.js', () => ({
  StyleDetector: function() {
    this.detect = () => Promise.resolve({
      hasCSSModules: false, hasTailwind: false, hasCSSInJS: false, hasPlainCSS: true, summary: 'No style system detected',
    })
  },
}))

vi.mock('../../src/core/rewriter/css-modules.js', () => ({
  CSSModulesRewriter: function() {
    this.rewrite = () => Promise.resolve({ success: false, filePath: '', reason: 'mock' })
    this.dispose = () => {}
  },
}))

vi.mock('../../src/core/rewriter/runtime-resolver.js', () => ({
  RuntimeCSSResolver: function() {
    this.resolve = () => Promise.resolve(null)
    this.dispose = () => {}
  },
}))

vi.mock('../../src/core/ai-writer.js', () => ({
  AIWriter: function() {
    this.write = vi.fn().mockResolvedValue({ success: true, newContent: '' })
  },
}))

vi.mock('../../src/core/deferred-writer.js', () => ({
  DeferredWriter: vi.fn().mockImplementation(function(this: any) {
    this.enqueue = vi.fn()
    this.cancelForFile = vi.fn()
    this.dispose = vi.fn()
  }),
}))

vi.mock('../../src/core/session/undo-stack.js', () => ({
  UndoStack: function() {
    this.push = () => {}
    this.undo = () => {}
    this.redo = () => {}
    this.peekUndo = () => null
    this.removeStaleEntry = () => false
    this.clear = () => {}
    this.canUndo = false
    this.canRedo = false
  },
}))

// Import mocks for per-test control
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { DeferredWriter } from '../../src/core/deferred-writer.js'
const mockResolveColors = vi.mocked(TailwindResolver.resolveColors)
const MockDeferredWriter = vi.mocked(DeferredWriter)

// Reset module-level state between tests so ordering doesn't matter
beforeEach(() => {
  mockResolveColors.mockResolvedValue(null)
  mockLoadEnv.mockReturnValue({})
  editPipelineConstructorArgs.length = 0
  MockDeferredWriter.mockClear()
})
afterEach(async () => {
  await _resetForTesting()
})

// Minimal mock of ResolvedConfig
function mockConfig(overrides: { command?: 'serve' | 'build'; root?: string } = {}) {
  return {
    command: overrides.command ?? 'serve',
    root: overrides.root ?? '/project',
  } as Parameters<NonNullable<Plugin['configResolved']>>[0]
}

// Helper to initialize plugin with config
function initPlugin(overrides?: { command?: 'serve' | 'build'; root?: string }) {
  const plugin = cortexEditor()
  ;(plugin.configResolved as Function)(mockConfig(overrides))
  return plugin
}

// Mock Vite server with server.hot API
function mockServer() {
  const handlers = new Map<string, Function>()
  const offHandlers = new Map<string, Function>()
  const sent: { event: string; data: unknown }[] = []
  return {
    middlewares: { use: vi.fn() },
    hot: {
      on(event: string, handler: Function) { handlers.set(event, handler) },
      off(event: string, handler: Function) { offHandlers.set(event, handler) },
      send(event: string, data: unknown) { sent.push({ event, data }) },
      _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
    },
    _handlers: handlers,
    _sent: sent,
  }
}

describe('cortexEditor Vite plugin', () => {
  describe('transform', () => {
    it('instruments JSX files with data-cortex-source', () => {
      const plugin = initPlugin({ root: '/project' })
      const code = 'export default function App() { return <div>hello</div> }'
      const result = (plugin.transform as Function)(code, '/project/src/App.tsx')
      expect(result).not.toBeNull()
      expect(result.code).toContain('data-cortex-source="src/App.tsx:')
      expect(result.map).toBeDefined()
    })

    it('returns null for non-JSX files', () => {
      const plugin = initPlugin()
      const result = (plugin.transform as Function)('const x = 1', '/project/src/utils.ts')
      expect(result).toBeNull()
    })

    it('returns null for node_modules', () => {
      const plugin = initPlugin()
      const code = 'export default function C() { return <div /> }'
      const result = (plugin.transform as Function)(code, '/project/node_modules/pkg/index.tsx')
      expect(result).toBeNull()
    })

    it('returns null in production build', () => {
      const plugin = initPlugin({ command: 'build' })
      const code = 'export default function App() { return <div>hello</div> }'
      const result = (plugin.transform as Function)(code, '/project/src/App.tsx')
      expect(result).toBeNull()
    })
  })

  describe('transformIndexHtml', () => {
    it('injects script tag before </head> in dev mode', () => {
      const plugin = initPlugin()
      const html = '<html><head><title>App</title></head><body></body></html>'
      const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
      const result = hook.handler(html)
      expect(result).toContain('<script type="module" src="/@cortex/client.js"></script>')
      expect(result).toContain('</head>')
      const scriptIdx = result.indexOf('/@cortex/client.js')
      const headIdx = result.indexOf('</head>')
      expect(scriptIdx).toBeLessThan(headIdx)
    })

    it('returns unchanged HTML in production', () => {
      const plugin = initPlugin({ command: 'build' })
      const html = '<html><head></head><body></body></html>'
      const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
      const result = hook.handler(html)
      expect(result).toBe(html)
    })

    it('warns and returns HTML unchanged when </head> is missing', () => {
      const plugin = initPlugin()
      const html = '<html><body><h1>No head tag</h1></body></html>'
      const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = hook.handler(html)
      expect(result).toBe(html)
      expect(warnSpy).toHaveBeenCalledWith(
        '[cortex] transformIndexHtml: </head> not found — client script not injected'
      )
      warnSpy.mockRestore()
    })
  })

  describe('virtual module', () => {
    it('resolves /@cortex/client.js to virtual module ID', () => {
      const plugin = initPlugin()
      const resolved = (plugin.resolveId as Function)('/@cortex/client.js')
      expect(resolved).toBe('\0cortex-client')
    })

    it('does not resolve other IDs', () => {
      const plugin = initPlugin()
      const resolved = (plugin.resolveId as Function)('./App.tsx')
      expect(resolved).toBeUndefined()
    })

    it('loads client script for virtual module ID', () => {
      const plugin = initPlugin()
      const source = (plugin.load as Function)('\0cortex-client')
      expect(source).toContain('import.meta.hot')
      expect(source).toContain('cortex:msg')
      expect(source).toContain('__cortex_channel__')
      expect(source).toContain('__cortex_send__')
    })

    it('client script defines __cortex_send__ as non-writable', () => {
      const plugin = initPlugin()
      const source = (plugin.load as Function)('\0cortex-client')
      expect(source).toContain('Object.defineProperty(window, \'__cortex_send__\'')
      expect(source).toContain('writable: false')
    })

    it('client script includes onerror on browser script tag', () => {
      const plugin = initPlugin()
      const source = (plugin.load as Function)('\0cortex-client')
      expect(source).toContain('__cortexScript.onerror')
      expect(source).toContain('Failed to load browser UI')
    })

    it('does not load other module IDs', () => {
      const plugin = initPlugin()
      const source = (plugin.load as Function)('./other.js')
      expect(source).toBeUndefined()
    })
  })

  describe('plugin metadata', () => {
    it('has name "cortex-editor"', () => {
      const plugin = cortexEditor()
      expect(plugin.name).toBe('cortex-editor')
    })

    it('uses enforce: "pre"', () => {
      const plugin = cortexEditor()
      expect(plugin.enforce).toBe('pre')
    })
  })

  describe('source maps', () => {
    it('returns valid source map from transform', () => {
      const plugin = initPlugin({ root: '/project' })
      const code = 'export default function App() { return <div>hello</div> }'
      const result = (plugin.transform as Function)(code, '/project/src/App.tsx')
      expect(result).not.toBeNull()
      expect(result.map).not.toBeNull()
      expect(result.map.version).toBe(3)
      expect(result.map.mappings).toBeDefined()
      expect(typeof result.map.mappings).toBe('string')
    })
  })

  describe('configureServer + getChannel', () => {
    it('getChannel() throws before configureServer is called', () => {
      expect(() => getChannel()).toThrow('getChannel() called before the Vite dev server started')
    })

    it('getChannel() returns ServerChannel after configureServer', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)
      const channel = getChannel()
      expect(channel).toBeDefined()
      expect(typeof channel.send).toBe('function')
      expect(typeof channel.broadcast).toBe('function')
      expect(typeof channel.onMessage).toBe('function')
      expect(typeof channel.dispose).toBe('function')
    })

    it('channel.onMessage receives messages from server.hot', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)
      const token = _getSessionTokenForTesting()!
      const channel = getChannel()
      const received: unknown[] = []
      channel.onMessage((msg) => received.push(msg))
      const testMsg = { type: 'edit' as const, token, editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }
      server.hot._trigger('cortex:msg', testMsg)
      expect(received).toHaveLength(1)
      expect(received[0]).toEqual(testMsg)
    })
  })

  describe('middleware error handling', () => {
    it('middleware calls next(error) when browser bundle is not found', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      // Extract the middleware handler
      const [, handler] = server.middlewares.use.mock.calls[0]
      const res = {
        setHeader: vi.fn(),
        end: vi.fn(),
      }
      const next = vi.fn()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Handler should call next with error since the file won't exist in test env
      handler({}, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
      expect(errorSpy).toHaveBeenCalled()
      // Headers should NOT have been set (read-before-headers pattern)
      expect(res.setHeader).not.toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('handshake (init → hello)', () => {
    it('sends hello with swatches after browser init message', async () => {
      mockResolveColors.mockResolvedValue(['#ef4444', '#3b82f6', '#22c55e'])
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      // Browser sends init
      server.hot._trigger('cortex:msg', { type: 'init' })

      // hello is sent async via .then() — wait for it specifically (agent-status arrives first)
      await vi.waitFor(() => {
        expect(server._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
      })

      const hello = server._sent.find((s) => (s.data as any).type === 'hello')!
      expect(hello.event).toBe('cortex:msg')
      expect((hello.data as any).protocolVersion).toBe(1)
      expect((hello.data as any).swatches).toEqual(['#ef4444', '#3b82f6', '#22c55e'])
    })

    it('hello awaits tailwind resolution before sending', async () => {
      // Create a promise we control
      let resolveSwatches!: (val: string[] | null) => void
      const pending = new Promise<string[] | null>((r) => { resolveSwatches = r })
      mockResolveColors.mockReturnValue(pending)

      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      // Browser sends init while tailwind is still resolving
      server.hot._trigger('cortex:msg', { type: 'init' })

      // Only agent-status sent — hello hasn't sent yet (swatches still pending)
      const hellosBeforeResolve = server._sent.filter((s) => (s.data as any).type === 'hello')
      expect(hellosBeforeResolve).toHaveLength(0)

      // Now resolve swatches
      resolveSwatches(['#000000'])
      await vi.waitFor(() => {
        const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
        expect(hellos.length).toBeGreaterThan(0)
      })

      const hello = server._sent.find((s) => (s.data as any).type === 'hello')
      expect((hello!.data as any).swatches).toEqual(['#000000'])
    })

    it('hello has undefined swatches when tailwind resolution fails', async () => {
      mockResolveColors.mockRejectedValue(new Error('no tailwindcss'))
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      server.hot._trigger('cortex:msg', { type: 'init' })

      await vi.waitFor(() => {
        expect(server._sent.length).toBeGreaterThan(0)
      })

      expect((server._sent[0].data as any).swatches).toBeUndefined()
    })

    it('only sends hello in response to init, not other message types', async () => {
      // Contract: hello responds to the browser's explicit 'init' signal — not
      // any first message. Sending edits, comments, or other types must not
      // trigger hello. This test guards against regressions to the old
      // "any first message" heuristic.
      mockResolveColors.mockResolvedValue(null)
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      const token = _getSessionTokenForTesting()!
      server.hot._trigger('cortex:msg', { type: 'init' })
      server.hot._trigger('cortex:msg', { type: 'edit', token, editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' })

      await vi.waitFor(() => {
        expect(server._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
      })

      // Exactly one hello — from the single init. The edit after must NOT have
      // triggered a second hello.
      const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
      expect(hellos).toHaveLength(1)
    })

    it('sends fresh hello on every init (idempotent — multi-tab + HMR re-mount support)', async () => {
      // Contract: each init gets a hello response. Required so second browser
      // tabs, HMR re-mounts, and strict-mode double-mounts all rebuild their
      // session context from scratch without relying on retained state. The
      // old `helloSent` flag broke this by silently blocking repeat sends.
      mockResolveColors.mockResolvedValue(['#ff0000'])
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      server.hot._trigger('cortex:msg', { type: 'init' })
      await vi.waitFor(() => {
        const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
        expect(hellos).toHaveLength(1)
      })

      server.hot._trigger('cortex:msg', { type: 'init' })
      await vi.waitFor(() => {
        const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
        expect(hellos).toHaveLength(2)
      })

      const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
      expect((hellos[0].data as any).sessionId).toBe((hellos[1].data as any).sessionId)
      expect((hellos[0].data as any).swatches).toEqual((hellos[1].data as any).swatches)
    })

    it('does not forward init to application message handlers', async () => {
      mockResolveColors.mockResolvedValue(null)
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      const received: unknown[] = []
      getChannel().onMessage((msg) => received.push(msg))

      server.hot._trigger('cortex:msg', { type: 'init' })

      await vi.waitFor(() => {
        expect(server._sent.length).toBeGreaterThan(0)
      })

      // init should NOT be forwarded to application handlers
      expect(received).toHaveLength(0)
    })
  })

  describe('handleHotUpdate + onHMRUpdate', () => {
    it('dispatches file list to registered HMR callbacks', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)
      const files: string[][] = []
      onHMRUpdate((f) => files.push(f))
      const hmrContext = {
        modules: [
          { file: '/project/src/App.tsx' },
          { file: '/project/src/Header.tsx' },
          { file: null },
        ],
      }
      ;(plugin.handleHotUpdate as Function)(hmrContext)
      expect(files).toHaveLength(1)
      expect(files[0]).toEqual(['/project/src/App.tsx', '/project/src/Header.tsx'])
    })

    it('onHMRUpdate returns unsubscribe function', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)
      const files: string[][] = []
      const unsub = onHMRUpdate((f) => files.push(f))
      unsub()
      const hmrContext = { modules: [{ file: '/project/src/App.tsx' }] }
      ;(plugin.handleHotUpdate as Function)(hmrContext)
      expect(files).toHaveLength(0)
    })

    it.each([
      ['styles.css', 'plain CSS'],
      ['App.module.css', 'CSS modules'],
    ])('fires onHMRUpdate for %s (%s) (bug #13)', (filename) => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)
      const files: string[][] = []
      onHMRUpdate((f) => files.push(f))
      const fullPath = `/project/src/${filename}`
      const hmrContext = {
        modules: [{ file: fullPath }],
      }
      ;(plugin.handleHotUpdate as Function)(hmrContext)
      expect(files).toHaveLength(1)
      expect(files[0]).toEqual([fullPath])
    })
  })
})

// --- CLI WebSocket bridge tests ---
// These use a real HTTP server + WebSocket clients (matching transport.test.ts pattern)

describe('CLI WebSocket bridge', () => {
  let httpServer: HttpServer
  let serverPort: number
  let tmpDir: string
  let sessionToken: string
  const openClients: WebSocket[] = []

  function readToken(): string {
    return fs.readFileSync(pathMod.join(tmpDir, '.cortex', 'token'), 'utf8').trim()
  }

  function mockServerWithHttp(http: HttpServer) {
    const handlers = new Map<string, Function>()
    const offHandlers = new Map<string, Function>()
    const sent: { event: string; data: unknown }[] = []
    return {
      middlewares: { use: vi.fn() },
      httpServer: http,
      hot: {
        on(event: string, handler: Function) { handlers.set(event, handler) },
        off(event: string, handler: Function) { offHandlers.set(event, handler) },
        send(event: string, data: unknown) { sent.push({ event, data }) },
        _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
      },
      _handlers: handlers,
      _offHandlers: offHandlers,
      _sent: sent,
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'cortex-ws-test-'))
  })

  async function setupServer() {
    const plugin = initPlugin({ root: tmpDir })
    httpServer = createServer()
    const server = mockServerWithHttp(httpServer)
    ;(plugin.configureServer as Function)(server)

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = httpServer.address()
    serverPort = (addr as any).port
    sessionToken = readToken()

    return { plugin, server }
  }

  type CLIConnection = { ws: WebSocket; nextMessage: () => Promise<any> }

  async function connectCLI(opts?: { headers?: Record<string, string> }): Promise<CLIConnection> {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`, {
      headers: opts?.headers,
    })

    // Attach message queue BEFORE open to catch cortex-status without race
    const queue: any[] = []
    const waiters: ((msg: any) => void)[] = []
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      const waiter = waiters.shift()
      if (waiter) waiter(msg)
      else queue.push(msg)
    })

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    openClients.push(ws)

    return {
      ws,
      nextMessage(): Promise<any> {
        const buffered = queue.shift()
        if (buffered !== undefined) return Promise.resolve(buffered)
        return new Promise((resolve) => waiters.push(resolve))
      },
    }
  }

  afterEach(async () => {
    for (const ws of openClients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
      }
    }
    openClients.length = 0
    await _resetForTesting()
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('accepts WebSocket upgrade at /@cortex/ws path', async () => {
    await setupServer()
    const { ws } = await connectCLI()
    expect(ws.readyState).toBe(WebSocket.OPEN)
  })

  it('sends cortex-status on CLI connect', async () => {
    await setupServer()
    const { nextMessage } = await connectCLI()
    const msg = await nextMessage()
    expect(msg).toEqual({
      type: 'cortex-status',
      editorActive: false,
      browserConnected: false,
    })
  })

  it('sends cortex-status with browserConnected after init', async () => {
    const { server } = await setupServer()
    server.hot._trigger('cortex:msg', { type: 'init' })

    const { nextMessage } = await connectCLI()
    const msg = await nextMessage()
    expect(msg.browserConnected).toBe(true)
  })

  it('forwards allowed CLI messages to browser channel', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain status

    ws.send(JSON.stringify({ type: 'cortex', token: sessionToken }))

    await vi.waitFor(() => {
      const cortexMsgs = server._sent.filter((s) => (s.data as any).type === 'cortex')
      expect(cortexMsgs.length).toBeGreaterThan(0)
    })
  })

  it('rejects CLI messages not in allowlist', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain status

    ws.send(JSON.stringify({ type: 'edit_status', editId: '1', status: 'done', token: sessionToken }))
    await new Promise((r) => setTimeout(r, 50))

    const editMsgs = server._sent.filter((s) => (s.data as any).type === 'edit_status')
    expect(editMsgs).toHaveLength(0)
  })

  it('forwards browser messages to CLI clients', async () => {
    const { server } = await setupServer()
    const { nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status
    await nextMessage() // drain agent-status (connected: true)

    const msgPromise = nextMessage()
    server.hot._trigger('cortex:msg', { type: 'cortex-closed' })
    const msg = await msgPromise
    expect(msg.type).toBe('cortex-closed')
  })

  it('forwards server-generated messages to CLI clients', async () => {
    await setupServer()
    const { nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status
    await nextMessage() // drain agent-status (connected: true)

    const msgPromise = nextMessage()
    const channel = getChannel()
    channel.send({ type: 'edit_status', editId: '1', status: 'done' })
    const msg = await msgPromise
    expect(msg.type).toBe('edit_status')
    expect(msg.editId).toBe('1')
  })

  it('rejects connections with invalid Origin header', async () => {
    await setupServer()
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`, {
      headers: { Origin: 'https://evil.com' },
    })
    openClients.push(ws)
    const error = await new Promise<Error>((resolve, reject) => {
      ws.on('error', (e) => resolve(e as Error))
      ws.on('open', () => reject(new Error('connection should have been rejected')))
    })
    // verifyClient returns false → ws library sends 401 Unauthorized
    expect(error.message).toContain('401')
  })

  it('rejects connections with invalid Host header (DNS rebinding)', async () => {
    await setupServer()
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`, {
      headers: { Host: 'evil.com:5173' },
    })
    openClients.push(ws)
    const error = await new Promise<Error>((resolve, reject) => {
      ws.on('error', (e) => resolve(e as Error))
      ws.on('open', () => reject(new Error('connection should have been rejected')))
    })
    // socket.destroy() before upgrade → connection reset
    expect(error).toBeInstanceOf(Error)
  })

  it('accepts connections with IPv6 [::1] host header (bug #11)', async () => {
    await setupServer()
    const { ws } = await connectCLI({
      headers: { Host: `[::1]:${serverPort}` },
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
  })

  it('caps concurrent connections at 5', async () => {
    await setupServer()

    for (let i = 0; i < 5; i++) {
      await connectCLI()
    }

    const ws6 = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`)
    openClients.push(ws6)
    const closeCode = await new Promise<number>((resolve) => {
      ws6.on('close', (code) => resolve(code))
    })
    expect(closeCode).toBe(1013)
  })

  it('handles CLI disconnect gracefully', async () => {
    await setupServer()
    const { ws } = await connectCLI()

    ws.close()
    await new Promise<void>((resolve) => ws.on('close', resolve))

    const channel = getChannel()
    expect(() => channel.send({ type: 'cortex' })).not.toThrow()
  })

  it('cleans up CLI connections on session dispose', async () => {
    await setupServer()
    const { ws } = await connectCLI()

    const closePromise = new Promise<void>((resolve) => ws.on('close', resolve))
    // Session dispose owns bridge cleanup — channel dispose is slim (hot.off only)
    await _resetForTesting()
    await closePromise
  })

  it('removes upgrade listener on session dispose', async () => {
    await setupServer()
    // Session dispose owns bridge cleanup — channel dispose is slim
    await _resetForTesting()

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`)
    openClients.push(ws)
    const result = await new Promise<string>((resolve) => {
      ws.on('error', () => resolve('error'))
      ws.on('open', () => resolve('open'))
      setTimeout(() => resolve('timeout'), 1000)
    })
    expect(result).not.toBe('open')
    ws.terminate()
  })

  it('tracks editorActive from CLI cortex message', async () => {
    await setupServer()
    const { ws, nextMessage } = await connectCLI()
    const status1 = await nextMessage()
    expect(status1.editorActive).toBe(false)

    ws.send(JSON.stringify({ type: 'cortex', token: sessionToken }))
    await new Promise((r) => setTimeout(r, 50))

    const { nextMessage: nextMessage2 } = await connectCLI()
    const status2 = await nextMessage2()
    expect(status2.editorActive).toBe(true)
  })

  it('tracks editorActive from browser cortex-closed message', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain status

    ws.send(JSON.stringify({ type: 'cortex', token: sessionToken }))
    await new Promise((r) => setTimeout(r, 50))

    server.hot._trigger('cortex:msg', { type: 'cortex-closed' })
    await new Promise((r) => setTimeout(r, 50))

    const { nextMessage: nextMessage2 } = await connectCLI()
    const status = await nextMessage2()
    expect(status.editorActive).toBe(false)
  })

  it('re-sends cortex to browser on init when editorActive is true', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status

    // Activate editor via CLI
    ws.send(JSON.stringify({ type: 'cortex', token: sessionToken }))
    await new Promise((r) => setTimeout(r, 50))

    // Record sent count after activation
    const sentBefore = server._sent.length

    // Simulate browser refresh — browser sends init
    server.hot._trigger('cortex:msg', { type: 'init' })
    await new Promise((r) => setTimeout(r, 50))

    const newMessages = server._sent.slice(sentBefore)
    expect(newMessages.some((s) => (s.data as any).type === 'cortex')).toBe(true)
    expect(newMessages.some((s) => (s.data as any).type === 'agent-status')).toBe(true)
  })

  it('does not send cortex on init when editorActive is false', async () => {
    const { server } = await setupServer()

    // Browser sends init without editor being active
    server.hot._trigger('cortex:msg', { type: 'init' })
    await new Promise((r) => setTimeout(r, 50))

    expect(server._sent.some((s) => (s.data as any).type === 'agent-status')).toBe(true)
    expect(server._sent.some((s) => (s.data as any).type === 'cortex')).toBe(false)
  })

  it('rejects CLI message without token (bug #19)', async () => {
    await setupServer()
    const { ws, nextMessage } = await connectCLI()

    // Drain the cortex-status and agent-status welcome messages
    await nextMessage()
    await nextMessage()

    ws.send(JSON.stringify({ type: 'cortex' }))
    const response = await nextMessage()

    expect(response.type).toBe('error')
    expect(response.code).toBe('AUTH_FAILED')
  })

  it('rejects CLI message with wrong token (bug #19)', async () => {
    await setupServer()
    const { ws, nextMessage } = await connectCLI()

    await nextMessage()
    await nextMessage()

    ws.send(JSON.stringify({ type: 'cortex', token: 'wrong-token' }))
    const response = await nextMessage()

    expect(response.type).toBe('error')
    expect(response.code).toBe('AUTH_FAILED')
  })

  it('warns when no httpServer (middleware mode)', () => {
    const plugin = initPlugin()
    const server = mockServer()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    ;(plugin.configureServer as Function)(server)

    expect(warnSpy).toHaveBeenCalledWith(
      '[cortex] No httpServer — running in middleware mode. CLI connections unavailable.'
    )
    warnSpy.mockRestore()
  })
})

describe('annotation RPC', () => {
  let httpServer: HttpServer
  let serverPort: number
  let tmpDir: string
  let sessionToken: string
  const openClients: WebSocket[] = []

  function readToken(): string {
    return fs.readFileSync(pathMod.join(tmpDir, '.cortex', 'token'), 'utf8').trim()
  }

  function mockServerWithHttp(http: HttpServer) {
    const handlers = new Map<string, Function>()
    const offHandlers = new Map<string, Function>()
    const sent: { event: string; data: unknown }[] = []
    return {
      middlewares: { use: vi.fn() },
      httpServer: http,
      hot: {
        on(event: string, handler: Function) { handlers.set(event, handler) },
        off(event: string, handler: Function) { offHandlers.set(event, handler) },
        send(event: string, data: unknown) { sent.push({ event, data }) },
        _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
      },
      _handlers: handlers,
      _offHandlers: offHandlers,
      _sent: sent,
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'cortex-rpc-test-'))
  })

  async function setupServer() {
    const plugin = initPlugin({ root: tmpDir })
    httpServer = createServer()
    const server = mockServerWithHttp(httpServer)
    ;(plugin.configureServer as Function)(server)

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = httpServer.address()
    serverPort = (addr as any).port
    sessionToken = readToken()

    return { plugin, server }
  }

  type CLIConnection = { ws: WebSocket; nextMessage: () => Promise<any> }

  async function connectCLI(): Promise<CLIConnection> {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/@cortex/ws`)

    const queue: any[] = []
    const waiters: ((msg: any) => void)[] = []
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      const waiter = waiters.shift()
      if (waiter) waiter(msg)
      else queue.push(msg)
    })

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    openClients.push(ws)

    return {
      ws,
      nextMessage(): Promise<any> {
        const buffered = queue.shift()
        if (buffered !== undefined) return Promise.resolve(buffered)
        return new Promise((resolve) => waiters.push(resolve))
      },
    }
  }

  afterEach(async () => {
    for (const ws of openClients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
      }
    }
    openClients.length = 0
    await _resetForTesting()
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('getPending returns empty list initially', async () => {
    await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status
    await nextMessage() // drain agent-status (connected: true)

    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'r1',
      method: 'getPending',
      params: {},
      token: sessionToken,
    }))
    const reply = await nextMessage()
    expect(reply.type).toBe('cortex-rpc-result')
    expect(reply.requestId).toBe('r1')
    expect(reply.result).toEqual([])
  })

  it('comment message creates annotation, getPending returns it', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status

    // Browser sends a comment via HMR
    server.hot._trigger('cortex:msg', {
      type: 'comment',
      token: sessionToken,
      elementSource: 'src/App.tsx:5:3',
      text: 'Make this blue',
    })

    // Drain the forwarded messages (comment + annotation-created + activity-entry come via CLI echo)
    // We need to consume any messages that arrive before our RPC response
    await new Promise((r) => setTimeout(r, 50))

    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'r2',
      method: 'getPending',
      params: {},
      token: sessionToken,
    }))

    // Read messages until we get the RPC result
    let reply: any
    for (let i = 0; i < 20; i++) {
      reply = await nextMessage()
      if (reply.type === 'cortex-rpc-result' && reply.requestId === 'r2') break
    }

    expect(reply.type).toBe('cortex-rpc-result')
    expect(reply.requestId).toBe('r2')
    expect(reply.result).toHaveLength(1)
    expect(reply.result[0].text).toBe('Make this blue')
    expect(reply.result[0].elementSource).toBe('src/App.tsx:5:3')
    expect(reply.result[0].status).toBe('pending')
  })

  it('acknowledge RPC changes status and sends annotation-updated to browser', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status

    // Create an annotation via browser comment
    server.hot._trigger('cortex:msg', {
      type: 'comment',
      token: sessionToken,
      elementSource: 'src/App.tsx:10:5',
      text: 'Fix spacing',
    })

    // Wait for processing
    await new Promise((r) => setTimeout(r, 50))

    // Get the annotation ID via getPending
    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'get1',
      method: 'getPending',
      params: {},
      token: sessionToken,
    }))

    let getReply: any
    for (let i = 0; i < 20; i++) {
      getReply = await nextMessage()
      if (getReply.type === 'cortex-rpc-result' && getReply.requestId === 'get1') break
    }
    const annotationId = getReply.result[0].id

    // Acknowledge it
    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'ack1',
      method: 'acknowledge',
      params: { annotationId },
      token: sessionToken,
    }))

    let ackReply: any
    for (let i = 0; i < 20; i++) {
      ackReply = await nextMessage()
      if (ackReply.type === 'cortex-rpc-result' && ackReply.requestId === 'ack1') break
    }

    expect(ackReply.result.status).toBe('acknowledged')
    expect(ackReply.result.id).toBe(annotationId)

    // Verify browser received annotation-updated via HMR
    const annotationUpdated = server._sent.find(
      (s) => (s.data as any).type === 'annotation-updated' && (s.data as any).annotation?.status === 'acknowledged'
    )
    expect(annotationUpdated).toBeDefined()
    expect((annotationUpdated!.data as any).annotation.id).toBe(annotationId)
  })

  it('unknown RPC method returns error', async () => {
    await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status
    await nextMessage() // drain agent-status (connected: true)

    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'bad1',
      method: 'deleteEverything',
      params: {},
      token: sessionToken,
    }))
    const reply = await nextMessage()
    expect(reply.type).toBe('cortex-rpc-error')
    expect(reply.requestId).toBe('bad1')
    expect(reply.error).toContain('Unknown RPC method')
  })

  it('comment-reply appends to existing annotation thread', async () => {
    const { server } = await setupServer()
    const { ws, nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status

    // Create an annotation via browser comment
    server.hot._trigger('cortex:msg', {
      type: 'comment',
      token: sessionToken,
      elementSource: 'src/App.tsx:5:3',
      text: 'Make this blue',
    })
    await new Promise((r) => setTimeout(r, 50))

    // Get the annotation ID via getPending
    ws.send(JSON.stringify({
      type: 'cortex-rpc',
      requestId: 'get1',
      method: 'getPending',
      params: {},
      token: sessionToken,
    }))
    let getReply: any
    for (let i = 0; i < 20; i++) {
      getReply = await nextMessage()
      if (getReply.type === 'cortex-rpc-result' && getReply.requestId === 'get1') break
    }
    const annotationId = getReply.result[0].id

    // Clear sent messages to isolate comment-reply effects
    server._sent.length = 0

    // Browser sends a comment-reply via HMR
    server.hot._trigger('cortex:msg', {
      type: 'comment-reply',
      token: sessionToken,
      annotationId,
      text: 'What shade of blue?',
    })
    await new Promise((r) => setTimeout(r, 50))

    // Verify browser received annotation-updated (not annotation-created)
    const updated = server._sent.find(
      (s) => (s.data as any).type === 'annotation-updated'
    )
    expect(updated).toBeDefined()
    expect((updated!.data as any).annotation.id).toBe(annotationId)
    expect((updated!.data as any).annotation.thread).toHaveLength(1)
    expect((updated!.data as any).annotation.thread[0].from).toBe('user')
    expect((updated!.data as any).annotation.thread[0].text).toBe('What shade of blue?')

    // Verify no annotation-created was sent (reply should NOT create a new annotation)
    const created = server._sent.find(
      (s) => (s.data as any).type === 'annotation-created'
    )
    expect(created).toBeUndefined()

    // Verify activity log entry was sent
    const activityEntry = server._sent.find(
      (s) => (s.data as any).type === 'activity-entry'
    )
    expect(activityEntry).toBeDefined()
    expect((activityEntry!.data as any).entry.type).toBe('comment')
  })

  it('comment-reply to nonexistent annotation is silently ignored', async () => {
    const { server } = await setupServer()
    await connectCLI()

    server._sent.length = 0

    // Send reply to a nonexistent annotation
    server.hot._trigger('cortex:msg', {
      type: 'comment-reply',
      token: sessionToken,
      annotationId: 'nonexistent-id',
      text: 'This should be ignored',
    })
    await new Promise((r) => setTimeout(r, 50))

    // No annotation-updated or annotation-created should be sent
    const annotationMsg = server._sent.find(
      (s) => (s.data as any).type === 'annotation-updated' || (s.data as any).type === 'annotation-created'
    )
    expect(annotationMsg).toBeUndefined()
  })

  it('agent-status sent on CLI connect', async () => {
    const { server } = await setupServer()
    const { nextMessage } = await connectCLI()
    await nextMessage() // drain cortex-status
    // The CLI also receives the agent-status echoed via forwardToCLI
    const agentMsg = await nextMessage()
    expect(agentMsg.type).toBe('agent-status')
    expect(agentMsg.connected).toBe(true)

    // Also verify browser received it via HMR
    const allAgentStatus = server._sent.filter((s) => (s.data as any).type === 'agent-status')
    expect(allAgentStatus.length).toBeGreaterThan(0)
    const connectStatus = allAgentStatus.find((s) => (s.data as any).connected === true)
    expect(connectStatus).toBeDefined()
  })

  it('agent-status sent on CLI disconnect', async () => {
    const { server } = await setupServer()
    const { ws } = await connectCLI()

    // Clear previous sent messages
    server._sent.length = 0

    ws.close()
    await new Promise<void>((resolve) => ws.on('close', resolve))

    // Wait for close handler to fire
    await new Promise((r) => setTimeout(r, 50))

    const agentStatus = server._sent.find((s) => (s.data as any).type === 'agent-status')
    expect(agentStatus).toBeDefined()
    expect((agentStatus!.data as any).connected).toBe(false)
  })

  it('ws.send() throwing during RPC success response does not crash the server', async () => {
    // Intercept ws.send on the server side: throw when sending any RPC response
    // for requestId "crash1". This simulates a WebSocket closing mid-send.
    // Without the fix, ws.send in the success path throws, the outer catch fires,
    // and ws.send in the catch also throws — an unhandled exception that crashes the server.
    const origSend = WebSocket.prototype.send
    WebSocket.prototype.send = function(this: WebSocket, data: any, ...args: any[]) {
      if (typeof data === 'string' && data.includes('"crash1"') && (data.includes('"cortex-rpc-result"') || data.includes('"cortex-rpc-error"'))) {
        throw new Error('WebSocket is not open')
      }
      return origSend.call(this, data, ...args)
    } as any

    try {
      await setupServer()
      const { ws, nextMessage } = await connectCLI()
      await nextMessage() // drain cortex-status
      await nextMessage() // drain agent-status

      ws.send(JSON.stringify({
        type: 'cortex-rpc',
        requestId: 'crash1',
        method: 'getPending',
        params: {},
        token: sessionToken,
      }))

      // Wait for the server to process the message
      await new Promise((r) => setTimeout(r, 100))

      // Restore send before verifying server is alive
      WebSocket.prototype.send = origSend

      // Verify the server is still alive by connecting a new client and performing an RPC
      const client2 = await connectCLI()
      await client2.nextMessage() // drain cortex-status
      await client2.nextMessage() // drain agent-status

      client2.ws.send(JSON.stringify({
        type: 'cortex-rpc',
        requestId: 'alive1',
        method: 'getPending',
        params: {},
        token: sessionToken,
      }))
      const reply = await client2.nextMessage()
      expect(reply.type).toBe('cortex-rpc-result')
      expect(reply.requestId).toBe('alive1')
    } finally {
      WebSocket.prototype.send = origSend
    }
  })

  it('ws.send() throwing during RPC error response logs console.warn', async () => {
    // Make handleAnnotationRPC throw by sabotaging AnnotationStore.prototype.getPending
    const getPendingSpy = vi.spyOn(AnnotationStore.prototype, 'getPending')
      .mockImplementation(() => { throw new Error('store exploded') })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Intercept ws.send on the server side: throw when sending cortex-rpc-error
    const origSend = WebSocket.prototype.send
    WebSocket.prototype.send = function(this: WebSocket, data: any, ...args: any[]) {
      if (typeof data === 'string' && data.includes('"cortex-rpc-error"')) {
        throw new Error('WebSocket is not open')
      }
      return origSend.call(this, data, ...args)
    } as any

    try {
      await setupServer()
      const { ws, nextMessage } = await connectCLI()
      await nextMessage() // drain cortex-status
      await nextMessage() // drain agent-status

      // Send the RPC — handleAnnotationRPC will throw ('store exploded'),
      // then the catch block's ws.send() will throw because we intercepted it.
      ws.send(JSON.stringify({
        type: 'cortex-rpc',
        requestId: 'crash2',
        method: 'getPending',
        params: {},
        token: sessionToken,
      }))

      // Wait for the server to process the message
      await new Promise((r) => setTimeout(r, 100))

      // Verify console.warn was called with the expected message
      expect(warnSpy).toHaveBeenCalledWith(
        '[cortex] Failed to send RPC error to CLI client:',
        expect.anything(),
      )
    } finally {
      WebSocket.prototype.send = origSend
      getPendingSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})

describe('port file', () => {
  let httpServer: HttpServer
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'cortex-port-test-'))
  })

  afterEach(async () => {
    await _resetForTesting()
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function setupPortFileServer() {
    const plugin = initPlugin({ root: tmpDir })
    httpServer = createServer()
    const handlers = new Map<string, Function>()
    const server = {
      middlewares: { use: vi.fn() },
      httpServer,
      hot: {
        on(event: string, handler: Function) { handlers.set(event, handler) },
        off: vi.fn(),
        send: vi.fn(),
        _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
      },
    }
    ;(plugin.configureServer as Function)(server)
    return server
  }

  it('writes .cortex/port on server start', async () => {
    setupPortFileServer()

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })

    const portFile = pathMod.join(tmpDir, '.cortex', 'port')
    const port = (httpServer.address() as any).port
    const content = fs.readFileSync(portFile, 'utf8')
    expect(content).toBe(String(port))
  })

  it('cleans up .cortex/port on session dispose', async () => {
    setupPortFileServer()

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })

    const portFile = pathMod.join(tmpDir, '.cortex', 'port')
    expect(fs.existsSync(portFile)).toBe(true)

    // Session dispose owns port file cleanup — channel dispose is slim
    await _resetForTesting()
    expect(fs.existsSync(portFile)).toBe(false)
  })
})

describe('validateToggleShortcut', () => {
  it('rejects XSS payload', async () => {
    const { validateToggleShortcut } = await import('../../src/adapters/vite.js')
    expect(() => validateToggleShortcut("'; alert(1);//")).toThrow(/Invalid toggleShortcut/)
  })

  it('rejects </script> payload', async () => {
    const { validateToggleShortcut } = await import('../../src/adapters/vite.js')
    expect(() => validateToggleShortcut("</script><script>alert(1)")).toThrow()
  })

  it('accepts valid shortcuts', async () => {
    const { validateToggleShortcut } = await import('../../src/adapters/vite.js')
    expect(validateToggleShortcut('$mod+Shift+Period')).toBe('$mod+Shift+Period')
    expect(validateToggleShortcut('$mod+Shift+KeyE')).toBe('$mod+Shift+KeyE')
    expect(validateToggleShortcut('$mod+KeyK')).toBe('$mod+KeyK')
  })
})

describe('DeferredWriter wiring', () => {
  it('constructs DeferredWriter when API key is available', async () => {
    mockLoadEnv.mockReturnValue({ CORTEX_API_KEY: 'test-key-123' })

    const plugin = initPlugin()
    const server = mockServer()
    ;(plugin.configureServer as Function)(server)

    // Pipeline construction is async (inside Promise.all().then()) — wait for it
    await vi.waitFor(() => {
      expect(editPipelineConstructorArgs.length).toBeGreaterThan(0)
    })

    // DeferredWriter constructor should have been called
    expect(MockDeferredWriter).toHaveBeenCalledTimes(1)
    const dwOpts = MockDeferredWriter.mock.calls[0][0]
    expect(dwOpts.coalescingMs).toBe(250)
    expect(typeof dwOpts.writeFn).toBe('function')

    // Pipeline should have received the deferredWriter instance
    const pipelineOpts = editPipelineConstructorArgs[0]
    expect(pipelineOpts.deferredWriter).toBeDefined()
    expect(pipelineOpts.aiWriter).toBeDefined()
  })

  it('does not construct DeferredWriter when no API key', async () => {
    mockLoadEnv.mockReturnValue({})
    // Also ensure process.env doesn't have the key
    const origKey = process.env.CORTEX_API_KEY
    delete process.env.CORTEX_API_KEY

    try {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      // Pipeline construction is async — wait for it
      await vi.waitFor(() => {
        expect(editPipelineConstructorArgs.length).toBeGreaterThan(0)
      })

      // DeferredWriter should NOT have been constructed
      expect(MockDeferredWriter).not.toHaveBeenCalled()

      // Pipeline should have undefined deferredWriter
      const pipelineOpts = editPipelineConstructorArgs[0]
      expect(pipelineOpts.deferredWriter).toBeUndefined()
      expect(pipelineOpts.aiWriter).toBeUndefined()
    } finally {
      if (origKey !== undefined) process.env.CORTEX_API_KEY = origKey
    }
  })
})

describe('CortexSession wiring (A2)', () => {
  describe('configureServer re-entry', () => {
    it('disposes old session when configureServer is called twice', async () => {
      const plugin = initPlugin()
      const server1 = mockServer()
      ;(plugin.configureServer as Function)(server1)

      // First session is active — channel exists
      const channel1 = getChannel()
      expect(channel1).toBeDefined()

      // Call configureServer again (simulates Vite restart)
      const server2 = mockServer()
      ;(plugin.configureServer as Function)(server2)

      // New channel exists and is different from the first
      const channel2 = getChannel()
      expect(channel2).toBeDefined()
      expect(channel2).not.toBe(channel1)
    })

    it('does not accumulate signal handlers on re-entry', () => {
      const plugin = initPlugin()
      const server1 = mockServer()
      ;(plugin.configureServer as Function)(server1)

      const listenerCount1 = process.listenerCount('SIGINT')

      // Call again — should remove old handlers first
      const server2 = mockServer()
      ;(plugin.configureServer as Function)(server2)

      const listenerCount2 = process.listenerCount('SIGINT')
      // Should have same count (old removed, new added)
      expect(listenerCount2).toBe(listenerCount1)
    })
  })

  describe('signal handler registration', () => {
    it('registers SIGINT and SIGTERM handlers after configureServer', () => {
      const sigintBefore = process.listenerCount('SIGINT')
      const sigtermBefore = process.listenerCount('SIGTERM')

      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
      expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)
    })
  })

  describe('_resetForTesting', () => {
    it('disposes session and clears signal handlers', async () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      const sigintBefore = process.listenerCount('SIGINT')

      await _resetForTesting()

      // Signal handlers removed
      expect(process.listenerCount('SIGINT')).toBe(sigintBefore - 1)

      // getChannel throws — session is null
      expect(() => getChannel()).toThrow('getChannel() called before the Vite dev server started')
    })

    it('is safe to call when no session exists', async () => {
      // Should not throw
      await _resetForTesting()
    })
  })

  describe('channel dispose is slim', () => {
    it('channel dispose does not clean up bridge resources — session owns those', async () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      const channel = getChannel()
      await channel.dispose()

      // After channel dispose, getChannel still returns the same object —
      // the session is NOT disposed, only the hot listener was detached.
      // Session fields remain intact (channel dispose didn't touch them).
      expect(getChannel()).toBe(channel)
    })
  })
})

// ---------------------------------------------------------------------------
// Regression tests (A4) — each must fail without the corresponding fix
// ---------------------------------------------------------------------------

describe('bug #5 regression: signal cleanup removes port + token files', () => {
  let httpServer: HttpServer
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'cortex-signal-test-'))
  })

  afterEach(async () => {
    await _resetForTesting()
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('dispose cleans up both .cortex/port and .cortex/token files', async () => {
    const plugin = initPlugin({ root: tmpDir })
    httpServer = createServer()
    const handlers = new Map<string, Function>()
    const server = {
      middlewares: { use: vi.fn() },
      httpServer,
      hot: {
        on(event: string, handler: Function) { handlers.set(event, handler) },
        off: vi.fn(),
        send: vi.fn(),
        _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
      },
    }
    ;(plugin.configureServer as Function)(server)

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })

    const portFile = pathMod.join(tmpDir, '.cortex', 'port')
    const tokenFile = pathMod.join(tmpDir, '.cortex', 'token')

    // Both files must exist after server start
    expect(fs.existsSync(portFile)).toBe(true)
    expect(fs.existsSync(tokenFile)).toBe(true)

    // Token file must have restrictive permissions (0o600)
    const tokenStat = fs.statSync(tokenFile)
    expect(tokenStat.mode & 0o777).toBe(0o600)

    // Simulate signal handler path: _resetForTesting calls session.dispose()
    await _resetForTesting()

    // Both files must be cleaned up — this is bug #5's fix
    expect(fs.existsSync(portFile)).toBe(false)
    expect(fs.existsSync(tokenFile)).toBe(false)
  })
})

describe('bug #10 regression: configureServer re-entry produces fresh stores', () => {
  it('new session has different identity and rejects old credentials after re-entry', async () => {
    const plugin = initPlugin()
    const server1 = mockServer()
    ;(plugin.configureServer as Function)(server1)

    // Populate first session's state via browser messages
    const token1 = _getSessionTokenForTesting()!
    server1.hot._trigger('cortex:msg', { type: 'init' })

    // Wait for hello to capture session1's identity
    await vi.waitFor(() => {
      expect(server1._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })
    const hello1 = server1._sent.find((s) => (s.data as any).type === 'hello')!
    const sessionId1 = (hello1.data as any).sessionId

    // Send a comment to create an annotation in the first session
    server1.hot._trigger('cortex:msg', {
      type: 'comment',
      token: token1,
      text: 'stale annotation',
      elementSource: 'div.old',
    })

    // configureServer re-entry (simulates Vite restart)
    const server2 = mockServer()
    ;(plugin.configureServer as Function)(server2)

    // New session must have different token AND sessionId — proving a new
    // CortexSession instance was created (constructor generates fresh stores,
    // as verified by the session independence test in session.test.ts)
    const token2 = _getSessionTokenForTesting()!
    expect(token2).not.toBe(token1)

    // Trigger hello on new session to confirm fresh identity
    server2.hot._trigger('cortex:msg', { type: 'init' })
    await vi.waitFor(() => {
      expect(server2._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })
    const hello2 = server2._sent.find((s) => (s.data as any).type === 'hello')!
    const sessionId2 = (hello2.data as any).sessionId
    expect(sessionId2).not.toBe(sessionId1)

    // Old token is rejected by new session — auth isolation confirmed
    server2.hot._trigger('cortex:msg', {
      type: 'edit',
      token: token1,
      editId: 'stale-1',
      property: 'color',
      value: 'blue',
      source: 'div.stale',
      elementSelector: 'div.stale',
    })

    const authError = server2._sent.find((s) => (s.data as any).code === 'AUTH_FAILED')
    expect(authError).toBeDefined()
  })
})

describe('bug #19 regression: write messages without valid token are rejected', () => {
  describe('browser HMR path', () => {
    it('rejects edit message with wrong token', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      server.hot._trigger('cortex:msg', { type: 'init' })

      server.hot._trigger('cortex:msg', {
        type: 'edit',
        token: 'wrong-token-value',
        editId: 'bad-2',
        property: 'color',
        value: 'red',
        source: 'div',
        elementSelector: 'div',
      })

      const authError = server._sent.find((s) => (s.data as any).code === 'AUTH_FAILED')
      expect(authError).toBeDefined()
    })

    it('accepts edit message with correct token', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      const token = _getSessionTokenForTesting()!
      server.hot._trigger('cortex:msg', { type: 'init' })

      server.hot._trigger('cortex:msg', {
        type: 'edit',
        token,
        editId: 'good-1',
        property: 'color',
        value: 'red',
        source: 'div',
        elementSelector: 'div',
      })

      // No AUTH_FAILED error should be sent
      const authError = server._sent.find((s) => (s.data as any).code === 'AUTH_FAILED')
      expect(authError).toBeUndefined()
    })

    it('does not require token for non-write messages', () => {
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      // init is not a WRITE_TYPE — should work without token
      server.hot._trigger('cortex:msg', { type: 'init' })

      // No AUTH_FAILED
      const authError = server._sent.find((s) => (s.data as any).code === 'AUTH_FAILED')
      expect(authError).toBeUndefined()
    })

    it.each(['edit', 'undo', 'redo', 'comment', 'comment-reply'] as const)(
      'rejects %s message without token',
      (writeType) => {
        const plugin = initPlugin()
        const server = mockServer()
        ;(plugin.configureServer as Function)(server)

        server.hot._trigger('cortex:msg', { type: 'init' })
        server.hot._trigger('cortex:msg', {
          type: writeType,
          editId: 'no-auth-1',
          property: 'color',
          value: 'red',
          source: 'div',
          elementSelector: 'div',
          text: 'test',
          elementSource: 'div',
          annotationId: 'ann-1',
        })

        const authError = server._sent.find((s) => (s.data as any).code === 'AUTH_FAILED')
        expect(authError).toBeDefined()
      },
    )
  })
})

describe('bug #20 regression: per-tab sessionId scoping', () => {
  it('hello response includes a sessionId', async () => {
    const plugin = initPlugin()
    const server = mockServer()
    ;(plugin.configureServer as Function)(server)

    server.hot._trigger('cortex:msg', { type: 'init' })

    await vi.waitFor(() => {
      expect(server._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })

    const hello = server._sent.find((s) => (s.data as any).type === 'hello')!
    const sessionId = (hello.data as any).sessionId
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
  })

  it('transformIndexHtml injects sessionId into window global', () => {
    const plugin = initPlugin()
    const server = mockServer()
    ;(plugin.configureServer as Function)(server)

    const html = '<html><head></head><body></body></html>'
    const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
    const result = hook.handler(html)

    expect(result).toContain('window.__CORTEX_SESSION_ID__=')
  })

  it('sessionId in hello matches sessionId in transformIndexHtml', async () => {
    const plugin = initPlugin()
    const server = mockServer()
    ;(plugin.configureServer as Function)(server)

    // Get sessionId from hello
    server.hot._trigger('cortex:msg', { type: 'init' })
    await vi.waitFor(() => {
      expect(server._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })
    const hello = server._sent.find((s) => (s.data as any).type === 'hello')!
    const helloSessionId = (hello.data as any).sessionId

    // Get sessionId from HTML injection
    const html = '<html><head></head><body></body></html>'
    const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
    const result = hook.handler(html)

    // Extract the injected sessionId value from the script tag
    const match = result.match(/window\.__CORTEX_SESSION_ID__="([^"]+)"/)
    expect(match).not.toBeNull()
    const htmlSessionId = match![1]

    expect(htmlSessionId).toBe(helloSessionId)
  })

  it('configureServer re-entry produces a different sessionId', async () => {
    const plugin = initPlugin()

    // First session
    const server1 = mockServer()
    ;(plugin.configureServer as Function)(server1)
    server1.hot._trigger('cortex:msg', { type: 'init' })
    await vi.waitFor(() => {
      expect(server1._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })
    const hello1 = server1._sent.find((s) => (s.data as any).type === 'hello')!
    const sessionId1 = (hello1.data as any).sessionId

    // Re-entry — new session
    const server2 = mockServer()
    ;(plugin.configureServer as Function)(server2)
    server2.hot._trigger('cortex:msg', { type: 'init' })
    await vi.waitFor(() => {
      expect(server2._sent.find((s) => (s.data as any).type === 'hello')).toBeDefined()
    })
    const hello2 = server2._sent.find((s) => (s.data as any).type === 'hello')!
    const sessionId2 = (hello2.data as any).sessionId

    // Different sessions must have different sessionIds
    expect(sessionId2).not.toBe(sessionId1)
  })
})
