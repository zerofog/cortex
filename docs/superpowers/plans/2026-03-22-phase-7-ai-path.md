# Phase 7: AI Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 6 MCP tools, annotation lifecycle, comment UI, comment pins, threads, and activity log on the existing CLI-server communication layer.

**Architecture:** Annotation store lives in the Vite server process (single source of truth). MCP tools query it via RPC over the existing WebSocket bridge. Browser components are Preact functional components rendered inside the Shadow DOM.

**Tech Stack:** TypeScript, Preact, `@modelcontextprotocol/sdk`, `ws`, `zod`, Vitest

**Important constraints:**
- Browser tests use `import { render } from 'preact'` (NOT `@testing-library/preact`)
- MCP tool `inputSchema` uses Zod schemas (SDK requires `ZodRawShapeCompat`)
- `AnnotationStore` and `ActivityLog` use `node:crypto` — never import from browser code (types only via `types.ts`)

**Spec:** `docs/superpowers/specs/2026-03-22-phase-7-ai-path-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/core/annotations.ts` | AnnotationStore — pure state machine, no transport |
| `src/core/session/activity-log.ts` | ActivityLog — chronological event tracker with eviction |
| `src/browser/components/CommentInput.tsx` | Text input at panel bottom |
| `src/browser/components/CommentPin.tsx` | Blue dot overlay + inline input |
| `src/browser/components/CommentThread.tsx` | Bidirectional thread card |
| `src/browser/components/ActivityLog.tsx` | Popover from toolbar badge |
| `tests/core/annotations.test.ts` | AnnotationStore unit tests |
| `tests/core/session/activity-log.test.ts` | ActivityLog unit tests |
| `tests/browser/comment-input.test.tsx` | CommentInput component tests |
| `tests/browser/comment-thread.test.tsx` | CommentThread component tests |
| `tests/browser/comment-pin.test.tsx` | CommentPin component tests |
| `tests/browser/activity-log.test.tsx` | ActivityLog component tests |
| `tests/integration/annotation-lifecycle.test.ts` | Full round-trip integration |

### Modified Files
| File | Changes |
|------|---------|
| `src/adapters/types.ts` | Add Annotation, ThreadMessage, ActivityEntry types; extend ServerToBrowser + BrowserToServer unions |
| `src/cli/mcp.ts` | Add RPC helper, RPC response handler, 6 new tool registrations |
| `src/adapters/vite.ts` | Import AnnotationStore + ActivityLog, add RPC handler, agent-status broadcast, annotation creation on comment |
| `src/browser/components/CortexApp.tsx` | Add annotation/agent state, pass to components, render CommentPin + ActivityLog |
| `src/browser/components/Panel.tsx` | Add CommentInput below sections, pass channel + annotation props |
| `src/browser/components/Toolbar.tsx` | Add comment mode button, wire ActivityLog popover |
| `src/browser/styles.css` | Styles for comment-input, comment-pin, comment-thread, activity-log |

---

## Task 1: Types + AnnotationStore

**Files:**
- Modify: `cortex-editor/src/adapters/types.ts`
- Create: `cortex-editor/src/core/annotations.ts`
- Create: `cortex-editor/tests/core/annotations.test.ts`

- [ ] **Step 1: Add annotation types to types.ts**

Add after the `ElementContext` interface (line 84):

```typescript
// === Annotation types (Phase 7) ===

export type AnnotationStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed'

export interface Annotation {
  id: string
  status: AnnotationStatus
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }
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

export interface CreateAnnotationParams {
  elementSource: string
  text: string
  elementContext?: ElementContext
  currentStyles?: Record<string, string>
  pinPosition?: { x: number; y: number }
}

export interface ActivityEntry {
  id: string
  type: 'edit' | 'comment' | 'status-change'
  timestamp: number
  elementSource?: string
  description: string
  details?: Record<string, unknown>
}
```

Also extend the `ServerToBrowser` union — add 4 new variants after `hmr_verified`:

```typescript
  | { type: 'annotation-created'; annotation: Annotation }
  | { type: 'annotation-updated'; annotation: Annotation }
  | { type: 'agent-status'; connected: boolean }
  | { type: 'activity-entry'; entry: ActivityEntry }
```

And extend the `BrowserToServer` `comment` variant — add `pinPosition?`:

```typescript
  | { type: 'comment'; protocolVersion?: number; elementSource: string; text: string; elementContext?: ElementContext; currentStyles?: Record<string, string>; pinPosition?: { x: number; y: number } }
```

- [ ] **Step 2: Write failing tests for AnnotationStore**

