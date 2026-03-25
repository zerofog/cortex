import { describe, it, expect } from 'vitest'
import { UndoStack } from '../../../src/core/session/undo-stack.js'

function entry(filePath: string, prev: string, curr: string) {
  return { filePath, previousContent: prev, currentContent: curr }
}

describe('UndoStack', () => {
  it('push + undo returns previous content', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'old', 'new'))
    const result = stack.undo()
    expect(result).toEqual({ filePath: '/a.ts', content: 'old' })
  })

  it('push + undo + redo returns current content', () => {
    const stack = new UndoStack()
    stack.push(entry('/a.ts', 'old', 'new'))
    stack.undo()
    const result = stack.redo()
    expect(result).toEqual({ filePath: '/a.ts', content: 'new' })
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
    expect(stack.undo()).toEqual({ filePath: '/d.ts', content: 'd0' })
    expect(stack.undo()).toEqual({ filePath: '/c.ts', content: 'c0' })
    expect(stack.undo()).toEqual({ filePath: '/b.ts', content: 'b0' })
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
    expect(stack.peekUndo()!.filePath).toBe('/c.ts')
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
    expect(stack.undo()).toEqual({ filePath: '/b.ts', content: 'b1' })
    expect(stack.undo()).toEqual({ filePath: '/a.ts', content: 'a1' })
    expect(stack.undo()).toEqual({ filePath: '/b.ts', content: 'b0' })
    expect(stack.undo()).toEqual({ filePath: '/a.ts', content: 'a0' })
    expect(stack.undo()).toBeNull()

    // Redo replays forward
    expect(stack.redo()).toEqual({ filePath: '/a.ts', content: 'a1' })
    expect(stack.redo()).toEqual({ filePath: '/b.ts', content: 'b1' })
    expect(stack.redo()).toEqual({ filePath: '/a.ts', content: 'a2' })
    expect(stack.redo()).toEqual({ filePath: '/b.ts', content: 'b2' })
    expect(stack.redo()).toBeNull()
  })
})
