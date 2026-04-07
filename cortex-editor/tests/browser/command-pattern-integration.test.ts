// tests/browser/command-pattern-integration.test.ts
//
// Integration tests for the command-pattern undo/redo system.
// Exercises the full flow: PropertyEditCommand + CommandStack + CSSOverrideManager
// working together as the browser-side undo engine.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CommandStack } from '../../src/browser/command-stack.js'
import { PropertyEditCommand } from '../../src/browser/edit-command.js'
import type { PropertyChange } from '../../src/browser/edit-command.js'
import { CSSOverrideManager } from '../../src/browser/override.js'

describe('command-pattern undo/redo integration', () => {
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

  /** Helper: read the override <style> tag text */
  function styleText(): string {
    return document.head.querySelector('[data-cortex-override]')!.textContent ?? ''
  }

  it('undo works locally without waiting for server', () => {
    // 1. Push an edit through the full pipeline (CommandStack → PropertyEditCommand → CSSOverrideManager)
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'App.tsx:3:5', property: 'color', value: 'red', previousValue: '' }],
      overrideManager: manager,
    })
    stack.push(cmd)
    manager.flush()

    // 2. Verify override was applied
    expect(styleText()).toContain('color: red !important')
    expect(manager.get('App.tsx:3:5', 'color')).toBe('red')

    // 3. Undo — returns the command synchronously (no async server call needed)
    const undone = stack.undo()
    manager.flush()

    // 4. Verify override was reverted immediately
    expect(undone).toBe(cmd)
    expect(styleText()).toBe('')
    expect(manager.get('App.tsx:3:5', 'color')).toBeUndefined()
    // Key assertion: undo() is synchronous — no await, no server round-trip
    expect(stack.canUndo).toBe(false)
  })

  it('multi-property edit undone atomically', () => {
    // 1. Create a PropertyEditCommand with 2 changes (simulates fill-type switch)
    const changes: PropertyChange[] = [
      { source: 'Hero.tsx:5:3', property: 'background-image', value: 'none', previousValue: 'linear-gradient(red, blue)' },
      { source: 'Hero.tsx:5:3', property: 'background-color', value: 'green', previousValue: '' },
    ]

    // Set up prior state for background-image
    manager.set('Hero.tsx:5:3', 'background-image', 'linear-gradient(red, blue)')
    manager.flush()
    expect(styleText()).toContain('background-image: linear-gradient(red, blue)')

    // 2. Push multi-property command
    const cmd = new PropertyEditCommand({ changes, overrideManager: manager })
    stack.push(cmd)
    manager.flush()

    // 3. Verify both overrides applied
    const applied = styleText()
    expect(applied).toContain('background-image: none')
    expect(applied).toContain('background-color: green')

    // 4. Undo — both changes revert in one step
    stack.undo()
    manager.flush()
    const reverted = styleText()
    expect(reverted).toContain('background-image: linear-gradient(red, blue)')
    expect(reverted).not.toContain('background-color') // removed, previousValue was ''

    // Only 1 undo call needed for 2 property changes
    expect(stack.undoCount).toBe(0)
    expect(stack.redoCount).toBe(1)
  })

  it('undo/redo round-trip preserves state', () => {
    // 1. Push an edit command
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Card.tsx:10:3', property: 'padding', value: '16px', previousValue: '8px' }],
      overrideManager: manager,
    })

    // Set up prior state
    manager.set('Card.tsx:10:3', 'padding', '8px')
    manager.flush()
    const preEditState = styleText()

    stack.push(cmd)
    manager.flush()
    const postEditState = styleText()
    expect(postEditState).toContain('padding: 16px')

    // 2. Undo — verify reverted to pre-edit state
    stack.undo()
    manager.flush()
    expect(styleText()).toBe(preEditState)
    expect(manager.get('Card.tsx:10:3', 'padding')).toBe('8px')

    // 3. Redo — verify re-applied to post-edit state
    stack.redo()
    manager.flush()
    expect(styleText()).toBe(postEditState)
    expect(manager.get('Card.tsx:10:3', 'padding')).toBe('16px')
  })

  it('sequential edits undo in LIFO order', () => {
    // Simulate a user making 3 edits, then undoing them one-by-one
    const sources = ['A.tsx:1:1', 'B.tsx:2:2', 'C.tsx:3:3']
    const cmds = sources.map((source, i) =>
      new PropertyEditCommand({
        changes: [{ source, property: 'color', value: `color-${i}`, previousValue: '' }],
        overrideManager: manager,
      })
    )

    for (const cmd of cmds) stack.push(cmd)
    manager.flush()
    expect(stack.undoCount).toBe(3)

    // Undo last edit (C)
    const undone1 = stack.undo()
    manager.flush()
    expect(undone1!.changes[0].source).toBe('C.tsx:3:3')
    expect(styleText()).not.toContain('color-2')
    expect(styleText()).toContain('color-0')
    expect(styleText()).toContain('color-1')

    // Undo second edit (B)
    const undone2 = stack.undo()
    manager.flush()
    expect(undone2!.changes[0].source).toBe('B.tsx:2:2')
    expect(styleText()).not.toContain('color-1')
    expect(styleText()).toContain('color-0')

    // Redo B
    const redone = stack.redo()
    manager.flush()
    expect(redone!.changes[0].source).toBe('B.tsx:2:2')
    expect(styleText()).toContain('color-1')
  })

  it('new edit after undo clears redo stack (fork)', () => {
    // Push edit A, push edit B, undo B, push edit C
    // Redo should NOT be available (B is gone)
    const cmdA = new PropertyEditCommand({
      changes: [{ source: 'X.tsx:1:1', property: 'color', value: 'red', previousValue: '' }],
      overrideManager: manager,
    })
    const cmdB = new PropertyEditCommand({
      changes: [{ source: 'X.tsx:1:1', property: 'color', value: 'blue', previousValue: 'red' }],
      overrideManager: manager,
    })
    const cmdC = new PropertyEditCommand({
      changes: [{ source: 'X.tsx:1:1', property: 'color', value: 'green', previousValue: 'red' }],
      overrideManager: manager,
    })

    stack.push(cmdA)
    stack.push(cmdB)
    stack.undo() // undo B → back to red
    manager.flush()
    expect(manager.get('X.tsx:1:1', 'color')).toBe('red')

    stack.push(cmdC) // fork — C replaces B
    manager.flush()
    expect(manager.get('X.tsx:1:1', 'color')).toBe('green')
    expect(stack.canRedo).toBe(false) // B is gone
    expect(stack.undoCount).toBe(2) // A, C
  })
})
