# Phase 1b: Vite + Next.js Adapters + CortexTransport

**Ticket:** ZF0-884
**Status:** Design approved
**Depends on:** Phase 1a (ZF0-883, complete)
**Blocks:** Phase 2 (ZF0-885)
**Scope change:** CLI and postinstall deferred from original ticket — not needed when AI agents handle installation, and not blocking for Phase 2.

## Problem

Phase 1a delivered the shared source transform (`createSourceTransform`) and type contracts (`FrameworkAdapter`, `ServerChannel`, message protocol). Phase 1b wires these into actual framework dev servers so that:

1. JSX files get `data-cortex-source` attributes at build time
2. A browser script is injected into the HTML
3. A bidirectional message channel exists between browser and server

Without this, Phase 2 (browser overlay) has no way to communicate edits back to the server.

## Architecture

```
cortex-editor/src/
  adapters/
    vite.ts                ← Vite plugin (new)
    next.ts                ← Next.js config wrapper (new)
    next-source-loader.ts  ← webpack loader (new)
    source-transform.ts    ← Phase 1a (existing)
    types.ts               ← Phase 1a (modified: simplify ServerChannel)
  core/
    transport.ts           ← CortexTransport WebSocket server (new)
  index.ts                 ← barrel exports (modified: add adapter exports)
```

Vite and Next.js take fundamentally different transport approaches because of their dev server APIs:

- **Vite** has `server.hot` — a built-in HMR channel with custom event support. We send `cortex:msg` events over this existing channel. No extra server needed.
- **Next.js** has no equivalent bidirectional channel. `CortexTransport` creates a standalone WebSocket server on a dedicated port using the `ws` library.

From downstream code's perspective (Phase 4 edit pipeline), both adapters expose a `ServerChannel` — the transport difference is invisible.

**Note on `FrameworkAdapter`:** Neither adapter implements the `FrameworkAdapter` interface directly in Phase 1b. The interface was defined in Phase 1a as a contract for downstream code. It will be revisited in Phase 2 when both adapters exist and the actual shared surface can be validated against real usage. For now, each adapter exposes its functionality through framework-idiomatic APIs (Vite `Plugin`, Next.js config wrapper).

## Interface Changes to types.ts

### ServerChannel: remove clientId

The Phase 1a `ServerChannel` interface includes per-client addressing (`clientId` parameter on `send` and `onMessage`). This is unnecessary:

- Vite's `server.hot` broadcasts — no per-client targeting available
- The intended UX is single-tab (one designer, one browser tab)
- Even in multi-tab scenarios, broadcast is acceptable — messages include `editId` for correlation
- Phase 7 (MCP) also works with broadcast

This is a breaking change to the exported `ServerChannel` type. No implementations exist yet (Phase 1b creates the first ones), so no migration is needed.

Simplified interface:

```typescript
export interface ServerChannel {
  send(msg: ServerToBrowser): void
  onMessage(handler: (msg: BrowserToServer) => void): () => void
  broadcast(msg: ServerToBrowser): void
  dispose(): Promise<void>
}
```

`send()` and `broadcast()` have identical semantics. Both are retained for intent clarity in calling code.

**Note on `hello` message:** The `ServerToBrowser` protocol includes `{ type: 'hello', sessionId }`. Since `send()` broadcasts, all connected tabs receive a `hello` when any new client connects. This is benign in the single-tab design. If multi-tab isolation is ever needed, `clientId` can be re-added.

### ServerChannel.dispose(): Promise<void>

Changed from `void` to `Promise<void>`. `CortexTransport` wraps `WebSocketServer.close()` which is inherently async. Returning a promise allows tests to await clean teardown. The Vite adapter's channel dispose can return a resolved promise.

## Component: Vite Adapter

**File:** `src/adapters/vite.ts`
**Export:** `cortexEditor(options?): Plugin`
**Peer dependency:** `vite >= 5.1.0` (for `server.hot` API)

Usage:
```typescript
import { cortexEditor } from 'cortex-editor/vite'

export default defineConfig({
  plugins: [react(), cortexEditor()],
})
```

The plugin uses four Vite hooks:

### `configResolved(config)`

Captures the resolved config. Creates the transform function once: `const transform = createSourceTransform(config.root)`. This factory call is done once at startup; the returned function is called per-file in the `transform` hook.

### `transform(code, id)`

- Guards: skip if `config.command !== 'serve'`
- Calls the pre-created `transform(code, id)` function (not the factory)
- Returns `{ code, map }` — source maps from magic-string pass through to Vite's pipeline
- Plugin uses `enforce: 'pre'` so this runs before React's JSX compilation

