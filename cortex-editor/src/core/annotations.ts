import { randomUUID } from 'node:crypto'
import type {
  Annotation,
  CreateAnnotationParams,
  ThreadMessage,
} from '../adapters/types.js'
import { loadAnnotations, saveAnnotations } from './annotations-persistence.js'

const DEFAULT_MAX_TERMINAL = 100

export interface AnnotationStoreOptions {
  /** Cap on terminal (resolved/dismissed) entries. FIFO eviction past this. Default 100.
   *  Implementation note: eviction uses Array.prototype.shift() which is O(n) in V8 due
   *  to array reindexing. At the default cap of 100 this is microseconds per terminal
   *  flip and unobservable. If callers ever raise the cap above ~1000, replace the
   *  string[] queue with a circular buffer or head-index deque to keep eviction O(1). */
  maxTerminal?: number
  /** When set, AnnotationStore hydrates from this file on construction and
   *  write-throughs every mutation. When unset, behavior is unchanged. */
  persistence?: { filePath: string }
}

export class AnnotationStore {
  private annotations = new Map<string, Annotation>()
  private terminalOrder: string[] = []
  private readonly maxTerminal: number
  private readonly persistenceFilePath: string | undefined

  constructor(opts?: AnnotationStoreOptions) {
    const max = opts?.maxTerminal ?? DEFAULT_MAX_TERMINAL
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(
        `AnnotationStore: maxTerminal must be a positive integer, got ${max}`,
      )
    }
    this.maxTerminal = max
    this.persistenceFilePath = opts?.persistence?.filePath

    // Synchronous hydration is intentional: adapter callers depend on the store
    // being ready BEFORE the first WebSocket message arrives. Bounded by
    // maxTerminal (default 100) — never moved to async without re-establishing
    // that invariant in the adapter wiring.
    if (this.persistenceFilePath !== undefined) {
      const loaded = loadAnnotations(this.persistenceFilePath)
      for (const ann of loaded) {
        this.annotations.set(ann.id, ann)
      }
      // terminalOrder must be FIFO by updatedAt so future eviction removes
      // the oldest terminal annotation first — same contract as live writes.
      this.terminalOrder = loaded
        .filter((a) => a.status === 'resolved' || a.status === 'dismissed')
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((a) => a.id)
    }
  }

  private persist(): void {
    if (this.persistenceFilePath === undefined) return
    saveAnnotations(this.persistenceFilePath, this.getAll())
  }

  private snapshot(ann: Annotation): Annotation {
    return { ...ann, thread: [...ann.thread] }
  }

  private markTerminal(id: string): void {
    this.terminalOrder.push(id)
    while (this.terminalOrder.length > this.maxTerminal) {
      const oldest = this.terminalOrder.shift()
      if (oldest !== undefined) this.annotations.delete(oldest)
    }
  }

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
      kind: params.kind ?? 'comment',
      fixMeta: params.fixMeta,
    }
    this.annotations.set(annotation.id, annotation)
    this.persist()
    return this.snapshot(annotation)
  }

  getPending(): Annotation[] {
    return [...this.annotations.values()]
      .filter((a) => a.status === 'pending')
      .map((a) => this.snapshot(a))
  }

  getById(id: string): Annotation | null {
    const ann = this.annotations.get(id)
    return ann ? this.snapshot(ann) : null
  }

  acknowledge(id: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status !== 'pending') return null
    ann.status = 'acknowledged'
    ann.updatedAt = Date.now()
    this.persist()
    return this.snapshot(ann)
  }

  resolve(id: string, summary: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status !== 'acknowledged') return null
    ann.status = 'resolved'
    ann.resolution = { summary }
    ann.updatedAt = Date.now()
    this.markTerminal(id)
    this.persist()
    return this.snapshot(ann)
  }

  dismiss(id: string, reason?: string): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status === 'resolved' || ann.status === 'dismissed')
      return null
    ann.status = 'dismissed'
    if (reason) ann.dismissReason = reason
    ann.updatedAt = Date.now()
    this.markTerminal(id)
    this.persist()
    return this.snapshot(ann)
  }

  addMessage(
    id: string,
    msg: Omit<ThreadMessage, 'id' | 'timestamp'>,
  ): Annotation | null {
    const ann = this.annotations.get(id)
    if (!ann || ann.status === 'resolved' || ann.status === 'dismissed')
      return null
    if (ann.thread.length >= 100) return null
    ann.thread.push({
      id: randomUUID(),
      from: msg.from,
      text: msg.text,
      timestamp: Date.now(),
    })
    ann.updatedAt = Date.now()
    this.persist()
    return this.snapshot(ann)
  }

  getAll(): Annotation[] {
    return [...this.annotations.values()].map((a) => this.snapshot(a))
  }
}
