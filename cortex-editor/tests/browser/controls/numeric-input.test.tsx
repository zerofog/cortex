import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { NumericInput } from '../../../src/browser/components/controls/NumericInput.js'
import { dispatchKeyboardEvent, dispatchPointerEvent, createShadowHost } from '../helpers.js'

describe('NumericInput', () => {
  let container: HTMLDivElement
  let shadowCleanup: (() => void) | null = null

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
    shadowCleanup?.()
    shadowCleanup = null
  })

  function setup(props?: Partial<Parameters<typeof NumericInput>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <NumericInput
        value={16}
        unit="px"
        onChange={onChange}
        {...props}
      />,
      container,
    )
    return { onChange, input: container.querySelector('input') as HTMLInputElement }
  }

  function setupInShadow(props?: Partial<Parameters<typeof NumericInput>[0]>) {
    const { host, shadow, root, cleanup } = createShadowHost()
    shadowCleanup = cleanup
    container = root
    const onChange = vi.fn()
    render(
      <NumericInput
        value={16}
        unit="px"
        onChange={onChange}
        {...props}
      />,
      root,
    )
    return { onChange, input: root.querySelector('input') as HTMLInputElement, shadow }
  }

  it('renders with value and unit', () => {
    setup()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('16')
    expect(container.textContent).toContain('px')
  })

  it('arrow up increments by 1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(17)
  })

  it('arrow down decrements by 1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(15)
  })

  it('shift+arrow increments by 10', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenCalledWith(26)
  })

  it('alt+arrow increments by 0.1', () => {
    const { onChange, input } = setup()
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp', altKey: true })
    expect(onChange).toHaveBeenCalledWith(16.1)
  })

  it('commits text input on Enter', () => {
    const { onChange, input } = setup()
    // Simulate typing by setting value and dispatching input event
    input.value = '24'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    dispatchKeyboardEvent(input, 'keydown', { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it('reverts invalid text on blur', async () => {
    const { onChange, input } = setup()
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    // Flush Preact's async re-render after setLocalValue in handleBlur
    await new Promise(r => setTimeout(r, 10))
    expect(input.value).toBe('16')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selects all text on focus', () => {
    const { input } = setup()
    const selectSpy = vi.spyOn(input, 'select')
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    expect(selectSpy).toHaveBeenCalled()
  })

  it('wheel changes value when input is focused inside Shadow DOM', () => {
    const { onChange, input } = setupInShadow()
    // Focus the input so getRootNode().activeElement matches
    input.focus()
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    })
    input.dispatchEvent(wheelEvent)
    expect(onChange).toHaveBeenCalledWith(17)
  })

  it('wheel is ignored when input is not focused inside Shadow DOM', () => {
    const { onChange, input } = setupInShadow()
    // Don't focus the input
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    })
    input.dispatchEvent(wheelEvent)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('scrub updates displayed value in real time', async () => {
    const onScrub = vi.fn()
    const { input } = setup({ onScrub })
    const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

    // Start scrub at x=100
    dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
    await new Promise(r => setTimeout(r, 0))

    // Drag 20px right — value should be 16 + 20 = 36
    dispatchPointerEvent(wrapper, 'pointermove', { clientX: 120 })
    await new Promise(r => setTimeout(r, 0))

    expect(input.value).toBe('36')
    expect(onScrub).toHaveBeenCalledWith(36)

    // Release
    dispatchPointerEvent(wrapper, 'pointerup', { clientX: 120 })
  })

  it('click without drag focuses input without dispatching edit', async () => {
    const onScrubEnd = vi.fn()
    const { onChange, input } = setup({ onScrubEnd })
    const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

    // Click: pointerdown at x=100, pointerup at x=100 (no move)
    dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
    await new Promise(r => setTimeout(r, 0))

    // Should NOT dispatch onScrubEnd or onChange — it's just a click
    expect(onScrubEnd).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits typed value on blur', async () => {
    const { onChange, input } = setup()
    // Focus, type a new value, then blur
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    input.value = '24'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(onChange).toHaveBeenCalledWith(24)
  })

  it('does NOT commit on blur if user did not type (HMR safety)', async () => {
    const { onChange, input } = setup()
    // Focus the input (select all), then blur WITHOUT typing
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does NOT commit on blur when value prop changes externally (HMR scenario)', async () => {
    // Simulates: user scrubs to 18, server writes, HMR fires, value prop changes to 30 (stale),
    // input blurs during React re-render — should NOT dispatch onChange(old-value)
    const onChange = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)

    // Render with value=30 (simulating stale computed style after HMR)
    render(<NumericInput value={30} unit="px" onChange={onChange} />, container)
    const input = container.querySelector('input') as HTMLInputElement

    // The input displays "30" but user never typed — blur should NOT fire onChange
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    // Re-render with different value (simulates HMR changing the prop)
    render(<NumericInput value={18} unit="px" onChange={onChange} />, container)
    await new Promise(r => setTimeout(r, 10))
    // Blur fires (e.g., React replaced DOM node)
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))

    // Should NOT have called onChange — user didn't type
    expect(onChange).not.toHaveBeenCalled()
  })
})
