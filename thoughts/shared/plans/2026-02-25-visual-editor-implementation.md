# Visual Editor — Implementation Plan (Internal Tool)

## Overview

Build the standalone visual editor as an internal dev tool within the cortex repo. Takes the architecture from `thoughts/shared/plans/2026-02-25-visual-editor-standalone-product.md`, applies the internal-tool review's scope reductions (~40% cut), and addresses all three CRITICAL findings (IC1-IC3) and four HIGH findings (IH1-IH4) from the consolidated review.

**Predecessor**: `thoughts/shared/plans/2026-02-25-visual-editor-standalone-product.md` (architecture + two review passes)

**Target stack**: React + Mantine (~80%), Tailwind (~17%), CSS Modules (~3%). Single known app. Localhost only.

## Current State Analysis

### What Exists (in cortex repo)

| File | Lines | Reusability |
|---|---|---|
| `scripts/visual-inspect.js` | 380 | **High** — core inspector logic. Needs IC2 fix (fiber traversal), IH1 fix (portal testId), IH3 fix (Alt+Click → mode toggle), and postMessage bridge |
| `scripts/visual-toolbar.js` | 708 | **Partial** — pure functions (`buildTokenMaps`, `reverseTokenLookup`, `detectStyleOrigin`, `finalizeDiff`) copy directly. Browser IIFE is replaced by panel.js. Needs IC1 fix (style tag overrides) baked into new panel |
| `scripts/__tests__/visual-inspect.test.ts` | 299 | **High** — 25 tests carry over, add tests for new fiber traversal + portal fix |
| `scripts/__tests__/visual-toolbar.test.ts` | 378 | **High** — 22 tests for pure functions carry over |
| `.claude/commands/visual.md` | 144 | **Replace** — new slash command launches sidecar instead of Playwright MCP |

### What Needs Building

| Component | Complexity | Notes |
|---|---|---|
| `package.json` + `tsconfig.json` + `tsup.config.ts` | Low | Project scaffold |
| `src/server.ts` — Express + proxy + WebSocket | Medium | Core infrastructure |
| `src/inject.ts` — HTML injection via responseInterceptor | Low | Pattern documented in arch plan |
| `src/state.ts` — Finalization state machine | Medium | With IC3 timeout fix |
| `src/client/shell.html` — Iframe + Shadow DOM layout | Medium | Parent frame |
| `src/client/inspector.js` — Adapted from visual-inspect.js | Medium | IC2, IH1, IH3 fixes + postMessage |
| `src/client/panel.tsx` — Preact panel with batch editing | High | IC1 (<style> tag strategy), IH2 (per-side), Preact + Open Props, Shadow DOM |
| `src/client/nav-blocker.js` — Navigation blocking | Medium | pushState/popstate/link interception |
| `src/bin.ts` — CLI entry | Low | parseArgs + open browser |
| `templates/visual.md` — Slash command (simplified) | Low | Auto-trigger finalization |
| Tests for all new code | Medium | Server, panel, nav-blocker, integration |

## Desired End State

A working internal dev tool where:

1. User runs `node visual-editor/src/bin.ts --target localhost:3000` (or `/visual` slash command)
2. Browser opens `localhost:4000` — shell with iframe (app) + panel (editor)
3. User clicks "Start Editing" — inspector activates with mode toggle (not Alt+Click)
4. User clicks elements — panel shows per-side spacing, radius, gap with token buttons
5. CSS overrides via `<style>` tag survive React re-renders and HMR
6. User clicks "Apply to Code" — sidecar auto-triggers Claude — source edits — HMR — overrides clear
7. State machine has 120s timeout recovery, WAL for crash recovery
8. Portal elements (Mantine modals/drawers) produce correct selectors

### Verification

- All existing 47 tests pass (25 inspector + 22 toolbar)
- New tests pass for: server proxy, HTML injection, WebSocket routing, state machine, panel, nav-blocker
- Full integration: launch sidecar against a static test page — inject — select — edit token — see override — finalize — verify source edit
- Manual: test with actual app on localhost:3000

## What We're NOT Doing

- Multi-framework support (Vue, Svelte, Angular)
- npm publishing / `npx` distribution
- Bearer token auth on HTTP endpoints
- Lease-based finalization / fencing tokens
- Instance-level editing infrastructure
- Multi-React-version detection / `_debugStack` parsing
- `sessionStorage` override backup (parent frame memory + WAL is sufficient)
- Service Worker handling
- Framework auto-detection
- Tailwind CSS parsing for token maps
- Color editing (v2)
- Font size/weight editing (v2)
- MCP server interface (v2)

## Implementation Approach

Build bottom-up: infrastructure first, then browser scripts, then integration. Each phase produces a testable artifact. Critical review fixes (IC1-IC3, IH1-IH4) are embedded in the phase where they naturally belong — not bolted on afterward.

