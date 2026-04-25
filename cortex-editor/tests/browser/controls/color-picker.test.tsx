import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { ColorPicker } from '../../../src/browser/components/controls/ColorPicker.js'

// Mock @floating-ui/dom — happy-dom doesn't have real layout
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

/** Yield one macrotask so Preact state updates flush between events. */
const flush = () => new Promise<void>(r => setTimeout(r, 0))

describe('ColorPicker', () => {
  let container: HTMLDivElement
  let anchor: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
    if (anchor) {
      anchor.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof ColorPicker>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    anchor = document.createElement('div')
    document.body.appendChild(anchor)
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(
      <ColorPicker
        color="#3b82f6"
        onChange={onChange}
        onClose={onClose}
        anchor={anchor}
        {...overrides}
      />,
      container,
    )
    return { onChange, onClose }
  }

  it('renders backdrop', () => {
    setup()
    const backdrop = container.querySelector('.cortex-color-picker__backdrop')
    expect(backdrop).not.toBeNull()
  })

  it('renders popover', () => {
    setup()
    const popover = container.querySelector('.cortex-color-picker__popover')
    expect(popover).not.toBeNull()
  })

  it('renders hex-color-picker element', () => {
    setup()
    const picker = container.querySelector('hex-color-picker')
    expect(picker).not.toBeNull()
  })

  it('renders hex input with current color', () => {
    setup()
    const input = container.querySelector('.cortex-color-picker__hex-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('#3b82f6')
  })

  it('renders alpha % text when onAlphaChange provided', () => {
    setup({ alpha: 80, onAlphaChange: vi.fn() })
    const unit = container.querySelector('.cortex-color-picker__unit')
    expect(unit).not.toBeNull()
    expect(unit!.textContent).toBe('%')
  })

  it('renders color swatches', () => {
    setup()
    const swatches = container.querySelectorAll('.cortex-color-picker__swatch')
    expect(swatches.length).toBe(24)
  })

  it('calls onClose on backdrop click', () => {
    const { onClose } = setup()
    const backdrop = container.querySelector('.cortex-color-picker__backdrop') as HTMLElement
    backdrop.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onChange on swatch click', async () => {
    const { onChange } = setup()
    const swatches = container.querySelectorAll('.cortex-color-picker__swatch')
    ;(swatches[0] as HTMLElement).click()
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ef4444')
    }, { timeout: 500 })
  })

  it('calls onChange when valid hex committed via input', async () => {
    const { onChange } = setup()
    const input = container.querySelector('.cortex-color-picker__hex-input') as HTMLInputElement
    input.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    input.value = '#ff0000'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    }, { timeout: 500 })
  })

  it('does not call onChange when invalid hex committed via input', async () => {
    const { onChange } = setup()
    const input = container.querySelector('.cortex-color-picker__hex-input') as HTMLInputElement
    input.dispatchEvent(new Event('focus', { bubbles: true }))
    await flush()
    input.value = 'notahex'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await flush()
    expect(onChange).not.toHaveBeenCalled()
  })
})
