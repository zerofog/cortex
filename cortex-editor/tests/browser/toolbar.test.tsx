import { describe, it, expect, vi, afterEach } from 'vitest'
import { Toolbar } from '../../src/browser/components/Toolbar.js'
import type { CortexMode } from '../../src/browser/components/Toolbar.js'
import { renderInShadow } from './helpers.js'

describe('Toolbar', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function setup(overrides: Partial<{
    mode: CortexMode
    onModeChange: (m: CortexMode) => void
    activityCount: number
    onClose: () => void
    canvasActive: boolean
  }> = {}) {
    const props = {
      mode: 'select' as CortexMode,
      onModeChange: vi.fn(),
      activityCount: 0,
      onClose: vi.fn(),
      canvasActive: false,
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

  it('renders all toolbar buttons', () => {
    const { root } = setup()
    const buttons = root.querySelectorAll('button')
    // Select, Comment, Canvas, Close = 4 buttons
    expect(buttons.length).toBe(4)
  })

  it('select button has active class when mode is select', () => {
    const { root } = setup({ mode: 'select' })
    const selectBtn = root.querySelector('[data-mode="select"]')
    expect(selectBtn?.classList.contains('cortex-toolbar__btn--active')).toBe(true)
  })

  it('clicking comment button calls onModeChange with comment', () => {
    const onModeChange = vi.fn()
    const { root } = setup({ onModeChange })
    const commentBtn = root.querySelector('[data-mode="comment"]') as HTMLButtonElement
    commentBtn.click()
    expect(onModeChange).toHaveBeenCalledWith('comment')
  })

  it('clicking canvas button calls onModeChange with canvas', () => {
    const onModeChange = vi.fn()
    const { root } = setup({ onModeChange })
    const canvasBtn = root.querySelector('[data-mode="canvas"]') as HTMLButtonElement
    canvasBtn.click()
    expect(onModeChange).toHaveBeenCalledWith('canvas')
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

  it('canvas button shows active state when canvasActive', () => {
    const { root } = setup({ canvasActive: true })
    const canvasBtn = root.querySelector('[data-mode="canvas"]')
    expect(canvasBtn?.classList.contains('cortex-toolbar__btn--active')).toBe(true)
  })

  it('renders logo drag handle as non-button div', () => {
    const { root } = setup()
    const logo = root.querySelector('.cortex-toolbar__logo')
    expect(logo).not.toBeNull()
    expect(logo?.tagName.toLowerCase()).not.toBe('button')
  })
})
