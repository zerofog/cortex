# Phase 1b: Adapters + Transport Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Phase 1a's shared source transform into Vite and Next.js dev servers with bidirectional messaging channels.

**Architecture:** Vite adapter uses Vite's native `server.hot` (5.1+ API) for transport. Next.js adapter uses `CortexTransport` (standalone WebSocket server via `ws`). Both expose `ServerChannel` so downstream code is framework-agnostic.

**Tech Stack:** TypeScript, Vite Plugin API, Next.js config wrapper, webpack loader API, `ws` WebSocket library, Vitest

**Spec:** `docs/superpowers/specs/2026-03-11-phase-1b-adapters-transport-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/core/transport.ts` | `CortexTransport` — standalone WebSocket server implementing `ServerChannel` |
| `src/adapters/vite.ts` | Vite plugin — transform, HTML injection, virtual module, HMR channel |
| `src/adapters/next.ts` | `withCortex()` — Next.js config wrapper adding webpack loader + transport |
| `src/adapters/next-source-loader.ts` | Webpack loader calling shared `createSourceTransform` |
| `tests/core/transport.test.ts` | CortexTransport connection lifecycle, messaging, heartbeat, dispose |
| `tests/adapters/vite.test.ts` | Vite plugin hook isolation tests |
| `tests/adapters/next.test.ts` | Next.js config wrapper tests |
| `tests/adapters/next-source-loader.test.ts` | Webpack loader tests |

### Modified files
| File | Change |
|------|--------|
| `src/adapters/types.ts` | Simplify `ServerChannel`: remove `clientId`, make `dispose()` async |
| `package.json` | Add `ws`/`@types/ws`, sub-path exports, bump Vite peer dep |
| `tsup.config.ts` | Add Vite and Next.js adapter entry points |

### Unchanged (verify only)
| File | Why unchanged |
|------|--------------|
| `src/adapters/source-transform.ts` | Consumed by adapters, not modified |
| `src/index.ts` | Re-exports types by name; ServerChannel shape change is transparent |
| `vitest.config.ts` | Already includes `tests/core/**` and `tests/adapters/**` globs |
| `tsconfig.json` | Already covers `src/**/*.ts` |

---

## Chunk 1: Foundation

### Task 1: Install dependencies and simplify ServerChannel

**Files:**
- Modify: `cortex-editor/package.json`
- Modify: `cortex-editor/src/adapters/types.ts`

- [ ] **Step 1: Install ws and @types/ws**

```bash
cd cortex-editor && npm install --save-dev ws @types/ws
```

- [ ] **Step 2: Simplify ServerChannel in types.ts**

In `src/adapters/types.ts`, change the `ServerChannel` interface:

```typescript
// BEFORE (lines 50-55):
export interface ServerChannel {
  send(clientId: string, msg: ServerToBrowser): void
  onMessage(handler: (msg: BrowserToServer, clientId: string) => void): void
  broadcast(msg: ServerToBrowser): void
  dispose(): void
}

// AFTER:
export interface ServerChannel {
  send(msg: ServerToBrowser): void
  onMessage(handler: (msg: BrowserToServer) => void): () => void
  broadcast(msg: ServerToBrowser): void
  dispose(): Promise<void>
}
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd cortex-editor && npm test
```

Expected: All 78 source-transform tests pass. No test references `ServerChannel.send(clientId)` — the type is only exported, never instantiated in Phase 1a.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/types.ts package.json package-lock.json && git commit -m "feat: simplify ServerChannel to broadcast-only, async dispose

Remove clientId from send/onMessage — broadcast is sufficient for
single-tab UX. Make dispose() return Promise<void> for async
WebSocket teardown. No existing implementations to migrate."
```

---

### Task 2: CortexTransport — connection lifecycle (TDD)

**Files:**
- Create: `cortex-editor/src/core/transport.ts`
- Create: `cortex-editor/tests/core/transport.test.ts`

- [ ] **Step 1: Write test — start and expose port**

Create `tests/core/transport.test.ts`:

```typescript
import { afterEach, describe, expect, it } from 'vitest'
import { CortexTransport } from '../../src/core/transport.js'

