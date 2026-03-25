export interface UndoEntry {
  readonly id: number
  readonly filePath: string
  readonly previousContent: string
  readonly currentContent: string
  readonly timestamp: number
}

export class UndoStack {
  private undoEntries: UndoEntry[] = []
  private redoEntries: UndoEntry[] = []
  private nextId = 0
  private currentBytes = 0
  private readonly maxDepth: number
  private readonly maxBytes: number

  constructor(maxDepth = 50, maxBytes = 10_485_760) {
    this.maxDepth = maxDepth
    this.maxBytes = maxBytes
  }

  push(input: Omit<UndoEntry, 'id' | 'timestamp'>): void {
    const entry: UndoEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      filePath: input.filePath,
      previousContent: input.previousContent,
      currentContent: input.currentContent,
    }
    this.redoEntries.length = 0
    this.undoEntries.push(entry)
    this.currentBytes += this.entryBytes(entry)
    this.evict()
  }

  undo(): { filePath: string; content: string } | null {
    const entry = this.undoEntries.pop()
    if (!entry) return null
    this.currentBytes -= this.entryBytes(entry)
    this.redoEntries.push(entry)
    return { filePath: entry.filePath, content: entry.previousContent }
  }

  redo(): { filePath: string; content: string } | null {
    const entry = this.redoEntries.pop()
    if (!entry) return null
    this.undoEntries.push(entry)
    this.currentBytes += this.entryBytes(entry)
    return { filePath: entry.filePath, content: entry.currentContent }
  }

  peekUndo(): UndoEntry | null {
    const top = this.undoEntries[this.undoEntries.length - 1]
    if (!top) return null
    return { id: top.id, filePath: top.filePath, previousContent: top.previousContent, currentContent: top.currentContent, timestamp: top.timestamp }
  }

  peekRedo(): UndoEntry | null {
    const top = this.redoEntries[this.redoEntries.length - 1]
    if (!top) return null
    return { id: top.id, filePath: top.filePath, previousContent: top.previousContent, currentContent: top.currentContent, timestamp: top.timestamp }
  }

  removeStaleEntry(entryId: number): boolean {
    const idx = this.undoEntries.findIndex(e => e.id === entryId)
    if (idx === -1) return false
    this.currentBytes -= this.entryBytes(this.undoEntries[idx]!)
    this.undoEntries.splice(idx, 1)
    return true
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0
  }

  get undoCount(): number {
    return this.undoEntries.length
  }

  get redoCount(): number {
    return this.redoEntries.length
  }

  clear(): void {
    this.undoEntries.length = 0
    this.redoEntries.length = 0
    this.currentBytes = 0
  }

  private entryBytes(e: UndoEntry): number {
    return (e.previousContent.length + e.currentContent.length) * 2
  }

  private evict(): void {
    while (this.undoEntries.length > this.maxDepth) {
      const evicted = this.undoEntries.shift()!
      this.currentBytes -= this.entryBytes(evicted)
    }
    while (this.undoEntries.length > 1 && this.currentBytes > this.maxBytes) {
      const evicted = this.undoEntries.shift()!
      this.currentBytes -= this.entryBytes(evicted)
    }
  }
}