Create `tests/core/annotations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { AnnotationStore } from '../../src/core/annotations.js'

describe('AnnotationStore', () => {
  it('creates an annotation with pending status', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'App.tsx:10:5', text: 'Make this blue' })
    expect(ann.id).toBeTruthy()
    expect(ann.status).toBe('pending')
    expect(ann.text).toBe('Make this blue')
    expect(ann.elementSource).toBe('App.tsx:10:5')
    expect(ann.thread).toEqual([])
    expect(ann.createdAt).toBeGreaterThan(0)
  })

  it('getPending returns only pending annotations', () => {
    const store = new AnnotationStore()
    store.create({ elementSource: 'a.tsx:1:1', text: 'one' })
    const ann2 = store.create({ elementSource: 'b.tsx:2:1', text: 'two' })
    store.acknowledge(ann2.id)
    expect(store.getPending()).toHaveLength(1)
    expect(store.getPending()[0].text).toBe('one')
  })

  it('getById returns annotation or null', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'hello' })
    expect(store.getById(ann.id)).toBeTruthy()
    expect(store.getById('nonexistent')).toBeNull()
  })

  it('acknowledge transitions pending → acknowledged', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    const result = store.acknowledge(ann.id)
    expect(result?.status).toBe('acknowledged')
  })

  it('resolve transitions acknowledged → resolved', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    store.acknowledge(ann.id)
    const result = store.resolve(ann.id, 'Changed color to blue')
    expect(result?.status).toBe('resolved')
    expect(result?.resolution?.summary).toBe('Changed color to blue')
  })

  it('dismiss transitions pending → dismissed', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    const result = store.dismiss(ann.id, 'Not applicable')
    expect(result?.status).toBe('dismissed')
    expect(result?.dismissReason).toBe('Not applicable')
  })

  it('dismiss transitions acknowledged → dismissed', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    store.acknowledge(ann.id)
    const result = store.dismiss(ann.id)
    expect(result?.status).toBe('dismissed')
  })

  it('rejects pending → resolved (must acknowledge first)', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    expect(store.resolve(ann.id, 'done')).toBeNull()
  })

  it('rejects transitions from terminal states', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')
    expect(store.acknowledge(ann.id)).toBeNull()
    expect(store.dismiss(ann.id)).toBeNull()
  })

  it('rejects repeated transition to same state', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    store.acknowledge(ann.id)
    expect(store.acknowledge(ann.id)).toBeNull()
  })

  it('addMessage adds to thread in non-terminal state', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    const result = store.addMessage(ann.id, { from: 'agent', text: 'What color?' })
    expect(result?.thread).toHaveLength(1)
    expect(result?.thread[0].from).toBe('agent')
    expect(result?.thread[0].text).toBe('What color?')
  })

  it('addMessage rejects for terminal states', () => {
    const store = new AnnotationStore()
    const ann = store.create({ elementSource: 'a.tsx:1:1', text: 'fix' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')
    expect(store.addMessage(ann.id, { from: 'user', text: 'hey' })).toBeNull()
  })

  it('creates annotation with pinPosition', () => {
    const store = new AnnotationStore()
    const ann = store.create({
      elementSource: 'a.tsx:1:1',
      text: 'fix this',
      pinPosition: { x: 0.5, y: 0.3 },
    })
    expect(ann.pinPosition).toEqual({ x: 0.5, y: 0.3 })
  })

  it('getAll returns all annotations', () => {
    const store = new AnnotationStore()
    store.create({ elementSource: 'a.tsx:1:1', text: 'one' })
    store.create({ elementSource: 'b.tsx:2:1', text: 'two' })
    expect(store.getAll()).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/core/annotations.test.ts`
Expected: FAIL — module `../../src/core/annotations.js` not found

- [ ] **Step 4: Implement AnnotationStore**