describe('CortexTransport', () => {
  let transport: CortexTransport

  afterEach(async () => {
    await transport?.dispose()
  })

  it('starts on an OS-assigned port', async () => {
    transport = new CortexTransport({ port: 0 })
    await transport.start()
    expect(transport.port).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd cortex-editor && npx vitest run tests/core/transport.test.ts
```

Expected: FAIL — `Cannot find module '../../src/core/transport.js'`

- [ ] **Step 3: Write minimal CortexTransport (start + dispose + port)**

Create `src/core/transport.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, type Server as HttpServer } from 'http'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from '../adapters/types.js'

export interface CortexTransportOptions {
  port?: number
  heartbeatInterval?: number
}

export class CortexTransport implements ServerChannel {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private messageHandlers: ((msg: BrowserToServer) => void)[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly heartbeatInterval: number
  private readonly requestedPort: number
  private actualPort = 0

  constructor(options?: CortexTransportOptions) {
    this.requestedPort = options?.port ?? 0
    this.heartbeatInterval = options?.heartbeatInterval ?? 30_000
  }

  get port(): number {
    return this.actualPort
  }

  async start(): Promise<void> {
    this.httpServer = createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      ws.on('close', () => this.clients.delete(ws))
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as BrowserToServer
          for (const h of this.messageHandlers) h(msg)
        } catch {
          // Ignore malformed messages
        }
      })
    })

    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.clients) {
        if (ws.readyState !== WebSocket.OPEN) {
          this.clients.delete(ws)
        } else {
          ws.ping()
        }
      }
    }, this.heartbeatInterval)

    return new Promise<void>((resolve) => {
      this.httpServer!.listen(this.requestedPort, () => {
        const addr = this.httpServer!.address()
        this.actualPort = typeof addr === 'object' && addr ? addr.port : 0
        resolve()
      })
    })
  }

  send(msg: ServerToBrowser): void {
    this.broadcast(msg)
  }

  broadcast(msg: ServerToBrowser): void {
    const data = JSON.stringify(msg)
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  onMessage(handler: (msg: BrowserToServer) => void): void {
    this.messageHandlers.push(handler)
  }

  async dispose(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    for (const ws of this.clients) {
      ws.close()
    }
    this.clients.clear()

    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => resolve())
          } else {
            resolve()
          }
        })
      } else if (this.httpServer) {
        this.httpServer.close(() => resolve())
      } else {
        resolve()
      }
    })
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd cortex-editor && npx vitest run tests/core/transport.test.ts
```

Expected: PASS

- [ ] **Step 5: Write test — WebSocket connection + message routing**

Add to `tests/core/transport.test.ts`:

```typescript
import WebSocket from 'ws'

// Helper: connect a WebSocket client and wait for open
async function connectClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`)
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  return ws
}

// Inside the describe block, add:

it('accepts WebSocket connections', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()
  const ws = await connectClient(transport.port)
  expect(ws.readyState).toBe(WebSocket.OPEN)
  ws.close()
})

it('routes messages from client to handlers', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()

  const received: unknown[] = []
  transport.onMessage((msg) => received.push(msg))

  const ws = await connectClient(transport.port)
  const msg = { type: 'edit', editId: '1', property: 'padding', value: 'md', source: 'App.tsx:1:1', elementSelector: 'div' }
  ws.send(JSON.stringify(msg))

  await vi.waitFor(() => expect(received).toHaveLength(1))
  expect(received[0]).toEqual(msg)
  ws.close()
})
```

