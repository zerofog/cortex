# Visual Editor — Standalone Product Architecture Plan

## Overview

Build a standalone visual editing tool that lets designers refine existing web applications directly in the browser. The browser is the design canvas, an editing panel sits alongside it (like Figma's right panel), and Claude Code powers the backend — translating visual changes into source code and providing design-engineering guidance.

This is NOT a design tool for creating new experiences. It's a design **refinement** tool for editing existing UI — visual, layout, and positioning changes within design system constraints.

**Predecessor**: `thoughts/shared/plans/2026-02-18-visual-editing-session-loop-and-token-toolbar.md` (Phase 0/1 plan using Playwright MCP, superseded by this document)

**Key insight**: Going from "this works" to "this looks right" is slow — whether in Figma (then translate to code) or in code directly (tedious, no visual feedback). This tool lets designers start with a working app built on any component library (Mantine, Tailwind, shadcn, etc.) and refine it visually, with Claude handling the code translation.

---

## Problem Being Solved

### The Traditional Designer-Engineer Loop

```
Designer creates mockup in Figma
  → sends to engineer
  → engineer: "this part doesn't work because..."
  → designer goes back to drawing board
  → repeat (days/weeks)
```

### The New Loop

```
Designer opens visual editor on the real, running app
  → sees immediately what's editable (active indicators)
  → makes token-constrained changes (can't break the design system)
  → asks about something non-visual
  → Claude explains the constraint + suggests alternatives
  → designer adjusts approach immediately
  → finalizes → source code updated
  → (minutes)
```

The designer learns engineering boundaries **while designing**, not after handing off.

---

## Product Vision

### What This Is

- A design **refinement** tool for editing existing UI
- Browser is the canvas — shows the real, running app
- Editing panel sits to the RIGHT of the canvas (not overlaid), like Figma's right panel
- Changes are token-constrained (xs/sm/md/lg/xl) — can't break the design system
- Claude is two things: **code translator** (applies changes to source) and **design advisor** (explains what can/can't be changed and why)
- Launched from Claude Code via `/visual` slash command

### What This Is NOT

- Not for creating new components from scratch
- Not for creating new pages or experiences
- Not for exploration/prototyping
- Not a full design tool (no drag-and-drop, no color picker in v1, no font editor in v1)
- Not for backend/business logic changes
- Not for production (dev-only)

### Scope for v1

- **Editable**: spacing (padding, margin, gap), border radius, layout (flex direction, gap, alignment)
- **Token-only**: preset values (xs, sm, md, lg, xl, none, full) — no arbitrary pixel values
- **Future**: colors (v2), font size/weight (v2), token primitive editor, interstitial states

---

## Architecture

### High-Level Diagram

```
User runs: /visual (in Claude Code)
         OR: npx @zerofog/visual-editor --target localhost:3000 (standalone)
Opens:       localhost:4000 in any browser (ONE tab)

┌─ Browser (any) ──────────────────────────────────────────────────┐
│  Shell page (served by sidecar)                                   │
│  ┌─ iframe ──────────────────────┬─ Panel (Shadow DOM) ────────┐ │
│  │ Proxied app from :3000        │ Inspector controls           │ │
│  │ + injected inspector.js       │ Token editing (xs/sm/md/lg/xl│)│
│  │ + injected nav-blocker.js     │ Editability indicators       │ │
│  │                               │ Accumulated diff display     │ │
│  │ App sees TRUE viewport width  │ Finalize / Discard           │ │
│  │ Media queries work correctly  │                              │ │
│  │ position:fixed works          │ "Start Editing" / "End"      │ │
│  │ 100vw works                   │                              │ │
│  └───────────┬───────────────────┴──────────────┬───────────────┘ │
│              │ postMessage                       │ WebSocket       │
└──────────────┼───────────────────────────────────┼────────────────┘
               │                                   │
┌─ Sidecar (Node.js) ─────────────────────────────┼────────────────┐
│  Reverse proxy → localhost:3000                  │                │
│  Script injection (responseInterceptor)          │                │
│  WebSocket server (/__zerofog)  ←────────────────┘                │
│  Serves shell.html + editor scripts                               │
│  Communicates with Claude Code for AI + file edits                │
└──────────────────────────────────────────────────────────────────┘
```

### Sidecar Proxy Pattern

The sidecar is a standalone Node.js server that runs **beside** the user's dev server. It does NOT modify the dev server. The sidecar:

1. **Reverse proxies** all requests from `:4000` to `:3000`
2. **Injects a `<script>` tag** into HTML responses (via `responseInterceptor` from `http-proxy-middleware`)
3. **Serves the shell page** (iframe + editing panel layout)
4. **Serves editor scripts** (inspector, panel, nav-blocker)
5. **Runs a WebSocket server** on `/__zerofog` for real-time browser ↔ sidecar communication
6. **Passes through** the dev server's HMR WebSocket connections transparently

The user opens ONE tab at `localhost:4000`. The dev server at `:3000` is still running but the user doesn't interact with it directly.

**Why a proxy (not middleware, not extension, not Electron)**:
- Framework-agnostic — works with Next.js, Vite, anything
- No browser extension required — works in any browser
- No download — `npx` or Claude Code slash command
- Battle-tested pattern — BrowserSync, Cypress use the same approach

**Prior art**: BrowserSync uses `http-proxy` + `resp-modifier` for the same purpose. We use `http-proxy-middleware` v3 with `responseInterceptor` which handles compression (brotli/gzip/deflate) automatically.

### Process Lifecycle Management

The sidecar must manage its own lifecycle — Claude Code cannot reliably track background process PIDs across context compaction, conversation boundaries, or terminal restarts.

**Startup**:
1. Check for existing PID file at `.zerofog/sidecar.pid` (project-relative) or `/tmp/cortex-sidecar-<port>.pid`
2. If PID file exists and process is alive → hit `/__zerofog/api/status` to verify it's a cortex sidecar. If yes, report "Cortex already running at localhost:4000" and exit 0 (not an error). If no (stale PID), delete the file and continue.
3. Check if the target port is available. If `EADDRINUSE`, fail fast with: "Port 4000 is already in use. Run with `--port 4001` to use a different port."
4. Poll the target dev server with TCP connect (not HTTP GET — the server might not serve `/` yet). Retry with exponential backoff up to 30 seconds. If unreachable, serve a custom "Waiting for dev server at localhost:3000..." page in the iframe that auto-refreshes every 2 seconds.
5. Write PID file. Start accepting connections.

**Graceful shutdown** (`SIGTERM`, `SIGINT`, or `POST /__zerofog/api/shutdown`):
1. Send WebSocket close frame (code 1001 Going Away) to all connected clients
2. Call `server.close()` — stop accepting new connections, let in-flight requests finish (5-second timeout)
3. Delete PID file
4. Delete `.zerofog/pending-diff.json` only if diff state is `idle` (preserve if `pending_diff` for crash recovery)
5. Exit with code 0

**Target server restart handling**: When the proxy gets `ECONNREFUSED` from the target, serve a friendly "Dev server restarting..." error page instead of a raw 502. The proxy will naturally reconnect on the next request when the target comes back. Add a `proxyError` handler for this.

### Iframe Shell Layout

The shell page served at `localhost:4000` contains:
- An `<iframe>` loading the proxied app on the LEFT
- The editing panel on the RIGHT (rendered in Shadow DOM for style isolation)

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │                      │
│     App (in iframe)              │   Editing Panel      │
│     True viewport width          │   (Shadow DOM)       │
│     Not obscured by panel        │                      │
│                                  │   Token buttons      │
│                                  │   Editability info   │
│                                  │   Diff accumulation  │
│                                  │   Finalize/Discard   │
│                                  │                      │
│  ← app viewport ends here →     │   ~320px wide        │
└──────────────────────────────────┴──────────────────────┘
```

**Why iframe (not `margin-right` injection)**:
- `margin-right` on documentElement does NOT affect `position: fixed` elements — they render under the panel
- `100vw` elements trigger horizontal scrollbar with `margin-right`
- Media queries still see the full browser viewport width with `margin-right`
- An iframe creates a **real viewport boundary** — the app genuinely sees a smaller window
- The app renders identically to how it would in a narrower browser window

**Shadow DOM for the panel**: Isolates panel CSS from the app's CSS. The app's Tailwind resets, Mantine globals, etc. cannot affect the panel, and vice versa.

### Routing Strategy

The sidecar serves both the shell page and proxied app content on the same port. Routing uses the `/__zerofog/` prefix to separate concerns:

```
localhost:4000/                    → Redirects to /__zerofog/shell
localhost:4000/__zerofog/shell     → shell.html (iframe + panel layout)
localhost:4000/__zerofog/client/*  → Editor scripts (inspector.js, panel.js, nav-blocker.js)
localhost:4000/__zerofog/api/*     → HTTP API (diff retrieval, status)
localhost:4000/__zerofog           → WebSocket endpoint
localhost:4000/*                   → Proxy to :3000 with script injection
```

The shell's iframe `src` is `/` — which the proxy handles normally (injecting inspector + nav-blocker scripts). This works because the redirect from `/` → `/__zerofog/shell` only fires for **top-level** navigations (checked via `Sec-Fetch-Dest: document` header). When the iframe requests `/`, `Sec-Fetch-Dest` is `iframe`, so the proxy serves normally.

**Fallback for browsers without `Sec-Fetch-Dest`**: Check the `Sec-Fetch-Mode` header (`navigate` = top-level, `no-cors`/`cors` = subresource). If neither header is present (rare), check for a `__zerofog_frame=1` query param that the shell adds to the iframe src.

### Communication Architecture

Three communication layers, each handling different latency requirements:

**1. Cross-iframe postMessage (instant, browser-only)**

The inspector runs inside the iframe (where the app and its CSS variables live). The panel runs in the parent frame (Shadow DOM). `CustomEvent` does NOT cross iframe boundaries, so all iframe ↔ panel communication uses `postMessage`.

**Message schema**: All messages follow a typed envelope with origin validation:

```typescript
interface ZerofogMessage {
  type: `zerofog:${string}`;
  version: 1;
  sessionId: string;          // Generated by sidecar at boot, injected into scripts
  requestId?: string;         // For request-response pairs (token-maps, finalize)
  payload?: unknown;
}
```

**Origin validation**: Every message listener MUST validate origin before processing:

```javascript
// Inspector (inside iframe) — validates messages from panel
window.addEventListener('message', (e) => {
  if (e.origin !== SIDECAR_ORIGIN) return;           // e.g., 'http://localhost:4000'
  if (!e.data?.type?.startsWith('zerofog:')) return;  // Ignore non-zerofog messages
  if (e.data.sessionId !== SESSION_ID) return;        // Ignore cross-tab interference
  // process message
});

// Panel (parent frame) — validates messages from inspector
window.addEventListener('message', (e) => {
  if (e.source !== iframe.contentWindow) return;      // Only accept from our iframe
  if (!e.data?.type?.startsWith('zerofog:')) return;
  // process message
});
```

`SIDECAR_ORIGIN` and `SESSION_ID` are injected by the sidecar at script-serve time (template replacement in the served JS files). This prevents other browser tabs, extensions, or dev tools from sending commands to the inspector.

**Initialization protocol**: The inspector sends `zerofog:ready` after initialization. The panel MUST wait for this before sending any commands. This prevents the race where the panel sends `get-token-maps` before the inspector's message listener is attached.

```
Startup sequence:
  1. Iframe loads → inspector.js executes → attaches message listener
  2. Inspector sends: { type: 'zerofog:ready', version: 1, sessionId: '...' }
  3. Panel receives 'ready' → sets inspectorReady = true
  4. Panel can now send commands

On iframe reload (HMR full reload):
  1. Panel listens for iframe 'load' event → sets inspectorReady = false
  2. Panel waits for new 'zerofog:ready' from reloaded inspector
  3. Panel re-sends any pending state (rehydration — see Finalization State Machine)
```

**Message catalog**:

```
Inspector (iframe) → Panel (parent):
  { type: 'zerofog:ready' }                                         // Inspector initialized
  { type: 'zerofog:selected', payload: { selection, selectionId } } // Element selected
  { type: 'zerofog:deselected' }                                    // Selection cleared
  { type: 'zerofog:token-maps', requestId: '...', payload: maps }  // Response to get-token-maps
  { type: 'zerofog:preview-applied' }                               // CSS override applied

Panel (parent) → Inspector (iframe):
  { type: 'zerofog:preview', payload: { selectionId, category, token } }
  { type: 'zerofog:revert', payload: { selectionId } }
  { type: 'zerofog:get-token-maps', requestId: '...' }             // Request-response
  { type: 'zerofog:activate-inspector' }
  { type: 'zerofog:deactivate-inspector' }
  { type: 'zerofog:rehydrate', payload: { overrides: [...] } }     // Re-apply after HMR
```

The inspector is a **command executor** — the panel is the UI controller. The inspector holds element references (keyed by `selectionId`); the panel never needs direct DOM access. `selectionId` is an incrementing integer assigned on each Alt+Click, stored in a `Map<number, Element>` inside the inspector. This eliminates the fragile `elementFromPoint` re-finding pattern from the predecessor code.

**Request-response with correlation IDs**: For `get-token-maps` and other non-realtime messages, the panel generates a `requestId` (e.g., `crypto.randomUUID()`). The inspector includes this `requestId` in its response. The panel implements a timeout (3 retries, 100ms/200ms/400ms backoff) for unanswered requests. Fire-and-forget messages (`preview`, `revert`, `selected`) do not use request IDs — latency matters more than delivery confirmation.

**Token maps constraint**: `buildTokenMaps()` must run inside the iframe (where `--mantine-spacing-*` CSS variables exist). Maps are built **lazily on first element selection** (not on activation) to avoid SSR/hydration timing issues — by the time the user interacts with the page, React has hydrated and CSS variables are available. If maps are empty (no CSS variables detected), the inspector retries after 500ms (max 3 retries), then sends an empty map with a `warning: 'no-css-vars-detected'` flag so the panel can show a warning.

**2. Browser ↔ Sidecar WebSocket (near-instant)**

```
Panel → Sidecar:
  { type: 'finalize', diff: {...} }          → Sidecar stores diff for Claude
  { type: 'status' }                         → Sidecar returns session state

Sidecar → Panel:
  { type: 'finalize-ack' }                   → Diff received
  { type: 'edit-complete', result: {...} }   → Claude finished editing source
  { type: 'guidance', message: '...' }       → Claude's design advice
```

**3. Sidecar ↔ Claude Code HTTP (on-demand)**

```
GET  /__zerofog/api/diff      → Returns accumulated diff (Claude reads this)
GET  /__zerofog/api/status    → Session state (editing, idle, etc.)
POST /__zerofog/api/complete  → Claude signals edit completion
```

Claude reads the diff when the user says "finalize" in the terminal. The slash command tells Claude to `curl` or `WebFetch` the endpoint. This is simple, reliable, and avoids MCP complexity for v1.

**Key constraint**: Claude cannot watch the browser in real-time. All real-time interaction is handled by browser-side JavaScript. Claude engages only on-demand — when the user sends a message in the terminal.

| Action | Who handles it | Real-time? |
|--------|---------------|------------|
| Token button click → CSS preview | Browser (panel JS) | Yes, instant |
| Undo a preview | Browser (panel JS) | Yes, instant |
| Navigation blocking | Browser (nav-blocker JS) | Yes, instant |
| Editability detection | Browser (inspector JS) | Yes, on selection |
| "Can I edit this?" → guidance | Claude (via sidecar) | On user message |
| "Finalize" → source code edits | Claude (reads diff via sidecar) | On user message |

### WebSocket Design

The sidecar handles two WebSocket concerns on the same port — its own editor channel and the dev server's HMR. These MUST be routed explicitly because Node.js `upgrade` events only deliver each socket to one handler.

**Critical**: Do NOT use `ws: true` on `createProxyMiddleware`. That makes the proxy automatically intercept ALL upgrade requests and forward them to the target, stealing the socket before the zerofog WebSocket server can see `/__zerofog` requests.

Instead, use manual upgrade routing with `noServer: true`:

```javascript
const { WebSocketServer } = require('ws');

// Zerofog editor WebSocket — noServer mode (manual upgrade handling)
const zerofogWss = new WebSocketServer({ noServer: true });

// HTTP server upgrade handler — routes by path
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname === '/__zerofog') {
    // Zerofog editor channel
    zerofogWss.handleUpgrade(req, socket, head, (ws) => {
      zerofogWss.emit('connection', ws, req);
    });
  } else {
    // Everything else → forward to dev server for HMR
    proxy.upgrade(req, socket, head);
  }
});
```

This is the canonical `ws` v8 pattern for multiple WebSocket servers on a single HTTP port. It gives explicit control over routing and avoids the race condition where `http-proxy-middleware`'s internal upgrade handler steals sockets meant for zerofog.

**HMR compatibility**: The `else` branch forwards ALL non-zerofog upgrades to the target dev server. This works regardless of the HMR path convention:
- Next.js webpack: `/_next/webpack-hmr`
- Next.js turbopack: different path (varies by version)
- Vite: `/__vite_hmr` (or root `/` when `server.hmr` is unconfigured)
- Webpack Dev Server / CRA: `/ws`

Because the routing is path-negative (anything that ISN'T `/__zerofog` goes to the target), new frameworks work automatically without configuration.

### HTML Injection (from official http-proxy-middleware docs)

This injection targets HTML responses served to the **iframe** (the proxied app), not the shell page. The shell page is served directly by Express and includes `panel.js` via a normal `<script>` tag.

```typescript
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';

const proxy = createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  selfHandleResponse: true,  // Required for responseInterceptor
  // NOTE: ws: true is deliberately OMITTED — see WebSocket Design section.
  // WebSocket upgrades are routed manually in server.on('upgrade') to avoid
  // the proxy stealing /__zerofog WS connections.
  on: {
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const contentType = proxyRes.headers['content-type'] || '';
      if (!contentType.includes('text/html')) return responseBuffer;

      // Strip headers that block framing or injected scripts (dev-only — acceptable)
      delete proxyRes.headers['content-security-policy'];
      delete proxyRes.headers['content-security-policy-report-only'];
      delete proxyRes.headers['x-frame-options'];        // Blocks iframe embedding

      // Safety valve: skip injection for very large HTML (streaming SSR edge case)
      if (responseBuffer.length > 5 * 1024 * 1024) {
        console.warn('[cortex] Skipping script injection: response >5MB');
        return responseBuffer;
      }

      const body = responseBuffer.toString('utf8');
      // Inject inspector + nav-blocker into the app's HTML (inside iframe)
      const scripts = `
        <script src="/__zerofog/client/inspector.js"></script>
        <script src="/__zerofog/client/nav-blocker.js"></script>
      `;
      return body.replace('</body>', scripts + '</body>');
    }),
  },
});
```

Key details from official docs:
- `selfHandleResponse: true` is **mandatory** — prevents automatic `res.end()` before interceptor runs
- `responseInterceptor` automatically decompresses brotli/gzip/deflate responses
- It buffers the entire response — fine for typical HTML pages (50-200KB) but **disables streaming SSR**. Next.js App Router with `loading.tsx` will see degraded TTFB. Acceptable for a dev-only tool but documented for user awareness.
- CSP and `X-Frame-Options` headers must be stripped — the injected scripts won't have a valid nonce, and the iframe embedding would be blocked by frame-ancestors/X-Frame-Options policies. Only stripped on HTML responses; non-HTML responses keep their headers.

---

## User Experience

### Invocation

```
Terminal (Claude Code):
> /visual

Claude Code:
  Starting visual editor...
  Visual editor running at localhost:4000
  (opens browser automatically)
```

No page specification needed. No framework config. No extension install.

### Browse → Lock → Edit → Finalize → Unlock Lifecycle

**Phase 1: Browse (navigation free)**

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │                      │
│  User's app — browse freely      │  "Navigate to the    │
│  Click links, find the page      │   page you want to   │
│  you want to edit                │   edit, then click    │
│                                  │   Start Editing"     │
│                                  │                      │
│                                  │  [ Start Editing ]   │
└──────────────────────────────────┴──────────────────────┘
```

**Phase 2: Locked (editing mode)**

User navigates to `/dashboard`, clicks **Start Editing**.

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │                      │
│  /dashboard (locked)             │  🔒 Editing:         │
│  Navigation blocked              │  /dashboard          │
│  Inspector active                │                      │
│  Hover = blue highlight          │  [Select an element  │
│  Alt+Click = select              │   to see what you    │
│                                  │   can edit]          │
│                                  │                      │
│                                  │  [ End Editing ]     │
└──────────────────────────────────┴──────────────────────┘
```

Navigation is blocked while editing — accidental link clicks, browser back/forward, URL bar changes are all intercepted. Modals, dropdowns, tooltips still work (same route). User sees a toast: "Navigation blocked — you have unsaved edits."

**Phase 3: Editing**

User Alt+Clicks a Card element. Panel shows editable properties:

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │                      │
│  /dashboard                      │  🔒 Editing          │
│  [Card with green selection]     │                      │
│                                  │  Selected: Card      │
│                                  │                      │
│                                  │  Padding             │
│                                  │  [xs] [sm] [md] [●lg] [xl]
│                                  │                      │
│                                  │  Radius              │
│                                  │  [xs] [sm] [●md] [lg] [xl]
│                                  │                      │
│                                  │  Gap                 │
│                                  │  [xs] [sm] [md] [lg] [xl]
│                                  │                      │
│                                  │  2 changes pending   │
│                                  │  [Finalize] [Discard]│
└──────────────────────────────────┴──────────────────────┘
```

- Token buttons show current value highlighted (●)
- Clicking a different token applies a **live CSS preview** (instant, browser-side)
- Changes accumulate — user can edit multiple elements before finalizing
- Undo is trivial — revert a CSS override before finalizing

**Phase 4: Send to Claude**

User clicks **"Send to Claude"** (not "Finalize" — the button name sets the expectation that the next step involves Claude in the terminal). The accumulated diff goes through WebSocket → sidecar (persisted to disk as write-ahead log). The panel shows: "Changes sent. Tell Claude to apply them in the terminal." CSS overrides remain visible — they are NOT cleared yet (see Three-Phase Commit).

In the terminal, the user says "finalize" (or Claude detects the pending diff via a health check). Claude fetches the diff via `GET /__zerofog/api/diff`, edits source code (grouped by file to avoid ordering conflicts), then `POST /__zerofog/api/complete` with per-change results. The sidecar pushes `edit-complete` to the browser. HMR updates the page with real code. The browser clears CSS overrides only after verifying HMR landed.

For changes Claude couldn't apply (ambiguous source, component in `node_modules`, etc.), the browser re-applies those CSS overrides and shows: "5/8 applied. 3 changes need attention: [reasons]."

**Phase 5: Verify & Continue**

User sees the result from real code (not CSS overrides). If it looks right, they can:
- Select another element and keep editing
- Click **End Editing** to unlock navigation
- Browse to another page and lock again
- End the session entirely

### Editing Model: Batch, Not One-at-a-Time

Changes accumulate in browser-side state as CSS overrides. Source code is NOT touched until finalization. This is better than edit-one-at-a-time because:

- **Changes interact** — padding + margin + gap together look different than separately
- **Undo is trivial** — revert a CSS override, no git needed
- **Fewer HMR cycles** — source only changes on finalize
- **More Figma-like** — make many tweaks, see them holistically, commit when satisfied

### Token-Only Editing

Only preset design tokens are allowed. No arbitrary pixel values:

- **Spacing**: xs (8px), sm (12px), md (16px), lg (20px), xl (24px)
- **Radius**: none, xs (4px), sm (6px), md (8px), lg (12px), xl (16px), full (9999px)
- **Future**: could let users modify the token definitions themselves (a "primitives" page)

### Editability: Active Indicators + Guidance

**Active (browser-side, on-the-fly per element selection)**: When user selects an element, the panel shows what's editable. Computed on-the-fly (not pre-computed) because not everything will be edited.

**Guidance (Claude-side, conversational)**: When something can't be edited visually, Claude explains WHY and suggests alternatives — not just "no."

Examples:
- User selects a table cell showing "Acme Corp", types "change this text":
  → Claude: "That text comes from your database, not source code. That's outside visual editing scope. But I can change the font weight or column width if you'd like."
- User selects a button, asks "can I move this to the right?":
  → Claude: "This button is in a flex container with `justify-content: space-between`. I can change the gap or switch to `flex-end` alignment. Want me to explain the tradeoffs?"

This is the **designer ↔ engineer communication** that makes the tool genuinely useful. Designers learn engineering constraints in real-time.

### Default = All Instances (Like Figma Components)

When a user edits a Card's padding, it changes the **component definition** (like editing a Figma component master). All instances of that Card update.

Changing just one instance is the exception — user would need to explicitly say "just this one." This maps to: edit the shared component file by default, add a prop override for instance-specific changes.

### Authentication / Login

Cookies are **port-agnostic** on the same hostname. A cookie set by `localhost:3000` gets sent to `localhost:4000` too.

- If user is already logged in on `:3000` → proxy at `:4000` inherits the session automatically
- If not → user sees login screen in the iframe, logs in normally through the proxy
- For apps with dev bypass modes (like `E2E_BYPASS_AUTH=true`) → sidecar can set env vars

### Navigation Blocking (Edit Mode)

When user clicks "Start Editing", the nav-blocker script intercepts:
- `beforeunload` — catches tab close, browser back/forward, URL bar navigation
- `history.pushState` / `replaceState` monkey-patch — catches SPA route changes
- `popstate` listener — catches browser back/forward buttons
- Link click interception — catches `<a>` and framework `<Link>` clicks to different pages

**Blocked**: route changes, browser back/forward, link clicks to different pages
**Allowed**: modals, dropdowns, popovers, tooltips, form interactions, scroll — anything on the same route

---

## Claude's Two Roles

### Role 1: Code Translator (the "backend")

Takes accumulated visual edits (token changes) and writes proper source code. Mechanical: toolbar diff → source edit.

Detects **style origin** to make the right kind of edit:
- `mantine-prop` → edit the JSX prop (e.g., `p="md"` → `p="lg"`)
- `mantine-default` → ask user about scope (instance vs theme default)
- `tailwind` → edit className (e.g., `p-4` → `p-5`)
- `css-module` → edit the `.module.css` file

### Role 2: Design Advisor (the "engineer in the loop")

When a user asks about something that can't be edited visually, Claude explains WHY and offers alternatives — exactly like an engineer would in a design review.

This is what a design tool **can't** do. Figma can't tell you "that button label comes from an i18n file" or "that table width is driven by the data grid component's auto-sizing."

---

## Comparison with Claude Code Preview

| | Claude Code Preview | Our Visual Editor |
|---|---|---|
| **Audience** | Developers debugging/testing | Designers refining visual design |
| **Browser** | Embedded in Electron desktop app | User's own browser (any) |
| **Primary interface** | Chat (describe problems) | Editing panel (click tokens) |
| **Edit mode** | One-at-a-time, Claude applies | Batch edit, user finalizes |
| **Constraint** | Free-form (Claude decides how) | Token-constrained (design system) |
| **Feedback** | Claude explains what it found | Active editability indicators |
| **Goal** | "Fix this bug" / "Does this work?" | "Refine this design" |

Preview is **chat-first** with a browser beside it. Ours is **browser-first** with a panel beside it.

Reference: https://claude.com/blog/preview-review-and-merge-with-claude-code
Official docs: https://code.claude.com/docs/en/desktop (Preview section)

---

## Gemini 3 Pro Review Findings

Consulted `gemini-3-pro-preview` on the architecture. Key feedback:

### 1. Data Stomping Risk
If user clicks "Done" on toolbar but then Alt+Clicks another element before pressing Enter, both `selected` and `styleDiff` could be present. **Recommendation**: prioritize `styleDiff` when both exist — user explicitly clicked "Done."

### 2. CustomEvent Pattern — ~~Robust Enough~~ Superseded by postMessage
`CustomEvent` between injected scripts is idiomatic within a single frame. However, in the iframe shell architecture, inspector and panel live in **different frames** — `CustomEvent` does not cross iframe boundaries. The standalone product uses `postMessage` for all cross-frame communication (see Communication Architecture above). `CustomEvent` is still used within the iframe for any in-frame listeners.

### 3. Atomic Read/Reset — Critical
Reading browser state and resetting it MUST happen in a single execution context. Two separate round-trips create a TOCTOU race condition.

### 4. Shadow DOM for Panel
Strongly recommended. App styles (Tailwind resets, Mantine globals) could break panel layout, and panel styles could bleed into the app.

### 5. Iframe Shell for Layout
`margin-right` approach breaks `position: fixed` and `100vw`. Iframe creates a real viewport boundary. Tradeoff: need to sync URL bar when iframe navigates internally.

### 6. HTML Injection Gotchas
- Strip `Accept-Encoding` header from proxy requests (or use `responseInterceptor` which handles decompression automatically)
- Strip/relax `Content-Security-Policy` headers from responses
- Use Transform Stream for injection to preserve TTFB (or accept buffering with `responseInterceptor`)

---

## Technical Decisions

### Why NOT Playwright MCP
- Request/response only — 100-300ms overhead per call, 3-7s total with LLM inference
- Fine for prototyping, not for a product
- The inspector and Phase 0 work in zerofog-web validated the UX concept

### Why NOT Electron
- Requires download — user said "they don't need to download something"
- Locks to a specific browser engine
- Turns it into a "product" in the traditional sense

### Why NOT Browser Extension
- Requires install (even from Chrome Web Store)
- Browser-specific (Chrome extensions don't work in Safari)
- Violates "any browser, no download" constraint

### Why Sidecar Proxy
- Framework-agnostic (Next.js, Vite, anything)
- No browser extension required
- No download — `npx` or Claude Code slash command
- Works in any browser
- Battle-tested pattern (BrowserSync, Cypress)

### Why Single Package (Not Monorepo)
- One npm package with both server code and client scripts
- Client scripts are bundled as strings served by the sidecar
- Can extract to monorepo later if needed
- Premature monorepo adds complexity without benefit

---

## Repo Structure

```
visual-editor/
├── src/
│   ├── bin.ts                  # CLI entry: parseArgs, start server, open browser
│   ├── server.ts               # Express + proxy + WebSocket + API routes
│   ├── inject.ts               # HTML injection logic (responseInterceptor)
│   ├── init.ts                 # `visual-editor init` — copies slash command to .claude/commands/
│   └── client/                 # Browser-injectable scripts
│       ├── inspector.js        # From visual-inspect.js + postMessage bridge
│       ├── panel.js            # Editing panel (Shadow DOM, token buttons, batch editing)
│       ├── shell.html          # Iframe shell page (parent frame)
│       └── nav-blocker.js      # Navigation blocking (runs inside iframe)
├── templates/
│   └── visual.md               # Slash command template (copied by `init`)
├── tests/
│   ├── server.test.ts          # Proxy, injection, routing, WebSocket
│   ├── inspector.test.ts       # Carried from existing 25 tests + postMessage tests
│   ├── panel.test.ts           # Token editing, diff accumulation, batch editing
│   └── nav-blocker.test.ts     # Route blocking, modal/dropdown passthrough
├── package.json
├── tsup.config.ts
└── tsconfig.json
```

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `http-proxy-middleware` | ^3.x | Reverse proxy with `responseInterceptor` (auto decompression, WS passthrough) |
| `ws` | ^8.x | WebSocket server for editor ↔ sidecar communication |
| `express` | ^4.x | HTTP server (serves shell, editor scripts, proxy middleware) |
| `tsup` | ^8.x | Build CLI binary (shebang injection, CJS for npx) |
| `typescript` | ^5.x | Type safety |
| `vitest` | latest | Testing (matches zerofog-web tooling) |

### What Carries Over from cortex (predecessor codebase)

| Asset | Status | Notes |
|---|---|---|
| `scripts/visual-inspect.js` (380 lines) | **Copy + adapt** | Core inspector: hover, selection, source resolution. Add postMessage bridge (~10 lines) |
| `scripts/visual-toolbar.js` — pure functions | **Copy** | `buildTokenMaps`, `reverseTokenLookup`, `detectStyleOrigin`, `finalizeDiff` — reuse in panel.js |
| `scripts/visual-toolbar.js` — browser IIFE | **Rework** | Floating toolbar → docked side panel in Shadow DOM. Interaction model reusable, layout is not |
| `scripts/__tests__/visual-inspect.test.ts` | **Copy** | 25 tests for inspector + classifier logic |
| `scripts/__tests__/visual-toolbar.test.ts` | **Copy** | 22 tests for pure functions (token maps, style origin, diff, reverse lookup) |
| `.claude/commands/visual.md` | **Replace** | New slash command starts sidecar, reads diff via HTTP |
| Research/plan docs | **Reference only** | This document and predecessors |

---

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Proxy/injection | HTML responses get script tag, non-HTML passes through, compression handled | Unit tests with mock HTTP responses |
| WebSocket | Messages route correctly between browser and sidecar | Unit tests with mock WS connections |
| Inspector | Element selection, source resolution, classification | 26 existing tests + expansion |
| Panel | Token selection, live preview, diff accumulation, editability | Unit tests with mock DOM |
| Nav blocker | Route changes blocked, modals/dropdowns allowed | Unit tests with mock history API |
| Integration | Full flow: sidecar + static test page | Launch sidecar against simple test app, verify injection works |
| E2E | Full flow in real browser | Playwright: launch sidecar, open browser, make edits, verify source changes |

---

## Claude Code Integration

### Setup in Consuming Repo

The visual editor is an npm package. From the app repo:

```bash
# Install
npm install -D @zerofog/visual-editor

# Create the slash command in your repo
npx visual-editor init
# → Copies templates/visual.md to .claude/commands/visual.md
```

No MCP configuration needed. No `.mcp.json` changes. The slash command tells Claude how to interact with the sidecar via HTTP.

### Slash Command Template (`templates/visual.md`)

```markdown
# /visual — Start Cortex Visual Editor

## On Invocation
1. Start the sidecar as a background process:
   npx @zerofog/cortex --target localhost:3000 --port 4000
2. Poll health endpoint until ready (max 15 seconds):
   curl -s --max-time 2 http://localhost:4000/__zerofog/api/health
   If this returns 200, the sidecar is up.
   If it times out after 15 seconds, tell the user: "Cortex failed to start. Check that your dev server is running on localhost:3000."
3. Tell the user: "Cortex running at localhost:4000. Open it in your browser."
4. Tell the user: "Make your changes in the browser, then click 'Send to Claude' and say 'finalize' here."

## While Editing (Design Advisor mode)
You are now in visual editing mode. The user is making changes in the browser at localhost:4000.
If they ask questions about what they can or can't edit, respond as a Design Advisor:
- Explain engineering constraints in plain language
- Suggest alternatives when something isn't editable
- You can check session state: curl -s http://localhost:4000/__zerofog/api/status

## When user says "finalize"
1. Check health: curl -s --max-time 5 http://localhost:4000/__zerofog/api/health
   If this fails, tell user: "Cortex appears to have stopped. Restart with /visual."
2. Create a git checkpoint before making changes:
   git stash push -m "cortex-pre-finalize" --include-untracked
   (If stash fails because working tree is clean, that's fine — proceed.)
3. Fetch the diff: curl -s --max-time 5 http://localhost:4000/__zerofog/api/diff
   If the request fails or returns null: tell user "No pending changes."
4. If diff has changes, group changes by target file, then for each file group:
   a. Read the styleOrigin to determine edit strategy:
      - mantine-prop → edit the JSX prop (e.g., p="lg" → p="xl")
      - mantine-default → ask: "Change all [Component]s via theme, or just this one?"
      - tailwind → edit the className
      - css-module → edit the .module.css file
   b. Use component chain + testId to locate the source file (Grep for data-testid or component name)
   c. Apply all changes for this file in a single edit pass
   d. Track which changes succeeded and which failed (with reasons)
5. Report results:
   curl -s -X POST http://localhost:4000/__zerofog/api/complete \
     -H "Content-Type: application/json" \
     -d '{"applied": [0,1,2], "failed": [{"index": 3, "reason": "..."}]}'
6. Tell the user which changes were applied and which failed.
   If any failed: "3 changes couldn't be applied automatically: [reasons]. The browser will keep showing those as CSS previews. You can adjust and retry."
7. Pop the git stash if it was created:
   git stash pop (only if a stash was created in step 2)

## When user says "done" or "stop"
1. Gracefully stop the sidecar:
   curl -s -X POST http://localhost:4000/__zerofog/api/shutdown
   (If this fails, the sidecar may have already stopped — that's fine.)
2. Tell user: "Cortex stopped."
```

### HTTP API (on sidecar)

| Endpoint | Method | Purpose |
|---|---|---|
| `/__zerofog/api/diff` | GET | Returns accumulated diff JSON (or `null` if not in `pending_diff` state) |
| `/__zerofog/api/status` | GET | Session state: `{ editing, page, changeCount, diffState, sidecarUptime, wsConnected }` |
| `/__zerofog/api/complete` | POST | Reports per-change results and transitions state (see body below) |
| `/__zerofog/api/health` | GET | Returns 200 when sidecar is ready. Claude polls this on startup before confirming. |
| `/__zerofog/api/shutdown` | POST | Graceful shutdown — closes WebSocket, stops HTTP server, exits. No PID needed. |

**`POST /api/complete` body** (per-change status tracking):
```json
{
  "applied": [0, 1, 2, 3, 5, 6, 7],
  "failed": [
    { "index": 4, "reason": "Ambiguous source: Card used in 3 files" }
  ]
}
```
The sidecar retains failed changes and pushes them to the browser via WebSocket so the user sees "5/8 applied, 3 need attention." The browser re-applies CSS overrides for the failed subset.

### Finalization State Machine

The diff lifecycle is governed by a state machine on the sidecar. This prevents race conditions (double-finalize, concurrent reads, finalize-during-edit) that were identified in the architecture review.

```
                    Browser clicks              Claude GET              Claude POST
                    "Send to Claude"            /api/diff               /api/complete
                    ─────────────────           ──────────              ─────────────
                         │                         │                        │
  ┌──────┐               ▼                         ▼                        ▼
  │ idle │──────────► pending_diff ──────────► processing ──────────────► idle
  └──────┘               │                         │                        │
                         │                         │                        │
                    Rejects if not idle       Rejects if not           Rejects if not
                    (409 Conflict)            pending_diff             processing
                                             (409 Conflict)           (409 Conflict)
```

**State transitions**:
- `idle → pending_diff`: Browser sends diff via WebSocket. Sidecar persists diff to `.zerofog/pending-diff.json` (write-ahead log) and ACKs. Rejects with 409 if already in `pending_diff` or `processing` (prevents double-finalize overwriting data).
- `pending_diff → processing`: Claude `GET /api/diff` reads the diff. State advances to `processing`. A second GET returns 409 (prevents duplicate reads on retry).
- `processing → idle`: Claude `POST /api/complete` with per-change results. Sidecar deletes `.zerofog/pending-diff.json`, sends `edit-complete` to browser via WebSocket, transitions to `idle`.

**Crash recovery**: On sidecar startup, check for an existing `.zerofog/pending-diff.json`. If found, resume in `pending_diff` state and notify the browser: "Recovered pending changes from previous session." This is the write-ahead log pattern — cheap to implement, prevents the worst failure mode (lost diffs).

### Three-Phase Commit for CSS Override Clearing

CSS overrides in the browser must NOT be cleared until source edits are verified. This prevents the visual flash where neither overrides nor real code changes are visible.

```
Phase 1: Browser sends diff → sidecar ACKs → browser KEEPS overrides visible
         Panel shows: "Changes sent to Claude..."

Phase 2: Claude edits source → HMR fires → sidecar sends 'edit-complete' to browser
         Browser detects HMR re-render (MutationObserver on app root)

Phase 3: Browser clears CSS overrides ONLY after 'edit-complete' AND HMR detected
         For failed changes: re-apply CSS overrides, show "3 changes need attention"
```

The browser verifies by re-reading computed styles after HMR and comparing against expected token values from the diff. If styles don't match (Claude's edit was wrong or HMR didn't fire), overrides are kept and the panel surfaces a warning.

**HMR survival for pending overrides**: CSS overrides are stored by selector (data-testid or component name), not by DOM reference. When HMR replaces DOM nodes, a MutationObserver on the iframe's app root detects the replacement. The inspector re-queries elements by selector and re-applies pending overrides. Additionally, overrides are backed up to `sessionStorage` (keyed by page URL) so a full page refresh can recover them.

### Future: MCP Server (v2)

The sidecar can later expose an MCP server (via `--mcp` flag) that provides tools like `get_pending_diff`, `apply_edit`, `get_selection`. This replaces the slash command's HTTP polling with structured tool calls. The browser-side code doesn't change — only the sidecar ↔ Claude interface.

---

## Open Questions / TBD

1. ~~**Sidecar ↔ Claude Code communication protocol**~~: **Resolved** — HTTP endpoint on sidecar for v1 (see Claude Code Integration above). MCP server as v2 option.

2. **URL bar sync for iframe**: When user navigates within the iframe, the outer URL (localhost:4000) should update. Standard `postMessage` + `history.replaceState` pattern, but need to implement.

3. ~~**Finalization failure handling**~~: **Resolved** — Apply what works, preserve what fails, show clear status. Claude processes changes grouped by file. For each file group, if the edit succeeds, those changes are `applied`. If it fails, those changes are `failed` with a reason. `POST /api/complete` reports the breakdown. The browser re-applies CSS overrides for failed changes so the user still sees what they intended. See Finalization State Machine and Three-Phase Commit sections above.

4. **Interstitial states**: Parked for now. Future consideration: can users toggle loading/error/hover states to edit those views? CSS pseudo-state forcing via CDP is feasible.

5. **Token primitive editor**: Future feature — a page where users can redefine the token values themselves (change what "md" spacing means).

6. **Multi-framework support**: Inspector's source resolution is React-specific (`_debugSource`, fiber tree). Vue, Svelte, etc. would need plugins. Not in v1 scope.

7. **Panel UI framework**: Should the panel use imperative DOM construction (current toolbar approach) or a lightweight framework (Preact, lit-html)? Imperative is simpler for v1 but the panel is more complex than the toolbar.

---

## Speed Expectations

| Operation | Latency | Handler |
|---|---|---|
| Token button click → CSS preview | Instant (~0ms) | Browser JS |
| Element hover → editability check | Instant (~0ms) | Browser JS |
| Undo a CSS preview | Instant (~0ms) | Browser JS |
| Navigation block | Instant (~0ms) | Browser JS |
| "Can I edit X?" → Claude guidance | 1-2s (API latency) | Sidecar → Claude API |
| Finalize → source code edits | 1-2s (API latency) | Sidecar → Claude Code |
| HMR update after source edit | 0.5-2s (framework dependent) | Dev server |

All real-time interactions are browser-side. Claude only engages when the user explicitly communicates (finalize, ask a question).

---

## Launch Flow (Final)

### Prerequisites (one-time)
1. `npm install -D @zerofog/visual-editor` in the app repo
2. `npx visual-editor init` → creates `.claude/commands/visual.md`

### Per-Session Flow
1. User starts their dev server normally (`npm run dev` → `:3000`)
2. User types `/visual` in Claude Code terminal
3. Claude runs `npx @zerofog/cortex --target localhost:3000 --port 4000` as background process
4. Claude polls `/__zerofog/api/health` until 200 (max 15s), confirms sidecar is up
5. User opens `localhost:4000` → sees shell: iframe with app + editing panel on the right
6. User browses to the page they want to edit
7. User clicks "Start Editing" → page locks, inspector activates, sends `zerofog:ready`
8. User selects elements, adjusts tokens, accumulates changes
9. User clicks **"Send to Claude"** in the panel → diff persisted to disk via sidecar (write-ahead log)
10. User says "finalize" in terminal → Claude creates git checkpoint, fetches diff, edits source (grouped by file), reports per-change results → HMR updates page → browser clears CSS overrides only after HMR verified
11. For any failed changes: browser re-applies CSS overrides, panel shows which changes need attention
12. User clicks "End Editing" → navigation unlocks
13. User can browse to another page and edit again, or repeat 7-12
14. User says "done" in terminal → Claude sends `POST /__zerofog/api/shutdown`, session ends cleanly

---

## References

- Anthropic Claude Code Preview docs: https://code.claude.com/docs/en/desktop
- Anthropic Claude Code Chrome integration: https://code.claude.com/docs/en/chrome
- http-proxy-middleware official docs: https://github.com/chimurai/http-proxy-middleware
- http-proxy-middleware responseInterceptor recipe: https://github.com/chimurai/http-proxy-middleware/blob/master/recipes/response-interceptor.md
- BrowserSync architecture (proxy + snippet injection): https://github.com/BrowserSync/browser-sync
- Predecessor plan: `thoughts/shared/plans/2026-02-18-visual-editing-session-loop-and-token-toolbar.md`
- Feasibility research: `thoughts/shared/research/2026-02-18-visual-editor-panel-feasibility.md`

---

## Codebase Audit (2026-02-25)

Inventory of what exists in the cortex repo and gap analysis against this plan.

### Existing Assets

| File | Lines | Status | Reusability |
|---|---|---|---|
| `scripts/visual-inspect.js` | 380 | Phase 0 complete | **High** — copy to `client/inspector.js`, add postMessage bridge |
| `scripts/visual-toolbar.js` | 708 | Phase 1 complete | **Partial** — pure functions reusable, browser IIFE needs rework for side panel |
| `scripts/__tests__/visual-inspect.test.ts` | 299 | 25 tests passing | **High** — carry over directly |
| `scripts/__tests__/visual-toolbar.test.ts` | 378 | 22 tests passing | **High** — pure function tests carry over |
| `.claude/commands/visual.md` | 144 | Session protocol (Playwright MCP) | **Replace** — new command launches sidecar |

### Inspector (`visual-inspect.js`) — What's There

- `resolveSource(element, fiberKeys)` — 3 strategies: data-testid, React fiber `_debugOwner` chain, DOM heuristic
- `classifyElement(componentChain, tagName)` — pure function → `icon|layout|text|interactive|container|feedback|input|unknown`
- Browser IIFE: hover overlay (blue `#3b82f6`), Alt+Click selection (green `#22c55e`), Escape deactivation
- `window.__ZEROFOG__` namespace (consolidated, idempotent init)
- `CustomEvent('zerofog:selected')` / `CustomEvent('zerofog:deselected')` dispatch
- `data-zerofog-ui="true"` on all injected DOM (UI ignore contract)
- Module exports: `resolveSource`, `getComponentName`, `findReactFiberKeys`, `classifyElement`

**Adaptation needed**: `CustomEvent` doesn't cross iframe boundaries. Inspector (inside iframe) needs to add `window.parent.postMessage()` alongside the existing `CustomEvent` dispatch. The `CustomEvent` still fires within the iframe for any in-frame listeners.

### Toolbar (`visual-toolbar.js`) — What's There

**Pure functions (100% reusable)**:
- `buildTokenMaps(styleGetter)` — sentinel element approach, resolves CSS variables to px
- `reverseTokenLookup(maps, category, pxValue)` — px → token name, handles `full` (>1000px)
- `detectStyleOrigin(element, property, findFiberKeysFn, themeDefaults)` — walks `_debugOwner` chain for Mantine prop / theme default / Tailwind / CSS Module
- `finalizeDiff(selection, changes)` — structured diff with selector, componentChain, changes array
- `findReactFiberKeys(element)` — duplicated from inspector (no cross-script dependency)

**Browser IIFE (needs rework for panel)**:
- Floating toolbar positioned near element → becomes docked side panel in Shadow DOM
- Token segmented buttons (spacing: xs/sm/md/lg/xl, radius: none/xs/sm/md/lg/xl)
- Live preview via `element.style.setProperty(cssProp, value, 'important')`
- Full `style` attribute snapshot/revert
- Category filtering by element type (icon=none, container=all, text=margin only, etc.)
- `[Done]` writes to `window.__ZEROFOG__.styleDiff`, `[X]` reverts
- Idempotent `destroy()` lifecycle

### Gap Analysis — What Needs to Be Built

| Component | Complexity | Existing Code to Leverage |
|---|---|---|
| `bin.ts` — CLI entry | Low | None |
| `server.ts` — Express + proxy + WebSocket | Medium | None |
| `inject.ts` — HTML injection (responseInterceptor) | Low | None (pattern documented in plan §HTML Injection) |
| `shell.html` — iframe + Shadow DOM panel layout | Medium | None |
| `nav-blocker.js` — navigation blocking | Medium | None (spec documented in plan §Navigation Blocking) |
| `panel.js` — side panel with batch editing | High | Toolbar pure functions + interaction model |
| `inspector.js` adaptation — postMessage bridge | Low | Full inspector, add ~10 lines for postMessage |
| WebSocket protocol — message types | Medium | None |
| Sidecar ↔ Claude Code protocol | TBD | None (open question #1 in plan) |
| `package.json` + build toolchain | Low | None (cortex has no package.json) |

### Cross-Iframe Communication Design

The biggest architectural delta from Phase 0/1. In the Playwright MCP approach, everything lived in the same window context. In the standalone product:

```
Inspector (inside iframe)                    Panel (parent frame, Shadow DOM)
  Startup:
  → attaches message listener (validates event.origin === SIDECAR_ORIGIN)
  → sends { type: 'zerofog:ready' }         → Panel receives 'ready', enables commands

  Alt+Click → resolveSource()
  → window.__ZEROFOG__.selected = {...}
  → CustomEvent('zerofog:selected')          (cannot hear this — different frame)
  → window.parent.postMessage({              ← bridge to parent
      type: 'zerofog:selected',
      version: 1,
      sessionId: SESSION_ID,
      payload: { selection, selectionId: 1 }
    }, SIDECAR_ORIGIN)
                                             → validates event.source === iframe.contentWindow
                                             → panel updates with selection data

  Token maps (buildTokenMaps) must           Panel requests token maps from iframe:
  run HERE (Mantine CSS vars exist           → iframe.contentWindow.postMessage({
  in this context). Built lazily on              type: 'zerofog:get-token-maps',
  first selection (post-hydration).              requestId: 'req-1'
                                               }, SIDECAR_ORIGIN)
                                             ← Inspector responds with maps + requestId
                                             ← Panel retries 3x with backoff if no response

  Live preview runs HERE (element is         Panel sends preview commands:
  in iframe). Inspector holds element        → iframe.contentWindow.postMessage({
  refs by selectionId — panel never              type: 'zerofog:preview',
  needs direct DOM access.                       payload: { selectionId: 1, category: 'padding', token: 'xl' }
                                               }, SIDECAR_ORIGIN)
```

`SIDECAR_ORIGIN` and `SESSION_ID` are injected by the sidecar at script-serve time via template replacement. This prevents cross-tab interference and ensures only the cortex sidecar can send commands to the inspector.

The inspector is a **command executor** with a `postMessage` listener handling: `preview`, `revert`, `get-token-maps`, `activate-inspector`, `deactivate-inspector`, `rehydrate`. The panel is a pure UI controller that sends commands and receives state.

### Token Map Location Constraint

`buildTokenMaps()` creates a sentinel element and reads `getComputedStyle()` to resolve `--mantine-spacing-*` CSS variables. These variables only exist within the iframe (where `MantineProvider` renders). The panel (parent frame) cannot run `buildTokenMaps()` directly.

**Solution**: Inspector builds maps on activation, sends them to panel via postMessage. Panel caches them for button rendering. Maps only need rebuilding if the page does a full reload (not HMR).

### Implementation Order Recommendation

1. **Scaffold** — `package.json`, `tsconfig.json`, `tsup.config.ts`, install deps
2. **Proxy core** — `server.ts` + `inject.ts` with tests (verify HTML injection, HMR passthrough)
3. **Shell** — `shell.html` with iframe + placeholder panel, verify app loads in iframe
4. **Port inspector** — Copy `visual-inspect.js`, add postMessage bridge, test cross-frame selection
5. **Nav-blocker** — Self-contained, test in isolation
6. **Panel** — Shadow DOM side panel, consume postMessage events, token buttons, batch editing
7. **WebSocket** — Connect panel ↔ sidecar for finalization
8. **CLI** — `bin.ts` with parseArgs, auto-open browser
9. **Integration** — Full flow: sidecar + static test page, verify injection → selection → edit → HMR

---

## Architecture Review Findings (2026-02-25)

Review team: 7 personas × 2 modes (clink multi-model + native Claude agents) = 14 total reviewers

- **frontend** (Codex-clink + native): DOM/CSS/React internals, iframe mechanics, HMR, browser APIs
- **security** (Gemini-clink + native): Auth, trust boundaries, injection vectors, CSP
- **distsys** (Codex-clink + native): State machines, crash recovery, WAL, leases, fencing
- **design** (Codex-clink + native): Designer experience, editing surface, trust, adoption
- **dx** (Gemini-clink + native): CLI ergonomics, onboarding, naming, workflow friction
- **backend** (Claude-clink + native): Server architecture, middleware, logging, graceful shutdown
- **fullstack** (Claude-clink + native): Cross-cutting integration, orchestration, state ownership

Mode: both (clink multi-model + native Claude agents)

### Cross-Reviewer Consensus

Issues flagged independently by 3+ of 14 reviewers:

| Issue | Reviewers | Count | Severity |
|---|---|---|---|
| Unauthenticated HTTP/WS endpoints exploitable via DNS rebinding + CSWSH | security, distsys, backend, fullstack, frontend | 9/14 | **Critical** |
| Finalization state machine deadlock (`GET /api/diff` mutates state, no timeout) | distsys, backend, fullstack, security | 7/14 | **Critical** |
| Default "all instances" scope destroys designer trust | design, dx, fullstack | 6/14 | **Critical** |
| Browser-to-terminal context switch hostile to designers | design, dx, fullstack | 6/14 | **Critical** |
| Naming inconsistency across four identities | dx, fullstack | 3/14 | **Critical** |
| React 19 `_debugOwner` removal — silent total failure in TWO files | frontend, fullstack | 3/14 + code-confirmed | **Critical** |
| CSS overrides don't survive React reconciliation | frontend, fullstack | 3/14 + code-confirmed | **High** |
| v1 editable surface too narrow (spacing/radius only) | design, dx | 4/14 | **High** |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1

**C1. Unauthenticated endpoints create remote exploitation vector** (9/14 reviewers)
- All control endpoints have zero auth. DNS rebinding + Cross-Site WebSocket Hijacking enable remote code modification from any website the user visits.
- Attack chain: DNS rebinding bypasses localhost assumption → CSWSH bypasses same-origin on WebSocket → no auth means nothing stops the attacker. `/api/complete` is specifically exploitable during the `processing` window — an attacker can silently drop all pending changes.
- Fix: (a) Generate session token at boot (`crypto.randomBytes(32)`), require as Bearer token on all HTTP + first-message auth on WebSocket. (b) Validate `Host` header (reject non-localhost). (c) Validate `Origin` on WebSocket upgrade. (d) Bind to loopback only.
- Flagged by: security (both), distsys (both), backend (both), fullstack (both), frontend (native)

**C2. Finalization state machine deadlocks when Claude crashes** (7/14 reviewers)
- `GET /api/diff` advances state to `processing`. If Claude dies before `POST /api/complete`, session is stuck forever. No timeout, no lease, no recovery except sidecar restart.
- `POST /api/complete` is unfenced — any stale/parallel actor can close a job with wrong data.
- Fix: Lease-based claim pattern. `POST /finalize/start` returns `{finalizeId, leaseToken, leaseExpiry}`. `GET /api/diff` becomes idempotent (read-only). Auto-revert `processing → pending_diff` on lease expiry (120s TTL). Require `finalizeId + leaseToken + diffHash` on complete.
- Flagged by: distsys (both), backend (both), fullstack (both), security (native)

**C3. Default "all instances" scope is trust-destroying** (6/14 reviewers)
- Editing a Card on `/dashboard` silently changes every Card in the app. No visual signal of blast radius. First accidental global edit = permanent trust loss.
- Fix: Default to instance-level editing. Explicit escalation with blast-radius preview: "Apply to all 14 Cards across the app?" Require confirmation for scope > 1.
- Flagged by: design (both), dx (both), fullstack (both)

**C4. React 19 `_debugOwner` removal breaks TWO files** (3/14 + code-confirmed — extended)
- React 19 (stable since Dec 2024) removed `_debugOwner`. Code at `visual-inspect.js:52` silently produces empty `componentChain`. **New finding**: `detectStyleOrigin` in `visual-toolbar.js:83,128` also walks `_debugOwner` to find Mantine component fibers and read `memoizedProps`. The prior review's fix (`fiber.return` traversal) doesn't fully work — `fiber.return` gives structural parents, not owners.
- Fix: Parse `_debugStack` string (React 19 replacement). Check for `fiber.owner` property (exists in React 19). Filter `fiber.return` chain to tags 0 (FunctionComponent) and 1 (ClassComponent). This is what React DevTools does internally.
- Flagged by: frontend (both), fullstack (native)

**C5. Token maps are Mantine-only — v1 launch blocker** (NEW — frontend-clink)
- `buildTokenMaps` hardcodes `--mantine-spacing-*` CSS variables. On any Tailwind/shadcn project (~50% of stated audience), token maps return empty. The tool *appears* to work but no current values are highlighted and diffs record wrong values.
- Fix: Framework-specific detection: Mantine via CSS vars (current), Tailwind via parsing generated CSS from proxied stylesheet, generic via per-element `getComputedStyle`. Must work for at least 2 design systems at v1.
- Flagged by: frontend (clink)

**C6. Naming inconsistency across four identities** (3/14 reviewers)
- `@zerofog/visual-editor`, `@zerofog/cortex`, `visual-editor`, `cortex` used interchangeably. Internal prefix `__zerofog` doesn't match any.
- Fix: Standardize before writing code. Pick one identity (package, CLI binary, product name, internal prefix) and update all references.
- Flagged by: dx (both), fullstack (native)

**C7. Browser-to-terminal finalization is hostile to designers** (6/14 reviewers)
- Clicking "Send to Claude" then switching to terminal to type "finalize" breaks flow. Leaks implementation detail of Claude's terminal model. Designers will not adopt a tool that requires terminal interaction.
- Fix: (a) Best: in-panel "Apply to Code" button triggers full pipeline via sidecar. Progress streamed to panel: "Applying changes... (3/8)". (b) Acceptable: sidecar signals Claude Code to auto-finalize. (c) Minimum: WebSocket progress bar in browser panel.
- Flagged by: design (both), dx (both), fullstack (both)

#### HIGH — Should fix in v1

**H1. CSS overrides don't survive React reconciliation** (3/14 + code-confirmed)
- `element.style.setProperty` inline overrides get blown away by React on any re-render (not just HMR). MutationObserver for HMR detection is unreliable — React Fast Refresh patches components in-place without replacing DOM nodes.
- Fix: Switch from inline `element.style` to injected `<style>` tag with high-specificity rules: `[data-testid="card-main"] { padding: 24px !important; }`. Survives React reconciliation because React doesn't touch external stylesheets.
- Flagged by: frontend (both), fullstack (native)

**H2. Three-phase commit HMR detection mechanism is broken** (NEW — frontend-clink)
- The plan relies on MutationObserver to detect HMR. React Fast Refresh doesn't trigger DOM mutations — it patches component functions in place. The "verify HMR landed" condition will never fire, hanging the three-phase commit indefinitely.
- Fix: Tap into the proxied HMR WebSocket stream (sidecar already controls it). Listen for framework-specific update events (`Vite: {type:"update"}`, `webpack: {type:"ok"}`).
- Flagged by: frontend (clink)

**H3. v1 editable surface too narrow** (4/14 reviewers)
- Spacing/radius alone can't handle >50% of design feedback. Designers will try once, find they can't change color/font, and never return.
- Fix: Add color token editing to v1 (same token-button pattern for `background-color`, `color`, `border-color`). Consider font-size/weight tokens.
- Flagged by: design (both), dx (both)

**H4. Portal elements produce wrong selectors** (NEW — frontend-clink)
- `element.closest('[data-testid]')` walks DOM ancestors — wrong for portals. Modals/drawers render into `document.body`, so DOM ancestor walking finds unrelated testIds. This silently produces wrong diffs for exactly the UI elements designers most want to refine.
- Fix: Detect DOM vs fiber parent chain divergence. Use `componentChain[0]` as selector for portals. Add `isPortal: true` flag to diff payload.
- Flagged by: frontend (clink)

**H5. Alt+Click conflicts with OS-level behaviors** (4/14 reviewers)
- macOS: Alt+Click downloads links in Safari/Firefox. Linux: Alt+Click is window-drag.
- Fix: Use mode toggle (like DevTools element picker). When "Select" mode is active, bare clicks select elements. Keep Alt+Click as power-user shortcut only.
- Flagged by: frontend (both), dx (both), design (clink)

**H6. Slash command template still uses `git stash`** (NEW — frontend-clink)
- Plan lines 758-759 still use `git stash push` for safety checkpointing despite the known fragility (conflict on pop, wrong-stash-pop risk, clean-tree false positive).
- Fix: Update to `git tag cortex-checkpoint-$(date +%s) HEAD`. Tags never conflict, never pop wrong.
- Flagged by: frontend (clink), distsys (both)

**H7. `pushState` monkey-patching won't catch Next.js App Router** (2/14 — extended)
- Next.js App Router uses React Transitions + Server Component tree swapping, bypassing `pushState` interception entirely. Programmatic `router.push()` bypasses click interception too. If router captures original `pushState` reference at module init before nav-blocker loads, monkey-patch catches nothing.
- Fix: (a) Inject nav-blocker in `<head>` before app scripts. (b) Patch `History.prototype.pushState` (prototype, not instance). (c) Use `popstate` + document click capture as fallback. (d) Navigation API where available.
- Flagged by: frontend (both)

**H8. `responseInterceptor` breaks streaming SSR** (NEW — backend-native)
- `responseInterceptor` buffers the entire response before injecting the script tag. For streaming SSR (React 18+ `renderToPipeableStream`), this defeats the purpose — users see a blank page until the full HTML arrives.
- Fix: Inject the editor script in `</head>` instead of `</body>`. The `<head>` completes before streaming body content begins. This avoids buffering the response body entirely.
- Flagged by: backend (native)

**H9. Graceful shutdown doesn't drain keep-alive connections** (NEW — backend-native)
- `server.close()` alone doesn't close keep-alive connections — they can linger for the browser's keep-alive timeout (typically 5 minutes). During shutdown, the sidecar appears hung.
- Fix: Track active connections. On shutdown signal, stop accepting new connections, wait 5s for in-flight requests, then force-close remaining connections.
- Flagged by: backend (native)

**H10. No WebSocket heartbeat/keepalive** (NEW — distsys-native)
- TCP keepalive defaults to 2 hours. Laptop sleep/wake silently kills the connection. Browser thinks it's connected, messages go to void. Panel shows stale state with no indication of disconnection.
- Fix: Application-level ping/pong at 30s interval. Auto-reconnect with exponential backoff. Show connection status indicator in panel.
- Flagged by: distsys (native)

**H11. No idempotency key on "Send to Claude"** (NEW — distsys-native)
- If WebSocket ACK is lost, panel retries, gets 409 ("already processing"), shows confusing error even though the first send succeeded. User has no way to know whether their edits were received.
- Fix: Client generates `requestId` (UUID). Server deduplicates by `requestId`. Retry returns same response as original. Panel shows "edits sent" immediately on local state, confirms on server ACK.
- Flagged by: distsys (native)

#### MEDIUM

- **M1**: WAL file has no atomic write semantics (`fsync` + rename) or integrity protection (HMAC) — distsys, backend
- **M2**: Single-tab assumption declared but not enforced — needs WebSocket lease/takeover protocol — distsys
- **M3**: `sessionStorage` backup for overrides is origin-scoped not tab-scoped — store in parent frame instead — distsys
- **M4**: Three-phase override clearing lacks `finalizeId` correlation — could clear wrong attempt's overrides (ABA race) — distsys
- **M5**: API contract contradiction: `/api/diff` returns `null` vs `409` depending on which section you read — distsys, backend
- **M6**: `POST /api/complete` result mapping by positional index is brittle — use stable `changeId` — distsys
- **M7**: No input validation on WebSocket messages — prototype pollution, memory exhaustion risks. Add `zod` schema validation + `maxPayload: 1MB` — backend
- **M8**: `postMessage` same-origin weakness — iframe and parent share origin, so app XSS can impersonate inspector. `MessageChannel` ports are capability-based and immune to this — security, frontend
- **M9**: PID file symlink attack — use `O_CREAT | O_EXCL`, check for symlinks, prefer project-relative paths — security
- **M10**: No `--help` or CLI documentation spec — dx
- **M11**: No config file (`.cortexrc`) — every session configured from scratch — dx
- **M12**: Framework detection missing — Vue/Svelte users get silent failure, not helpful error — dx
- **M13**: CSS transitions animate during token switching — suppress `transition` inline during preview (double-rAF pattern) — frontend
- **M14**: Shadow DOM components cannot be overridden — detect and show warning — frontend
- **M15**: `pointer-events` performance — cache fiber key lookup, throttle `handleHover` with `requestAnimationFrame` — frontend
- **M16**: Memory leak from `Map<number, Element>` never pruned across HMR cycles — frontend
- **M17**: Shutdown endpoint should reject with 409 if pending changes exist — backend
- **M18**: URL bar sync is a v1 must-have, not a TBD — dx
- **M19**: Per-side spacing control (top/right/bottom/left independently) needed for real design work — design
- **M20**: Token buttons should render dynamically from discovered token map, not hardcoded xs/sm/md/lg/xl — design
- **M21**: Design Advisor tone guide needed — lead with what IS possible, explain in designer language — design
- **M22**: Finalization flow should surface WebSocket progress in browser: "Claude applying changes... (3/8)" — design, dx
- **M23**: Token maps stale on in-session theme switches — if user toggles dark/light mode, cached token values are wrong (NEW) — frontend
- **M24**: `selectionId` collision on HMR full reload — counter resets to 0, stale Map entries reference wrong elements (NEW) — frontend
- **M25**: CSS Module hash regex too narrow — misses webpack `--` separator format, Vite `_hash` format, and responsive variants (NEW — extended) — frontend
- **M26**: `classifyElement` is Mantine-specific — shadcn/Radix/Chakra components all return `'unknown'` (NEW) — frontend
- **M27**: `__zerofog_frame=1` query param corrupts SSR caching — CDN/edge caches serve instrumented HTML to non-editor users (NEW) — frontend, backend
- **M28**: `mouseover` + `Object.keys` on every hover is expensive on dense pages — throttle and cache fiber key lookup (NEW) — frontend
- **M29**: `textContent` capture leaks sensitive data — API keys displayed in settings pages get captured in diff payload, persisted to WAL (NEW) — security
- **M30**: Injected script URLs are predictable — any iframe code can `fetch('/__zerofog/client/inspector.js')` and extract `SESSION_ID` (NEW) — security
- **M31**: State duplication across 3 layers — browser `sessionStorage`, sidecar memory, WAL file. Sidecar should be single source of truth; browser reconstructs on reconnect (NEW) — fullstack
- **M32**: Slash command template not versioned — `init` copies a snapshot that diverges from package updates. No version check, no migration, no warning (NEW) — fullstack
- **M33**: No error propagation strategy — errors detectable at step 2 (inspector can't resolve source) only surface at step 6 (Claude can't find file). Each layer should fail fast (NEW) — fullstack
- **M34**: No structured logging — single `console.warn` in entire plan. Need structured JSON logs with request IDs for debugging (NEW) — backend
- **M35**: `POST /api/complete` has no verification — Claude self-reports success, but wrong file could have been edited or a linter could have auto-reverted (NEW) — fullstack
- **M36**: Nav-blocker injection at `</body>` is too late — routers capture `pushState` reference at module init. Must inject in `<head>` and patch `History.prototype.pushState` (NEW) — frontend
- **M37**: Tailwind regex has false positives — `/\bp[xytblr]?-(\S+)/` matches `position-relative` and misses responsive variants like `md:p-4` (NEW) — frontend
- **M38**: `elementFromPoint` re-finding still in toolbar code (`visual-toolbar.js:585-593`) — must be cleaned up, as the plan's `Map<selectionId, Element>` approach supersedes it (NEW) — frontend
- **M39**: Shutdown during `processing` state orphans Claude's in-flight edits — need coordinated abort or "resume after restart" (NEW) — distsys
- **M40**: Component name ambiguity makes source-file grep unreliable — `Button` exists in `@mantine/core`, local `components/Button.tsx`, `@radix-ui`. Use `_debugSource` (file path + line) as Strategy 0 — frontend
- **M41**: OAuth redirect breaks iframe access — cross-origin navigation makes parent lose `postMessage`. Nav-blocker should detect and open in new tab — frontend
- **M42**: CSP stripping removes all content security protections — elevates any app XSS to arbitrary source modification. Replace CSP instead of stripping — security, backend
- **M43**: Service Workers at `:3000` inactive at `:4000` — SW cache serves HTML without injected scripts. Inject script to unregister existing SWs — frontend
- **M44**: Component model lacks variant/state semantics — hover/active states can't be edited — design
- **M45**: CTA/state language inconsistent ("Finalize" vs "Send to Claude") — design
- **M46**: Panel responsiveness and hierarchy underdefined — design
- **M47**: No dev server auto-detection — requires manual `--target localhost:3000` every run. Scan common ports, read framework configs — dx
- **M48**: Browser-derived selector can drive unsafe file targeting — diff must use abstract identifiers; backend resolves to file paths with allowlist — security
- **M49**: Figma/design-tool bridge is rhetorical, not specified — design
- **M50**: Selection pattern not discoverable without tutorial — design

#### LOW

- Port auto-increment (try 4000-4010 like Vite)
- Health endpoint should include state machine state
- Express 4.x specified but 5 has been stable since late 2025
- No mention of dark mode / accessibility in editing panel
- Product framing ("refinement") undersells value — reframe as "design-in-production autonomy"
- `init` command should verify prerequisites and handle existing files
- Overlay `transition: all 0.1s` is wasteful — use specific properties
- `findReactFiberKeys` uses `Object.keys` vs `getOwnPropertyNames` — may miss non-enumerable fiber internals

### Positive Practices — Preserve These

1. **Iframe shell architecture** — correct analysis of `position: fixed` + `100vw` problem (all reviewers)
2. **`noServer: true` WebSocket routing** — avoids socket-stealing race (frontend, distsys, backend, fullstack)
3. **Three-phase commit concept for override clearing** — prevents visual flash (distsys, fullstack, design)
4. **Write-ahead log for diff persistence** — right crash recovery primitive (distsys, backend, fullstack)
5. **`data-zerofog-ui="true"` ignore contract** — prevents inspector-inspects-itself (frontend)
6. **Lazy `buildTokenMaps` on first selection** — avoids SSR/hydration timing issues (frontend)
7. **Batch editing model** — accumulate browser-side, commit once (design, frontend)
8. **`responseInterceptor` for auto-decompression** — handles brotli/gzip correctly (frontend, backend)
9. **Cookie port-agnosticism** — correctly identifies cookies are port-agnostic (frontend)
10. **`Sec-Fetch-Dest` routing** — correct modern approach for iframe detection (frontend)
11. **Path-negative routing** — "anything NOT `/__zerofog`" is elegant and framework-proof (frontend, backend)
12. **Graceful shutdown sequence** — concrete and operationally sound (backend)
13. **postMessage origin + session validation** — proper browser-side trust boundary (security, frontend)
14. **Browse-lock-edit lifecycle** — clear mental model for designers (design)

### Architectural Recommendation (Fullstack-Native Cross-Cutting)

The fullstack review identified the systemic issue underlying many individual findings:

> The sidecar is treated as a dumb pipe (proxy + relay + file server). But it's the only stateful, persistent process. It should own more responsibility: orchestrate finalization, be the single source of truth, validate data flowing between browser and Claude, and provide observability.

Three architectural actions before writing code:
1. **Make the sidecar the orchestrator** — slash command becomes a thin trigger, not the transaction coordinator. Steps 3-5 of finalize (currently executed by an LLM following natural language) move to deterministic sidecar code
2. **Define source of truth** — sidecar owns state, browser reconstructs from sidecar on reconnect, WAL is the persistence layer
3. **Design error propagation** — each layer catches errors as early as possible; don't let bad data flow downstream to Claude

### Review Methodology Note

Seven expert personas deployed in two parallel modes: clink (multi-model) and native (Claude agents) — 14 total reviewers. This is a superset of the initial Feb 25 review (5 personas, 10 reviewers), adding **backend** and **fullstack** personas.

**Multi-model (Clink)**: Codex, Gemini 2.5 Pro, Claude — each reviewing from a different expert persona. Strength: genuine perspective diversity (different models have different blind spots). Codex excelled at state machine analysis (lease patterns, fencing tokens). Gemini produced thorough DX/holistic reviews. Claude's frontend review was the deepest — reading actual codebase files to surface 5 novel findings (token maps Mantine-only, portal selectors, HMR detection mechanism, selectionId collision, mouseover performance).

**Native (Claude agents)**: 7 parallel Claude subagents. Strength: deeper codebase access, implementation-level analysis, code-grounded fixes. The fullstack-native agent identified the systemic architectural issue (sidecar as orchestrator) that connects many individual findings.

**Novel findings unique to expanded review** (not in initial 5-persona review): C5 (token maps Mantine-only), C7 (browser-to-terminal elevated from HIGH), H2 (HMR detection broken), H4 (portal selectors), H6 (slash command git stash), H8 (`responseInterceptor` streaming SSR), H9 (graceful shutdown), H10 (WS heartbeat), H11 (idempotency), plus 17 new MEDIUM-severity items from backend/fullstack/deeper-frontend analysis.

**Recommendation**: Use multi-model for breadth (security threat modeling, product thesis challenges) and native agents for depth (code-level correctness, implementation strategy, cross-cutting architecture). The two approaches are complementary, not substitutes. For future reviews, the fullstack-native persona is the highest-value addition — its cross-cutting perspective connects findings that appear independent when viewed from single-domain personas.

---

## Architecture Review Findings — Internal Tool Re-evaluation (2026-02-25)

Review team: **security**, **pm**, **mts**, **dx**, **frontend**, **backend**, **fullstack** (7 personas)
Mode: **both** (clink multi-model + native Claude agents = 14 total reviewers)
Framing: Re-evaluate all findings through the lens of an **internal dev tool** — known team, known stack (React + Mantine dominant, ~17% Tailwind, ~3% CSS Modules), known deployment (localhost). Maintain fundamental security, cut everything else.

### Cross-Reviewer Consensus

Issues flagged by 3+ reviewers independently — highest-confidence signals:

| Issue | Flagged By | Severity (Internal) | Severity (Original) |
|---|---|---|---|
| CSS overrides via `element.style` do not survive React reconciliation | frontend, mts, fullstack, backend, dx | **CRITICAL** | HIGH |
| React 19 `_debugOwner` removal silently breaks fiber traversal | frontend, mts, security, dx, backend, fullstack | **CRITICAL** | CRITICAL |
| Finalization state machine has no timeout/recovery from `processing` state | security, mts, backend, fullstack, frontend | **CRITICAL** | CRITICAL |
| `buildTokenMaps` is Mantine-only (hardcoded `--mantine-*` CSS vars) | frontend, mts, dx, fullstack | **HIGH** | CRITICAL |
| Browser-to-terminal context switch kills adoption | pm, mts, dx, fullstack, frontend | **MEDIUM** | CRITICAL |
| Default "all instances" scope is unintuitive | mts, dx, pm, frontend | **MEDIUM** | CRITICAL |
| GET `/api/diff` mutates state (violates HTTP semantics) | backend, fullstack, mts, security | **MEDIUM** | HIGH |
| Plan over-engineered by ~2x for internal use | pm, mts, fullstack, dx | **META** | N/A |
| Naming inconsistency (zerofog/cortex/visual-editor) | mts, dx, backend, frontend | **LOW** | CRITICAL |
| `pushState` monkey-patch may miss App Router server navigations | frontend, backend, fullstack | **MEDIUM** | HIGH |
| Portal elements produce wrong DOM-based selectors | frontend, backend, fullstack | **HIGH** | MEDIUM |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1

**IC1. CSS Overrides Via `element.style.setProperty` Do Not Survive React Reconciliation**
_Flagged by: frontend-native (primary), mts, fullstack, backend, dx_

The existing code at `visual-toolbar.js:247` applies overrides via `element.style.setProperty`. React owns the `style` attribute on managed elements. Any state change, context update, or parent re-render resets the `style` attribute to what React's VDOM expects. In a normal editing session:
1. Designer selects element, changes padding to `xl`
2. Interacts with the page (clicks dropdown, scrolls)
3. Interaction triggers state update → React re-renders parent
4. Padding change visually disappears

This is the **normal usage flow**, not an edge case. The designer loses trust immediately.

**Fix**: Switch to an injected `<style>` tag strategy. CSS in `<style>` elements not created by React survives reconciliation and HMR:
```javascript
const overrideSheet = document.createElement('style');
overrideSheet.id = '__zerofog_overrides__';
overrideSheet.setAttribute('data-zerofog-ui', 'true');
document.head.appendChild(overrideSheet);

function applyOverride(selector, property, value) {
  overrideSheet.textContent += `\n${selector} { ${property}: ${value} !important; }`;
}
```

**What this also cuts**: The MutationObserver HMR detection (document lines 843-846) becomes unnecessary for override survival. HMR detection is only needed for the "verify real code landed" step — which can use the simpler approach of tapping the HMR WebSocket the sidecar already proxies.

---

**IC2. React Fiber Traversal Uses `_debugOwner` — Removed in React 19**
_Flagged by: all 14 reviewers across both modes_

`visual-inspect.js:52` and `visual-toolbar.js:83,128` walk `_debugOwner` chains to build component ancestry. In React 19+, `_debugOwner` is removed and replaced by `fiber.owner` (or walking `fiber.return` filtering by tag 0/1). Silent failure: `componentChain` returns empty arrays, which means:
- Panel shows `unknown` for every element type
- `detectStyleOrigin` never finds Mantine fibers → never detects `mantine-prop` origin
- Every edit falls through to Tailwind regex or CSS Module detection → wrong diffs

**Internal simplification**: You know your exact React version. Implement **one** traversal strategy matched to your pinned version. Cut the multi-version detection, `_debugStack` parsing, and `fiber.owner` fallback chain from the original review's C4 fix. One React version = one traversal strategy.

---

**IC3. Finalization State Machine Deadlock — No Recovery from `processing`**
_Flagged by: security-native (primary), mts, backend, fullstack, frontend_

If Claude crashes, the terminal is closed, or the network drops after `GET /api/diff` advances state to `processing` (document line 822), the session is permanently stuck. No timeout, no recovery. Designer must restart the sidecar and redo all work.

**Internal simplification**: You do not need lease-based claims or fencing tokens (those are distributed systems patterns for multiple untrusted actors). A simple timeout is sufficient:
```javascript
this.processingTimeout = setTimeout(() => {
  console.warn('[cortex] Processing timed out after 120s, reverting to pending_diff');
  this.state = 'pending_diff';
  // Notify browser: "Claude didn't finish. Click to retry."
}, 120_000);
clearTimeout(this.processingTimeout); // on success
```

---

#### HIGH — Should fix in v1

**IH1. Portal Elements Produce Wrong Selectors (Mantine Modals/Drawers)**
_Flagged by: frontend-native (primary), backend, fullstack_

Mantine uses portals heavily for modals, drawers, popovers, selects, date pickers, tooltips. When a designer selects a portaled element, `element.closest('[data-testid]')` at `visual-inspect.js:28-29` walks DOM ancestors and finds a testId on `document.body` or an unrelated ancestor — because the modal is portaled to `document.body`, not nested under the rendering component.

**Fix**: When `testId` is found, verify it belongs to an ancestor in the fiber tree (not just DOM tree). If the fiber chain's first component doesn't match the testId element's fiber, discard testId and fall back to `componentChain[0]`. ~10-line check.

---

**IH2. Per-Side Spacing Control Missing**
_Flagged by: frontend-native (primary), dx, design_

Current implementation at `visual-toolbar.js:450-456` applies padding/margin as a single shorthand. Real design work almost always needs per-side control ("more padding on the left, top is fine"). Without this, every spacing change is all-or-nothing.

**Fix**: The infrastructure exists — `detectStyleOrigin` at `visual-toolbar.js:96-100` already lists per-side props (`px`, `py`, `pt`, `pb`, `pl`, `pr`). The panel UI just needs to expose individual sides under each spacing category.

---

**IH3. Alt+Click Selection Conflict on macOS**
_Flagged by: frontend, dx, pm_

On macOS, Alt+Click (Option+Click) triggers "download link" behavior in Safari and has system-level semantics. Your designers are almost certainly on macOS.

**Fix for internal use**: Use a mode toggle (click eyedropper icon in panel, then bare clicks select) or Cmd+Click. Pick one, don't support both. Mode toggle is more discoverable.

---

**IH4. `elementFromPoint` Re-finding Pattern Is Fragile**
_Flagged by: frontend-native (primary), backend, fullstack_

`visual-toolbar.js:585-593` recovers DOM elements via `document.elementFromPoint(centerX, centerY)`. Fails when: element has scrolled, another element overlaps center (tooltip/dropdown), or element has `pointer-events: none`. The plan's design (document line 268) correctly replaces this with `Map<selectionId, Element>` — just ensure the legacy code path isn't carried over.

---

**IH5. `responseInterceptor` Buffering Defeats Streaming SSR**
_Flagged by: frontend, backend, fullstack_

If the dev server uses React 18+ streaming SSR (`renderToPipeableStream`), full-response buffering causes a blank page until the entire HTML is buffered.

**Internal decision**: Check whether your dev server uses streaming SSR. If on Next.js App Router with `loading.tsx` Suspense boundaries, you have streaming. If on Vite with CSR, this is a non-issue.

**Fix if needed**: Inject in `</head>` instead of `</body>`. Head completes before streaming body, so injection works without buffering.

---

#### MEDIUM

- **IM1. GET `/api/diff` mutates state** — Violates HTTP semantics (GET should be idempotent). Change to `POST /api/diff` with `{ action: "claim" }` body. Trivial fix, prevents confusion. _(backend, fullstack, mts, security)_
- **IM2. Browser-to-terminal context switch** — For internal use, auto-trigger finalization from the panel. Sidecar writes a trigger file or uses Claude Code extension API. Designer clicks "Apply to Code" → sees progress indicator → source updates. Cut the multi-step slash command template (document lines 734-785). _(pm, mts, dx, fullstack, frontend)_
- **IM3. Default "all instances" scope** — Instead of instance-level editing infrastructure, have Claude report affected count: "Changing Card padding to xl. This Card is used in 14 files." Designer confirms or scopes. _(mts, dx, pm, frontend)_
- **IM4. `pushState` monkey-patch may miss App Router navigations** — Check your router. If App Router: patch `History.prototype.pushState` (prototype, not instance) and use Navigation API as primary interception. If Pages Router or Vite: current approach is sufficient. _(frontend, backend, fullstack)_
- **IM5. Tailwind regex has false positives** — `/\bp[xytblr]?-(\S+)/` at `visual-toolbar.js:137` matches `position-relative` and misses responsive variants like `md:p-4`. Tighten regex or enumerate your actual Tailwind spacing classes from `tailwind.config`. _(frontend, mts)_
- **IM6. `sessionStorage` backup is origin-scoped** — Two tabs on `localhost:4000` share `sessionStorage`. Store overrides in parent frame JS memory (tab-scoped) instead. Cut `sessionStorage` backup; sidecar WAL is the durable store. _(frontend, security)_
- **IM7. Memory leak in `Map<selectionId, Element>`** — Counter increments forever. Cap at 50 entries or use `WeakRef<Element>`. _(frontend, mts)_
- **IM8. CSS transitions animate during token preview** — Suppress with `transition: none !important` during preview. _(frontend, dx)_
- **IM9. `classifyElement` is Mantine-specific** — Hardcoded Mantine component names at `visual-inspect.js:96-167`. Acceptable for internal use (80% Mantine). Non-Mantine elements get `unknown` classification → all editing categories shown. _(frontend)_
- **IM10. WebSocket heartbeat/keepalive missing** — Laptop sleep/wake silently kills connection. Add ping/pong at 30s intervals, reconnect on failure, show "reconnecting..." indicator. ~20 lines. _(frontend, backend, security)_

#### LOW

- **IL1. Naming inconsistency (zerofog/cortex/visual-editor)** — Pick one name, find-and-replace in the plan. 15 minutes. Not blocking. _(mts, dx, backend, frontend)_
- **IL2. Multi-framework support not needed** — Delete Vue/Svelte/Angular from open questions. You use React. _(pm, mts, fullstack)_
- **IL3. Service Worker interference** — Check `chrome://serviceworker-internals` on your dev server. If no SW registered, skip entirely. _(frontend)_
- **IL4. Security overkill for localhost dev tool** — Cut Bearer tokens on HTTP endpoints, first-message WebSocket auth, full CSRF protection. Keep: loopback binding (`127.0.0.1`), Host header validation. That's sufficient for internal use. _(security, pm, fullstack)_
- **IL5. npm distribution infrastructure** — Cut `npx @zerofog/visual-editor`. Internal tool can be a git clone + `node server.js`. _(pm, dx)_
- **IL6. Express 4 vs 5** — Use Express 5 if starting fresh. Not blocking either way. _(backend)_
- **IL7. Panel UI framework choice** — Imperative DOM construction is fine for v1. ~10 interactive elements. Upgrade to Preact/lit-html only if it grows. _(frontend, dx)_

### What to CUT vs KEEP vs SIMPLIFY for Internal Tooling

#### CUT (Defer Indefinitely)

| Item | Reason |
|---|---|
| Multi-framework token resolution | You use Mantine. Tailwind fallback is adequate. |
| Vue/Svelte/Angular support | You use React. |
| Bearer token auth on HTTP endpoints | Localhost dev tool. Loopback binding is sufficient. |
| Lease-based finalization protocol | Simple timeout is sufficient for one Claude instance. |
| Instance-level editing infrastructure | Report blast radius; let designer decide. |
| `_debugStack` string parsing | Pin to your React version's fiber traversal. |
| Multi-React-version detection | You have one React version. |
| Service Worker unregistration | Verify you don't have SWs, then ignore. |
| Framework auto-detection | You know your framework. |
| `sessionStorage` override backup | Parent frame memory + sidecar WAL is sufficient. |
| npm distribution infrastructure | Git clone + `node server.js` for internal use. |
| Tailwind CSS parsing for token maps | Coincidental Mantine alignment covers most cases. |

#### KEEP (Essential for v1)

| Item | Why |
|---|---|
| Fix `_debugOwner` for your React version (IC2) | Without this, component chain is empty and nothing works. |
| Switch to `<style>` tag overrides (IC1) | Without this, overrides vanish on any re-render. |
| Processing timeout on state machine (IC3) | Without this, one crash permanently bricks the session. |
| Portal-aware testId lookup (IH1) | Mantine modals/drawers are portaled. Wrong selectors = wrong edits. |
| Per-side spacing control (IH2) | Without this, designers cannot do real design work. |
| Alt+Click replacement (IH3) | macOS designers cannot select elements without this. |
| WebSocket heartbeat (IM10) | Laptop sleep/wake silently kills connection. |
| `<head>` injection for nav-blocker (if App Router) (IH5) | Otherwise nav-blocking fails for streaming SSR. |
| Loopback binding + Host header validation (IL4) | Minimum viable security for localhost. |

#### SIMPLIFY (Lighter Implementation Than Documented)

| Item | Simplified Approach |
|---|---|
| Security | Loopback binding + Host header validation only. |
| State machine deadlock | 120-second timeout, not lease/fencing. |
| All-instances scope | Report count, let designer confirm. No instance-level infra. |
| Browser-to-terminal flow | Sidecar auto-triggers finalization. No terminal typing. |
| HMR detection | Tap HMR WebSocket in sidecar (already proxied). No MutationObserver. |
| Token maps for Tailwind | Show no active token for Tailwind elements. Diff records `styleOrigin: 'tailwind'`. |
| Naming | Pick one name now. 15-minute find-and-replace. |

### Implementation Priority Order (Internal v1 Critical Path)

1. **Fix fiber traversal** for your React version — without this, everything downstream fails
2. **Switch to `<style>` tag overrides** — without this, the tool is visually broken after any re-render
3. **Add processing timeout** to the state machine — without this, one crash requires manual recovery
4. **Add per-side spacing control** — without this, designers will reject the tool as too limited
5. **Replace Alt+Click** with mode toggle or Cmd+Click — without this, macOS users cannot select elements
6. **Auto-trigger finalization** from the panel — without this, designers must context-switch to terminal

### Positive Practices — Preserve These

1. **Iframe shell architecture** — correct `position: fixed` + `100vw` analysis. The plan's approach of rendering the app in an iframe with the panel alongside in Shadow DOM is architecturally sound. _(all reviewers)_
2. **`noServer: true` WebSocket routing** — avoids socket-stealing race between proxy and editor. _(frontend, backend, fullstack)_
3. **Batch editing model** — accumulate browser-side, commit once. Right primitive for design iteration. _(design, frontend, pm)_
4. **Write-ahead log for diff persistence** — correct crash recovery primitive. Even simplified, the WAL concept should remain. _(backend, fullstack, mts)_
5. **`data-zerofog-ui="true"` ignore contract** — prevents inspector-inspects-itself. Elegant and framework-agnostic. _(frontend)_
6. **Token-constrained editing** — only design system tokens, no arbitrary pixels. Prevents designers from creating unmaintainable one-off values. _(design, pm, dx)_
7. **`Sec-Fetch-Dest` routing** — correct modern approach for iframe detection. _(frontend, backend)_
8. **Path-negative routing** (`/__zerofog` prefix) — elegant, framework-proof namespace isolation. _(frontend, backend)_
9. **Lazy `buildTokenMaps` on first selection** — avoids SSR/hydration timing issues. _(frontend)_
10. **Browse-lock-edit lifecycle** — clear mental model for designers. _(design, pm)_

### Scope Reduction Summary

The consensus across PM, MTS, DX, and fullstack reviewers is that **the plan is over-engineered by ~2x for an internal tool**. The original plan was written for a public product with unknown users, unknown frameworks, and unknown deployment contexts. For a known team on a known stack:

- **~40% of the plan's complexity can be cut** without losing any functionality your team needs
- **Security requirements drop from 14 items to 2** (loopback binding + Host header)
- **Framework support drops from "any" to "React + Mantine"** with Tailwind fallback
- **Distribution drops from npm to git clone**
- **Finalization drops from multi-step slash command to auto-triggered**

The result is a tool that can ship in roughly half the time while serving the same internal use case.

### Review Methodology Note

This is the **second review pass** of this document. The first pass (above, lines 1048-1277) deployed 7 personas in both modes (14 reviewers) from a public product perspective. This second pass re-deployed the same 7 personas with an **internal-tool framing**: "given that this is an internal tool, what should we add/remove? We still want to maintain fundamental security."

**Key differences from Pass 1**:
- 5 findings **downgraded** in severity (security items, naming, all-instances scope, browser-to-terminal, Mantine-only tokens)
- 1 finding **upgraded** (CSS override survival: HIGH → CRITICAL, because it's the normal usage flow, not an edge case)
- 12 items identified as **cuttable** for internal use
- 7 items identified as **simplifiable** (lighter implementation than documented)
- New **implementation priority order** reflecting internal-tool constraints

**Multi-model (Clink)**: Codex, Gemini 2.5 Pro, Claude — each reviewing from a different persona. Gemini excelled at holistic DX analysis. Codex produced thorough state machine and API contract analysis. Claude's PM review was the most impactful for scope reduction.

**Native (Claude agents)**: 7 parallel Claude subagents with full codebase access. The frontend-native agent produced the deepest technical analysis — reading `visual-inspect.js` and `visual-toolbar.js` line-by-line to ground every finding in actual code. The fullstack-native agent again identified the systemic cross-cutting issues.

**Recommendation**: For the internal v1, use this second review as the authoritative severity ranking. The first review's findings remain valid but their priorities were calibrated for a public product.