### `transformIndexHtml`

- Order: `'pre'` (before other plugins)
- Guards: skip if `config.command !== 'serve'`
- Injects a `<script type="module" src="/@cortex/client.js"></script>` before `</head>`
- The client script is served as a virtual module (see `resolveId`/`load` below), giving it access to `import.meta.hot` for HMR custom events

### `resolveId` + `load` (virtual module)

The Cortex client script cannot be an inline `<script>` tag because `import.meta.hot` is only available in modules processed by Vite's module graph. Instead:

- `resolveId('/@cortex/client.js')` → returns a virtual module ID
- `load(virtualId)` → returns the client script source:
  ```javascript
  if (import.meta.hot) {
    import.meta.hot.on('cortex:msg', (data) => {
      window.__cortex_channel__?.handleServerMessage(data)
    })
    window.__cortex_send__ = (msg) => import.meta.hot.send('cortex:msg', msg)
  }
  ```

This module is processed by Vite like any other ESM module, ensuring `import.meta.hot` is available.

### `configureServer(server)`

- Uses `server.hot.on('cortex:msg', handler)` for browser-to-server messages (Vite 5.1+ API, replaces deprecated `server.ws`)
- Uses `server.hot.send('cortex:msg', data)` for server-to-browser messages
- Listens for HMR update completion events
- Exposes adapter handle for downstream code

### Adapter handle

```typescript
export function cortexEditor(options?): Plugin { ... }
export function getChannel(): ServerChannel  // available after configureServer
export function onHMRUpdate(cb: (files: string[]) => void): () => void
```

## Component: CortexTransport

**File:** `src/core/transport.ts`
**Export:** `class CortexTransport implements ServerChannel`

Standalone WebSocket server for frameworks without built-in bidirectional channels.

### Constructor options

```typescript
interface CortexTransportOptions {
  port?: number              // default: 0 (OS-assigned)
  heartbeatInterval?: number // default: 30_000ms, configurable for testing
}
```

The `heartbeatInterval` option exists primarily for testability — tests use `vi.useFakeTimers()` and advance by the configured interval rather than waiting 30 real seconds.

### Mounting

Creates its own HTTP server and `WebSocketServer` bound to it. Listens on the configured port (or OS-assigned if 0). The actual port is available via `transport.port` after `start()` resolves.

This avoids the problem of obtaining a reference to the framework's internal HTTP server. Next.js does not expose its HTTP server through `next.config.js`, and intercepting `http.createServer` is fragile. A standalone server on a separate port is simple, reliable, and framework-agnostic.

```typescript
const transport = new CortexTransport({ port: 0 })
await transport.start()
console.log(`Cortex transport on port ${transport.port}`)
```

The browser connects to `ws://localhost:{transport.port}`.

### Connection lifecycle

1. Client connects via WebSocket
2. Added to `Set<WebSocket>`
3. Messages parsed as JSON, dispatched to registered handlers
4. On close, removed from set
5. Malformed messages silently ignored (no server crash)

### Heartbeat

- Pings all clients at the configured interval (default 30s)
- Clients that aren't in `OPEN` state are removed
- Prevents zombie connections from accumulating over long dev sessions

### Disposal

`dispose()` returns a `Promise<void>` that resolves when:
1. Heartbeat interval is cleared
2. All WebSocket connections are closed
3. The HTTP server is closed

## Component: Next.js Adapter

**File:** `src/adapters/next.ts`
**Export:** `withCortex(nextConfig?): NextConfig`

Usage:
```javascript
const { withCortex } = require('cortex-editor/next')
module.exports = withCortex(nextConfig)
```

### Production safety

First line checks `process.env.NODE_ENV === 'production'` and returns the original config unchanged. Zero overhead in prod.

### Webpack loader

Adds a webpack rule for `.jsx`/`.tsx` files (excluding `/node_modules/`). The loader (`next-source-loader.ts`) calls `createSourceTransform()` and returns the transformed code. Source maps are passed through via the webpack loader API (`this.callback`).

### Transport

Creates a `CortexTransport` instance on startup (port 0 for OS-assigned). The chosen port is made available to the browser via an injected inline script in the document head (through a custom `_document` or header injection). The browser then connects via standard `new WebSocket('ws://localhost:{port}')`.

## Component: Next.js Source Loader

**File:** `src/adapters/next-source-loader.ts`

~15 lines. Standard webpack loader that:
1. Receives source code and file path
2. Uses a module-level cached transform function (lazily initialized on first call from `createSourceTransform(projectRoot)`)
3. Returns transformed code + source map via `this.callback()`