Add `vi` to the import: `import { afterEach, describe, expect, it, vi } from 'vitest'`

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cortex-editor && npx vitest run tests/core/transport.test.ts
```

Expected: All 3 tests PASS

- [ ] **Step 7: Write test — broadcast to multiple clients**

Add to the describe block:

```typescript
it('broadcasts messages to all connected clients', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()

  const ws1 = await connectClient(transport.port)
  const ws2 = await connectClient(transport.port)

  const received1: string[] = []
  const received2: string[] = []
  ws1.on('message', (data) => received1.push(data.toString()))
  ws2.on('message', (data) => received2.push(data.toString()))

  const msg = { type: 'hello' as const, protocolVersion: 1, sessionId: 'test' }
  transport.broadcast(msg)

  await vi.waitFor(() => {
    expect(received1).toHaveLength(1)
    expect(received2).toHaveLength(1)
  })

  expect(JSON.parse(received1[0]!)).toEqual(msg)
  expect(JSON.parse(received2[0]!)).toEqual(msg)

  ws1.close()
  ws2.close()
})
```

- [ ] **Step 8: Run tests — verify they pass**

```bash
cd cortex-editor && npx vitest run tests/core/transport.test.ts
```

Expected: All 4 tests PASS

- [ ] **Step 9: Write test — client disconnect cleanup**

```typescript
it('removes disconnected clients from the set', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()

  const ws = await connectClient(transport.port)

  // Broadcast should reach the client
  const received: string[] = []
  ws.on('message', (data) => received.push(data.toString()))
  transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'a' })
  await vi.waitFor(() => expect(received).toHaveLength(1))

  // Close the client
  ws.close()
  await new Promise((r) => setTimeout(r, 50))

  // Broadcast after disconnect — should not throw
  transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'b' })
  // If cleanup didn't happen, the closed socket would cause an error
})
```

- [ ] **Step 10: Write test — malformed message handling**

```typescript
it('ignores malformed JSON messages without crashing', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()

  const received: unknown[] = []
  transport.onMessage((msg) => received.push(msg))

  const ws = await connectClient(transport.port)
  ws.send('not valid json {{{')
  ws.send(JSON.stringify({ type: 'edit', editId: '1', property: 'p', value: 'v', source: 's', elementSelector: 'e' }))

  await vi.waitFor(() => expect(received).toHaveLength(1))
  // Only the valid message was delivered
  ws.close()
})
```

- [ ] **Step 11: Write test — heartbeat sends pings**

```typescript
it('sends heartbeat pings at configured interval', async () => {
  transport = new CortexTransport({ port: 0, heartbeatInterval: 50 })
  await transport.start()

  const ws = await connectClient(transport.port)
  const pingReceived = new Promise<void>((resolve) => {
    ws.on('ping', () => resolve())
  })

  await pingReceived
  ws.close()
})
```

- [ ] **Step 12: Write test — heartbeat removes dead connections**

```typescript
it('removes non-OPEN connections during heartbeat sweep', async () => {
  transport = new CortexTransport({ port: 0, heartbeatInterval: 50 })
  await transport.start()

  const ws = await connectClient(transport.port)

  // Verify client receives broadcasts
  const received: string[] = []
  ws.on('message', (data) => received.push(data.toString()))
  transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'a' })
  await vi.waitFor(() => expect(received).toHaveLength(1))

  // Forcibly terminate the underlying socket to simulate a zombie connection
  ws.terminate()

  // Wait for a heartbeat cycle to clean up
  await new Promise((r) => setTimeout(r, 100))

  // Broadcast after cleanup — should not throw, and no clients to receive
  transport.broadcast({ type: 'hello' as const, protocolVersion: 1, sessionId: 'b' })
})
```

- [ ] **Step 13: Write test — dispose tears down cleanly**

```typescript
it('dispose() resolves after full teardown', async () => {
  transport = new CortexTransport({ port: 0 })
  await transport.start()
  const port = transport.port

  const ws = await connectClient(port)
  await transport.dispose()

  // Server is closed — new connections should fail
  const ws2 = new WebSocket(`ws://localhost:${port}`)
  const error = await new Promise<Error>((resolve) => {
    ws2.on('error', resolve)
  })
  expect(error).toBeDefined()
})
```

- [ ] **Step 14: Run all transport tests**

```bash
cd cortex-editor && npx vitest run tests/core/transport.test.ts
```

Expected: All 9 tests PASS

- [ ] **Step 15: Commit**

```bash
git add src/core/transport.ts tests/core/transport.test.ts && git commit -m "feat: add CortexTransport with WebSocket server, heartbeat, and tests

