# Phase 7: AI Path — Design Spec

**Ticket:** ZF0-892
**Date:** 2026-03-22
**Predecessor:** ZF0-908 (CLI-server communication layer — complete)

## Overview

Build 6 MCP tools, annotation lifecycle, comment UI, comment pin mode, element-scoped threads, session activity log, and agent response rendering on top of the existing CLI-server communication layer.

## Architecture Decision: Annotation Store Location

**Chosen: Option B — Vite server as single source of truth.**

The annotation store lives in the Vite dev server process. MCP tool calls query it via a request/response (RPC) protocol over the existing WebSocket bridge.

**Rationale:** Survives MCP restarts, supports multiple CLI clients, browser can render annotations without MCP running. The alternative (store in MCP process) would lose state on restart and create multiple divergent stores with multiple CLI clients.

## RPC Protocol

The WebSocket bridge (currently fire-and-forget with `CLI_ALLOWED_TYPES` allowlist) gains a correlated request/response layer for MCP tool queries.

### CLI → Vite
```typescript
{ type: 'cortex-rpc', requestId: string, method: string, params: Record<string, unknown> }
```

### Vite → CLI (same WebSocket that sent the request)
```typescript
{ type: 'cortex-rpc-result', requestId: string, result: unknown }
{ type: 'cortex-rpc-error', requestId: string, error: string }
```

**Key constraints:**
- RPC responses route to the **specific CLI client** that made the request (not broadcast)
- Handled in the per-client `ws.on('message')` handler where the individual socket is available
- RPC messages are NOT forwarded to the browser
- 10-second timeout on the MCP side for safety
- `requestId` is a UUID for correlation

## Module Structure

```
src/core/annotations.ts              — AnnotationStore (pure state, no transport)
src/core/session/activity-log.ts      — ActivityLog (chronological event tracker)
src/cli/mcp.ts                        — 6 new tools + RPC helper
src/adapters/vite.ts                  — RPC handler + annotation store instance + agent status
src/adapters/types.ts                 — Annotation types + new message types
src/browser/components/CommentInput.tsx   — text input at panel bottom
src/browser/components/CommentPin.tsx     — blue dots overlay
src/browser/components/CommentThread.tsx  — bidirectional thread UI
src/browser/components/ActivityLog.tsx    — popover from toolbar badge
```

## Annotation State Machine

```
pending → acknowledged → resolved (with summary)
                       → dismissed (with optional reason)
```

### Valid State Transitions

| From | To | Method | Notes |
|------|-----|--------|-------|
| `pending` | `acknowledged` | `acknowledge()` | Agent claims the annotation |
| `acknowledged` | `resolved` | `resolve()` | Agent applied the change |
| `acknowledged` | `dismissed` | `dismiss()` | Agent skipped the annotation |
| `pending` | `dismissed` | `dismiss()` | Agent skips without acknowledging first |

**Invalid transitions** (return `null`):
- `resolved` → any state (terminal)
- `dismissed` → any state (terminal)
- `pending` → `resolved` (must acknowledge first)
- Any repeated transition to current state (not idempotent — return `null`)

Thread messages can be added in any non-terminal state (`pending` or `acknowledged`). Adding messages to `resolved`/`dismissed` annotations returns `null`.

### CreateAnnotationParams

```typescript
export interface CreateAnnotationParams {
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }
}
```

All other `Annotation` fields (`id`, `status`, `createdAt`, `updatedAt`, `thread`, etc.) are set by the store at creation time.

### Annotation Type

```typescript
export type AnnotationStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed'

export interface Annotation {
  id: string
  status: AnnotationStatus
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }  // relative to element bbox (0-1 range)
  createdAt: number
  updatedAt: number
  resolution?: { summary: string }
  dismissReason?: string
  thread: ThreadMessage[]
}

export interface ThreadMessage {
  id: string
  from: 'user' | 'agent'
  text: string
  timestamp: number
}
```

### AnnotationStore API

