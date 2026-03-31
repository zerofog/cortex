# Editing Engine Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the implicit "Layer 4 fallback" AI writer with an explicit editing engine that routes edits to the right write strategy, batches multi-property AI edits, cancels superseded calls, and removes CSS overrides only after the framework re-renders.

**Architecture:** An `EditRouter` classifies each edit as `immediate` (deterministic) or `deferred` (AI) based on detection state. Immediate writes use the existing synchronous rewrite path. Deferred writes collect per-element, fire a single batched AI call, and use optimistic concurrency (read inside lock, AI call outside, compare-and-swap on re-entry). The browser receives the edit strategy with `edit_status: done` and defers override removal for AI edits until after framework re-render.

**Tech Stack:** TypeScript, Vitest, existing edit-pipeline infrastructure

**Predecessor:** ZF0-964 (AI writer initial implementation). This plan addresses 4 real-world failures discovered during manual testing: visual flicker, stale reads on concurrent AI writes, AI targeting wrong element, and HMR suppression mismatch.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/edit-strategy.ts` | **Create** | `EditStrategy` type, `EditRouter` classifier |
| `src/core/deferred-writer.ts` | **Create** | Per-element coalescing, cancellation, optimistic concurrency |
| `src/core/ai-writer.ts` | **Modify** | Accept `fileContent` param instead of reading file; support multi-property `changes[]` |
| `src/core/edit-pipeline.ts` | **Modify** | Use router + deferred writer; extract common write lifecycle |
| `src/adapters/vite.ts` | **Modify** | Replace `suppressHMR` flag with `WriteIntent`; remove global `suppressHMRForNextWrite` for edits |
| `src/adapters/types.ts` | **Modify** | Add `strategy` to `edit_status` message type |
| `src/browser/override.ts` | **Modify** | Strategy-aware override removal (deferred for AI) |
| `src/browser/components/CortexApp.tsx` | **Modify** | Pass strategy to override manager |
| `tests/core/edit-strategy.test.ts` | **Create** | Router classification tests |
| `tests/core/deferred-writer.test.ts` | **Create** | Coalescing, cancellation, concurrency tests |
| `tests/core/ai-writer.test.ts` | **Modify** | Update for new `write()` signature |
| `tests/core/edit-pipeline.test.ts` | **Modify** | Update for router integration |

---

## Task 1: EditStrategy type + EditRouter

The router is the "decision maker" — it classifies edits upfront so the pipeline knows which write strategy to use before attempting anything.

**Files:**
- Create: `src/core/edit-strategy.ts`
- Create: `tests/core/edit-strategy.test.ts`

- [ ] **Step 1: Write failing tests for the router**

```typescript
// tests/core/edit-strategy.test.ts
import { describe, it, expect } from 'vitest'
import { classifyEdit } from '../../src/core/edit-strategy.js'

