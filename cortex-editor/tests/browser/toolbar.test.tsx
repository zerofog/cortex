import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import { renderInShadow, dispatchPointerEvent } from './helpers.js'

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

  it('renders select and comment mode buttons', () => {
    const { root } = setup()
    const modes = root.querySelectorAll('.cortex-toolbar__mode')
    expect(modes.length).toBe(2)
    // First mode is select (default active), second is comment
    expect(modes[0].classList.contains('cortex-toolbar__mode--active')).toBe(true)
    expect(modes[1].classList.contains('cortex-toolbar__mode--active')).toBe(false)
  })

  it('renders grip, badge, and close button', () => {
    const { root } = setup({ activityCount: 3 })
    expect(root.querySelector('.cortex-toolbar__grip')).not.toBeNull()
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
    expect(root.querySelector('.cortex-toolbar__badge')).not.toBeNull()
  })

  it('renders mode switcher and close button', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__modes')).not.toBeNull()
    expect(root.querySelectorAll('.cortex-toolbar__mode').length).toBe(2)
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
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

    const initialTransform = toolbar.style.transform

    // Simulate pointerdown on badge — should NOT start drag
    dispatchPointerEvent(badge, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointerEvent(toolbar, 'pointermove', { clientX: 200, clientY: 200 })

    expect(toolbar.style.transform).toBe(initialTransform)
  })
})