```typescript
class AnnotationStore {
  create(params: CreateAnnotationParams): Annotation
  getPending(): Annotation[]
  getById(id: string): Annotation | null
  acknowledge(id: string): Annotation | null
  resolve(id: string, summary: string): Annotation | null
  dismiss(id: string, reason?: string): Annotation | null
  addMessage(id: string, msg: Omit<ThreadMessage, 'id' | 'timestamp'>): Annotation | null
  getAll(): Annotation[]
}
```

Mutable class with `Map<id, Annotation>` internally. This is a deliberate trade-off: the store lives in a single-threaded Node.js Vite server process, so mutable state is safe and simpler than an immutable approach. No transport dependencies — fully unit-testable.

## MCP Tools

Six tools registered via `server.registerTool()` in `mcp.ts`:

| Tool | Input Schema | RPC Method | Description |
|------|-------------|------------|-------------|
| `cortex_get_pending` | `{}` | `getPending` | List all pending annotations (comments awaiting agent action) |
| `cortex_get_details` | `{ annotationId: string }` | `getDetails` | Full annotation with thread history |
| `cortex_acknowledge` | `{ annotationId: string }` | `acknowledge` | Mark annotation as "working on it" |
| `cortex_resolve` | `{ annotationId: string, summary: string }` | `resolve` | Mark annotation as applied with change summary |
| `cortex_dismiss` | `{ annotationId: string, reason?: string }` | `dismiss` | Skip annotation with optional reason |
| `cortex_respond` | `{ annotationId: string, text: string }` | `respond` | Send clarification/reply to annotation thread |

### RPC Helper (in mcp.ts)

```typescript
import { randomUUID } from 'node:crypto'

const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}>()

function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  const socket = ws
  if (!connected || !socket) throw new Error('Not connected to Vite server')
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      reject(new Error('RPC timeout'))
    }, 10_000)
    pendingRequests.set(requestId, {
      resolve: (v: unknown) => { clearTimeout(timer); resolve(v) },
      reject: (e: Error) => { clearTimeout(timer); reject(e) },
    })
    socket.send(JSON.stringify({ type: 'cortex-rpc', requestId, method, params }))
  })
}
```

WebSocket `message` handler in `mcp.ts` dispatches RPC responses:
```typescript
if (msg.type === 'cortex-rpc-result' || msg.type === 'cortex-rpc-error') {
  const pending = pendingRequests.get(msg.requestId)
  if (!pending) return
  pendingRequests.delete(msg.requestId)
  if (msg.type === 'cortex-rpc-result') pending.resolve(msg.result)
  else pending.reject(new Error(msg.error))
}
```

### RPC Handler (in vite.ts)

**Must be inserted BEFORE the `CLI_ALLOWED_TYPES` guard** in the per-client `ws.on('message')` handler, so RPC messages are intercepted before the allowlist rejects them:

```typescript
const ALLOWED_RPC_METHODS = new Set(['getPending', 'getDetails', 'acknowledge', 'resolve', 'dismiss', 'respond'])

// In ws.on('message') handler — BEFORE the CLI_ALLOWED_TYPES check:
if (type === 'cortex-rpc') {
  const { requestId, method, params } = parsed as { requestId: string; method: string; params: Record<string, unknown> }
  if (!ALLOWED_RPC_METHODS.has(method)) {
    ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: `Unknown RPC method: ${method}` }))
    return
  }
  try {
    const result = handleAnnotationRPC(method, params)
    ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
  } catch (err) {
    ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: err instanceof Error ? err.message : String(err) }))
  }
  return  // don't forward RPC to browser or hit CLI_ALLOWED_TYPES check
}
```

`handleAnnotationRPC` validates params per-method (e.g., `annotationId` must be a non-empty string for `acknowledge`) and dispatches to `AnnotationStore` methods. On state-changing operations, it broadcasts `annotation-updated` to browser via `channelInstance.send()`.

## Message Protocol Extensions

These types must be added to the discriminated unions in `src/adapters/types.ts`.

### ServerToBrowser — add 4 variants

```typescript
export type ServerToBrowser =
  | ... existing 8 variants ...
  | { type: 'annotation-created'; annotation: Annotation }
  | { type: 'annotation-updated'; annotation: Annotation }
  | { type: 'agent-status'; connected: boolean }
  | { type: 'activity-entry'; entry: ActivityEntry }
```