Create `src/core/annotations.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import type { Annotation, CreateAnnotationParams, ThreadMessage } from '../adapters/types.js'

export class AnnotationStore {
  private annotations = new Map<string, Annotation>()

  create(params: CreateAnnotationParams): Annotation {
    const now = Date.now()
    const annotation: Annotation = {
      id: randomUUID(),
      status: 'pending',
      elementSource: params.elementSource,
      text: params.text,
      elementContext: params.elementContext,
      currentStyles: params.currentStyles,
      pinPosition: params.pinPosition,
      createdAt: now,
      updatedAt: now,
      thread: [],
    }
    this.annotations.set(annotation.id, annotation)
    return this.snapshot(annotation)
  }

  getPending(): Annotation[] {
    return [...this.annotations.values()].filter(a => a.status === 'pending').map(a => this.snapshot(a))
  }

  getById(id: string): Annotation | null {
    const ann = this.annotations.get(id)
    return ann ? this.snapshot(ann) : null
  }

  private snapshot(ann: Annotation): Annotation {
    return { ...ann, thread: [...ann.thread] }
  }

  acknowledge(id: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status !== 'pending') return null
    ann.status = 'acknowledged'
    ann.updatedAt = Date.now()
    return this.snapshot(ann)
  }

  resolve(id: string, summary: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status !== 'acknowledged') return null
    ann.status = 'resolved'
    ann.resolution = { summary }
    ann.updatedAt = Date.now()
    return this.snapshot(ann)
  }

  dismiss(id: string, reason?: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status === 'resolved' || ann.status === 'dismissed') return null
    ann.status = 'dismissed'
    if (reason) ann.dismissReason = reason
    ann.updatedAt = Date.now()
    return this.snapshot(ann)
  }

  addMessage(id: string, msg: Omit<ThreadMessage, 'id' | 'timestamp'>): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status === 'resolved' || ann.status === 'dismissed') return null
    ann.thread.push({
      id: randomUUID(),
      from: msg.from,
      text: msg.text,
      timestamp: Date.now(),
    })
    ann.updatedAt = Date.now()
    return this.snapshot(ann)
  }

  getAll(): Annotation[] {
    return [...this.annotations.values()].map(a => this.snapshot(a))
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/core/annotations.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/adapters/types.ts cortex-editor/src/core/annotations.ts cortex-editor/tests/core/annotations.test.ts
git commit -m "feat(annotations): AnnotationStore + types (ZF0-892)"
```

---

## Task 2: ActivityLog

**Files:**
- Create: `cortex-editor/src/core/session/activity-log.ts`
- Create: `cortex-editor/tests/core/session/activity-log.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/session/activity-log.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ActivityLog } from '../../../src/core/session/activity-log.js'

describe('ActivityLog', () => {
  it('adds entries with auto-generated id and timestamp', () => {
    const log = new ActivityLog()
    const entry = log.add({ type: 'edit', description: 'Changed color', elementSource: 'App.tsx:10:5' })
    expect(entry.id).toBeTruthy()
    expect(entry.timestamp).toBeGreaterThan(0)
    expect(entry.type).toBe('edit')
  })

  it('getAll returns all entries', () => {
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'one' })
    log.add({ type: 'comment', description: 'two' })
    expect(log.getAll()).toHaveLength(2)
  })

  it('getRecent returns last N entries', () => {
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'one' })
    log.add({ type: 'edit', description: 'two' })
    log.add({ type: 'edit', description: 'three' })
    const recent = log.getRecent(2)
    expect(recent).toHaveLength(2)
    expect(recent[0].description).toBe('two')
    expect(recent[1].description).toBe('three')
  })

  it('getSince returns entries after timestamp', () => {
    vi.useFakeTimers()
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'old' })
    const cutoff = Date.now()
    vi.advanceTimersByTime(1)
    log.add({ type: 'edit', description: 'new' })
    const since = log.getSince(cutoff)
    expect(since).toHaveLength(1)
    expect(since[0].description).toBe('new')
    vi.useRealTimers()
  })

  it('count returns total entries', () => {
    const log = new ActivityLog()
    expect(log.count).toBe(0)
    log.add({ type: 'edit', description: 'one' })
    expect(log.count).toBe(1)
  })

  it('evicts oldest entries when maxEntries exceeded', () => {
    const log = new ActivityLog(5) // small cap for testing
    for (let i = 0; i < 7; i++) {
      log.add({ type: 'edit', description: `entry-${i}` })
    }
    expect(log.count).toBe(5)
    expect(log.getAll()[0].description).toBe('entry-2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/core/session/activity-log.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ActivityLog**

Create `src/core/session/activity-log.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import type { ActivityEntry } from '../../adapters/types.js'

export class ActivityLog {
  private entries: ActivityEntry[] = []

  constructor(private readonly maxEntries = 500) {}

