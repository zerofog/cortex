// tests/browser/edit-command.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PropertyEditCommand } from '../../src/browser/edit-command.js'
import { CSSOverrideManager } from '../../src/browser/override.js'

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
})
