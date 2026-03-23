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
    return this.entries.map(e => ({ ...e }))
  }

  getRecent(count: number): ActivityEntry[] {
    return this.entries.slice(-count).map(e => ({ ...e }))
  }

  getSince(timestamp: number): ActivityEntry[] {
    return this.entries.filter(e => e.timestamp > timestamp).map(e => ({ ...e }))
  }

  get count(): number {
    return this.entries.length
  }
}
