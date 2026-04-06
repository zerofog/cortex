// tests/browser/command-stack.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CommandStack } from '../../src/browser/command-stack.js'
import { PropertyEditCommand } from '../../src/browser/edit-command.js'
import { CSSOverrideManager } from '../../src/browser/override.js'

describe('CommandStack', () => {
  let stack: CommandStack
  let manager: CSSOverrideManager
  const originalRAF = window.requestAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now())
      return 0
    }) as typeof requestAnimationFrame
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
    stack = new CommandStack()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
  })

  function makeCmd(property: string, value: string, previousValue: string): PropertyEditCommand {
    return new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property, value, previousValue }],
      overrideManager: manager,
    })
  }

  it('push executes the command', () => {
    const cmd = makeCmd('color', 'red', '')
    stack.push(cmd)
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('color: red')
  })

  it('undo reverts the last command', () => {
    stack.push(makeCmd('color', 'red', ''))
    manager.flush()
    const undone = stack.undo()
    manager.flush()
    expect(undone).not.toBeNull()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toBe('')
  })

  it('redo re-applies after undo', () => {
    stack.push(makeCmd('color', 'red', ''))
    stack.undo()
    const redone = stack.redo()
    manager.flush()
    expect(redone).not.toBeNull()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('color: red')
  })

  it('new push clears redo stack', () => {
    stack.push(makeCmd('color', 'red', ''))
    stack.undo()
    expect(stack.canRedo).toBe(true)
    stack.push(makeCmd('color', 'blue', ''))
    expect(stack.canRedo).toBe(false)
  })

  it('multiple undo/redo levels', () => {
    stack.push(makeCmd('color', 'red', ''))
    stack.push(makeCmd('font-size', '16px', ''))
    stack.push(makeCmd('padding', '8px', ''))

    stack.undo() // removes padding
    stack.undo() // removes font-size
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).toContain('color: red')
    expect(text).not.toContain('font-size')
    expect(text).not.toContain('padding')

    stack.redo() // re-applies font-size
    manager.flush()
    const text2 = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text2).toContain('font-size: 16px')
  })

  it('respects max depth (evicts oldest)', () => {
    const maxStack = new CommandStack(3)
    maxStack.push(makeCmd('a', '1', ''))
    maxStack.push(makeCmd('b', '2', ''))
    maxStack.push(makeCmd('c', '3', ''))
    maxStack.push(makeCmd('d', '4', ''))
    expect(maxStack.undoCount).toBe(3) // a was evicted
  })

  it('undo returns null on empty stack', () => {
    expect(stack.undo()).toBeNull()
  })

  it('redo returns null when nothing to redo', () => {
    expect(stack.redo()).toBeNull()
  })

  it('canUndo / canRedo accessors', () => {
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
    stack.push(makeCmd('color', 'red', ''))
    expect(stack.canUndo).toBe(true)
    stack.undo()
    expect(stack.canRedo).toBe(true)
    expect(stack.canUndo).toBe(false)
  })

  it('clear empties both stacks', () => {
    stack.push(makeCmd('color', 'red', ''))
    stack.undo()
    stack.clear()
    expect(stack.canUndo).toBe(false)
    expect(stack.canRedo).toBe(false)
  })

  it('peekUndo returns the top command without popping', () => {
    const cmd = makeCmd('color', 'red', '')
    stack.push(cmd)
    expect(stack.peekUndo()).toBe(cmd)
    expect(stack.undoCount).toBe(1)
  })
})