Standalone WebSocket server implementing ServerChannel. Uses OS-assigned
port, JSON message routing, configurable heartbeat interval, and clean
async dispose. 9 tests covering lifecycle, messaging, and error handling."
```

---

## Chunk 2: Adapters + Package Infrastructure

### Task 3: Vite adapter (TDD)

**Files:**
- Create: `cortex-editor/src/adapters/vite.ts`
- Create: `cortex-editor/tests/adapters/vite.test.ts`

- [ ] **Step 1: Write test file — transform hook**

Create `tests/adapters/vite.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { cortexEditor, getChannel, onHMRUpdate } from '../../src/adapters/vite.js'
import type { Plugin } from 'vite'

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
  // Call configResolved to initialize the plugin
  ;(plugin.configResolved as Function)(mockConfig(overrides))
  return plugin
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
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd cortex-editor && npx vitest run tests/adapters/vite.test.ts
```

Expected: FAIL — `Cannot find module '../../src/adapters/vite.js'`

- [ ] **Step 3: Write Vite adapter implementation**

Create `src/adapters/vite.ts`:

```typescript
import type { Plugin, ResolvedConfig, ViteDevServer, HmrContext } from 'vite'
import { createSourceTransform } from './source-transform.js'
import type { ServerChannel, BrowserToServer, ServerToBrowser } from './types.js'

export interface CortexEditorOptions {
  // Reserved for future options
}

const CORTEX_CLIENT_PATH = '/@cortex/client.js'
const VIRTUAL_CORTEX_CLIENT = '\0cortex-client'

const CLIENT_SCRIPT = `\
if (import.meta.hot) {
  import.meta.hot.on('cortex:msg', (data) => {
    window.__cortex_channel__?.handleServerMessage(data);
  });
  window.__cortex_send__ = (msg) => import.meta.hot.send('cortex:msg', msg);
}
`

let channelInstance: ServerChannel | null = null
const hmrCallbacks: ((files: string[]) => void)[] = []

export function getChannel(): ServerChannel {
  if (!channelInstance) {
    throw new Error('cortexEditor plugin not initialized — configureServer has not been called')
  }
  return channelInstance
}

export function onHMRUpdate(cb: (files: string[]) => void): () => void {
  hmrCallbacks.push(cb)
  return () => {
    const idx = hmrCallbacks.indexOf(cb)
    if (idx >= 0) hmrCallbacks.splice(idx, 1)
  }
}

