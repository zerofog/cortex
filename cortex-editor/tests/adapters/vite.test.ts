import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cortexEditor, getChannel, onHMRUpdate, _resetForTesting } from '../../src/adapters/vite.js'
import type { Plugin } from 'vite'

// Mock TailwindResolver so tests control when/how swatches resolve
vi.mock('../../src/core/tailwind-resolver.js', () => ({
  TailwindResolver: {
    resolveColors: vi.fn().mockResolvedValue(null),
  },
}))

// Import the mock for per-test control
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
const mockResolveColors = vi.mocked(TailwindResolver.resolveColors)

// Reset module-level state between tests so ordering doesn't matter
beforeEach(() => {
  mockResolveColors.mockResolvedValue(null)
})
afterEach(() => {
  _resetForTesting()
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
      const channel = getChannel()
      const received: unknown[] = []
      channel.onMessage((msg) => received.push(msg))
      const testMsg = { type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }
      server.hot._trigger('cortex:msg', testMsg)
      expect(received).toHaveLength(1)
      expect(received[0]).toEqual(testMsg)
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

      // hello is sent async via .then() — flush microtasks
      await vi.waitFor(() => {
        expect(server._sent.length).toBeGreaterThan(0)
      })

      const hello = server._sent[0]
      expect(hello.event).toBe('cortex:msg')
      expect((hello.data as any).type).toBe('hello')
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

      // Nothing sent yet — swatches haven't resolved
      expect(server._sent).toHaveLength(0)

      // Now resolve swatches
      resolveSwatches(['#000000'])
      await vi.waitFor(() => {
        expect(server._sent.length).toBeGreaterThan(0)
      })

      expect((server._sent[0].data as any).swatches).toEqual(['#000000'])
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

    it('does not send hello twice on multiple messages', async () => {
      mockResolveColors.mockResolvedValue(null)
      const plugin = initPlugin()
      const server = mockServer()
      ;(plugin.configureServer as Function)(server)

      server.hot._trigger('cortex:msg', { type: 'init' })
      server.hot._trigger('cortex:msg', { type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' })

      await vi.waitFor(() => {
        expect(server._sent.length).toBeGreaterThan(0)
      })

      const hellos = server._sent.filter((s) => (s.data as any).type === 'hello')
      expect(hellos).toHaveLength(1)
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
      const files: string[][] = []
      const unsub = onHMRUpdate((f) => files.push(f))
      unsub()
      const hmrContext = { modules: [{ file: '/project/src/App.tsx' }] }
      ;(plugin.handleHotUpdate as Function)(hmrContext)
      expect(files).toHaveLength(0)
    })
  })
})