**Naming decision**: Use `cortex` as the consistent name everywhere. The `__zerofog` prefix in CSS/DOM attributes stays (it's already in existing code and tests), but user-facing naming is `cortex`.

**Directory**: Everything goes under `visual-editor/` within the cortex repo.

---

## Phase 1: Project Scaffold

### Overview
Set up the project structure, install dependencies, configure build tooling.

### Changes Required

#### 1. Directory Structure
Create:
```
visual-editor/
├── src/
│   ├── bin.ts                  # Phase 6
│   ├── server.ts               # Phase 2
│   ├── inject.ts               # Phase 2
│   ├── state.ts                # Phase 5
│   └── client/                 # Phases 3-5
│       ├── inspector.js        # Phase 3
│       ├── panel.tsx           # Phase 4 (Preact + Open Props)
│       ├── shell.html          # Phase 3
│       └── nav-blocker.js      # Phase 5
├── templates/
│   └── visual.md               # Phase 6
├── tests/
│   ├── server.test.ts          # Phase 2
│   ├── inject.test.ts          # Phase 2
│   ├── inspector.test.ts       # Phase 3 (carry over + expand)
│   ├── panel.test.ts           # Phase 4
│   ├── state.test.ts           # Phase 5
│   └── nav-blocker.test.ts     # Phase 5
├── test-fixtures/
│   └── test-app.html           # Static HTML page for integration testing
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

#### 2. `package.json`
**File**: `visual-editor/package.json`

```json
{
  "name": "cortex-visual-editor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "cortex-visual-editor": "dist/bin.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/bin.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepare": "npm run build"
  },
  "dependencies": {
    "express": "^5.1.0",
    "http-proxy-middleware": "^3.0.3",
    "preact": "^10.25.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@testing-library/preact": "^3.2.0",
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.13",
    "happy-dom": "^15.0.0",
    "open-props": "^2.0.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

#### 3. `tsconfig.json`
**File**: `visual-editor/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### 4. `tsup.config.ts`
**File**: `visual-editor/tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig([
  // Server — Node ESM
  {
    entry: ['src/bin.ts', 'src/server.ts'],
    format: ['esm'],
    target: 'node20',
    clean: true,
    sourcemap: true,
    dts: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Client — Preact panel bundled as IIFE for Shadow DOM injection
  // inspector.js and nav-blocker.js also bundled for consistent dist/client/ serving
  {
    entry: [
      'src/client/panel.tsx',
      'src/client/inspector.js',
      'src/client/nav-blocker.js',
    ],
    format: ['iife'],
    target: 'es2020',
    outDir: 'dist/client',
    sourcemap: true,
    esbuildOptions(options) {
      options.jsxFactory = 'h';
      options.jsxFragment = 'Fragment';
    },
  },
]);
```

#### 5. Test Fixture — Static Test App
**File**: `visual-editor/test-fixtures/test-app.html`

A minimal HTML page with Mantine-like CSS variables and a few styled elements. Used for integration testing without requiring the real app.

```html
<!DOCTYPE html>
<html>
<head>
  <title>Cortex Test App</title>
  <style>
    :root {
      --mantine-spacing-xs: 8px;
      --mantine-spacing-sm: 12px;
      --mantine-spacing-md: 16px;
      --mantine-spacing-lg: 20px;
      --mantine-spacing-xl: 24px;
      --mantine-radius-xs: 4px;
      --mantine-radius-sm: 6px;
      --mantine-radius-md: 8px;
      --mantine-radius-lg: 12px;
      --mantine-radius-xl: 16px;
    }
    .card {
      padding: var(--mantine-spacing-lg);
      border-radius: var(--mantine-radius-md);
      background: #fff;
      border: 1px solid #e0e0e0;
      margin: var(--mantine-spacing-md);
    }
    .card-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .card-body { font-size: 14px; color: #666; }
    .flex-row { display: flex; gap: var(--mantine-spacing-md); padding: var(--mantine-spacing-lg); }
    .btn {
      padding: var(--mantine-spacing-sm) var(--mantine-spacing-lg);
      border-radius: var(--mantine-radius-sm);
      border: none; background: #228be6; color: #fff; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="flex-row">
    <div class="card" data-testid="dashboard-card">
      <div class="card-title">Dashboard</div>
      <div class="card-body">Some content here</div>
      <button class="btn" data-testid="action-btn">Click me</button>
    </div>
    <div class="card" data-testid="stats-card">
      <div class="card-title">Stats</div>
      <div class="card-body">More content</div>
    </div>
  </div>
</body>
</html>
```

### Success Criteria

#### Automated Verification
- [x] `cd visual-editor && npm install` completes without errors
- [x] `npm run typecheck` passes (no source files yet, but config is valid)
- [x] `npm test` runs (no tests yet, exits cleanly)
- [x] Directory structure matches spec

#### Manual Verification
- [ ] `test-fixtures/test-app.html` opens in browser and renders correctly

**Implementation Note**: After completing this phase, pause for confirmation before proceeding.

---

## Phase 2: Sidecar Server Core

### Overview
Build the Express server with reverse proxy, HTML injection, WebSocket routing, and HTTP API endpoints. This is the infrastructure layer everything else depends on.

### Key Decisions
- **Express 5** (stable, modern async error handling)
- **Loopback binding only** (`127.0.0.1`, not `0.0.0.0`) — minimal security per internal-tool review
- **Host header validation** — reject requests where Host doesn't match expected `localhost:PORT`
- **`POST /api/diff`** (not GET) — fixes IM1 from review (GET should not mutate state)
- **`noServer: true`** for WebSocket — manual upgrade routing per architecture plan

### Changes Required

#### 1. Server Core
**File**: `visual-editor/src/server.ts`

Express server with:
- Reverse proxy to target dev server via `http-proxy-middleware`
- `responseInterceptor` for HTML injection (delegates to `inject.ts`)
- `noServer: true` WebSocket server on `/__zerofog` path
- Manual `server.on('upgrade')` routing: `/__zerofog` to editor WS, everything else to proxy (HMR passthrough)
- API routes under `/__zerofog/api/`:
  - `GET /health` — returns 200 when ready
  - `GET /status` — session state (editing, page, changeCount, diffState, uptime, wsConnected)
  - `POST /diff` — receives diff from Claude, advances state machine (replaces GET from arch plan)
  - `POST /complete` — Claude reports per-change results, transitions state
  - `POST /shutdown` — graceful shutdown
- Serves `shell.html` at `/__zerofog/shell`
- Serves client scripts at `/__zerofog/client/*`
- Redirects top-level `/` to `/__zerofog/shell` (via `Sec-Fetch-Dest: document` check)
- PID file at `.cortex/sidecar.pid` (project-relative)
- `proxyError` handler for `ECONNREFUSED` — serves friendly "Dev server restarting..." page
- Host header validation middleware (reject non-localhost Host values)
- Bind to `127.0.0.1` only

Key implementation detail — the WebSocket routing:

```typescript
// Manual upgrade routing — the canonical ws v8 pattern
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url!, `http://${req.headers.host}`);
  if (pathname === '/__zerofog') {
    editorWss.handleUpgrade(req, socket, head, (ws) => {
      editorWss.emit('connection', ws, req);
    });
  } else {
    // Forward everything else to dev server for HMR
    proxy.upgrade(req, socket, head);
  }
});
```

Key implementation detail — session ID injection:

```typescript
// Generate session ID at boot
const SESSION_ID = crypto.randomUUID();

// Serve client scripts from dist/client/ (all bundled by tsup — panel.tsx as IIFE, others passthrough)
app.get('/__zerofog/client/:script', (req, res) => {
  const scriptPath = path.join(__dirname, '../dist/client', req.params.script);
  let content = fs.readFileSync(scriptPath, 'utf8');
  content = content.replace('__SESSION_ID__', SESSION_ID);
  content = content.replace('__SIDECAR_ORIGIN__', `http://localhost:${port}`);
  res.type('application/javascript').send(content);
});
```

#### 2. HTML Injection
**File**: `visual-editor/src/inject.ts`

Separated from server.ts for testability. Exports a function that:
- Takes HTML string
- Injects `<script>` tags for inspector.js and nav-blocker.js before `</body>`
- Returns modified HTML

```typescript
export function injectScripts(html: string): string {
  const scripts = `
    <script src="/__zerofog/client/inspector.js"></script>
    <script src="/__zerofog/client/nav-blocker.js"></script>
  `;
  // Prefer </body> injection. Fall back to end-of-string if no </body>.
  if (html.includes('</body>')) {
    return html.replace('</body>', scripts + '</body>');
  }
  return html + scripts;
}
```

The `responseInterceptor` in server.ts calls this function. It also:
- Strips `content-security-policy`, `content-security-policy-report-only`, and `x-frame-options` headers from HTML responses
- Skips injection for non-HTML responses (checks `content-type`)
- Skips injection for responses >5MB (safety valve)

#### 3. Server Lifecycle
**Within `server.ts`**:

**Startup**:
1. Check for existing PID file. If found, verify process alive via `kill(pid, 0)`, then hit `/api/health`. If another sidecar is running, print message and exit 0
2. Check target port available — fail fast on `EADDRINUSE`
3. Poll target dev server with TCP connect (not HTTP) — retry with exponential backoff up to 30s — if unreachable, serve "Waiting for dev server..." page in iframe
4. Write PID file. Start accepting connections.

**Shutdown** (`SIGTERM`, `SIGINT`, or `POST /api/shutdown`):
1. Send WebSocket close frame (code 1001) to all clients
2. `server.close()` — stop new connections, 5s timeout for in-flight
3. Delete PID file
4. Delete `.cortex/pending-diff.json` only if state is `idle`
5. Exit 0

### Tests

**File**: `visual-editor/tests/server.test.ts`

- Proxy forwards requests to target (mock HTTP server)
- HTML responses get script tags injected
- Non-HTML responses pass through unmodified
- CSP and X-Frame-Options headers stripped from HTML responses
- `Sec-Fetch-Dest: document` requests redirect to shell
- `Sec-Fetch-Dest: iframe` requests get proxied normally
- `/__zerofog/api/health` returns 200
- `/__zerofog/api/status` returns session state
- `/__zerofog/api/shutdown` triggers graceful shutdown
- Host header validation rejects non-localhost requests
- WebSocket upgrade to `/__zerofog` connects to editor WS
- WebSocket upgrade to other paths forwards to target

**File**: `visual-editor/tests/inject.test.ts`

- Injects before `</body>` when present
- Appends to end when no `</body>`
- Handles empty string
- Handles HTML without body tag
- Does not double-inject (idempotent check)

### Success Criteria

#### Automated Verification
- [ ] `npm test` — all server and injection tests pass
- [ ] `npm run typecheck` — no type errors
- [ ] Launch server against test-fixtures/test-app.html served by a simple HTTP server — verify HTML injection works
- [ ] WebSocket connection to `/__zerofog` succeeds
- [ ] Non-zerofog WebSocket upgrade is forwarded

#### Manual Verification
- [ ] Open `localhost:4000` — redirects to `/__zerofog/shell` (shell not built yet, but redirect works)
- [ ] Open `localhost:4000/some-path` from iframe context — proxied HTML includes injected scripts
- [ ] Kill dev server — proxy shows "Dev server restarting..." instead of raw 502

**Implementation Note**: Pause after this phase for manual verification.

---

## Phase 3: Shell & Inspector Port

### Overview
Build the shell page (iframe + panel placeholder) and port the inspector with three critical fixes: fiber traversal (IC2), portal-aware testId (IH1), and mode toggle replacing Alt+Click (IH3). Add postMessage bridge for cross-frame communication.

### Key Decisions
- **Mode toggle over Alt+Click** — click "Select" button in panel to enter selection mode, bare clicks select elements. More discoverable, no macOS conflicts.
- **Single fiber traversal strategy** — check for `_debugOwner` first (React 18), fall back to `fiber.return` tag filtering (React 19+). Since this is internal and we control React version, only one path will execute at runtime.
- **PostMessage with origin + sessionId validation** — per architecture plan

### Changes Required

#### 1. Shell Page
**File**: `visual-editor/src/client/shell.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Cortex Visual Editor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    .cortex-shell {
      display: flex;
      height: 100vh;
      width: 100vw;
    }
    .cortex-app-frame {
      flex: 1;
      border: none;
      height: 100%;
    }
    .cortex-panel-container {
      width: 320px;
      min-width: 320px;
      height: 100%;
      border-left: 1px solid #e0e0e0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div class="cortex-shell">
    <iframe class="cortex-app-frame" src="/"></iframe>
    <div class="cortex-panel-container" id="panel-mount"></div>
  </div>
  <script src="/__zerofog/client/panel.js"></script>
</body>
</html>
```

The panel.js script attaches a Shadow DOM root to `#panel-mount` and renders the editing UI inside it. This isolates panel styles from app styles completely.

#### 2. Inspector Port
**File**: `visual-editor/src/client/inspector.js`

Port from `scripts/visual-inspect.js` with these changes:

**IC2 fix — fiber traversal**:
Replace `_debugOwner` chain walk with a version-adaptive approach:

```javascript
function walkComponentChain(fiber) {
  var chain = [];
  var depth = 0;

  // Strategy A: _debugOwner (React 18.x and earlier)
  if (fiber._debugOwner) {
    var owner = fiber._debugOwner;
    while (owner && depth < MAX_CHAIN_DEPTH) {
      var name = getComponentName(owner);
      if (name) chain.push(name);
      owner = owner._debugOwner;
      depth++;
    }
    return chain;
  }

  // Strategy B: fiber.return filtered by tag (React 19+)
  // Tag 0 = FunctionComponent, Tag 1 = ClassComponent
  var current = fiber.return;
  while (current && depth < MAX_CHAIN_DEPTH) {
    if ((current.tag === 0 || current.tag === 1) && current.type) {
      var name = current.type.displayName || current.type.name;
      if (name) chain.push(name);
    }
    current = current.return;
    depth++;
  }
  return chain;
}
```

This checks `_debugOwner` first (cheaper, more accurate when available), falls back to `fiber.return` tag filtering. Both strategies are simple and we control the React version.

**IH1 fix — portal-aware testId**:
After finding testId via `element.closest('[data-testid]')`, verify the testId element is a fiber ancestor of the selected element:

```javascript
function resolveSource(element, fiberKeys) {
  // ... existing testId lookup ...
  if (testIdEl && testIdEl !== element) {
    // Verify testId element is a fiber ancestor, not just a DOM ancestor
    // (portaled elements have different DOM vs fiber parents)
    if (!isFiberAncestor(element, testIdEl, fiberKeys)) {
      testId = null; // Discard — DOM ancestor but not fiber ancestor
    }
  }
  // ... rest of resolution ...
}

function isFiberAncestor(child, potentialAncestor, fiberKeys) {
  var keys = fiberKeys || findReactFiberKeys(child);
  var childFiber = keys.length > 0 ? child[keys[0]] : null;
  var ancestorKeys = findReactFiberKeys(potentialAncestor);
  var ancestorFiber = ancestorKeys.length > 0
    ? potentialAncestor[ancestorKeys[0]] : null;
  if (!childFiber || !ancestorFiber) return true; // Can't verify — keep testId

  // Walk child's fiber.return chain looking for ancestor's fiber
  var current = childFiber.return;
  var depth = 0;
  while (current && depth < 50) {
    if (current.stateNode === potentialAncestor) return true;
    current = current.return;
    depth++;
  }
  return false;
}
```

**IH3 fix — mode toggle instead of Alt+Click**:
Replace `e.altKey` check with a mode-based approach. The inspector has two modes:
- **Browse mode** (default): hover shows highlight, clicks go through to the app normally
- **Select mode**: hover shows highlight, clicks select elements (no Alt required)

Mode is toggled by postMessage from the panel ("Select Element" button).

```javascript
var selectMode = false;

function handleClick(e) {
  if (!active || !selectMode) return;
  e.stopPropagation();
  e.preventDefault();
  // ... existing selection logic without the e.altKey check ...
  // After selection, stay in select mode
}

// Panel toggles select mode via postMessage
function handleMessage(e) {
  // ... origin/sessionId validation ...
  if (e.data.type === 'zerofog:toggle-select') {
    selectMode = !selectMode;
    window.parent.postMessage({
      type: 'zerofog:select-mode-changed',
      version: 1,
      sessionId: SESSION_ID,
      payload: { active: selectMode }
    }, SIDECAR_ORIGIN);
  }
}
```

**PostMessage bridge**:
Add `window.parent.postMessage()` alongside existing `CustomEvent` dispatch for all events (`selected`, `deselected`, `ready`). Add `window.addEventListener('message')` for incoming commands (`preview`, `revert`, `get-token-maps`, `toggle-select`, `activate-inspector`, `deactivate-inspector`, `rehydrate`).

**Element reference map**:
Store selected elements in `Map<number, Element>` keyed by `selectionId`. Panel sends `selectionId` in preview/revert commands. Inspector looks up the element — no `elementFromPoint` re-finding (fixes IH4).

#### 3. Carry Over & Expand Tests
**File**: `visual-editor/tests/inspector.test.ts`

Carry over all 25 existing tests from `scripts/__tests__/visual-inspect.test.ts`. Add:

- `walkComponentChain` with `_debugOwner` (React 18 path)
- `walkComponentChain` with `fiber.return` + tags (React 19 path)
- `walkComponentChain` with neither (returns empty array)
- `isFiberAncestor` — child is fiber descendant of ancestor
- `isFiberAncestor` — portaled child (DOM descendant but NOT fiber descendant) returns false
- `isFiberAncestor` — no fibers available returns true (conservative)
- `resolveSource` discards testId when portal detected
- Select mode toggle via message handling
- `selectionId` to element map stores and retrieves correctly

### Success Criteria

#### Automated Verification
- [ ] All 25 original inspector tests pass (adapted for new fiber traversal)
- [ ] New fiber traversal tests pass (both React 18 and 19 paths)
- [ ] Portal testId tests pass
- [ ] Select mode tests pass
- [ ] `npm run typecheck` passes

#### Manual Verification
- [ ] Open `localhost:4000` — shell renders with iframe showing proxied app + empty panel area
- [ ] Inspector scripts injected into iframe (check Network tab)
- [ ] Hover over elements in iframe — blue highlight overlay appears
- [ ] Console shows `zerofog:ready` postMessage from inspector

**Implementation Note**: Pause after this phase for manual verification.

---

## Phase 4: Panel & Token Editing

### Overview
Build the editing panel using Preact + Open Props in Shadow DOM: token buttons with per-side spacing control (IH2), `<style>` tag override strategy (IC1), batch editing with diff accumulation. Preact manages 7 reactive state dimensions across ~5 components; Open Props provides design tokens for consistent styling. This is the highest-complexity phase.

### Key Decisions
- **Shadow DOM (closed)** — panel renders inside `#panel-mount` via `attachShadow({ mode: 'closed' })`. Closed mode prevents target app scripts from traversing into panel DOM (defense-in-depth alongside same-origin iframe boundary).
- **Preact + Open Props** — Preact (~4KB gzipped) for reactive rendering of ~70 interactive elements across 5 components; Open Props (~2KB) for design tokens. Architecture review ([panel component options](../research/2026-02-25-panel-component-options.md)) found imperative DOM estimate was 10-20x wrong — existing toolbar.js is 708 lines for a simpler UI. Panel has 7 state dimensions requiring reactive management. Bundled as IIFE via tsup (no additional build infrastructure needed).
- **`<style>` tag overrides** (IC1) — inject a `<style id="__zerofog_overrides__">` into the iframe's `<head>`. CSS rules target elements by `data-testid` or generated `data-cortex-id` attribute. Survives React reconciliation and HMR.
- **Per-side spacing** (IH2) — panel shows individual sides (top/right/bottom/left) under padding and margin categories. Each side maps to a specific CSS property and Mantine prop.
- **Token maps from iframe** — panel requests maps via postMessage, caches them

### Changes Required

#### 1. Panel UI
**File**: `visual-editor/src/client/panel.tsx`

Structure:
```
Shadow DOM root
|- <style> (panel styles — isolated)
|- Header: "Cortex Visual Editor"
|- Mode section: [Browse] [Select Element] mode toggle buttons
|- Status: "Navigate to a page, then click Select Element"
|
|- (When element selected):
|   |- Selection info: "Card [data-testid=dashboard-card]"
|   |- Component chain: "Card > Paper > Box"
|   |
|   |- Padding section:
|   |   |- "All" row: [xs] [sm] [md] [lg] [xl]
|   |   |- "Top" row: [xs] [sm] [md] [lg] [xl]
|   |   |- "Right" row: ...
|   |   |- "Bottom" row: ...
|   |   |- "Left" row: ...
|   |
|   |- Margin section (same per-side structure)
|   |- Gap section (single row — gap has no sides)
|   |- Radius section (single row for v1)
|   |
|   |- Pending changes list: "2 changes"
|   |   |- "padding-top: md -> xl"
|   |   |- "border-radius: md -> lg"
|   |   |- [Undo] per change
|   |
|   |- Actions: [Apply to Code] [Discard All]
|
|- (When finalizing):
|   |- "Applying changes..." with progress
|
|- WebSocket status indicator (bottom)
```

**Preact component tree** — five components map to the UI structure above. The top-level `Panel` component manages all 7 state dimensions via hooks:

```tsx
import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

function Panel() {
  // 7 state dimensions (identified by architecture review)
  const [mode, setMode] = useState<'browse' | 'select'>('browse');
  const [selection, setSelection] = useState(null);
  const [tokenMaps, setTokenMaps] = useState(null);
  const [activeTokens, setActiveTokens] = useState({});
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [diffState, setDiffState] = useState<'idle' | 'applying'>('idle');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');

  useEffect(() => { /* postMessage listener for inspector events */ }, []);
  useEffect(() => { /* WebSocket connection to sidecar */ }, []);

  return (
    <div class="cortex-panel">
      <header>Cortex Visual Editor</header>
      <ModeToggle mode={mode} onToggle={setMode} />
      <StatusText mode={mode} selection={selection} />
      {selection && tokenMaps && (
        <>
          <SelectionInfo selection={selection} />
          <Section title="Padding" defaultOpen>
            {['All', 'Top', 'Right', 'Bottom', 'Left'].map(side => (
              <TokenGroup
                label={side}
                property={side === 'All' ? 'padding' : `padding-${side.toLowerCase()}`}
                tokens={['xs', 'sm', 'md', 'lg', 'xl']}
                activeToken={activeTokens[`padding-${side.toLowerCase()}`]}
                inherited={side !== 'All' ? activeTokens['padding'] : null}
                onSelect={handleTokenSelect}
              />
            ))}
          </Section>
          {/* Margin, Gap, Radius — same Section + TokenGroup pattern */}
          <ChangeList changes={pendingChanges} onUndo={handleUndo} />
          <ActionBar diffState={diffState} onApply={handleApply} onDiscard={handleDiscard} />
        </>
      )}
      <StatusBar wsStatus={wsStatus} />
    </div>
  );
}
```

Sub-components:
- `TokenGroup` — row of token buttons with `role="group"`, 4 visual states: default, hover, active/selected, inherited (when "All" is set and per-side inherits)
- `Section` — wraps `<details>/<summary>` for collapsible sections
- `ChangeList` — renders `pendingChanges` map with per-item undo buttons
- `ActionBar` — Apply to Code / Discard All, disabled states based on `diffState` and `pendingChanges.size`
- `StatusBar` — WebSocket connection indicator

**Shadow DOM mount** (runs once, before Preact render):

```tsx
const container = document.getElementById('panel-mount');
const shadow = container.attachShadow({ mode: 'closed' });

// Open Props tokens + panel styles, inlined at build time by tsup
const style = document.createElement('style');
style.textContent = PANEL_CSS;
shadow.appendChild(style);

const mount = document.createElement('div');
shadow.appendChild(mount);
render(h(Panel, {}), mount);
```

**Token maps**: On first element selection, panel sends `zerofog:get-token-maps` to inspector (inside iframe where CSS vars exist). Inspector builds maps lazily, responds with `zerofog:token-maps`. Panel caches for the session.

**Override strategy (IC1)**:
When user clicks a token button, panel sends `zerofog:preview` to inspector. Inspector applies the override by:

1. Assigning a `data-cortex-id="sel-{selectionId}"` attribute to the element (if no testId)
2. Building a CSS selector: `[data-testid="dashboard-card"]` or `[data-cortex-id="sel-1"]`
3. Updating the `<style id="__zerofog_overrides__">` tag with the rule

```javascript
// Inside inspector — handles preview command from panel
function applyOverride(selectionId, cssProperty, cssValue) {
  var element = elementMap.get(selectionId);
  if (!element) return;

  // Build selector
  var selector = element.getAttribute('data-testid')
    ? '[data-testid="' + element.getAttribute('data-testid') + '"]'
    : '[data-cortex-id="sel-' + selectionId + '"]';

  // Ensure element has the selector attribute
  if (!element.getAttribute('data-testid')) {
    element.setAttribute('data-cortex-id', 'sel-' + selectionId);
  }

  // Update stylesheet
  updateOverrideSheet(selector, cssProperty, cssValue);
}

function updateOverrideSheet(selector, property, value) {
  var sheet = document.getElementById('__zerofog_overrides__');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = '__zerofog_overrides__';
    sheet.setAttribute('data-zerofog-ui', 'true');
    document.head.appendChild(sheet);
  }

  // Parse existing rules, update or add
  var rules = parseOverrideRules(sheet.textContent);
  if (!rules[selector]) rules[selector] = {};
  rules[selector][property] = value;
  sheet.textContent = buildOverrideCSS(rules);
}

function buildOverrideCSS(rules) {
  var css = '';
  for (var selector in rules) {
    var props = [];
    for (var prop in rules[selector]) {
      props.push(prop + ': ' + rules[selector][prop] + ' !important');
    }
    css += selector + ' { ' + props.join('; ') + ' }\n';
  }
  return css;
}
```

**Per-side spacing (IH2)**:
The category `padding` expands into: `padding` (shorthand/all), `padding-top`, `padding-right`, `padding-bottom`, `padding-left`. Each maps to a Mantine prop:

```javascript
var PER_SIDE_MAP = {
  'padding': { css: 'padding', mantineProp: 'p' },
  'padding-top': { css: 'padding-top', mantineProp: 'pt' },
  'padding-right': { css: 'padding-right', mantineProp: 'pr' },
  'padding-bottom': { css: 'padding-bottom', mantineProp: 'pb' },
  'padding-left': { css: 'padding-left', mantineProp: 'pl' },
  'margin': { css: 'margin', mantineProp: 'm' },
  'margin-top': { css: 'margin-top', mantineProp: 'mt' },
  'margin-right': { css: 'margin-right', mantineProp: 'mr' },
  'margin-bottom': { css: 'margin-bottom', mantineProp: 'mb' },
  'margin-left': { css: 'margin-left', mantineProp: 'ml' },
};
```

**Diff accumulation**:
Panel maintains a `Map<string, Change>` where key is `{selectionId}-{cssProperty}`. Each change records:
```javascript
{
  selectionId: number,
  selector: string,        // testId or cortex-id selector
  componentChain: string[],
  cssProperty: string,      // 'padding-top', 'border-radius', etc
  previousToken: string,    // 'md' (or null if custom)
  newToken: string,         // 'xl'
  previousCssValue: string, // '16px'
  newCssValue: string,      // '24px'
  mantineProp: string,      // 'pt' — from PER_SIDE_MAP
  styleOrigin: object,      // from detectStyleOrigin
}
```

**"Apply to Code" button**:
Sends the accumulated diff to sidecar via WebSocket. Sidecar persists to WAL and auto-triggers finalization (IM2 — no terminal context switch).

#### 2. Carry Over Pure Functions
Copy `buildTokenMaps`, `reverseTokenLookup`, `detectStyleOrigin`, `finalizeDiff` from `scripts/visual-toolbar.js` into the inspector (they need to run inside the iframe where CSS vars exist). Fix the Tailwind regex (IM5) while porting:

```javascript
// Before (visual-toolbar.js:137)
// padding: /\bp[xytblr]?-(\S+)/,

// After — require valid Tailwind spacing values, handle responsive prefix
// padding: /(?:^|\s)(?:[\w]+:)?p[xytblr]?-(\d+(?:\.5)?|px|auto)/,
```

#### 3. Panel Tests
**File**: `visual-editor/tests/panel.test.ts`

Uses `@testing-library/preact` with `happy-dom` for component testing:

- Panel renders into Shadow DOM mount without affecting outer page
- TokenGroup: clicking a token button calls onSelect with correct property and token
- TokenGroup: active token has `aria-pressed="true"`
- TokenGroup: inherited token shows inherited visual state (when "All" is set)
- Section: toggles open/closed via details element
- ChangeList: renders pending changes with per-item undo buttons
- Per-side spacing: selecting "padding-top: xl" sends correct CSS property via postMessage
- Diff accumulation: multiple changes tracked by selectionId + property
- Undo removes a single change and sends revert to inspector
- "Apply to Code" sends accumulated diff via WebSocket
- "Discard All" clears all changes, overrides, and resets state
- Token maps cached after first postMessage response
- State transitions: selection → token editing → apply flow

**File**: `visual-editor/tests/toolbar-pure.test.ts`

Carry over all 22 tests from `scripts/__tests__/visual-toolbar.test.ts`. Add:
- Tailwind regex fix tests (responsive variants, false positive prevention)

### Success Criteria

#### Automated Verification
- [ ] All 22 original toolbar pure function tests pass
- [ ] New panel tests pass
- [ ] Tailwind regex fix tests pass
- [ ] `npm run typecheck` passes

#### Manual Verification
- [ ] Panel renders in Shadow DOM with correct layout
- [ ] Select mode toggle works — click "Select Element", then click an element in iframe
- [ ] Token buttons appear for selected element with per-side spacing
- [ ] Clicking a token button shows live preview in iframe
- [ ] Preview survives clicking around the app (React re-renders)
- [ ] Undo reverts a single change
- [ ] Discard All clears everything

**Implementation Note**: This is the highest-risk phase. Pause for thorough manual testing before proceeding.

---

## Phase 5: Finalization Pipeline

> **Detailed spec:** [2026-03-02-finalize-pipeline-spec.md](./2026-03-02-finalize-pipeline-spec.md) — covers input format (`AccumulatedDiff`), edit strategy dispatch per `StyleOrigin`, Claude integration, approval flow, MVP tiers, and architecture review findings.

### Overview
Build the state machine, write-ahead log, three-phase commit (simplified), auto-trigger finalization, and nav-blocker. This connects browser editing to source code changes.

### Key Decisions
- **120-second timeout** (IC3) — simple `setTimeout`, not lease-based
- **Auto-trigger** (IM2) — sidecar logs "Diff received" to stdout when diff arrives. Claude detects this (since it launched the sidecar) and auto-claims.
- **WAL** — `.cortex/pending-diff.json` persisted on diff receipt, deleted on completion
- **Report blast radius** (IM3) — Claude reports how many instances of a component exist before editing

### Changes Required

#### 1. State Machine
**File**: `visual-editor/src/state.ts`

```typescript
type DiffState = 'idle' | 'pending_diff' | 'processing';

interface StateManager {
  state: DiffState;
  diff: AccumulatedDiff | null;
  processingTimeout: NodeJS.Timeout | null;

  receiveDiff(diff: AccumulatedDiff): { ok: boolean; error?: string };
  claimDiff(): { ok: boolean; diff?: AccumulatedDiff; error?: string };
  complete(results: CompletionResults): { ok: boolean; error?: string };
  recover(): void; // Check for WAL on startup
}
```

Transitions:
- `idle -> pending_diff`: `receiveDiff()` — persists to `.cortex/pending-diff.json`, rejects if not idle (409)
- `pending_diff -> processing`: `claimDiff()` — starts 120s timeout, returns diff, rejects if not pending_diff (409)
- `processing -> idle`: `complete()` — clears timeout, deletes WAL, rejects if not processing (409)
- Timeout in `processing`: reverts to `pending_diff`, logs warning, notifies browser via WebSocket

**Crash recovery**: On startup, check for `.cortex/pending-diff.json`. If found, resume in `pending_diff` state and notify browser.

#### 2. Auto-Trigger Finalization
**Within `server.ts`** — when the state machine receives a diff and transitions to `pending_diff`:

The sidecar logs to stdout:
```
[cortex] Diff received (3 changes). Ready for finalization.
```
Claude Code detects this output since it launched the sidecar as a background process. Claude then claims the diff via `POST /api/diff` and proceeds with the finalization flow automatically.

#### 3. Three-Phase Commit (Simplified)
Integrated into state machine + WebSocket messages:

**Phase 1**: Browser sends diff via WS. Sidecar persists to WAL, ACKs browser. Browser keeps overrides visible. Panel shows "Changes sent. Applying..."

**Phase 2**: Claude edits source. `POST /api/complete` with per-change results. Sidecar pushes `edit-complete` to browser via WebSocket.

**Phase 3**: Browser receives `edit-complete`. For successful changes: wait for HMR (detect via sidecar forwarding HMR WebSocket activity signal). Clear CSS overrides for applied changes. For failed changes: re-apply CSS overrides, show "N changes need attention: [reasons]."

HMR detection: sidecar observes traffic on the proxied HMR WebSocket. When it sees HMR messages after sending `edit-complete`, it pushes `zerofog:hmr-detected` to the browser. The browser then clears overrides. If no HMR within 5s, clear overrides anyway (the source change may not trigger HMR if the edited file isn't currently imported).

#### 4. Nav-Blocker
**File**: `visual-editor/src/client/nav-blocker.js`

Runs inside the iframe. Activated/deactivated by postMessage from panel.

When active:
- `history.pushState` / `replaceState` monkey-patch — intercepts SPA route changes
- `popstate` listener — catches browser back/forward
- Link click interception on `<a>` elements — `e.preventDefault()` for different-path links
- `beforeunload` handler — warns on tab close

When intercepting a navigation:
- Send `zerofog:nav-blocked` to panel via postMessage with the attempted URL
- Panel shows toast: "Navigation blocked — you have unsaved edits"

What's NOT blocked:
- Same-path navigations (hash changes, query params)
- Clicks on elements that are NOT links
- Modal/dropdown/popover interactions
- Scroll, form submission on same page

#### 5. State Machine Tests
**File**: `visual-editor/tests/state.test.ts`

- `idle -> pending_diff` on receiveDiff
- Rejects receiveDiff when not idle (returns 409)
- `pending_diff -> processing` on claimDiff
- Rejects claimDiff when not pending_diff
- `processing -> idle` on complete
- Rejects complete when not processing
- Processing timeout (120s) reverts to pending_diff
- WAL file created on receiveDiff, deleted on complete
- Crash recovery: finds WAL on startup, resumes in pending_diff

#### 6. Nav-Blocker Tests
**File**: `visual-editor/tests/nav-blocker.test.ts`

- Blocks `pushState` to different path
- Allows `pushState` to same path with different hash
- Blocks link clicks to different path
- Allows clicks on non-link elements
- Sends `zerofog:nav-blocked` postMessage when blocking
- Deactivates cleanly (restores original pushState)

### Success Criteria

#### Automated Verification
- [ ] State machine tests pass (all transitions, timeout, WAL, recovery)
- [ ] Nav-blocker tests pass
- [ ] `npm run typecheck` passes

#### Manual Verification
- [ ] Click "Start Editing" then navigation is blocked
- [ ] Click a link in the app, see toast "Navigation blocked"
- [ ] Modals/dropdowns still work while editing
- [ ] Click "Apply to Code", see diff appear in sidecar stdout
- [ ] State machine transitions visible in `/api/status`
- [ ] Kill sidecar while processing then restart, see it recover pending diff

**Implementation Note**: Pause for verification. This phase is the critical integration point.

---

## Phase 6: CLI & Integration

> **Key dependency:** [2026-03-02-finalize-pipeline-spec.md](./2026-03-02-finalize-pipeline-spec.md) — the slash command template below is a simplified version; the spec's §5.2 (edit strategy dispatch) and §5.3 (full slash command) are the authoritative references. Architecture review findings (appended to spec) identified 5 CRITICAL issues to address during implementation, notably: use `POST /api/diff/claim` instead of GET for the claim operation, add session auth to all API endpoints, and add claim fencing tokens.

### Overview
Build the CLI entry point, slash command template, WebSocket heartbeat (IM10), and run full integration testing.

### Changes Required

#### 1. CLI Entry
**File**: `visual-editor/src/bin.ts`

```typescript
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { startServer } from './server.js';

const { values } = parseArgs({
  options: {
    target: { type: 'string', default: 'localhost:3000' },
    port: { type: 'string', default: '4000' },
  },
});

const targetPort = parseInt(values.target!.split(':').pop()!, 10);
const serverPort = parseInt(values.port!, 10);

await startServer({ targetPort, serverPort });

// Auto-open browser (safe — no user input in args)
execFile('open', [`http://localhost:${serverPort}`]);
```

#### 2. Slash Command Template
**File**: `visual-editor/templates/visual.md`

Simplified for internal use. Key change from architecture plan: no manual `curl` commands. Claude watches sidecar stdout for "Diff received" signal, then auto-claims and processes.

This template is copied into the target app's `.claude/commands/visual.md` so that `/visual` is available in Claude Code sessions.

```markdown
# /visual — Start Cortex Visual Editor

## On Invocation
1. Start the sidecar as a background process:
   npx cortex-visual-editor --target localhost:3000 --port 4000
2. Wait for "Cortex running at localhost:4000" in output (max 15s).
3. Tell user: "Visual editor running. Open localhost:4000 in your browser."
4. Tell user: "Make changes in the browser. When you click 'Apply to Code',
   I'll automatically apply them."

## While Editing (Design Advisor mode)
You are in visual editing mode. If the user asks questions about what they
can or can't edit, respond as a Design Advisor:
- Explain engineering constraints in plain language
- Suggest alternatives when something isn't editable

## When you see "Diff received" in sidecar output (auto-trigger)
1. Claim the diff:
   curl -s -X POST http://localhost:4000/__zerofog/api/diff
2. For each change, group by target file. Use componentChain + testId to
   locate source.
3. For each file group, read styleOrigin to determine edit strategy:
   - mantine-prop: edit the JSX prop (e.g., pt="md" to pt="xl")
   - tailwind: edit the className
   - css-module: edit the .module.css file
4. Report how many instances of the component exist.
5. Apply all changes, then report results:
   curl -s -X POST http://localhost:4000/__zerofog/api/complete \
     -H "Content-Type: application/json" \
     -d '{"applied": [...], "failed": [...]}'

## When user says "done" or "stop"
1. curl -s -X POST http://localhost:4000/__zerofog/api/shutdown
2. "Visual editor stopped."
```

#### 3. WebSocket Heartbeat (IM10)
**Within `server.ts`**:

```typescript
// Ping every 30s, expect pong within 10s
const HEARTBEAT_INTERVAL = 30_000;

editorWss.on('connection', (ws) => {
  let isAlive = true;

  ws.on('pong', () => { isAlive = true; });

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      ws.terminate();
      clearInterval(heartbeat);
      return;
    }
    isAlive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL);

  ws.on('close', () => clearInterval(heartbeat));
});
```

Panel-side: detect missed pongs, show "Reconnecting..." indicator, auto-reconnect with exponential backoff.

#### 4. Integration Test
**File**: `visual-editor/tests/integration.test.ts`

Full-flow test:
1. Start a simple HTTP server serving `test-fixtures/test-app.html`
2. Start the cortex sidecar pointing at it
3. Verify: `GET /` serves shell.html (when `Sec-Fetch-Dest: document`)
4. Verify: `GET /` serves injected test-app.html (when `Sec-Fetch-Dest: iframe`)
5. Verify: WebSocket connects to `/__zerofog`
6. Verify: `/api/health` returns 200
7. Verify: `/api/status` shows idle state
8. Simulate: send diff via WebSocket, then state becomes `pending_diff`
9. Verify: WAL file exists
10. Simulate: `POST /api/diff` returns the diff, state becomes `processing`
11. Simulate: `POST /api/complete` causes state to return to idle, WAL deleted
12. Verify: `POST /api/shutdown` causes server to close

### Success Criteria

#### Automated Verification
- [ ] Integration test passes end-to-end
- [ ] All unit tests still pass
- [ ] `npm run typecheck` passes
- [ ] CLI starts and stops cleanly

#### Manual Verification
- [ ] Full flow with real app: `/visual` then browse then select then edit tokens then apply then source changes then HMR then overrides clear
- [ ] WebSocket reconnects after laptop sleep/wake
- [ ] Shutdown is clean (PID file deleted, no orphan processes)
- [ ] Slash command works in Claude Code

**Implementation Note**: This is the final phase. Full manual testing required.

---

## Testing Strategy

### Unit Tests
| Module | Key Tests | Count (est) |
|---|---|---|
| `inject.ts` | HTML injection, edge cases, idempotency | ~5 |
| `server.ts` | Proxy, routing, API endpoints, WS, Host validation | ~15 |
| `inspector.js` | Source resolution (25 carried), fiber traversal, portal fix, select mode | ~35 |
| `panel.tsx` | Preact components, Shadow DOM mount, token buttons, per-side spacing, diff accumulation, undo | ~18 |
| `state.ts` | State transitions, timeout, WAL, crash recovery | ~10 |
| `nav-blocker.js` | Route blocking, modal passthrough, deactivation | ~8 |
| Pure functions | Token maps (22 carried), Tailwind regex fix | ~25 |

### Integration Tests
- Full flow: sidecar to proxy to injection to WS to state machine to shutdown

### Manual Testing Steps
1. Start real dev server, start sidecar, open browser
2. Navigate to a page with Mantine components
3. Click "Select Element" then click a Card, verify panel shows correct component info
4. Change padding-top from md to xl, verify preview in browser
5. Preview survives clicking a dropdown in the app (React re-render)
6. Add a second change (border-radius)
7. Undo one change, verify only that change reverts
8. Click "Apply to Code", verify Claude applies changes, HMR fires, overrides clear
9. Open a Mantine Modal, select an element inside it, verify correct selector (portal fix)
10. Click "Start Editing", try to navigate, verify blocked
11. Kill sidecar, restart, verify pending diff recovered

## Performance Considerations

- **Token maps**: Built lazily on first selection. Cached for session. ~1ms to build.
- **CSS override stylesheet**: Rebuilt on each change. For <50 overrides, string concatenation is fine (~0ms).
- **postMessage latency**: ~0ms (same-origin, same browser process). Not a concern.
- **WebSocket round-trip**: ~1ms for localhost. Not a concern.
- **Proxy overhead**: http-proxy-middleware adds ~1-2ms per request. Acceptable for dev tool.

## Installation (in Target App)

The visual editor is distributed as an npm dependency installed from the cortex git repo. No npm registry publishing needed.

**One-time setup** (by a human, in the target app repo):
```bash
# Install cortex-visual-editor as a dev dependency from git
npm install -D github:your-org/cortex

