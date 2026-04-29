// tests/browser/edit-command.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PropertyEditCommand, CompoundEditCommand } from '../../src/browser/edit-command.js'
import type { StagingBufferOps } from '../../src/browser/edit-command.js'
import { CSSOverrideManager } from '../../src/browser/override.js'
import type { PendingEdit } from '../../src/browser/hooks/useEditStagingBuffer.js'

describe('PropertyEditCommand', () => {
  let manager: CSSOverrideManager
  const originalRAF = window.requestAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now())
      return 0
    }) as typeof requestAnimationFrame
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
  })

  it('execute applies CSS overrides', () => {
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: '' }],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const style = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(style.textContent).toContain('color: red !important')
  })

  it('undo reverts CSS overrides to previous values', () => {
    manager.set('Hero.tsx:5:3', 'color', 'blue')
    manager.flush()

    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' }],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('color: red')

    cmd.undo()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('color: blue')
  })

  it('undo removes override when previousValue is empty', () => {
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: '' }],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    cmd.undo()
    manager.flush()
    const style = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(style.textContent).toBe('')
  })

  it('handles multi-property changes atomically', () => {
    const cmd = new PropertyEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'background-image', value: 'none', previousValue: 'linear-gradient(red, blue)' },
        { source: 'Hero.tsx:5:3', property: 'background-color', value: 'green', previousValue: '' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).toContain('background-image: none')
    expect(text).toContain('background-color: green')

    cmd.undo()
    manager.flush()
    const undoneText = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(undoneText).toContain('background-image: linear-gradient(red, blue)')
    expect(undoneText).not.toContain('background-color')
  })

  it('handles scope=all with multiple sources', () => {
    const cmd = new PropertyEditCommand({
      changes: [
        { source: 'Card.tsx:10:3', property: 'padding', value: '16px', previousValue: '8px' },
        { source: 'Card.tsx:20:3', property: 'padding', value: '16px', previousValue: '8px' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).toContain('Card\\.tsx\\:10\\:3')
    expect(text).toContain('Card\\.tsx\\:20\\:3')

    cmd.undo()
    manager.flush()
    const undoneText = document.head.querySelector('[data-cortex-override]')!.textContent!
    // Both sources must revert — not just the selected element
    expect(undoneText).toContain('Card\\.tsx\\:10\\:3')
    expect(undoneText).toContain('Card\\.tsx\\:20\\:3')
    expect(undoneText).toContain('padding: 8px')
  })

  it('handles pseudo-element changes', () => {
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property: 'content', value: '"hello"', previousValue: '', pseudo: '::before' }],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).toContain('::before')
    expect(text).toContain('content: "hello"')
  })

  it('exposes metadata for UI and server sync', () => {
    const cmd = new PropertyEditCommand({
      changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' }],
      overrideManager: manager,
      editId: 'test-123',
    })
    expect(cmd.editId).toBe('test-123')
    expect(cmd.changes).toHaveLength(1)
    expect(cmd.changes[0].property).toBe('color')
  })

  describe('staging-buffer sync (Copilot fix #1)', () => {
    function makeBufferOps(): StagingBufferOps & { append: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } {
      return { append: vi.fn(), remove: vi.fn() }
    }

    function makePending(intentId: string, property = 'color', value = 'red'): PendingEdit {
      return {
        intentId,
        source: 'Hero.tsx:5:3',
        property,
        value,
        previousValue: 'blue',
        timestamp: 1000,
      }
    }

    it('undo removes pendingEdit intentIds from the staging buffer', () => {
      const bufferOps = makeBufferOps()
      const pendingEdits = [makePending('intent-1'), makePending('intent-2', 'background', 'red')]
      const cmd = new PropertyEditCommand({
        changes: [
          { source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' },
          { source: 'Hero.tsx:5:3', property: 'background', value: 'red', previousValue: 'blue' },
        ],
        overrideManager: manager,
        pendingEdits,
        bufferOps,
      })

      cmd.undo()

      expect(bufferOps.remove).toHaveBeenCalledTimes(1)
      expect(bufferOps.remove).toHaveBeenCalledWith(['intent-1', 'intent-2'])
      expect(bufferOps.append).not.toHaveBeenCalled()
    })

    it('execute (redo path) re-appends pendingEdits to the staging buffer', () => {
      const bufferOps = makeBufferOps()
      const pendingEdits = [makePending('intent-1'), makePending('intent-2', 'background', 'red')]
      const cmd = new PropertyEditCommand({
        changes: [
          { source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' },
          { source: 'Hero.tsx:5:3', property: 'background', value: 'red', previousValue: 'blue' },
        ],
        overrideManager: manager,
        pendingEdits,
        bufferOps,
      })

      cmd.execute()

      expect(bufferOps.append).toHaveBeenCalledTimes(2)
      expect(bufferOps.append).toHaveBeenNthCalledWith(1, pendingEdits[0])
      expect(bufferOps.append).toHaveBeenNthCalledWith(2, pendingEdits[1])
      expect(bufferOps.remove).not.toHaveBeenCalled()
    })

    it('undo→redo cycle restores buffer state (round-trip)', () => {
      const bufferOps = makeBufferOps()
      const pendingEdits = [makePending('intent-1')]
      const cmd = new PropertyEditCommand({
        changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' }],
        overrideManager: manager,
        pendingEdits,
        bufferOps,
      })

      cmd.undo()
      cmd.execute() // redo

      expect(bufferOps.remove).toHaveBeenCalledExactlyOnceWith(['intent-1'])
      expect(bufferOps.append).toHaveBeenCalledExactlyOnceWith(pendingEdits[0])
    })

    it('skips buffer ops when no bufferOps is supplied (back-compat)', () => {
      const cmd = new PropertyEditCommand({
        changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' }],
        overrideManager: manager,
        // No pendingEdits / bufferOps — older test/caller shape
      })
      expect(() => cmd.execute()).not.toThrow()
      expect(() => cmd.undo()).not.toThrow()
    })

    it('skips buffer ops when pendingEdits is empty (no spurious calls)', () => {
      const bufferOps = makeBufferOps()
      const cmd = new PropertyEditCommand({
        changes: [{ source: 'Hero.tsx:5:3', property: 'color', value: 'red', previousValue: 'blue' }],
        overrideManager: manager,
        pendingEdits: [],
        bufferOps,
      })
      cmd.execute()
      cmd.undo()
      expect(bufferOps.append).not.toHaveBeenCalled()
      expect(bufferOps.remove).not.toHaveBeenCalled()
    })
  })
})