describe('classifyEdit', () => {
  const base = { source: 'src/App.tsx:14:7', property: 'padding-top', value: '16px', elementSelector: 'section' }

  it('returns immediate when cssMapping is present (CSS Modules annotated)', () => {
    expect(classifyEdit({ ...base, cssMapping: 'src/Hero.module.css:.hero' }, { hasCSSModules: true, hasTailwind: false }))
      .toBe('immediate')
  })

  it('returns immediate when Tailwind resolver is available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true }, { resolverAvailable: true }))
      .toBe('immediate')
  })

  it('returns deferred when Tailwind detected but resolver unavailable and AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns deferred for component library with AI available', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: false, hasComponentLibrary: true }, { resolverAvailable: false, aiAvailable: true }))
      .toBe('deferred')
  })

  it('returns unsupported when no strategy can handle the edit', () => {
    expect(classifyEdit(base, { hasCSSModules: false, hasTailwind: true }, { resolverAvailable: false, aiAvailable: false }))
      .toBe('unsupported')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/core/edit-strategy.test.ts --poolOptions.threads.maxThreads=1`
Expected: FAIL — module not found

- [ ] **Step 3: Implement EditStrategy type + classifyEdit**

```typescript
// src/core/edit-strategy.ts
import type { DetectionResult } from './rewriter/detector.js'
import type { ResolverState } from './capabilities.js'

export type EditStrategy = 'immediate' | 'deferred' | 'unsupported'

export interface EditClassificationInput {
  cssMapping?: string
}

/**
 * Classify an edit request into a write strategy.
 * - immediate: deterministic rewrite (CSS Modules, Tailwind AST) — <50ms, suppress HMR
 * - deferred: AI writer — batched, async, HMR required
 * - unsupported: no write path available — preview-only
 */
export function classifyEdit(
  edit: EditClassificationInput,
  detection: Pick<DetectionResult, 'hasCSSModules' | 'hasTailwind' | 'hasComponentLibrary' | 'hasCSSInJS'>,
  resolver?: Pick<ResolverState, 'resolverAvailable' | 'aiAvailable'>,
): EditStrategy {
  // CSS Modules annotated path — always immediate
  if (edit.cssMapping && detection.hasCSSModules) return 'immediate'

  // CSS Modules runtime resolver — immediate if available
  if (detection.hasCSSModules && !detection.hasTailwind) {
    return resolver?.aiAvailable ? 'deferred' : 'unsupported'
  }

  // Tailwind with working resolver — immediate
  if (detection.hasTailwind && resolver?.resolverAvailable) return 'immediate'

  // AI available — deferred (covers Tailwind fallback, component libs, CSS-in-JS)
  if (resolver?.aiAvailable) return 'deferred'

  // Nothing can handle it
  return 'unsupported'
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/core/edit-strategy.test.ts --poolOptions.threads.maxThreads=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/edit-strategy.ts tests/core/edit-strategy.test.ts
git commit -m "feat: EditStrategy type + classifyEdit router"
```

---

## Task 2: DeferredWriter with per-element coalescing + cancellation

This is the core new component. It collects property changes per element, batches them into a single AI call, and cancels superseded requests.

**Files:**
- Create: `src/core/deferred-writer.ts`
- Create: `tests/core/deferred-writer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/deferred-writer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeferredWriter } from '../../src/core/deferred-writer.js'

describe('DeferredWriter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces multiple properties into a single flush', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-left', value: '8px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(1)
    expect(writeFn).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/app/App.tsx',
      line: 14,
      changes: expect.arrayContaining([
        { property: 'padding-top', value: '16px' },
        { property: 'padding-left', value: '8px' },
      ]),
    }))
  })

  it('cancels superseded value for same element+property', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(1)
    const changes = writeFn.mock.calls[0][0].changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ property: 'padding-top', value: '24px' })
  })

  it('aborts in-flight AI call when new edit arrives for same element', async () => {
    let callCount = 0
    const writeFn = vi.fn().mockImplementation(async (req) => {
      callCount++
      if (callCount === 1) {
        // Simulate slow AI call — check if aborted
        await new Promise(r => setTimeout(r, 2000))
        if (req.signal?.aborted) return { success: false, reason: 'aborted' }
      }
      return { success: true, newContent: 'updated' }
    })
    const writer = new DeferredWriter({ coalescingMs: 100, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // first batch fires

    // New edit while first is in-flight — should abort first
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // second batch fires

    await vi.advanceTimersByTimeAsync(5000) // let everything settle
    expect(callCount).toBe(2)
  })

  it('keeps separate batches for different files', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/Hero.tsx', line: 5, col: 3, property: 'color', value: 'red', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

- [ ] **Step 3: Implement DeferredWriter**

Key design: `DeferredWriter` groups edits by `filePath:line:col` (element key). Each element has a coalescing window. When the window closes, the writer fires a single `writeFn(batch)` with all accumulated property changes. If a new edit arrives while an AI call is in-flight for the same element, the in-flight call is aborted via `AbortController`.

```typescript
// src/core/deferred-writer.ts
export interface DeferredEdit {
  filePath: string
  line: number
  col: number
  property: string
  value: string
  failureReason: string
}

export interface BatchedWriteRequest {
  filePath: string
  line: number
  col: number
  changes: Array<{ property: string; value: string }>
  failureReason: string
  signal: AbortSignal
}

export type WriteFn = (request: BatchedWriteRequest) => Promise<{ success: boolean; newContent?: string; reason?: string }>

export interface DeferredWriterOptions {
  coalescingMs: number
  writeFn: WriteFn
}

export class DeferredWriter {
  private readonly coalescingMs: number
  private readonly writeFn: WriteFn
  // Key: "filePath:line:col" (element identity)
  private pending = new Map<string, {
    edits: Map<string, { property: string; value: string }>  // property → latest value
    filePath: string
    line: number
    col: number
    failureReason: string
    timer: ReturnType<typeof setTimeout>
  }>()
  private inflight = new Map<string, AbortController>()

  constructor(options: DeferredWriterOptions) {
    this.coalescingMs = options.coalescingMs
    this.writeFn = options.writeFn
  }

  enqueue(edit: DeferredEdit): void {
    const elementKey = `${edit.filePath}:${edit.line}:${edit.col}`

    // Cancel any in-flight AI call for this element
    const existing = this.inflight.get(elementKey)
    if (existing) existing.abort()

    const entry = this.pending.get(elementKey)
    if (entry) {
      // Coalesce: update/add the property, reset timer
      entry.edits.set(edit.property, { property: edit.property, value: edit.value })
      entry.failureReason = edit.failureReason
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => this.flush(elementKey), this.coalescingMs)
    } else {
      const edits = new Map<string, { property: string; value: string }>()
      edits.set(edit.property, { property: edit.property, value: edit.value })
      this.pending.set(elementKey, {
        edits,
        filePath: edit.filePath,
        line: edit.line,
        col: edit.col,
        failureReason: edit.failureReason,
        timer: setTimeout(() => this.flush(elementKey), this.coalescingMs),
      })
    }
  }

  private async flush(elementKey: string): Promise<void> {
    const entry = this.pending.get(elementKey)
    if (!entry) return
    this.pending.delete(elementKey)

    const controller = new AbortController()
    this.inflight.set(elementKey, controller)

    try {
      await this.writeFn({
        filePath: entry.filePath,
        line: entry.line,
        col: entry.col,
        changes: [...entry.edits.values()],
        failureReason: entry.failureReason,
        signal: controller.signal,
      })
    } finally {
      if (this.inflight.get(elementKey) === controller) {
        this.inflight.delete(elementKey)
      }
    }
  }

  dispose(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer)
    this.pending.clear()
    for (const controller of this.inflight.values()) controller.abort()
    this.inflight.clear()
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 3: Update AIWriter to accept file content + multi-property changes

The engine reads the file (inside the lock), passes content to the writer. The writer no longer reads files. Prompt supports multiple property changes in one call.

**Files:**
- Modify: `src/core/ai-writer.ts`
- Modify: `tests/core/ai-writer.test.ts`

- [ ] **Step 1: Write failing test for multi-property write**

```typescript
it('handles multiple property changes in a single call', async () => {
  mockReadFile.mockResolvedValueOnce(sampleFile)
  mockClaudeResponse(sampleFile.replace('pt-4', 'pt-6'))  // AI modifies the code

  const writer = new AIWriter({ apiKey: 'test-key', readFile: mockReadFile })
  const result = await writer.write({
    filePath: '/app/App.tsx',
    line: 5,
    col: 5,
    changes: [
      { property: 'padding-top', value: '24px' },
      { property: 'margin-left', value: '8px' },
    ],
    failureReason: 'Cannot resolve Tailwind class',
  })

  expect(result.success).toBe(true)
  // Verify the prompt included both properties
  const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
  expect(sentBody.messages[0].content).toContain('padding-top')
  expect(sentBody.messages[0].content).toContain('margin-left')
})
```

- [ ] **Step 2: Run test — verify it fails**
- [ ] **Step 3: Update AIWriteRequest to support `changes[]`**

Add to `AIWriteRequest`:
```typescript
export interface AIWriteRequest {
  filePath: string
  line: number
  col: number
  /** Single property change (legacy) */
  property?: string
  value?: string
  /** Batched property changes */
  changes?: Array<{ property: string; value: string }>
  failureReason: string
}
```

Update `buildUserPrompt` to format multiple changes:
```typescript
const changesList = request.changes
  ? request.changes.map(c => `\`${c.property}: ${c.value}\``).join(', ')
  : `\`${request.property}: ${request.value}\``

return `TASK: Set ${changesList} on the element at line ${request.line} (marked with arrow).`
```

- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Add `fileContent` optional parameter to `write()`**

Allow callers to pass pre-read content (engine reads inside lock, passes to writer):
```typescript
async write(request: AIWriteRequest, fileContent?: string): Promise<AIWriteResult> {
  const oldContent = fileContent ?? await this.readFile(request.filePath)
  // ... rest unchanged
}
```

- [ ] **Step 6: Run full ai-writer test suite — verify all pass**
- [ ] **Step 7: Commit**

---

## Task 4: Strategy-aware `edit_status` + browser override removal

The browser needs to know the edit strategy so it can defer override removal for AI edits (wait for framework re-render after HMR).

**Files:**
- Modify: `src/adapters/types.ts` — add `strategy` to `edit_status`
- Modify: `src/browser/override.ts` — deferred removal path
- Modify: `src/browser/components/CortexApp.tsx` — pass strategy to override manager
- Tests: `tests/core/edit-pipeline.test.ts` — verify strategy in status messages

- [ ] **Step 1: Add strategy field to edit_status type**

In `src/adapters/types.ts`, update the `edit_status` message:
```typescript
| { type: 'edit_status'; editId: string; status: 'done'; newToken?: string; strategy?: 'immediate' | 'deferred' }
```

- [ ] **Step 2: Add deferred removal to override manager**

In `src/browser/override.ts`, add a new method:
```typescript
/** Remove override after framework re-render completes (double-rAF). */
deferRemoval(source: string, property: string, pseudo?: '::before' | '::after'): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      this.remove(source, property, pseudo)
    })
  })
}
```

Update `onHMRApplied` to check if pending removals are marked as deferred:
```typescript
onHMRApplied(): void {
  if (this.pendingClearAll) { /* ... existing ... */ }
  if (this.pendingRemovals.length > 0) {
    const removals = this.pendingRemovals.splice(0)
    for (const r of removals) {
      if (r.deferred) {
        this.deferRemoval(r.source, r.property, r.pseudo)
      } else {
        this.remove(r.source, r.property, r.pseudo)
      }
    }
  }
}
```

- [ ] **Step 3: Pass strategy through CortexApp**

In `CortexApp.tsx`, when handling `edit_status: done`:
```typescript
if (msg.status === 'done') {
  setActivityCount(c => c + 1)
  overrideRef.current?.commitEdit(msg.strategy === 'deferred')
}
```

Update `commitEdit` to tag pending edits as deferred when AI-originated.

- [ ] **Step 4: Update pipeline to include strategy in done messages**

In `edit-pipeline.ts`, the deterministic done message:
```typescript
this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done', newToken, strategy: 'immediate' })
```

The AI done message:
```typescript
this.channel.send({ type: 'edit_status', editId: edit.editId, status: 'done', strategy: 'deferred' })
```

- [ ] **Step 5: Run tests — verify all pass**
- [ ] **Step 6: Commit**

---

## Task 5: Wire DeferredWriter into EditPipeline

Replace the direct `commitAIWrite`/`executeAIWrite` calls with the `DeferredWriter`. The pipeline routes to the deferred writer based on the router's classification.

**Files:**
- Modify: `src/core/edit-pipeline.ts`
- Modify: `src/adapters/vite.ts`
- Modify: `tests/core/edit-pipeline.test.ts`

- [ ] **Step 1: Add DeferredWriter to EditPipelineOptions**

```typescript
// In EditPipelineOptions:
deferredWriter?: DeferredWriter
```

- [ ] **Step 2: Replace AI intercept points with deferredWriter.enqueue()**

At Points A, B, C — instead of calling `commitAIWrite`/`executeAIWrite` directly:
```typescript
if (this.deferredWriter) {
  this.deferredWriter.enqueue({
    filePath: resolvedPath, line, col,
    property: edit.property, value: edit.value,
    failureReason: reason,
  })
  // Status will be sent by the deferred writer's callback
  return
}
```

- [ ] **Step 3: Wire DeferredWriter's writeFn to the pipeline's write lifecycle**

The `writeFn` callback performs the actual file write, undo push, HMR tracking, and status messaging:
```typescript
// In vite.ts pipeline construction:
const deferredWriter = aiWriter ? new DeferredWriter({
  coalescingMs: 250,
  writeFn: async (batch) => {
    return withFileLock(batch.filePath, async () => {
      const fileContent = await readFile(batch.filePath)
      const result = await aiWriter.write({
        filePath: batch.filePath, line: batch.line, col: batch.col,
        changes: batch.changes, failureReason: batch.failureReason,
      }, fileContent)
      if (!result.success) return result
      // Undo, verify, write, status — same as existing executeAIWrite
      undoStack?.push({ filePath: batch.filePath, previousContent: result.oldContent, currentContent: result.newContent })
      verifier.trackEdit({ ... })
      await writeFile(batch.filePath, result.newContent)  // no suppressHMR
      channel.send({ type: 'edit_status', ..., strategy: 'deferred' })
      return result
    })
  },
}) : undefined
```

- [ ] **Step 4: Remove seed-edit skip for deferred edits**

The seed check at line 250 (`if (!previousValue) return`) should only apply to the immediate (Tailwind) path. AI doesn't need `previousValue`:
```typescript
// Only skip seed for the Tailwind deterministic path
if (!previousValue && strategy === 'immediate') return
```

- [ ] **Step 5: Update tests for new routing behavior**
- [ ] **Step 6: Run full test suite**
- [ ] **Step 7: Commit**

---

## Task 6: Validation Gate 6 — target-line mutation check

After the AI returns, verify it actually modified the target line (not just a nearby element).

**Files:**
- Modify: `src/core/ai-writer.ts`
- Modify: `tests/core/ai-writer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('rejects edit that only modifies a non-target line', () => {
  // Target is line 5, but only line 3 changed
  const oldFile = [
    'import React from "react"',
    '',
    '<div style={{ margin: "8px" }}>',    // line 3
    '  <p>Target</p>',                     // line 4
    '  <section>Hello</section>',          // line 5 ← target
    '</div>',
  ].join('\n')
  const newFile = oldFile.replace('margin: "8px"', 'margin: "8px", paddingTop: "16px"')
  const result = validateResult(oldFile, newFile, 'App.tsx', 5)
  expect(result.valid).toBe(false)
  expect(!result.valid && result.reason).toContain('target line')
})
```

- [ ] **Step 2: Run test — verify it fails**
- [ ] **Step 3: Add Gate 6 to validateResult**

After existing gates, add:
```typescript
// Gate 4 (new): Target-line mutation — at least one change must be on or adjacent to target
const targetChanged = changedLineNumbers.some(ln => Math.abs(ln - targetLine) <= 2)
if (!targetChanged) {
  return { valid: false, reason: `AI modified lines ${changedLineNumbers.join(', ')} but not the target line ${targetLine}. Edit rejected.` }
}
```

- [ ] **Step 4: Run tests — verify they pass**
- [ ] **Step 5: Commit**

---

## Task 7: Replace suppressHMR flag with WriteIntent

Make the HMR suppression decision structural rather than flag-based.

**Files:**
- Modify: `src/core/edit-pipeline.ts`
- Modify: `src/adapters/vite.ts`

- [ ] **Step 1: Define WriteIntent type**

```typescript
// In edit-pipeline.ts
export interface WriteIntent {
  kind: 'immediate' | 'deferred' | 'undo' | 'redo'
  filePath: string
  content: string
}
```

- [ ] **Step 2: Update writeFile signature**

```typescript
writeFile: (intent: WriteIntent) => Promise<void>
```

- [ ] **Step 3: Update Vite adapter writeFile callback**

```typescript
writeFile: async (intent) => {
  if (intent.kind === 'immediate' || intent.kind === 'undo' || intent.kind === 'redo') {
    recentEditWrites.add(intent.filePath)
    setTimeout(() => recentEditWrites.delete(intent.filePath), 500)
  }
  await fs.promises.writeFile(intent.filePath, intent.content, 'utf-8')
}
```

- [ ] **Step 4: Remove `suppressHMRForNextWrite` global flag**

The edit handler in vite.ts no longer sets `suppressHMRForNextWrite = true` for edits (already removed). Undo/redo handlers pass `kind: 'undo'` / `kind: 'redo'` to the WriteIntent.

- [ ] **Step 5: Update all writeFile call sites**
- [ ] **Step 6: Update tests**
- [ ] **Step 7: Commit**

---

## Dependency Graph

```
Task 1 (EditStrategy + Router)
  ↓