### BrowserToServer — extend `comment` variant with `pinPosition`

```typescript
// Replace the existing comment variant:
| { type: 'comment'; protocolVersion?: number; elementSource: string; text: string;
    elementContext?: ElementContext; currentStyles?: Record<string, string>;
    pinPosition?: { x: number; y: number } }
```

When `pinPosition` is present → pin comment (blue dot). Otherwise → panel comment.

The `Annotation`, `ThreadMessage`, `AnnotationStatus`, `CreateAnnotationParams`, and `ActivityEntry` types are also exported from `types.ts` so both server and browser code share the same contracts.

## Data Flows

### Comment Creation

1. User types in CommentInput or pins a comment via click
2. Browser sends `{ type: 'comment', elementSource, text, pinPosition? }` via HMR
3. Vite `hotHandler` receives it → `AnnotationStore.create()` + `ActivityLog.addComment()`
4. Vite sends `{ type: 'annotation-created', annotation }` to browser via HMR
5. Vite forwards original `comment` message to CLI clients via `forwardToCLI()`
6. Browser renders pending state in comment thread

### MCP Tool Call

1. Claude Code calls `cortex_get_pending`
2. MCP handler calls `rpc('getPending', {})`
3. WebSocket sends `{ type: 'cortex-rpc', requestId, method: 'getPending', params: {} }`
4. Vite RPC handler calls `annotationStore.getPending()`
5. Vite responds: `{ type: 'cortex-rpc-result', requestId, result: [...] }`
6. MCP handler resolves Promise, formats as MCP tool result text

### Agent Lifecycle

1. Claude Code calls `cortex_acknowledge({ annotationId: '...' })`
2. RPC → Vite → `annotationStore.acknowledge(id)` → updates status to `acknowledged`
3. Vite broadcasts `{ type: 'annotation-updated', annotation }` to browser
4. Browser thread UI shows "working" status (blue spinner)
5. Claude Code later calls `cortex_resolve({ annotationId, summary: '...' })`
6. Same flow → status `resolved` → browser shows "Applied" with summary + blue pulse on element

### Agent Connection Tracking

1. CLI WebSocket connects → Vite checks `cliClients.size > 0` → sends `{ type: 'agent-status', connected: true }` to browser
2. CLI WebSocket disconnects → Vite checks `cliClients.size > 0` → sends `{ type: 'agent-status', connected: cliClients.size > 0 }` to browser
3. Browser toggles CommentInput enabled/disabled state

`connected` reflects whether **any** CLI client is connected (not a specific one). Multiple CLI connections are supported (up to `MAX_CLI_CONNECTIONS = 5`); disconnecting one while another is still connected keeps the UI enabled.

## Activity Log

### Server-Side (src/core/session/activity-log.ts)

```typescript
export interface ActivityEntry {
  id: string
  type: 'edit' | 'comment' | 'status-change'
  timestamp: number
  elementSource?: string
  description: string
  details?: Record<string, unknown>
}

export class ActivityLog {
  private entries: ActivityEntry[] = []
  private readonly maxEntries = 500  // oldest-first eviction

  add(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry
  getAll(): ActivityEntry[]
  getRecent(count: number): ActivityEntry[]
  getSince(timestamp: number): ActivityEntry[]
  get count(): number
}
```

### Integration Points
- Edit pipeline → `activityLog.add({ type: 'edit', ... })` on each CSS edit
- Annotation creation → `activityLog.add({ type: 'comment', ... })`
- Annotation status change → `activityLog.add({ type: 'status-change', ... })`
- Each add sends `{ type: 'activity-entry', entry }` to browser

## Browser State Management

Annotation state in the browser is managed in `CortexApp.tsx` (the root component), following the existing pattern for `selectedElement` and `activityCount`:

```typescript
const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map())
const [agentConnected, setAgentConnected] = useState(false)

// In channel.onMessage subscription:
if (msg.type === 'annotation-created') {
  setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
}
if (msg.type === 'annotation-updated') {
  setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
}
if (msg.type === 'agent-status') {
  setAgentConnected(msg.connected)
}
```