export function cortexEditor(_options?: CortexEditorOptions): Plugin {
  let config: ResolvedConfig
  let transformSource: ReturnType<typeof createSourceTransform>
  const messageHandlers: ((msg: BrowserToServer) => void)[] = []

  return {
    name: 'cortex-editor',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved
      transformSource = createSourceTransform(config.root)
    },

    resolveId(id) {
      if (id === CORTEX_CLIENT_PATH) return VIRTUAL_CORTEX_CLIENT
    },

    load(id) {
      if (id === VIRTUAL_CORTEX_CLIENT) return CLIENT_SCRIPT
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (config.command !== 'serve') return html
        const script = `<script type="module" src="${CORTEX_CLIENT_PATH}"></script>`
        return html.replace('</head>', `${script}\n</head>`)
      },
    },

    transform(code, id) {
      if (config.command !== 'serve') return null
      return transformSource(code, id)
    },

    configureServer(server) {
      // Vite 5.1+ API: server.hot replaces deprecated server.ws
      server.hot.on('cortex:msg', (data: BrowserToServer) => {
        for (const h of messageHandlers) h(data)
      })

      channelInstance = {
        send(msg: ServerToBrowser) {
          server.hot.send('cortex:msg', msg)
        },
        broadcast(msg: ServerToBrowser) {
          server.hot.send('cortex:msg', msg)
        },
        onMessage(handler: (msg: BrowserToServer) => void) {
          messageHandlers.push(handler)
        },
        async dispose() {
          messageHandlers.length = 0
        },
      }
    },

    handleHotUpdate({ modules }: HmrContext) {
      if (modules.length > 0) {
        const files = modules.map(m => m.file).filter((f): f is string => f != null)
        if (files.length > 0) {
          for (const cb of hmrCallbacks) cb(files)
        }
      }
    },
  }
}
```

- [ ] **Step 4: Run transform tests — verify they pass**

```bash
cd cortex-editor && npx vitest run tests/adapters/vite.test.ts
```

Expected: All 4 transform tests PASS

- [ ] **Step 5: Write test — transformIndexHtml**

Add to `tests/adapters/vite.test.ts`:

```typescript
describe('transformIndexHtml', () => {
  it('injects script tag before </head> in dev mode', () => {
    const plugin = initPlugin()
    const html = '<html><head><title>App</title></head><body></body></html>'
    const hook = plugin.transformIndexHtml as { order: string; handler: (html: string) => string }
    const result = hook.handler(html)

    expect(result).toContain('<script type="module" src="/@cortex/client.js"></script>')
    expect(result).toContain('</head>')
    // Script should appear before </head>
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
})
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cortex-editor && npx vitest run tests/adapters/vite.test.ts
```

Expected: All 6 tests PASS

- [ ] **Step 7: Write test — virtual module**

Add to `tests/adapters/vite.test.ts`:

```typescript
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
```

- [ ] **Step 8: Write test — plugin metadata**

```typescript
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
```

- [ ] **Step 9: Write test — source maps pass-through**

```typescript
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
```

- [ ] **Step 10: Write test — configureServer and getChannel**

Add to `tests/adapters/vite.test.ts` (note: `getChannel` and `onHMRUpdate` already imported at top):

```typescript
// Mock Vite server with server.hot API
function mockServer() {
  const handlers = new Map<string, Function>()
  return {
    hot: {
      on(event: string, handler: Function) { handlers.set(event, handler) },
      send(event: string, data: unknown) { /* noop in test */ },
      _trigger(event: string, data: unknown) { handlers.get(event)?.(data) },
    },
    _handlers: handlers,
  }
}

describe('configureServer + getChannel', () => {
  it('getChannel() throws before configureServer is called', () => {
    // Note: this test may need module isolation if channelInstance leaks between tests
    // Reset by calling cortexEditor() fresh without configureServer
    expect(() => getChannel()).toThrow('cortexEditor plugin not initialized')
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
```

- [ ] **Step 11: Write test — onHMRUpdate and handleHotUpdate**

```typescript
describe('handleHotUpdate + onHMRUpdate', () => {
  it('dispatches file list to registered HMR callbacks', () => {
    const plugin = initPlugin()
    const files: string[][] = []
    onHMRUpdate((f) => files.push(f))

    const hmrContext = {
      modules: [
        { file: '/project/src/App.tsx' },
        { file: '/project/src/Header.tsx' },
        { file: null }, // modules without files are filtered out
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
```

- [ ] **Step 12: Run all Vite adapter tests**

```bash
cd cortex-editor && npx vitest run tests/adapters/vite.test.ts
```

Expected: All 18 tests PASS

- [ ] **Step 13: Commit**

```bash
git add src/adapters/vite.ts tests/adapters/vite.test.ts && git commit -m "feat: add Vite adapter with transform, HTML injection, and virtual module

cortexEditor() plugin with enforce:'pre', transformIndexHtml, virtual
module for import.meta.hot bridge, server.hot channel, HMR callback
registration, and ServerChannel exposure via getChannel(). 18 tests
covering all plugin hooks including configureServer and handleHotUpdate."
```

---

### Task 4: Next.js adapter + source loader (TDD)

**Files:**
- Create: `cortex-editor/src/adapters/next.ts`
- Create: `cortex-editor/src/adapters/next-source-loader.ts`
- Create: `cortex-editor/tests/adapters/next.test.ts`
- Create: `cortex-editor/tests/adapters/next-source-loader.test.ts`

- [ ] **Step 1: Write test — withCortex config wrapper**

Create `tests/adapters/next.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withCortex } from '../../src/adapters/next.js'

describe('withCortex', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('adds webpack loader rule for .jsx/.tsx files', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(webpackConfig.module.rules).toHaveLength(1)
    const rule = webpackConfig.module.rules[0] as { test: RegExp; exclude: RegExp }
    expect(rule.test).toEqual(/\.[jt]sx$/)
    expect(rule.exclude).toEqual(/\/node_modules\//)
  })

  it('preserves existing webpack config', () => {
    const existingRule = { test: /\.css$/, use: ['style-loader'] }
    const originalWebpack = vi.fn((config: any) => {
      config.module.rules.push(existingRule)
      return config
    })

    const config = withCortex({ webpack: originalWebpack })
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    expect(originalWebpack).toHaveBeenCalledOnce()
    // Both the original rule and our loader rule should be present
    expect(webpackConfig.module.rules).toHaveLength(2)
  })

  it('returns original config in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const original = { reactStrictMode: true }
    const result = withCortex(original as any)
    expect(result).toBe(original)
  })

  it('passes projectRoot from context.dir to loader options', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/my/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ options: { projectRoot: string } }> }
    expect(rule.use[0]!.options.projectRoot).toBe('/my/project')
  })

  it('sets loader path to a string ending in next-source-loader', () => {
    const config = withCortex({})
    const webpackConfig = { module: { rules: [] as unknown[] } }
    const context = { dir: '/project', dev: true, isServer: false }

    config.webpack!(webpackConfig as any, context as any)

    const rule = webpackConfig.module.rules[0] as { use: Array<{ loader: string }> }
    expect(typeof rule.use[0]!.loader).toBe('string')
    expect(rule.use[0]!.loader).toMatch(/next-source-loader/)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd cortex-editor && npx vitest run tests/adapters/next.test.ts
```

Expected: FAIL — `Cannot find module '../../src/adapters/next.js'`

- [ ] **Step 3: Write Next.js adapter**

Create `src/adapters/next.ts`:

```typescript
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

export interface CortexNextOptions {
  // Reserved for future options
}

// Resolve loader path relative to this file's compiled location.
// Both next.ts and next-source-loader.ts compile to the same dist/next/ directory.
function resolveLoaderPath(): string {
  try {
    // ESM: use import.meta.url
    const dir = path.dirname(fileURLToPath(import.meta.url))
    return path.join(dir, 'next-source-loader.cjs')
  } catch {
    // CJS fallback: __dirname is available
    return path.join(__dirname, 'next-source-loader.cjs')
  }
}

export function withCortex(nextConfig: NextConfig = {}, _options?: CortexNextOptions): NextConfig {
  if (process.env.NODE_ENV === 'production') return nextConfig

  return {
    ...nextConfig,

    webpack(config, context) {
      // Apply user's webpack config first
      if (typeof nextConfig.webpack === 'function') {
        config = nextConfig.webpack(config, context)
      }

      // Add source transform loader for .jsx/.tsx files
      config.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: /\/node_modules\//,
        use: [{
          loader: resolveLoaderPath(),
          options: { projectRoot: context.dir },
        }],
      })

      return config
    },
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd cortex-editor && npx vitest run tests/adapters/next.test.ts
```

Expected: All 5 tests PASS

- [ ] **Step 5: Write test — Next.js source loader**

Create `tests/adapters/next-source-loader.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'

// We can't directly test a webpack loader (needs `this` context).
// Instead, test the transform logic that the loader calls.
// The loader is a thin wrapper around createSourceTransform.

import { createSourceTransform } from '../../src/adapters/source-transform.js'

describe('next-source-loader transform logic', () => {
  const projectRoot = '/project'
  let transform: ReturnType<typeof createSourceTransform>

  beforeEach(() => {
    transform = createSourceTransform(projectRoot)
  })

  it('transforms JSX and returns code + map', () => {
    const code = 'export default function Page() { return <div>hello</div> }'
    const result = transform(code, '/project/src/page.tsx')

    expect(result).not.toBeNull()
    expect(result!.code).toContain('data-cortex-source="src/page.tsx:')
    expect(result!.map).not.toBeNull()
  })

  it('returns null for non-JSX files', () => {
    const result = transform('const x = 1', '/project/src/utils.ts')
    expect(result).toBeNull()
  })

  it('uses the same factory across multiple calls', () => {
    // Verify the cached transform produces consistent results
    const code = 'export default function A() { return <div /> }'
    const r1 = transform(code, '/project/src/A.tsx')
    const r2 = transform(code, '/project/src/A.tsx')

    expect(r1).not.toBeNull()
    expect(r2).not.toBeNull()
    expect(r1!.code).toBe(r2!.code)
  })
})
```

- [ ] **Step 6: Write the source loader file**

Create `src/adapters/next-source-loader.ts`:

```typescript
import { createSourceTransform } from './source-transform.js'

interface LoaderOptions {
  projectRoot: string
}

// Cache the transform function at module scope.
// Webpack calls the loader function per file, but the factory only
// needs to be created once (it captures projectRoot in a closure).
let cachedTransform: ReturnType<typeof createSourceTransform> | null = null
let cachedRoot: string | null = null

// Webpack loader function — `this` is the webpack LoaderContext.
// Uses `export default` which tsup converts to `module.exports = exports.default`
// in CJS output, making it compatible with webpack's loader resolution.
export default function cortexSourceLoader(this: { resourcePath: string; getOptions: () => LoaderOptions; callback: (err: Error | null, content?: string, sourceMap?: unknown) => void }, source: string) {
  const { projectRoot } = this.getOptions()

  // Re-create transform if projectRoot changed (shouldn't happen in practice)
  if (!cachedTransform || cachedRoot !== projectRoot) {
    cachedTransform = createSourceTransform(projectRoot)
    cachedRoot = projectRoot
  }

  const result = cachedTransform(source, this.resourcePath)
  if (result) {
    this.callback(null, result.code, result.map ?? undefined)
  } else {
    this.callback(null, source)
  }
}
```

- [ ] **Step 7: Run source loader tests**

```bash
cd cortex-editor && npx vitest run tests/adapters/next-source-loader.test.ts
```

Expected: All 3 tests PASS

- [ ] **Step 8: Run all adapter tests together**

```bash
cd cortex-editor && npx vitest run tests/adapters/
```

Expected: All tests PASS (source-transform: 78, vite: 18, next: 5, next-source-loader: 3)

- [ ] **Step 9: Commit**

```bash
git add src/adapters/next.ts src/adapters/next-source-loader.ts tests/adapters/next.test.ts tests/adapters/next-source-loader.test.ts && git commit -m "feat: add Next.js adapter (withCortex) and webpack source loader

withCortex() wraps NextConfig to add source transform webpack loader.
Loader caches createSourceTransform at module scope. Production-safe:
returns original config when NODE_ENV=production. 8 tests."
```

---

### Task 5: Package infrastructure and build verification

**Files:**
- Modify: `cortex-editor/package.json`
- Modify: `cortex-editor/tsup.config.ts`

- [ ] **Step 1: Add sub-path exports to package.json**

Update `package.json` to add the `./vite` and `./next` sub-path exports and bump the Vite peer dep:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./vite": {
      "import": { "types": "./dist/vite/vite.d.ts", "default": "./dist/vite/vite.js" },
      "require": { "types": "./dist/vite/vite.d.cts", "default": "./dist/vite/vite.cjs" }
    },
    "./next": {
      "import": { "types": "./dist/next/next.d.ts", "default": "./dist/next/next.js" },
      "require": { "types": "./dist/next/next.d.cts", "default": "./dist/next/next.cjs" }
    }
  },
  "peerDependencies": {
    "next": ">=13.0.0",
    "tailwindcss": ">=3.0.0",
    "vite": ">=5.1.0"
  }
}
```

**Note:** Verify the exact output file names after the first build. tsup names output files based on entry point file names. If `src/adapters/vite.ts` outputs as `dist/vite/vite.js`, the paths above are correct. Adjust if different.

- [ ] **Step 2: Add tsup entries for adapters**

Update `tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig([
  // Server-side: core types + source transform
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: ['vite', 'next', 'tailwindcss'],
  },
  // Vite adapter
  {
    entry: ['src/adapters/vite.ts'],
    outDir: 'dist/vite',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: ['vite'],
  },
  // Next.js adapter + webpack loader
  {
    entry: ['src/adapters/next.ts', 'src/adapters/next-source-loader.ts'],
    outDir: 'dist/next',
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    dts: true,
    external: ['next', 'webpack'],
  },
])
```

- [ ] **Step 3: Run the build**

```bash
cd cortex-editor && npm run build
```

Expected: Build succeeds. Check for these output files:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`
- `dist/vite/vite.js`, `dist/vite/vite.cjs`, `dist/vite/vite.d.ts`, `dist/vite/vite.d.cts`
- `dist/next/next.js`, `dist/next/next.cjs`, `dist/next/next.d.ts`, `dist/next/next.d.cts`
- `dist/next/next-source-loader.js`, `dist/next/next-source-loader.cjs`

```bash
ls -la cortex-editor/dist/ cortex-editor/dist/vite/ cortex-editor/dist/next/
```

If output file names differ from expected, update the `exports` map in `package.json` to match.

- [ ] **Step 4: Run typecheck**

```bash
cd cortex-editor && npm run typecheck
```

Expected: No type errors. If there are type errors from importing Vite/Next.js types, ensure `skipLibCheck: true` is in tsconfig (it is) and that the types are installed as dev deps or available via peer deps.

- [ ] **Step 5: Run full test suite**

```bash
cd cortex-editor && npm test
```

Expected: All tests pass — source-transform (78) + transport (9) + vite (18) + next (5) + next-source-loader (3) = ~113 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsup.config.ts && git commit -m "feat: add sub-path exports and tsup entries for Vite and Next.js adapters

Adds cortex-editor/vite and cortex-editor/next sub-path exports.
Three tsup build configs: main, vite adapter, next adapter + loader.
Vite peer dep bumped to >=5.1.0."
```

---

## Verification Checklist

After all tasks complete, verify against success criteria:

- [ ] `npm run build` — all three entry points produce output
- [ ] `npm run typecheck` — zero type errors
- [ ] `npm test` — all ~113 tests pass
- [ ] CortexTransport: connect, message round-trip, broadcast, heartbeat, dead connection cleanup, malformed message, dispose
- [ ] Vite adapter: transform + source maps, HTML injection, virtual module, configureServer/getChannel, handleHotUpdate/onHMRUpdate, production skip
- [ ] Next.js adapter: webpack rule added, config preserved, loader path, production skip
- [ ] Source loader: transforms JSX, caches factory, returns maps