describe('CompoundEditCommand (C-R2-1 regression)', () => {
  let manager: CSSOverrideManager
  const originalRAF = window.requestAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now())
      return 0
    }) as typeof requestAnimationFrame
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
  })

  it('execute applies inlineSets as overrides', () => {
    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'font-size', value: '32px', previousValue: '' },
        { source: 'Hero.tsx:5:3', property: 'font-weight', value: '700', previousValue: '' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).toContain('font-size: 32px !important')
    expect(text).toContain('font-weight: 700 !important')
  })

  it('execute with value="" removes the override (inlineRemoves path)', () => {
    manager.set('Hero.tsx:5:3', 'font-size', '32px')
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('font-size: 32px')

    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'font-size', value: '', previousValue: '32px' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).not.toContain('font-size')
  })

  it('undo restores previous override values after execute', () => {
    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'font-family', value: 'Inter', previousValue: 'Helvetica' },
      ],
      overrideManager: manager,
    })
    manager.set('Hero.tsx:5:3', 'font-family', 'Helvetica')
    manager.flush()
    cmd.execute()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('font-family: Inter')

    cmd.undo()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('font-family: Helvetica')
  })

  it('undo with empty previousValue removes the override', () => {
    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'letter-spacing', value: '-0.5px', previousValue: '' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    cmd.undo()
    manager.flush()
    const style = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(style.textContent).toBe('')
  })

  it('undo restores the prior override when inlineRemove cleared it (value="" + previousValue!="")', () => {
    manager.set('Hero.tsx:5:3', 'font-size', '32px')
    manager.flush()

    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'font-size', value: '', previousValue: '32px' },
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).not.toContain('font-size')

    cmd.undo()
    manager.flush()
    expect(document.head.querySelector('[data-cortex-override]')!.textContent).toContain('font-size: 32px')
  })

  it('handles mixed inlineSets + inlineRemoves in one atomic command', () => {
    manager.set('Hero.tsx:5:3', 'font-size', '14px')
    manager.flush()

    const cmd = new CompoundEditCommand({
      changes: [
        { source: 'Hero.tsx:5:3', property: 'font-size', value: '', previousValue: '14px' },       // remove
        { source: 'Hero.tsx:5:3', property: 'font-weight', value: '700', previousValue: '' },      // set
      ],
      overrideManager: manager,
    })
    cmd.execute()
    manager.flush()
    const text = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(text).not.toContain('font-size')
    expect(text).toContain('font-weight: 700')

    cmd.undo()
    manager.flush()
    const undone = document.head.querySelector('[data-cortex-override]')!.textContent!
    expect(undone).toContain('font-size: 14px')
    expect(undone).not.toContain('font-weight')
  })

  it('accepts explicit editId for server-sync correlation', () => {
    const cmd = new CompoundEditCommand({
      changes: [],
      overrideManager: manager,
      editId: 'compound-abc-123',
    })
    expect(cmd.editId).toBe('compound-abc-123')
  })

  it('generates a crypto-random editId when not provided', () => {
    const cmd = new CompoundEditCommand({ changes: [], overrideManager: manager })
    expect(cmd.editId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('EXISTS on the stack even with empty changes (load-bearing invariant for Ctrl+Z gate)', () => {
    // The C-R2-1 regression: applyClassChange called channel.send but
    // did NOT push to commandStack. When user hit Ctrl+Z, the
    // `if (cmd)` gate in CortexApp saw undefined and blocked the
    // server-side undo message. A CompoundEditCommand with empty
    // changes — for classOp-only gestures with no inline ops — must
    // still be a valid pushable command so the gate fires.
    const cmd = new CompoundEditCommand({ changes: [], overrideManager: manager })
    expect(cmd).toBeInstanceOf(CompoundEditCommand)
    expect(cmd.editId).toBeTruthy()
    expect(cmd.changes).toEqual([])
    // execute + undo on empty changes must not throw
    expect(() => cmd.execute()).not.toThrow()
    expect(() => cmd.undo()).not.toThrow()
  })
})
