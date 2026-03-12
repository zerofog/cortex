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

- **Vite** has `server.ws` — a built-in WebSocket connection used for HMR. We send custom `cortex:msg` events over this existing channel. No extra server needed.
- **Next.js** has no equivalent bidirectional channel. `CortexTransport` creates a standalone WebSocket server on `/__cortex_ws` using the `ws` library, attached to the same HTTP server via `noServer` upgrade handling.

From downstream code's perspective (Phase 4 edit pipeline), both adapters expose a `ServerChannel` — the transport difference is invisible.

## Interface Change: ServerChannel

The Phase 1a `ServerChannel` interface includes per-client addressing (`clientId` parameter on `send` and `onMessage`). This is unnecessary:

- Vite's `server.ws` broadcasts — no per-client targeting available
- The intended UX is single-tab (one designer, one browser tab)
- Even in multi-tab scenarios, broadcast is acceptable — messages include `editId` for correlation
- Phase 7 (MCP) also works with broadcast

Simplified interface:

```typescript
export interface ServerChannel {
  send(msg: ServerToBrowser): void
  onMessage(handler: (msg: BrowserToServer) => void): void
  broadcast(msg: ServerToBrowser): void
  dispose(): void
}
```

`send()` and `broadcast()` have identical semantics. Both are retained for intent clarity in calling code.

## Component: Vite Adapter

**File:** `src/adapters/vite.ts`
**Export:** `cortexEditor(options?): Plugin`

Usage:
```typescript
import { cortexEditor } from 'cortex-editor/vite'

export default defineConfig({
  plugins: [react(), cortexEditor()],
})
```

The plugin uses three Vite hooks:

### `transform(code, id)`

- Guards: skip if `config.command !== 'serve'`, if not `.jsx`/`.tsx`, if inside `/node_modules/`
- Calls `createSourceTransform(config.root)` (created once in `configResolved`)
- Returns `{ code, map }` — source maps from magic-string pass through to Vite's pipeline
- Must run before React's JSX compilation, so the plugin uses `enforce: 'pre'`

### `transformIndexHtml`

- Order: `'pre'` (before other plugins)
- Guards: skip if `config.command !== 'serve'`
- Injects a `<script>` before `</head>` that:
  - Listens for `cortex:msg` events via `import.meta.hot.on()`
  - Exposes `window.__cortex_send__` for browser-to-server messages
  - Loads the Cortex browser bundle (Phase 2) via a second script tag

### `configureServer(server)`

- Registers `server.ws.on('cortex:msg', handler)` for browser-to-server messages
- Listens for HMR update completion events
- Exposes adapter handle for downstream code

### Adapter handle

`cortexEditor()` returns a standard Vite `Plugin` but also exposes an adapter object via a module-level accessor:

```typescript
export function cortexEditor(options?): Plugin { ... }
export function getChannel(): ServerChannel  // available after configureServer
export function onHMRUpdate(cb: (files: string[]) => void): () => void
```

## Component: CortexTransport

**File:** `src/core/transport.ts`
**Export:** `class CortexTransport implements ServerChannel`

Standalone WebSocket server for frameworks without built-in bidirectional channels.

### Mounting

Uses `noServer` mode on `WebSocketServer`. Attaches to the HTTP server's `upgrade` event and only handles requests where `req.url === '/__cortex_ws'`. All other upgrade requests pass through (preserving Next.js HMR, webpack-dev-server, etc.).

### Connection lifecycle

1. Client connects to `ws://localhost:{port}/__cortex_ws`
2. Added to `Set<WebSocket>`
3. Messages parsed as JSON, dispatched to registered handlers
4. On close, removed from set
5. Malformed messages silently ignored (no server crash)

### Heartbeat

- Pings all clients every 30 seconds
- Clients that aren't in `OPEN` state are removed
- Prevents zombie connections from accumulating over long dev sessions

### Disposal

`dispose()` clears the heartbeat interval, closes the WebSocket server, and removes the upgrade listener from the HTTP server.

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

Adds a webpack rule for `.jsx`/`.tsx` files (excluding `node_modules`). The loader (`next-source-loader.ts`) calls `createSourceTransform()` and returns the transformed code. Source maps are passed through via the webpack loader API (`this.callback`).

### Transport

Creates a `CortexTransport` instance internally. Mounts it on the Next.js dev server's HTTP server. The browser connects via standard `WebSocket` API.

## Component: Next.js Source Loader

**File:** `src/adapters/next-source-loader.ts`

~10 lines. Standard webpack loader that:
1. Receives source code and file path
2. Calls `createSourceTransform(projectRoot)(code, resourcePath)`
3. Returns transformed code + source map via `this.callback()`

`projectRoot` comes from loader options, set by `withCortex()`.

## Package Infrastructure

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
  { entry: ['src/adapters/vite.ts'], outDir: 'dist/vite', ... },
  // Next.js adapter
  { entry: ['src/adapters/next.ts', 'src/adapters/next-source-loader.ts'], outDir: 'dist/next', ... },
])
```

### New dependencies

- `ws` — WebSocket server for CortexTransport (runtime dependency)
- `@types/ws` — TypeScript types (dev dependency)

### External modules

`vite`, `next`, `webpack` remain externalized (optional peer dependencies).

## Test Strategy

### CortexTransport (`tests/core/transport.test.ts`)

Real HTTP server + WebSocket client tests:
- Connect and receive messages
- Send message from client, verify handler receives it
- Multiple clients, verify broadcast reaches all
- Client disconnect, verify cleanup
- Heartbeat removes dead connections
- Malformed message doesn't crash server
- `dispose()` tears down cleanly

### Vite adapter (`tests/adapters/vite.test.ts`)

Plugin hook isolation tests with mocked Vite types:
- `transform` returns instrumented code + source map for `.tsx` files
- `transform` returns null for non-JSX, node_modules, production
- `transformIndexHtml` injects script tag in dev
- `transformIndexHtml` returns unchanged HTML in production
- Source maps from transform are valid

### Next.js adapter (`tests/adapters/next.test.ts`)

Config wrapper tests:
- `withCortex()` adds webpack loader rule
- `withCortex()` preserves existing webpack config
- `withCortex()` returns original config in production
- Webpack loader rule targets correct file extensions
- Webpack loader rule excludes node_modules

### Next.js source loader (`tests/adapters/next-source-loader.test.ts`)

- Transforms JSX source and returns code + map
- Returns original source for non-JSX files
- Passes projectRoot correctly

## Out of Scope

- CLI (`cortex-editor init`) — deferred, not needed for Phase 2
- Postinstall script — deferred with CLI
- Browser-side channel implementation (`src/browser/channel.ts`) — Phase 2
- Browser bundle injection content — Phase 2 (script tag is injected, but bundle doesn't exist yet)
- Per-client WebSocket targeting — broadcast is sufficient for all planned use cases