  add(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
    const full: ActivityEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      ...entry,
    }
    this.entries.push(full)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    return full
  }

  getAll(): ActivityEntry[] {
    return this.entries
  }

  getRecent(count: number): ActivityEntry[] {
    return this.entries.slice(-count)
  }

  getSince(timestamp: number): ActivityEntry[] {
    return this.entries.filter(e => e.timestamp > timestamp)
  }

  get count(): number {
    return this.entries.length
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/core/session/activity-log.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/core/session/activity-log.ts cortex-editor/tests/core/session/activity-log.test.ts
git commit -m "feat(activity-log): ActivityLog with eviction (ZF0-892)"
```

---

## Task 3: MCP RPC Helper + 6 Tools

**Files:**
- Modify: `cortex-editor/src/cli/mcp.ts`
- Modify: `cortex-editor/tests/cli/mcp.test.ts`

- [ ] **Step 1: Write failing tests for RPC + tools**

Add to `tests/cli/mcp.test.ts`. The mock Vite server needs to handle `cortex-rpc` messages and respond:

```typescript
describe('annotation tools', () => {
  /** Extend mock Vite to handle cortex-rpc messages */
  function installRPCHandler(mockVite: MockViteServer): void {
    // Simple in-memory annotation store for test
    const annotations = new Map<string, Record<string, unknown>>()
    mockVite.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(raw.toString()) } catch { return }
        if (msg.type !== 'cortex-rpc') return

        const { requestId, method, params } = msg as { requestId: string; method: string; params: Record<string, unknown> }
        try {
          let result: unknown
          if (method === 'getPending') {
            result = [...annotations.values()].filter((a) => a.status === 'pending')
          } else if (method === 'getDetails') {
            result = annotations.get(params.annotationId as string) ?? null
          } else if (method === 'acknowledge') {
            const ann = annotations.get(params.annotationId as string)
            if (ann) { ann.status = 'acknowledged'; result = ann } else { result = null }
          } else if (method === 'resolve') {
            const ann = annotations.get(params.annotationId as string)
            if (ann) { ann.status = 'resolved'; ann.resolution = { summary: params.summary }; result = ann } else { result = null }
          } else if (method === 'dismiss') {
            const ann = annotations.get(params.annotationId as string)
            if (ann) { ann.status = 'dismissed'; result = ann } else { result = null }
          } else if (method === 'respond') {
            const ann = annotations.get(params.annotationId as string)
            if (ann) {
              (ann.thread as unknown[]).push({ from: 'agent', text: params.text })
              result = ann
            } else { result = null }
          } else {
            throw new Error(`Unknown method: ${method}`)
          }
          ws.send(JSON.stringify({ type: 'cortex-rpc-result', requestId, result }))
        } catch (err) {
          ws.send(JSON.stringify({ type: 'cortex-rpc-error', requestId, error: (err as Error).message }))
        }
      })
    })

    // Seed a test annotation
    annotations.set('test-ann-1', {
      id: 'test-ann-1', status: 'pending', elementSource: 'App.tsx:10:5',
      text: 'Make this blue', createdAt: Date.now(), updatedAt: Date.now(), thread: [],
    })
  }

  it('cortex_get_pending returns annotations', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_get_pending' })
    expect(result.isError).toBeFalsy()
    const text = (result.content as Array<{ text: string }>)[0].text
    const parsed = JSON.parse(text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('Make this blue')
  })

  it('cortex_get_details returns annotation by id', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_get_details', arguments: { annotationId: 'test-ann-1' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed.id).toBe('test-ann-1')
  })

  it('cortex_acknowledge transitions annotation', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_acknowledge', arguments: { annotationId: 'test-ann-1' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed.status).toBe('acknowledged')
  })

  it('cortex_resolve transitions annotation', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    // Must acknowledge first
    await client.callTool({ name: 'cortex_acknowledge', arguments: { annotationId: 'test-ann-1' } })
    const result = await client.callTool({ name: 'cortex_resolve', arguments: { annotationId: 'test-ann-1', summary: 'Changed to blue' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed.status).toBe('resolved')
  })

  it('cortex_dismiss transitions annotation', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_dismiss', arguments: { annotationId: 'test-ann-1', reason: 'Not needed' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed.status).toBe('dismissed')
  })

  it('cortex_respond adds thread message', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_respond', arguments: { annotationId: 'test-ann-1', text: 'What color exactly?' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed.thread).toHaveLength(1)
  })

  it('returns error when not connected', async () => {
    // Don't start mock Vite — just start MCP with bad port
    const client = await startTestServer(59999) // nothing listening
    // Wait a moment for the initial connection attempt to fail
    await new Promise(r => setTimeout(r, 500))
    const result = await client.callTool({ name: 'cortex_get_pending' })
    expect(result.isError).toBe(true)
  })

  it('returns null gracefully when annotation not found', async () => {
    installRPCHandler(mockVite)
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_get_details', arguments: { annotationId: 'nonexistent' } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text)
    expect(parsed).toBeNull()
  })

  it('RPC timeout returns error when server never responds', async () => {
    // Create a mock that accepts RPC but never responds
    mockVite.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'cortex-rpc') {
          // Intentionally do not respond — trigger timeout
        }
      })
    })
    const client = await startTestServer(mockVite.port)
    await waitForConnection(mockVite)
    const result = await client.callTool({ name: 'cortex_get_pending' })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ text: string }>)[0].text).toContain('timeout')
  }, 15_000) // extend test timeout past the 10s RPC timeout
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/cli/mcp.test.ts`
Expected: FAIL — tools not found

- [ ] **Step 3: Implement RPC helper and 6 tools in mcp.ts**

Add to `src/cli/mcp.ts`:

1. Import `randomUUID` from `node:crypto`
2. Add `pendingRequests` Map and `rpc()` function (see spec)
3. Add RPC response handling in the `ws.on('message')` handler
4. Register 6 tools with `server.registerTool()` using JSON Schema for input params

Import `z` from `zod` at top of `mcp.ts`.

Zero-arg tool pattern:
```typescript
server.registerTool(
  'cortex_get_pending',
  { description: 'List all pending annotations (comments awaiting agent action).' },
  async () => {
    try {
      const result = await rpc('getPending', {})
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
    }
  },
)
```

Tools with params use Zod schemas for `inputSchema` (SDK validates and parses):
```typescript
server.registerTool(
  'cortex_acknowledge',
  {
    description: 'Mark an annotation as "working on it".',
    inputSchema: { annotationId: z.string().describe('Annotation ID') },
  },
  async ({ annotationId }) => {
    try {
      const result = await rpc('acknowledge', { annotationId })
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true }
    }
  },
)
```

Similarly for `cortex_resolve` (`{ annotationId: z.string(), summary: z.string() }`), `cortex_dismiss` (`{ annotationId: z.string(), reason: z.string().optional() }`), `cortex_respond` (`{ annotationId: z.string(), text: z.string() }`), and `cortex_get_details` (`{ annotationId: z.string() }`).

Also add pending request cleanup on WebSocket disconnect:
```typescript
ws.on('close', () => {
  connected = false
  // Reject all pending RPC requests
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error('WebSocket disconnected'))
  }
  pendingRequests.clear()
  // ... existing reconnect logic
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/cli/mcp.test.ts`
Expected: All tests PASS (existing + 7 new)

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/cli/mcp.ts cortex-editor/tests/cli/mcp.test.ts
git commit -m "feat(mcp): 6 annotation tools + RPC helper (ZF0-892)"
```