This state is passed down to `CommentInput`, `CommentPin`, `CommentThread`, and `ActivityLog` as props. No separate state hook needed — the root component is already the state hub.

## Browser Components

### CommentInput

Location: Bottom of Panel, below property sections.

- Single-line text input with Enter to submit
- Sends `{ type: 'comment', elementSource, text }` via channel
- "No agent connected" muted state: gray text, disabled input
- Enabled/disabled driven by `agent-status` messages
- After submit: shows pending annotation with spinner until acknowledged

### CommentPin

Location: Overlay layer (sibling to SelectionOverlay).

- **Pin mode** activated by a new toolbar comment button (added in this phase)
- Crosshair cursor (`cursor: crosshair`) when in pin mode
- Click on element → inline text input appears at click position
- Submit → creates annotation with `pinPosition` (relative to element bbox, 0-1 range)
- Blue dot (12px circle, `background: #3b82f6`) persists at pin position
- Pin positions re-computed on scroll/resize using element's current `getBoundingClientRect()`
- Click dot → opens CommentThread card positioned near the pin

### CommentThread

- Shows annotation text + all `thread` messages
- Status badge: pending (gray `○`) → acknowledged (blue `◉` + "Working...") → resolved (green `✓` + summary) → dismissed (red `✗` + reason)
- User reply input at bottom for clarification flow
- Agent messages rendered with distinct styling (left-aligned, different bg)
- Agent "Applied" response shows change summary text

### ActivityLog

- Popover triggered by toolbar badge click
- Chronological list, newest first
- Each entry: timestamp, type icon (pencil for edit, chat for comment, arrow for status), description, element reference
- Badge count shows entries since last opened (resets on open)
- Max 100 entries displayed (scrollable)

## Pin Position Strategy

Pin coordinates stored as **relative position within element bounding box** (0-1 range for both x and y):

```typescript
pinPosition: {
  x: (clickX - rect.left) / rect.width,   // 0 = left edge, 1 = right edge
  y: (clickY - rect.top) / rect.height,   // 0 = top edge, 1 = bottom edge
}
```

Rendering: `element.getBoundingClientRect()` + relative offset → viewport coordinates. Re-computed on scroll/resize via `requestAnimationFrame`. Invariant to scroll, resize, and minor layout shifts.

**Zero-size element guard:** If `rect.width === 0 || rect.height === 0` (element has `display: none` or is removed from layout), hide the pin dot rather than rendering at `NaN`/`Infinity` coordinates. During creation, reject pin placement on zero-size elements.

## Not In Scope

- SPA navigation handling for pins (Phase 8b)
- localStorage persistence for comments/activity (Phase 8b)
- Dark mode theming for new components (Phase 8b)
- Move operations as annotations
- Markdown export fallback
- `cortex_get_batch` (replaced by `cortex_respond` for thread-based interaction)

## Test Plan

| Module | Test File | Key Cases |
|--------|----------|-----------|
| AnnotationStore | `tests/core/annotations.test.ts` | Create, lifecycle transitions, invalid transitions rejected, thread messages, getPending filters |
| ActivityLog | `tests/core/session/activity-log.test.ts` | Add entries, getRecent, getSince, count |
| MCP Tools | `tests/cli/mcp.test.ts` (extend) | 6 tools callable, RPC round-trip, timeout handling, error cases |
| RPC Protocol | `tests/adapters/vite.test.ts` (extend) | RPC request/response, per-client routing, invalid method handling |
| CommentInput | `tests/browser/comment-input.test.tsx` | Submit sends message, disabled when no agent, spinner on pending |
| CommentThread | `tests/browser/comment-thread.test.tsx` | Status transitions, reply flow, agent message rendering |
| CommentPin | `tests/browser/comment-pin.test.tsx` | Pin creation, position calculation, dot rendering |
| ActivityLog UI | `tests/browser/activity-log.test.tsx` | Entry rendering, badge count, popover toggle |
| Round-trip | `tests/integration/annotation-lifecycle.test.ts` | Full flow: comment → create → getPending → acknowledge → resolve → browser update, concurrent clients |
