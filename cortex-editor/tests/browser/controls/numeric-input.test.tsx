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

  it('zero-delta pointermove does not trigger scrub commit (deadzone)', async () => {
    const onScrubEnd = vi.fn()
    const { onChange, input } = setup({ onScrubEnd })
    const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

    // Simulate trackpad jitter: pointerdown, pointermove at same X, pointerup
    dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(wrapper, 'pointermove', { clientX: 100 }) // zero delta
    dispatchPointerEvent(wrapper, 'pointermove', { clientX: 101 }) // 1px — still within deadzone
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(wrapper, 'pointerup', { clientX: 101 })
    await new Promise(r => setTimeout(r, 0))

    // Sub-pixel movement should NOT trigger scrub commit
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

  describe('mixed state', () => {
    it('shows placeholder "--" when mixed and not editing', () => {
      const { input } = setup({ mixed: true })
      expect(input.value).toBe('')
      expect(input.placeholder).toBe('--')
    })

    it('does not auto-fill selected element value on click', async () => {
      const { input } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement
      expect(input.value).toBe('')

      // Click without drag — triggers handleScrubDown → handleUp → focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise(r => setTimeout(r, 10))

      // Input stays empty — no auto-fill with selected element's value (16)
      expect(input.value).toBe('')
    })

    it('accepts keystrokes after click-to-focus', async () => {
      const { input } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

      // Click to focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise(r => setTimeout(r, 10))

      // Simulate typing "30"
      input.value = '30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))

      expect(input.value).toBe('30')
    })

    it('commits typed value on Enter', () => {
      const { input, onChange } = setup({ value: 16, mixed: true })

      // Direct input event (same pattern as existing Enter commit tests)
      input.value = '30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      dispatchKeyboardEvent(input, 'keydown', { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(30)
    })

    it('does not commit on blur without typing', async () => {
      const { input, onChange } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

      // Click to focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise(r => setTimeout(r, 10))

      // Blur without typing
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      await new Promise(r => setTimeout(r, 10))

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  // ── prefix prop (Task 6 / ZF0-1184) ───────────────────────────────────
  // The `prefix` slot replaces the legacy `label` slot for callers that
  // need to render an icon (or richer markup) inline-left of the value.
  // PositionSection v2 uses it for X / Y / Z text tags AND the rotate icon.
  describe('prefix prop', () => {
    it('renders a string prefix inside a __prefix slot (not __label)', () => {
      setup({ prefix: 'X' })
      const prefixSlot = container.querySelector('.cortex-numeric-input__prefix')
      expect(prefixSlot).not.toBeNull()
      expect(prefixSlot!.textContent).toBe('X')
      // Mutually exclusive with the legacy label slot
      expect(container.querySelector('.cortex-numeric-input__label')).toBeNull()
    })

    it('renders a JSX prefix (icon support) inside the __prefix slot', () => {
      // Stand-in icon — falsifiable: a real path string in the slot
      // proves the JSX child rendered, and an empty container would
      // fail the .innerHTML assertion.
      const fakeIcon = (
        <svg data-test-icon="rotate" viewBox="0 0 24 24">
          <path d="M21 3v5h-5" />
        </svg>
      )
      setup({ prefix: fakeIcon })
      const prefixSlot = container.querySelector('.cortex-numeric-input__prefix')
      expect(prefixSlot).not.toBeNull()
      const svg = prefixSlot!.querySelector('svg[data-test-icon="rotate"]')
      expect(svg).not.toBeNull()
      expect(svg!.innerHTML).toContain('M21 3v5h-5')
    })

    it('prefix wins when both prefix and label are passed', () => {
      setup({ prefix: 'X', label: 'IGNORED' })
      const prefixSlot = container.querySelector('.cortex-numeric-input__prefix')
      expect(prefixSlot!.textContent).toBe('X')
      expect(container.querySelector('.cortex-numeric-input__label')).toBeNull()
    })

    it('falls back to the legacy label slot when prefix is omitted', () => {
      setup({ label: 'T' })
      const labelSlot = container.querySelector('.cortex-numeric-input__label')
      expect(labelSlot).not.toBeNull()
      expect(labelSlot!.textContent).toBe('T')
      expect(container.querySelector('.cortex-numeric-input__prefix')).toBeNull()
    })
  })
})
