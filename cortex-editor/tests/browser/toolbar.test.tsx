import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import { renderInShadow, dispatchPointerEvent } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{ onClose: () => void }> = {}) {
    const props = {
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
    const selectBtn = root.querySelector('[data-mode="select"]')
    const commentBtn = root.querySelector('[data-mode="comment"]')
    expect(selectBtn).not.toBeNull()
    expect(commentBtn).not.toBeNull()
    expect(selectBtn!.classList.contains('cortex-toolbar__mode--active')).toBe(true)
    expect(commentBtn!.classList.contains('cortex-toolbar__mode--active')).toBe(false)
  })

  it('renders grip and close button', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__grip')).not.toBeNull()
    expect(root.querySelector('[data-action="close"]')).not.toBeNull()
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

  it('renders grip drag handle as non-button div', () => {
    const { root } = setup()
    const grip = root.querySelector('.cortex-toolbar__grip')
    expect(grip).not.toBeNull()
    expect(grip?.tagName.toLowerCase()).not.toBe('button')
  })

  it('badge is never rendered (activity-count badge removed)', () => {
    const { root } = setup()
    expect(root.querySelector('.cortex-toolbar__badge')).toBeNull()
  })
})
