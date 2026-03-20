import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import { renderInShadow } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{ activityCount: number; onClose: () => void }> = {}) {
    const props = {
      activityCount: 0,
      onClose: vi.fn(),
      ...overrides,
    }
    const result = renderInShadow(<Toolbar {...props} />)
    cleanup = result.cleanup
    return { ...result, props }
  }

  it('renders toolbar element', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar')).not.toBeNull()
  })

  it('does not render a select mode button', () => {
    const { root } = setup()
    expect(root.querySelector('[data-mode="select"]')).toBeNull()
  })

  it('renders grip, badge, and close button', () => {
    const { root } = setup({ activityCount: 3 })
    expect(root.querySelector('.cortex-toolbar__grip')).not.toBeNull()
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
    expect(root.querySelector('.cortex-toolbar__badge')).not.toBeNull()
  })

  it('renders only close button (no mode buttons)', () => {
    const { root } = setup()
    const buttons = root.querySelectorAll('button')
    expect(buttons.length).toBe(1)
  })

  it('clicking close calls onClose', () => {
    const onClose = vi.fn()
    const { root } = setup({ onClose })
    const closeBtn = root.querySelector('[data-action="close"]') as HTMLButtonElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('displays activity count', () => {
    const { root } = setup({ activityCount: 5 })
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge?.textContent).toContain('5')
  })

  it('hides badge when activity count is 0', () => {
    const { root } = setup({ activityCount: 0 })
    const badge = root.querySelector('.cortex-toolbar__badge')
    expect(badge).toBeNull()
  })

  it('renders grip drag handle as non-button div', () => {
    const { root } = setup()
    const grip = root.querySelector('.cortex-toolbar__grip')
    expect(grip).not.toBeNull()
    expect(grip?.tagName.toLowerCase()).not.toBe('button')
  })

  it('ignores pointerdown on badge area (drag restricted to grip)', () => {
    const { root } = setup({ activityCount: 3 })
    const toolbar = root.querySelector('.cortex-toolbar') as HTMLElement
    const badge = root.querySelector('.cortex-toolbar__badge') as HTMLElement

    // Simulate pointerdown on badge — should NOT start drag
    const downEvent = new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, pointerId: 1 })
    badge.dispatchEvent(downEvent)

    // Move pointer — toolbar should NOT have moved from initial position
    const moveEvent = new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200, pointerId: 1 })
    toolbar.dispatchEvent(moveEvent)

    const transform = toolbar.style.transform
    // Should still be at initial position (bottom-center), not at 200,200
    expect(transform).not.toContain('200px')
  })
})