---

## Task 4: Vite RPC Handler + Annotation Integration

**Files:**
- Modify: `cortex-editor/src/adapters/vite.ts`
- Modify: `cortex-editor/tests/adapters/vite.test.ts`

- [ ] **Step 1: Write failing tests for RPC handler in vite.test.ts**

Add tests for:
- RPC `getPending` returns empty initially
- Sending `comment` message creates annotation, then RPC `getPending` returns it
- RPC `acknowledge` changes status, sends `annotation-updated` to browser
- RPC with unknown method returns error
- Agent-status sent on CLI connect/disconnect

The existing `vite.test.ts` already has infrastructure for testing CLI WebSocket behavior. Extend it.

```typescript
describe('annotation RPC', () => {
  it('getPending returns empty list when no annotations', async () => {
    // Connect CLI client, send cortex-rpc getPending, verify response
    // ... (uses existing test infrastructure)
  })

  it('comment message creates annotation accessible via getPending', async () => {
    // Send comment via HMR, then query via RPC
  })

  it('acknowledge RPC sends annotation-updated to browser', async () => {
    // Create annotation, acknowledge via RPC, check HMR output
  })

  it('unknown RPC method returns error', async () => {
    // Send { type: 'cortex-rpc', method: 'badMethod' }
  })

  it('agent-status sent on CLI connect', async () => {
    // Connect CLI, check browser receives agent-status connected: true
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/adapters/vite.test.ts`
Expected: FAIL — no RPC handler

- [ ] **Step 3: Implement RPC handler in vite.ts**

Changes to `src/adapters/vite.ts`:

1. Import `AnnotationStore` and `ActivityLog` at top
2. Add module-level instances:
   ```typescript
   import { AnnotationStore } from '../core/annotations.js'
   import { ActivityLog } from '../core/session/activity-log.js'

   let annotationStore = new AnnotationStore()
   let activityLog = new ActivityLog()
   ```
3. Add `ALLOWED_RPC_METHODS` set and `handleAnnotationRPC()` function
4. In `ws.on('message')` handler — add RPC handling **before** the `CLI_ALLOWED_TYPES` check:
   ```typescript
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
     return
   }
   ```
5. In `hotHandler` — handle `comment` messages to create annotations:
   ```typescript
   if (data.type === 'comment') {
     const ann = annotationStore.create({
       elementSource: data.elementSource,
       text: data.text,
       elementContext: data.elementContext,
       currentStyles: data.currentStyles,
       pinPosition: data.pinPosition,
     })
     activityLog.add({ type: 'comment', description: data.text, elementSource: data.elementSource })
     channel.send({ type: 'annotation-created', annotation: ann })
     channel.send({ type: 'activity-entry', entry: activityLog.getRecent(1)[0] })
   }
   ```