The transform function is cached at module scope to avoid re-creating the factory closure on every file. `projectRoot` comes from loader options set by `withCortex()`.

```typescript
import { createSourceTransform } from './source-transform'
import type { LoaderContext } from 'webpack'

interface LoaderOptions { projectRoot: string }

let transform: ReturnType<typeof createSourceTransform> | null = null

export default function cortexSourceLoader(this: LoaderContext<LoaderOptions>, source: string) {
  const { projectRoot } = this.getOptions()
  if (!transform) transform = createSourceTransform(projectRoot)
  const result = transform(source, this.resourcePath)
  if (result) {
    this.callback(null, result.code, result.map ?? undefined)
  } else {
    this.callback(null, source)
  }
}
```

## Package Infrastructure

### Peer dependency change

Bump Vite peer dependency from `>=5.0.0` to `>=5.1.0`. The `server.hot` API was introduced in Vite 5.1. `server.ws` is deprecated in Vite 6.

### New sub-path exports

```json
{
  "exports": {
    ".": { "import": ..., "require": ... },
    "./vite": { "import": ..., "require": ... },
    "./next": { "import": ..., "require": ... }
  }
}
```

### New tsup entries

```typescript
defineConfig([
  // Existing main entry
  { entry: ['src/index.ts'], ... },
  // Vite adapter
  { entry: ['src/adapters/vite.ts'], outDir: 'dist/vite', external: ['vite'], ... },
  // Next.js adapter + loader
  { entry: ['src/adapters/next.ts', 'src/adapters/next-source-loader.ts'], outDir: 'dist/next', external: ['next', 'webpack'], ... },
])
```

### New dependencies

- `ws` — WebSocket server for CortexTransport (dev dependency, bundled by tsup)
- `@types/ws` — TypeScript types (dev dependency)

### Note on bundled dependencies

`@babel/parser`, `magic-string`, and `ws` are all in `devDependencies` intentionally. tsup bundles them into the output — they are not listed as externals, so the compiled `dist/` files include their code. Consumers do not need to install them separately.

### External modules

`vite`, `next`, `webpack`, `tailwindcss` are externalized — they are optional peer dependencies provided by the user's project.

## Test Strategy

### CortexTransport (`tests/core/transport.test.ts`)

Real HTTP server + WebSocket client tests. Uses `vi.useFakeTimers()` for heartbeat tests with a short configurable interval.

- Connect and receive messages
- Send message from client, verify handler receives it
- Multiple clients, verify broadcast reaches all
- Client disconnect, verify cleanup from set
- Heartbeat: advance fake timers by interval, verify dead connections removed
- Malformed JSON message doesn't crash server
- `dispose()` resolves after clean teardown (server closed, no open handles)

### Vite adapter (`tests/adapters/vite.test.ts`)

Plugin hook isolation tests with mocked Vite `ResolvedConfig` and `ViteDevServer`:
- `transform` returns instrumented code + source map for `.tsx` files
- `transform` returns null for non-JSX, `/node_modules/`, production build
- `transformIndexHtml` injects `<script>` tag referencing virtual module in dev
- `transformIndexHtml` returns unchanged HTML in production
- Virtual module `resolveId` resolves `/@cortex/client.js`
- Virtual module `load` returns client script with `import.meta.hot` usage
- Source maps from transform contain valid mappings

### Next.js adapter (`tests/adapters/next.test.ts`)

Config wrapper tests:
- `withCortex()` adds webpack loader rule for `.jsx`/`.tsx`
- `withCortex()` preserves existing webpack config (calls original `webpack()` function)
- `withCortex()` returns original config unchanged in production
- Webpack loader rule excludes `/node_modules/`

### Next.js source loader (`tests/adapters/next-source-loader.test.ts`)

- Transforms JSX source, returns code + map via callback
- Returns original source unchanged for non-JSX files
- Caches transform function across multiple calls (same factory instance)
- Passes projectRoot from loader options

## Out of Scope

- CLI (`cortex-editor init`) — deferred, not needed for Phase 2
- Postinstall script — deferred with CLI
- Browser-side channel implementation (`src/browser/channel.ts`) — Phase 2
- Browser bundle content — Phase 2 (virtual module script tag is injected, but the browser overlay bundle doesn't exist yet; the virtual module sets up the HMR messaging bridge)
- Per-client WebSocket targeting — broadcast is sufficient for all planned use cases
- `FrameworkAdapter` implementation — interface exists in types.ts but adapters use framework-idiomatic APIs; will be revisited in Phase 2