Task 2 (DeferredWriter)
  ↓
Task 3 (AIWriter multi-property) ─────┐
  ↓                                     │
Task 5 (Wire into pipeline) ←──────────┘
  ↓
Task 4 (Strategy-aware browser) ← can start after Task 1
  ↓
Task 6 (Gate 6) ← independent, can start after Task 3
  ↓
Task 7 (WriteIntent) ← final cleanup, after Task 5
```

**Parallelizable:** Tasks 1+4 (types flow to browser), Task 6 (validation gate).
**Sequential:** Tasks 2→3→5→7 (core pipeline changes).

---

## Testing Strategy

- **Unit tests**: Each new file (`edit-strategy.ts`, `deferred-writer.ts`) has its own test file with focused pure-function tests
- **Integration tests**: `edit-pipeline.test.ts` updated to verify routing, batching, and strategy propagation
- **E2E**: `e2e-ai-writer.mjs` updated to send multi-property drag sequence and verify single AI call + correct DOM state
- **Regression**: Full vitest suite must remain at 1231+ passing

## What's NOT in this plan

- Retry/backoff improvements (existing single-retry is sufficient for MVP)
- Circuit breaker for repeated AI failures (follow-up)
- Server-side logging for AI writer (follow-up)
- `apiBaseUrl` validation (follow-up)