6. Implement `handleAnnotationRPC` — the full method-to-store dispatch:
   ```typescript
   const ALLOWED_RPC_METHODS = new Set(['getPending', 'getDetails', 'acknowledge', 'resolve', 'dismiss', 'respond'])

   function handleAnnotationRPC(method: string, params: Record<string, unknown>): unknown {
     const id = typeof params.annotationId === 'string' ? params.annotationId : ''
     switch (method) {
       case 'getPending': return annotationStore.getPending()
       case 'getDetails': return annotationStore.getById(id)
       case 'acknowledge': {
         const result = annotationStore.acknowledge(id)
         if (result) {
           channelInstance?.send({ type: 'annotation-updated', annotation: result })
           const entry = activityLog.add({ type: 'status-change', description: `Acknowledged: ${result.text}`, elementSource: result.elementSource })
           channelInstance?.send({ type: 'activity-entry', entry })
         }
         return result
       }
       case 'resolve': {
         const summary = typeof params.summary === 'string' ? params.summary : ''
         const result = annotationStore.resolve(id, summary)
         if (result) {
           channelInstance?.send({ type: 'annotation-updated', annotation: result })
           const entry = activityLog.add({ type: 'status-change', description: `Resolved: ${summary}`, elementSource: result.elementSource })
           channelInstance?.send({ type: 'activity-entry', entry })
         }
         return result
       }
       case 'dismiss': {
         const reason = typeof params.reason === 'string' ? params.reason : undefined
         const result = annotationStore.dismiss(id, reason)
         if (result) {
           channelInstance?.send({ type: 'annotation-updated', annotation: result })
           const entry = activityLog.add({ type: 'status-change', description: `Dismissed: ${result.text}`, elementSource: result.elementSource })
           channelInstance?.send({ type: 'activity-entry', entry })
         }
         return result
       }
       case 'respond': {
         const text = typeof params.text === 'string' ? params.text : ''
         const result = annotationStore.addMessage(id, { from: 'agent', text })
         if (result) {
           channelInstance?.send({ type: 'annotation-updated', annotation: result })
         }
         return result
       }
       default: throw new Error(`Unknown RPC method: ${method}`)
     }
   }
   ```
7. Agent-status: in `cliWss.on('connection')` callback, after adding client to set, send `{ type: 'agent-status', connected: true }` to browser via `channelInstance?.send()`. In `ws.on('close')` callback, after deleting client, send `{ type: 'agent-status', connected: cliClients.size > 0 }`.
8. Reset in `_resetForTesting()`:
   ```typescript
   annotationStore = new AnnotationStore()
   activityLog = new ActivityLog()
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/adapters/vite.test.ts`
Expected: All tests PASS (existing + new RPC tests)

- [ ] **Step 5: Commit**

```bash
git add cortex-editor/src/adapters/vite.ts cortex-editor/tests/adapters/vite.test.ts
git commit -m "feat(vite): RPC handler + annotation creation + agent-status (ZF0-892)"
```

---

## Task 5: Browser Components — CommentInput + CommentThread

**Files:**
- Create: `cortex-editor/src/browser/components/CommentInput.tsx`
- Create: `cortex-editor/src/browser/components/CommentThread.tsx`
- Modify: `cortex-editor/src/browser/components/Panel.tsx`
- Create: `cortex-editor/tests/browser/comment-input.test.tsx`
- Create: `cortex-editor/tests/browser/comment-thread.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write failing tests for CommentInput**

Create `tests/browser/comment-input.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { CommentInput } from '../../src/browser/components/CommentInput.js'

