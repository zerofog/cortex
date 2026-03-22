import { randomUUID } from 'node:crypto'
import type { Annotation, CreateAnnotationParams, ThreadMessage } from '../adapters/types.js'

export class AnnotationStore {
  private annotations = new Map<string, Annotation>()

  private snapshot(ann: Annotation): Annotation {
    return { ...ann, thread: [...ann.thread] }
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
