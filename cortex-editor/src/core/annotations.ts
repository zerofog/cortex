import { randomUUID } from "node:crypto";
import type {
  Annotation,
  CreateAnnotationParams,
  ThreadMessage,
} from "../adapters/types.js";

const DEFAULT_MAX_TERMINAL = 100;

export interface AnnotationStoreOptions {
  /** Cap on terminal (resolved/dismissed) entries. FIFO eviction past this. Default 100. */
  maxTerminal?: number;
}

export class AnnotationStore {
  private annotations = new Map<string, Annotation>();
  private terminalOrder: string[] = [];
  private readonly maxTerminal: number;

  constructor(opts?: AnnotationStoreOptions) {
    const max = opts?.maxTerminal ?? DEFAULT_MAX_TERMINAL;
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(
        `AnnotationStore: maxTerminal must be a positive integer, got ${max}`,
      );
    }
    this.maxTerminal = max;
  }

  private snapshot(ann: Annotation): Annotation {
    return { ...ann, thread: [...ann.thread] };
  }

  private markTerminal(id: string): void {
    this.terminalOrder.push(id);
    while (this.terminalOrder.length > this.maxTerminal) {
      const oldest = this.terminalOrder.shift();
      if (oldest !== undefined) this.annotations.delete(oldest);
    }
  }

  create(params: CreateAnnotationParams): Annotation {
    const now = Date.now();
    const annotation: Annotation = {
      id: randomUUID(),
      status: "pending",
      elementSource: params.elementSource,
      text: params.text,
      elementContext: params.elementContext,
      currentStyles: params.currentStyles,
      pinPosition: params.pinPosition,
      createdAt: now,
      updatedAt: now,
      thread: [],
      kind: params.kind ?? "comment",
      fixMeta: params.fixMeta,
    };
    this.annotations.set(annotation.id, annotation);
    return this.snapshot(annotation);
  }

  getPending(): Annotation[] {
    return [...this.annotations.values()]
      .filter((a) => a.status === "pending")
      .map((a) => this.snapshot(a));
  }

  getById(id: string): Annotation | null {
    const ann = this.annotations.get(id);
    return ann ? this.snapshot(ann) : null;
  }

  acknowledge(id: string): Annotation | null {
    const ann = this.annotations.get(id);
    if (!ann || ann.status !== "pending") return null;
    ann.status = "acknowledged";
    ann.updatedAt = Date.now();
    return this.snapshot(ann);
  }

  resolve(id: string, summary: string): Annotation | null {
    const ann = this.annotations.get(id);
    if (!ann || ann.status !== "acknowledged") return null;
    ann.status = "resolved";
    ann.resolution = { summary };
    ann.updatedAt = Date.now();
    this.markTerminal(id);
    return this.snapshot(ann);
  }

  dismiss(id: string, reason?: string): Annotation | null {
    const ann = this.annotations.get(id);
    if (!ann || ann.status === "resolved" || ann.status === "dismissed")
      return null;
    ann.status = "dismissed";
    if (reason) ann.dismissReason = reason;
    ann.updatedAt = Date.now();
    this.markTerminal(id);
    return this.snapshot(ann);
  }

  addMessage(
    id: string,
    msg: Omit<ThreadMessage, "id" | "timestamp">,
  ): Annotation | null {
    const ann = this.annotations.get(id);
    if (!ann || ann.status === "resolved" || ann.status === "dismissed")
      return null;
    if (ann.thread.length >= 100) return null;
    ann.thread.push({
      id: randomUUID(),
      from: msg.from,
      text: msg.text,
      timestamp: Date.now(),
    });
    ann.updatedAt = Date.now();
    return this.snapshot(ann);
  }

  getAll(): Annotation[] {
    return [...this.annotations.values()].map((a) => this.snapshot(a));
  }
}