# Copy the slash command template into the target app
cp node_modules/cortex-visual-editor/templates/visual.md .claude/commands/visual.md
```

After this, every developer (and every Claude Code session) gets the visual editor automatically on `npm install`. The slash command `/visual` launches it via `npx cortex-visual-editor`.

**Updating**: To pull the latest version of the editor:
```bash
npm update cortex-visual-editor
```

**During active development of the editor**: Use `npm link` for instant feedback:
```bash
# In cortex/visual-editor:
npm link

# In target app:
npm link cortex-visual-editor
```

The `"prepare": "npm run build"` script in package.json ensures `dist/bin.js` (the `bin` entry point) is built automatically on `npm install` from git.

## Migration Notes

- Existing `scripts/visual-inspect.js` and `scripts/visual-toolbar.js` stay in place (they're used by the existing Playwright MCP-based `/visual` command). The new implementation in `visual-editor/src/client/` is a port, not a move.
- Once the standalone tool is validated, the old scripts and `.claude/commands/visual.md` can be removed.
- The 47 existing tests should be carried over (not moved) to `visual-editor/tests/` and adapted for the new module structure.

## References

- Architecture plan: `thoughts/shared/plans/2026-02-25-visual-editor-standalone-product.md`
- Internal-tool review findings: Same file, "Architecture Review Findings — Internal Tool Re-evaluation" section
- Panel component options + review: `thoughts/shared/research/2026-02-25-panel-component-options.md`
- Feasibility research: `thoughts/shared/research/2026-02-18-visual-editor-panel-feasibility.md`
- Predecessor plan: `thoughts/shared/plans/2026-02-18-visual-editing-session-loop-and-token-toolbar.md`
- Existing inspector: `scripts/visual-inspect.js`
- Existing toolbar: `scripts/visual-toolbar.js`
- Existing tests: `scripts/__tests__/visual-inspect.test.ts`, `scripts/__tests__/visual-toolbar.test.ts`
