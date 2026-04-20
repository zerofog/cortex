/** Individual file change within a (possibly compound) undo entry. */
export interface UndoFileChange {
  readonly filePath: string
  readonly previousContent: string
  readonly currentContent: string
  /** True when reapplying this change requires an HMR refresh because the
   *  visual depends on a framework re-render — e.g. className mutations
   *  (no browser-side override layer paints them) and deferred/AI rewrites
   *  (may restructure JSX). False when the change's visual is already
   *  painted by the browser-side `!important` override layer before the
   *  source write lands — the common case for inline-style property edits.
   *
   *  Consumed by `_doUndo`/`_doRedo` in edit-pipeline.ts to compute the
   *  `suppressHmr` flag per writeFile call. Without this field, undo/redo
   *  fall back to the default kind-based HMR policy, which for `'undo'`/
   *  `'redo'` means "suppress". That left undone className edits stranded:
   *  file restored, DOM not refreshed, Panel state stale. */
  readonly requiresHmr: boolean
}

/** A single undo entry representing one logical edit.
 *  Contains one or more file changes that are reverted/reapplied as a unit.
 *  scope='all' CSS Module edits produce compound entries (CSS file + JSX cleanup). */
export interface UndoEntry {
  readonly id: number
  readonly changes: readonly UndoFileChange[]
  readonly timestamp: number
}

/** Result of undo()/redo() — the files to write, with the appropriate content direction. */
export type UndoRestoreSet = readonly { filePath: string; content: string }[]

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

  /** Time window (ms) for coalescing sequential edits into one undo entry. */
  private static readonly COALESCE_WINDOW_MS = 500

  push(input: Omit<UndoEntry, 'id' | 'timestamp'>): void {
    if (input.changes.length === 0) throw new Error('UndoStack.push: changes must not be empty')

    // Coalesce with the top entry when rapid sequential edits hit the same file(s).
    // Example: padding-left + padding-right arrive as separate edits within ~100ms.
    // Without coalescing, server has 2 entries but browser has 1 → stacks drift.
    // Detection: every new change's previousContent must match the top entry's
    // currentContent for that file (proof they're sequential, not concurrent).
    const top = this.undoEntries[this.undoEntries.length - 1]
    if (top && Date.now() - top.timestamp < UndoStack.COALESCE_WINDOW_MS) {
      const canCoalesce = input.changes.every(nc => {
        const existing = top.changes.find(c => c.filePath === nc.filePath)
        return existing !== undefined && existing.currentContent === nc.previousContent
      })
      if (canCoalesce) {
        // Extend the top entry: keep original previousContent, update currentContent.
        // canCoalesce guarantees every new change maps to an existing file in top,
        // so this map covers all changes without needing a file-expansion loop.
        const merged: UndoFileChange[] = top.changes.map(existing => {
          const nc = input.changes.find(c => c.filePath === existing.filePath)
          // requiresHmr is OR-combined: if either the original change or the
          // incoming change required HMR, the merged change does too. That way
          // one undo of the compound state restores DOM + Panel correctly even
          // if only one of the coalesced mutations was a className write.
          return nc
            ? {
                filePath: existing.filePath,
                previousContent: existing.previousContent,
                currentContent: nc.currentContent,
                requiresHmr: existing.requiresHmr || nc.requiresHmr,
              }
            : existing
        })
        const oldBytes = this.entryBytes(top)
        const updated: UndoEntry = { id: top.id, timestamp: top.timestamp, changes: merged }
        this.undoEntries[this.undoEntries.length - 1] = updated
        this.currentBytes += this.entryBytes(updated) - oldBytes
        this.redoEntries.length = 0
        this.evict()
        return
      }
    }

    const entry: UndoEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      changes: input.changes,
    }
    this.redoEntries.length = 0
    this.undoEntries.push(entry)
    this.currentBytes += this.entryBytes(entry)
    this.evict()
  }

  undo(): UndoRestoreSet | null {
    const entry = this.undoEntries.pop()
    if (!entry) return null
    this.currentBytes -= this.entryBytes(entry)
    this.redoEntries.push(entry)
    return entry.changes.map(c => ({ filePath: c.filePath, content: c.previousContent }))
  }

  redo(): UndoRestoreSet | null {
    const entry = this.redoEntries.pop()
    if (!entry) return null
    this.undoEntries.push(entry)
    this.currentBytes += this.entryBytes(entry)
    return entry.changes.map(c => ({ filePath: c.filePath, content: c.currentContent }))
  }

  peekUndo(): UndoEntry | null {
    const top = this.undoEntries[this.undoEntries.length - 1]
    if (!top) return null
    return { id: top.id, changes: top.changes, timestamp: top.timestamp }
  }

  peekRedo(): UndoEntry | null {
    const top = this.redoEntries[this.redoEntries.length - 1]
    if (!top) return null
    return { id: top.id, changes: top.changes, timestamp: top.timestamp }
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
    let bytes = 0
    for (const c of e.changes) {
      bytes += (c.previousContent.length + c.currentContent.length) * 2
    }
    return bytes
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
