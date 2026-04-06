import { describe, it, expect, vi } from 'vitest'
import { UndoStack } from '../../../src/core/session/undo-stack.js'

/** Single-file push input — wraps in changes[] for convenience. */
function entry(filePath: string, prev: string, curr: string) {
  return { changes: [{ filePath, previousContent: prev, currentContent: curr }] }
}

/** Compound push input — multiple file changes in one entry. */
function compound(...entries: Array<[filePath: string, prev: string, curr: string]>) {
  return { changes: entries.map(([filePath, prev, curr]) => ({ filePath, previousContent: prev, currentContent: curr })) }
}

describe('UndoStack', () => {
  it('push + undo returns previous content', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'old', 'new'))
    const result = stack.undo()
    expect(result).toEqual([{ filePath: '/a.ts', content: 'old' }])
  })

  it('push + undo + redo returns current content', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'old', 'new'))
    stack.undo()
    const result = stack.redo()
    expect(result).toEqual([{ filePath: '/a.ts', content: 'new' }])
  })

  it('undo on empty stack returns null', () => {
    const stack = new UndoStack()
    expect(stack.undo()).toBeNull()
  })

  it('redo on empty stack returns null', () => {
    const stack = new UndoStack()
    expect(stack.redo()).toBeNull()
  })

  it('push after undo clears redo stack', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'v0', 'v1'))
    stack.push(entry('/a.ts', 'v1', 'v2'))
    stack.undo()
    expect(stack.canRedo).toBe(true)
    stack.push(entry('/a.ts', 'v1', 'v3'))
    expect(stack.canRedo).toBe(false)
    expect(stack.redo()).toBeNull()
  })

  it('assigns monotonic IDs to entries', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'a', 'b'))
    stack.push(entry('/b.ts', 'c', 'd'))
    stack.push(entry('/c.ts', 'e', 'f'))
    const e1 = stack.peekUndo()!
    stack.undo()
    const e2 = stack.peekUndo()!
    stack.undo()
    const e3 = stack.peekUndo()!
    expect(e3.id).toBeLessThan(e2.id)
    expect(e2.id).toBeLessThan(e1.id)
  })

  it('canUndo / canRedo reflect state correctly', () => {
    const stack = new UndoStack()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)

    stack.push(entry('/a.ts', 'old', 'new'))
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)

    stack.undo()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(true)

    stack.redo()
    expect(stack.canUndo).toBe(true)
    expect(stack.canRedo).toBe(false)
  })

  it('depth limit evicts oldest entry', () => {
    const stack = new UndoStack(3)
    stack.push(entry('/a.ts', 'a0', 'a1'))
    stack.push(entry('/b.ts', 'b0', 'b1'))
    stack.push(entry('/c.ts', 'c0', 'c1'))
    expect(stack.undoCount).toBe(3)

    stack.push(entry('/d.ts', 'd0', 'd1'))
    expect(stack.undoCount).toBe(3)

    // oldest (a.ts) should have been evicted; undo order: d, c, b
    expect(stack.undo()).toEqual([{ filePath: '/d.ts', content: 'd0' }])
    expect(stack.undo()).toEqual([{ filePath: '/c.ts', content: 'c0' }])
    expect(stack.undo()).toEqual([{ filePath: '/b.ts', content: 'b0' }])
    expect(stack.undo()).toBeNull()
  })

  it('byte budget evicts oldest entries when exceeded', () => {
    // Each char = 2 bytes. Entry bytes = (prev.length + curr.length) * 2
    // An entry with 10-char strings = (10 + 10) * 2 = 40 bytes
    // maxBytes = 100 means we can hold ~2 entries of 40 bytes each
    const stack = new UndoStack(50, 100)
    stack.push(entry('/a.ts', '0123456789', 'abcdefghij')) // 40 bytes
    stack.push(entry('/b.ts', '0123456789', 'abcdefghij')) // 40 bytes, total 80
    expect(stack.undoCount).toBe(2)

    stack.push(entry('/c.ts', '0123456789', 'abcdefghij')) // 40 bytes, total would be 120 > 100
    // oldest entries evicted until under budget
    expect(stack.undoCount).toBeLessThanOrEqual(2)
    // c.ts must still be present (it was just pushed)
    expect(stack.peekUndo()!.changes[0]!.filePath).toBe('/c.ts')
  })

  it('removeStaleEntry removes correct entry by ID', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'a0', 'a1'))
    stack.push(entry('/b.ts', 'b0', 'b1'))
    stack.push(entry('/c.ts', 'c0', 'c1'))

    // Get the middle entry's ID
    stack.undo() // pop c
    const middle = stack.peekUndo()!
    stack.redo() // restore c on top

    const removed = stack.removeStaleEntry(middle.id)
    expect(removed).toBe(true)
    expect(stack.undoCount).toBe(2)

    // Removing non-existent ID returns false
    expect(stack.removeStaleEntry(9999)).toBe(false)
  })

  it('clear empties both stacks', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'old', 'new'))
    stack.push(entry('/b.ts', 'old', 'new'))
    stack.undo()

    expect(stack.undoCount).toBe(1)
    expect(stack.redoCount).toBe(1)

    stack.clear()
    expect(stack.undoCount).toBe(0)
    expect(stack.redoCount).toBe(0)
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
  })

  it('handles multiple files interleaved in the stack', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'a0', 'a1'))
    stack.push(entry('/b.ts', 'b0', 'b1'))
    stack.push(entry('/a.ts', 'a1', 'a2'))
    stack.push(entry('/b.ts', 'b1', 'b2'))

    // Undo restores in reverse order regardless of file
    expect(stack.undo()).toEqual([{ filePath: '/b.ts', content: 'b1' }])
    expect(stack.undo()).toEqual([{ filePath: '/a.ts', content: 'a1' }])
    expect(stack.undo()).toEqual([{ filePath: '/b.ts', content: 'b0' }])
    expect(stack.undo()).toEqual([{ filePath: '/a.ts', content: 'a0' }])
    expect(stack.undo()).toBeNull()

    // Redo replays forward
    expect(stack.redo()).toEqual([{ filePath: '/a.ts', content: 'a1' }])
    expect(stack.redo()).toEqual([{ filePath: '/b.ts', content: 'b1' }])
    expect(stack.redo()).toEqual([{ filePath: '/a.ts', content: 'a2' }])
    expect(stack.redo()).toEqual([{ filePath: '/b.ts', content: 'b2' }])
    expect(stack.redo()).toBeNull()
  })

  describe('compound entries', () => {
    it('compound push + undo reverts all files in the entry', () => {
      const stack = new UndoStack()
      stack.push(compound(['/a.css', 'css-old', 'css-new'], ['/b.tsx', 'jsx-old', 'jsx-new']))
      expect(stack.undoCount).toBe(1)

      const result = stack.undo()
      expect(result).toEqual([
        { filePath: '/a.css', content: 'css-old' },
        { filePath: '/b.tsx', content: 'jsx-old' },
      ])
      expect(stack.undoCount).toBe(0)
    })

    it('compound push + undo + redo reapplies all files', () => {
      const stack = new UndoStack()
      stack.push(compound(['/a.css', 'css-old', 'css-new'], ['/b.tsx', 'jsx-old', 'jsx-new']))
      stack.undo()

      const result = stack.redo()
      expect(result).toEqual([
        { filePath: '/a.css', content: 'css-new' },
        { filePath: '/b.tsx', content: 'jsx-new' },
      ])
      expect(stack.undoCount).toBe(1)
    })

    it('compound entry counts as one depth unit', () => {
      const stack = new UndoStack(2)
      stack.push(compound(['/a.css', 'a0', 'a1'], ['/a.tsx', 'b0', 'b1']))
      stack.push(compound(['/c.css', 'c0', 'c1'], ['/c.tsx', 'd0', 'd1']))
      expect(stack.undoCount).toBe(2)

      // Third push evicts oldest compound entry as one unit
      stack.push(entry('/e.ts', 'e0', 'e1'))
      expect(stack.undoCount).toBe(2)

      // First compound entry (a.css + a.tsx) is gone
      stack.undo() // e.ts
      const result = stack.undo()
      expect(result).toEqual([
        { filePath: '/c.css', content: 'c0' },
        { filePath: '/c.tsx', content: 'd0' },
      ])
      expect(stack.undo()).toBeNull()
    })

    it('compound byte budget sums all file changes', () => {
      // Entry with 2 files of 10-char strings: 2 * (10 + 10) * 2 = 80 bytes
      // maxBytes = 100 means one compound (80) + one small single (20) fits
      const stack = new UndoStack(50, 100)
      stack.push(compound(['/a.css', '0123456789', 'abcdefghij'], ['/a.tsx', '0123456789', 'klmnopqrst']))
      expect(stack.undoCount).toBe(1) // 80 bytes

      // Small single-file entry: (3 + 3) * 2 = 12 bytes, total 92 < 100
      stack.push(entry('/b.ts', 'old', 'new'))
      expect(stack.undoCount).toBe(2)

      // Another compound (80 bytes) would push total to 172 > 100, evicting oldest
      stack.push(compound(['/c.css', '0123456789', 'ABCDEFGHIJ'], ['/c.tsx', '0123456789', 'KLMNOPQRST']))
      expect(stack.undoCount).toBeLessThanOrEqual(2)
      expect(stack.peekUndo()!.changes[0]!.filePath).toBe('/c.css')
    })

    it('peekUndo returns compound entry with all changes', () => {
      const stack = new UndoStack()
      stack.push(compound(['/a.css', 'css-old', 'css-new'], ['/b.tsx', 'jsx-old', 'jsx-new']))

      const entry = stack.peekUndo()!
      expect(entry.changes).toHaveLength(2)
      expect(entry.changes[0]).toEqual({ filePath: '/a.css', previousContent: 'css-old', currentContent: 'css-new' })
      expect(entry.changes[1]).toEqual({ filePath: '/b.tsx', previousContent: 'jsx-old', currentContent: 'jsx-new' })
    })

    it('removeStaleEntry removes entire compound entry', () => {
      const stack = new UndoStack()
      stack.push(entry('/x.ts', 'x0', 'x1'))
      stack.push(compound(['/a.css', 'a0', 'a1'], ['/a.tsx', 'b0', 'b1']))
      stack.push(entry('/y.ts', 'y0', 'y1'))

      // Get the compound entry's ID
      stack.undo() // pop y.ts
      const compoundEntry = stack.peekUndo()!
      expect(compoundEntry.changes).toHaveLength(2)
      stack.redo() // restore y.ts

      const removed = stack.removeStaleEntry(compoundEntry.id)
      expect(removed).toBe(true)
      expect(stack.undoCount).toBe(2) // x.ts and y.ts remain
    })

    it('mixed single and compound entries interleave correctly', () => {
      const stack = new UndoStack()
      stack.push(entry('/a.ts', 'a0', 'a1'))
      stack.push(compound(['/b.css', 'b0', 'b1'], ['/b.tsx', 'c0', 'c1']))
      stack.push(entry('/d.ts', 'd0', 'd1'))

      // Undo in reverse: single, compound, single
      expect(stack.undo()).toEqual([{ filePath: '/d.ts', content: 'd0' }])
      expect(stack.undo()).toEqual([
        { filePath: '/b.css', content: 'b0' },
        { filePath: '/b.tsx', content: 'c0' },
      ])
      expect(stack.undo()).toEqual([{ filePath: '/a.ts', content: 'a0' }])

      // Redo forward: single, compound, single
      expect(stack.redo()).toEqual([{ filePath: '/a.ts', content: 'a1' }])
      expect(stack.redo()).toEqual([
        { filePath: '/b.css', content: 'b1' },
        { filePath: '/b.tsx', content: 'c1' },
      ])
      expect(stack.redo()).toEqual([{ filePath: '/d.ts', content: 'd1' }])
    })

    it('compound entry with 3+ files (multi-JSX cleanup)', () => {
      const stack = new UndoStack()
      stack.push(compound(
        ['/style.module.css', 'css-old', 'css-new'],
        ['/ComponentA.tsx', 'a-old', 'a-new'],
        ['/ComponentB.tsx', 'b-old', 'b-new'],
      ))
      expect(stack.undoCount).toBe(1)

      const result = stack.undo()
      expect(result).toEqual([
        { filePath: '/style.module.css', content: 'css-old' },
        { filePath: '/ComponentA.tsx', content: 'a-old' },
        { filePath: '/ComponentB.tsx', content: 'b-old' },
      ])
    })

    it('push rejects empty changes array', () => {
      const stack = new UndoStack()
      expect(() => stack.push({ changes: [] })).toThrow('changes must not be empty')
    })
  })

  describe('coalescing', () => {
    it('coalesces sequential edits to same file within window', () => {
      const stack = new UndoStack()
      // Edit 1: padding-left (A → B)
      stack.push(entry('/style.module.css', 'A', 'B'))
      // Edit 2: padding-right, same file (B → C) — arrives quickly
      stack.push(entry('/style.module.css', 'B', 'C'))

      // Should be one entry, not two
      expect(stack.undoCount).toBe(1)
      // Undo restores original (A), not intermediate (B)
      expect(stack.undo()).toEqual([{ filePath: '/style.module.css', content: 'A' }])
    })

    it('coalesced entry redo restores final state', () => {
      const stack = new UndoStack()
      stack.push(entry('/s.css', 'A', 'B'))
      stack.push(entry('/s.css', 'B', 'C'))
      stack.undo()
      expect(stack.redo()).toEqual([{ filePath: '/s.css', content: 'C' }])
    })

    it('does NOT coalesce when previousContent mismatches top currentContent', () => {
      const stack = new UndoStack()
      stack.push(entry('/a.css', 'A', 'B'))
      // Different file — previousContent doesn't match anything in top
      stack.push(entry('/b.css', 'X', 'Y'))
      expect(stack.undoCount).toBe(2)
    })

    it('does NOT coalesce edits to different files', () => {
      const stack = new UndoStack()
      stack.push(entry('/a.css', 'A', 'B'))
      stack.push(entry('/b.css', 'B', 'C'))
      expect(stack.undoCount).toBe(2)
    })

    it('coalesces compound entries that share files', () => {
      const stack = new UndoStack()
      stack.push(compound(['/s.css', 'A', 'B'], ['/a.tsx', 'a0', 'a1']))
      // Second edit writes same CSS (B→C) + same JSX (a1→a2)
      stack.push(compound(['/s.css', 'B', 'C'], ['/a.tsx', 'a1', 'a2']))
      expect(stack.undoCount).toBe(1)
      expect(stack.undo()).toEqual([
        { filePath: '/s.css', content: 'A' },
        { filePath: '/a.tsx', content: 'a0' },
      ])
    })

    it('three sequential edits coalesce into one', () => {
      const stack = new UndoStack()
      stack.push(entry('/s.css', 'A', 'B'))
      stack.push(entry('/s.css', 'B', 'C'))
      stack.push(entry('/s.css', 'C', 'D'))
      expect(stack.undoCount).toBe(1)
      expect(stack.undo()).toEqual([{ filePath: '/s.css', content: 'A' }])
    })

    it('coalescing clears redo stack', () => {
      const stack = new UndoStack()
      stack.push(entry('/a.ts', 'old', 'new'))
      stack.undo()
      stack.redo()
      // Now push two sequential edits that coalesce
      stack.push(entry('/s.css', 'A', 'B'))
      stack.push(entry('/s.css', 'B', 'C'))
      expect(stack.redoCount).toBe(0)
    })

    it('does NOT coalesce when outside the time window', () => {
      vi.useFakeTimers()
      try {
        const stack = new UndoStack()
        stack.push(entry('/s.css', 'A', 'B'))
        vi.advanceTimersByTime(501)
        stack.push(entry('/s.css', 'B', 'C'))
        // Beyond 500ms window — should be separate entries
        expect(stack.undoCount).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