describe('CommentInput', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
  })

  it('renders input field', () => {
    render(<CommentInput onSubmit={vi.fn()} agentConnected={true} />, container)
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('calls onSubmit with text on Enter', () => {
    const onSubmit = vi.fn()
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    input.value = 'Make this blue'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).toHaveBeenCalledWith('Make this blue')
  })

  it('shows disabled state when agent not connected', () => {
    render(<CommentInput onSubmit={vi.fn()} agentConnected={false} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toContain('No agent')
  })

  it('does not submit empty text', () => {
    const onSubmit = vi.fn()
    render(<CommentInput onSubmit={onSubmit} agentConnected={true} />, container)
    const input = container.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write failing tests for CommentThread**

Create `tests/browser/comment-thread.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from 'preact'
import { CommentThread } from '../../src/browser/components/CommentThread.js'
import type { Annotation } from '../../src/adapters/types.js'

const baseAnnotation: Annotation = {
  id: 'ann-1', status: 'pending', elementSource: 'App.tsx:10:5',
  text: 'Make this blue', createdAt: Date.now(), updatedAt: Date.now(), thread: [],
}

describe('CommentThread', () => {
  it('shows annotation text', () => {
    const { container } = render(<CommentThread annotation={baseAnnotation} onReply={vi.fn()} />)
    expect(container.textContent).toContain('Make this blue')
  })

  it('shows pending status', () => {
    const { container } = render(<CommentThread annotation={baseAnnotation} onReply={vi.fn()} />)
    expect(container.querySelector('.cortex-thread__status--pending')).toBeTruthy()
  })

  it('shows acknowledged status', () => {
    const ann = { ...baseAnnotation, status: 'acknowledged' as const }
    const { container } = render(<CommentThread annotation={ann} onReply={vi.fn()} />)
    expect(container.querySelector('.cortex-thread__status--acknowledged')).toBeTruthy()
  })

  it('shows resolved status with summary', () => {
    const ann = { ...baseAnnotation, status: 'resolved' as const, resolution: { summary: 'Changed color' } }
    const { container } = render(<CommentThread annotation={ann} onReply={vi.fn()} />)
    expect(container.textContent).toContain('Changed color')
  })

  it('renders thread messages', () => {
    const ann = {
      ...baseAnnotation,
      thread: [{ id: 'm1', from: 'agent' as const, text: 'What color?', timestamp: Date.now() }],
    }
    const { container } = render(<CommentThread annotation={ann} onReply={vi.fn()} />)
    expect(container.textContent).toContain('What color?')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/comment-input.test.tsx tests/browser/comment-thread.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement CommentInput**

Create `src/browser/components/CommentInput.tsx` — a simple text input with Enter-to-submit.

- [ ] **Step 5: Implement CommentThread**

Create `src/browser/components/CommentThread.tsx` — shows annotation text, status badge, thread messages, and reply input.

- [ ] **Step 6: Add CSS for both components**

Add to `src/browser/styles.css`:
- `.cortex-comment-input` — input styling at panel bottom
- `.cortex-thread` — thread card styling
- `.cortex-thread__status--pending/acknowledged/resolved/dismissed` — status badge colors
- `.cortex-thread__message--agent/user` — message bubble styling

- [ ] **Step 7: Wire CommentInput into Panel.tsx**

Add `CommentInput` below `EffectsSection` in Panel's render, inside the `.cortex-panel__body` div. Pass `onSubmit` callback that sends `{ type: 'comment' }` message via channel. Add `channel` and `agentConnected` to `PanelProps`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/comment-input.test.tsx tests/browser/comment-thread.test.tsx`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add cortex-editor/src/browser/components/CommentInput.tsx cortex-editor/src/browser/components/CommentThread.tsx cortex-editor/src/browser/components/Panel.tsx cortex-editor/src/browser/styles.css cortex-editor/tests/browser/comment-input.test.tsx cortex-editor/tests/browser/comment-thread.test.tsx
git commit -m "feat(ui): CommentInput + CommentThread components (ZF0-892)"
```

---

## Task 6: Browser Components — CommentPin + ActivityLog

**Files:**
- Create: `cortex-editor/src/browser/components/CommentPin.tsx`
- Create: `cortex-editor/src/browser/components/ActivityLog.tsx`
- Modify: `cortex-editor/src/browser/components/Toolbar.tsx`
- Create: `cortex-editor/tests/browser/comment-pin.test.tsx`
- Create: `cortex-editor/tests/browser/activity-log.test.tsx`
- Modify: `cortex-editor/src/browser/styles.css`

- [ ] **Step 1: Write failing tests for CommentPin**

Create `tests/browser/comment-pin.test.tsx` — test pin dot rendering, position calculation, zero-size guard.

- [ ] **Step 2: Write failing tests for ActivityLog**

Create `tests/browser/activity-log.test.tsx` — test entry rendering, badge count, popover toggle.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/comment-pin.test.tsx tests/browser/activity-log.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement CommentPin**

Create `src/browser/components/CommentPin.tsx`:
- Renders blue dots (12px) for each annotation with `pinPosition`
- Uses `getBoundingClientRect()` + relative offset for positioning
- Re-computes on scroll/resize via `useEffect` + `requestAnimationFrame`
- Zero-size element guard: hide pin if `rect.width === 0 || rect.height === 0`
- Click dot opens CommentThread
- Pin creation mode: crosshair cursor, click → inline input

- [ ] **Step 5: Implement ActivityLog**

Create `src/browser/components/ActivityLog.tsx`:
- Popover card with chronological entry list (newest first)
- Entry: timestamp, type icon, description
- Max 100 entries displayed
- Badge count prop for toolbar integration

- [ ] **Step 6: Update Toolbar with comment button and activity popover**

Modify `src/browser/components/Toolbar.tsx`:
- Add comment mode button (chat bubble icon SVG)
- Add `onCommentMode` callback prop
- Wire activity badge to toggle `ActivityLog` popover
- Add `onActivityToggle`, `showActivity`, `activityEntries` props

- [ ] **Step 7: Add CSS for CommentPin and ActivityLog**

Add to `src/browser/styles.css`:
- `.cortex-pin` — blue dot, 12px circle
- `.cortex-pin--mode` — crosshair cursor overlay
- `.cortex-activity-log` — popover styling, entry list

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/comment-pin.test.tsx tests/browser/activity-log.test.tsx`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add cortex-editor/src/browser/components/CommentPin.tsx cortex-editor/src/browser/components/ActivityLog.tsx cortex-editor/src/browser/components/Toolbar.tsx cortex-editor/src/browser/styles.css cortex-editor/tests/browser/comment-pin.test.tsx cortex-editor/tests/browser/activity-log.test.tsx
git commit -m "feat(ui): CommentPin + ActivityLog + toolbar buttons (ZF0-892)"
```

---

## Task 7: CortexApp Integration

**Files:**
- Modify: `cortex-editor/src/browser/components/CortexApp.tsx`
- Modify: `cortex-editor/tests/browser/cortex-app.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `tests/browser/cortex-app.test.tsx`:
- Test that `annotation-created` message adds to state
- Test that `annotation-updated` message updates state
- Test that `agent-status` message toggles agentConnected
- Test that CommentPin renders when annotations exist
- Test that ActivityLog receives activity entries

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cortex-editor && npx vitest run tests/browser/cortex-app.test.tsx`
Expected: FAIL

- [ ] **Step 3: Add annotation state to CortexApp**

In `CortexApp.tsx`:

1. Add state:
   ```typescript
   const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map())
   const [agentConnected, setAgentConnected] = useState(false)
   const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
   const [commentMode, setCommentMode] = useState(false)
   const [showActivity, setShowActivity] = useState(false)
   ```

2. Add to `channel.onMessage` subscription:
   ```typescript
   if (msg.type === 'annotation-created') {
     setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
   }
   if (msg.type === 'annotation-updated') {
     setAnnotations(prev => new Map(prev).set(msg.annotation.id, msg.annotation))
   }
   if (msg.type === 'agent-status') {
     setAgentConnected(msg.connected)
   }
   if (msg.type === 'activity-entry') {
     setActivityEntries(prev => [...prev, msg.entry])
     setActivityCount(c => c + 1)
   }
   ```

3. Render `CommentPin` and `ActivityLog` in the return JSX:
   ```tsx
   <CommentPin
     annotations={[...annotations.values()]}
     commentMode={commentMode}
     channel={channel}
     shadowRoot={shadowRoot}
   />
   ```

4. Pass `agentConnected` and `channel` to `Panel` for `CommentInput`.

5. Update `Toolbar` props with `onCommentMode`, `showActivity`, `activityEntries`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cortex-editor && npx vitest run tests/browser/cortex-app.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add cortex-editor/src/browser/components/CortexApp.tsx cortex-editor/tests/browser/cortex-app.test.tsx
git commit -m "feat(app): wire annotation state + CommentPin + ActivityLog (ZF0-892)"
```

---

## Task 8: Integration Test

**Files:**
- Create: `cortex-editor/tests/integration/annotation-lifecycle.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/annotation-lifecycle.test.ts`:

Full round-trip test:
1. Start mock Vite server with real `AnnotationStore` + RPC handler
2. Start MCP server connected to it
3. Simulate browser sending `comment` message
4. Call `cortex_get_pending` → verify annotation returned
5. Call `cortex_acknowledge` → verify status change
6. Call `cortex_respond` → verify thread message added
7. Call `cortex_resolve` → verify terminal state
8. Call `cortex_get_pending` → verify empty (no more pending)

- [ ] **Step 2: Run test**

Run: `cd cortex-editor && npx vitest run tests/integration/annotation-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add cortex-editor/tests/integration/annotation-lifecycle.test.ts
git commit -m "test(integration): annotation lifecycle round-trip (ZF0-892)"
```

---

## Task 9: Type Check + Build Verification

- [ ] **Step 1: Type check**

Run: `cd cortex-editor && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build**

Run: `cd cortex-editor && npm run build`
Expected: Successful build

- [ ] **Step 3: Lint (if configured)**

Run: `cd cortex-editor && npm run lint 2>/dev/null || echo "No lint configured"`

- [ ] **Step 4: Final full test suite**

Run: `cd cortex-editor && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: type check + build fixes (ZF0-892)"
```
