import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, createElement } from 'preact'
import { NumericInput } from '../../../src/browser/components/controls/NumericInput.js'
import { SpacingTokensContext } from '../../../src/browser/tokens/TokenContext.js'
import type { SpacingToken } from '../../../src/core/tailwind-resolver.js'
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

  it('arrow stepping uses the live draft value and syncs the input', () => {
    const { onChange, input } = setup()
    input.value = '30'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(31)
    expect(onChange).not.toHaveBeenCalledWith(17)
    expect(input.value).toBe('31')

    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('commits text input on Enter exactly once (no double-fire from blur)', async () => {
    const { onChange, input } = setup()
    // Simulate typing by setting value and dispatching input event
    input.value = '24'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    dispatchKeyboardEvent(input, 'keydown', { key: 'Enter' })
    // Enter calls blur() internally — wait for blur handler to run
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(24)
    }, { timeout: 500 })
  })

  it('reverts invalid text on blur', async () => {
    const { onChange, input } = setup()
    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    // Flush Preact's async re-render after setLocalValue in handleBlur
    await vi.waitFor(() => {
      expect(input.value).toBe('16')
    }, { timeout: 500 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops an uncommitted draft when the input becomes disabled', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(<NumericInput value={16} unit="px" onChange={onChange} />, container)
    let input = container.querySelector('input') as HTMLInputElement
    input.focus()
    input.value = '24'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    render(<NumericInput value={16} unit="px" tooltip="Switch to Fixed (px) to edit dimensions" disabled onChange={onChange} />, container)
    input = container.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))

    await vi.waitFor(() => {
      expect(input.disabled).toBe(true)
      expect(input.value).toBe('16')
    }, { timeout: 500 })
    const wrapper = container.querySelector('.cortex-numeric-input') as HTMLElement
    expect(wrapper.getAttribute('aria-disabled')).toBe('true')
    expect(wrapper.getAttribute('aria-label')).toBe('Switch to Fixed (px) to edit dimensions')
    expect(wrapper.getAttribute('role')).toBe('group')
    expect(wrapper.tabIndex).toBe(0)
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

  it('wheel stepping uses the live draft value and syncs the input', () => {
    const { onChange, input } = setupInShadow()
    input.focus()
    input.value = '30'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    })
    input.dispatchEvent(wheelEvent)
    expect(onChange).toHaveBeenCalledWith(31)
    expect(onChange).not.toHaveBeenCalledWith(17)
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(input.value).toBe('31')

    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(1)
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
    await vi.waitFor(() => {
      expect(input.value).toBe('36')
      expect(onScrub).toHaveBeenCalledWith(36)
      expect(wrapper.querySelector('.cortex-numeric-input__scrub-badge')?.textContent).toBe('36px')
    }, { timeout: 500 })

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
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(24)
    }, { timeout: 500 })
  })

  it('does NOT commit on blur if user did not type (HMR safety)', async () => {
    const { onChange, input } = setup()
    // Focus the input (select all), then blur WITHOUT typing
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await new Promise<void>(r => setTimeout(r, 0))
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
    await new Promise<void>(r => setTimeout(r, 0))
    // Blur fires (e.g., React replaced DOM node)
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await new Promise<void>(r => setTimeout(r, 0))

    // Should NOT have called onChange — user didn't type
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('mixed state', () => {
    it('shows a Mixed placeholder when mixed and not editing', () => {
      const { input } = setup({ mixed: true })
      expect(input.value).toBe('')
      expect(input.placeholder).toBe('Mixed')
    })

    it('does not auto-fill selected element value on click', async () => {
      const { input } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement
      expect(input.value).toBe('')

      // Click without drag — triggers handleScrubDown → handleUp → focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))

      // Input stays empty — no auto-fill with selected element's value (16)
      expect(input.value).toBe('')
    })

    it('accepts keystrokes after click-to-focus', async () => {
      const { input } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

      // Click to focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))

      // Simulate typing "30"
      input.value = '30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await vi.waitFor(() => {
        expect(input.value).toBe('30')
      }, { timeout: 500 })
    })

    it('commits typed value on Enter', () => {
      const { input, onChange } = setup({ value: 16, mixed: true })

      // Direct input event (same pattern as existing Enter commit tests)
      input.value = '30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      dispatchKeyboardEvent(input, 'keydown', { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(30)
    })

    it('commits the typed representative value on blur', async () => {
      const { input, onChange } = setup({ value: 16, mixed: true })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      input.value = '16'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(16)
      }, { timeout: 500 })
    })

    it('ignores arrow stepping before a concrete value is typed', () => {
      const { input, onChange } = setup({ value: 16, mixed: true })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp' })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps from the typed value instead of the hidden representative value', () => {
      const { input, onChange } = setup({ value: 16, mixed: true })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      input.value = '30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      dispatchKeyboardEvent(input, 'keydown', { key: 'ArrowUp' })
      expect(onChange).toHaveBeenCalledWith(31)
      expect(onChange).not.toHaveBeenCalledWith(17)
    })

    it('ignores wheel stepping before a concrete value is typed', () => {
      const { input, onChange } = setupInShadow({ value: 16, mixed: true })
      input.focus()
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      const wheelEvent = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -1,
      })
      input.dispatchEvent(wheelEvent)
      expect(onChange).not.toHaveBeenCalled()
      expect(wheelEvent.defaultPrevented).toBe(false)
    })

    it('does not scrub from the hidden representative value while mixed', async () => {
      const onScrub = vi.fn()
      const onScrubEnd = vi.fn()
      const { input, onChange } = setup({ value: 16, mixed: true, onScrub, onScrubEnd })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointermove', { clientX: 120 })
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 120 })
      await new Promise<void>(r => setTimeout(r, 0))

      expect(onScrub).not.toHaveBeenCalled()
      expect(onScrubEnd).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
      expect(wrapper.querySelector('.cortex-numeric-input__scrub-badge')).toBeNull()
      expect(input.value).toBe('')
    })

    it('does not commit on blur without typing', async () => {
      const { input, onChange } = setup({ value: 16, mixed: true })
      const wrapper = input.closest('.cortex-numeric-input') as HTMLElement

      // Click to focus
      dispatchPointerEvent(wrapper, 'pointerdown', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))
      dispatchPointerEvent(wrapper, 'pointerup', { clientX: 100 })
      await new Promise<void>(r => setTimeout(r, 0))

      // Blur without typing
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
      await new Promise<void>(r => setTimeout(r, 0))

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('tokenFamily popover', () => {
    const MOCK_TOKENS: readonly SpacingToken[] = [
      { name: '--spacing-sm', valuePx: 8, source: 'css-variable' },
      { name: '--gap-lg', valuePx: 24, source: 'css-variable' },
    ]

    function setupWithTokens(props?: Partial<Parameters<typeof NumericInput>[0]>, tokens: readonly SpacingToken[] = MOCK_TOKENS) {
      container = document.createElement('div')
      document.body.appendChild(container)
      const onChange = vi.fn()
      render(
        createElement(SpacingTokensContext.Provider, { value: tokens },
          createElement(NumericInput, {
            value: 16,
            unit: 'px',
            onChange,
            ...props,
          }),
        ),
        container,
      )
      return { onChange, input: container.querySelector('input') as HTMLInputElement }
    }

    it('renders popover when tokenFamily="spacing" and input is focused', async () => {
      const { input } = setupWithTokens({ tokenFamily: 'spacing' })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })
    })

    // Both omission and unwired-family share a single branch — `tokenFamily !== 'spacing'`
    // — so cover them with a single parametrized test instead of duplicate it() blocks.
    // 'sizing' stands in for any reserved-but-unwired family from the TokenFamily union.
    it.each([
      ['omitted', undefined],
      ['unwired family ("sizing")', 'sizing' as const],
    ])('does NOT render popover when tokenFamily is %s', async (_label, tokenFamily) => {
      const { input } = setupWithTokens(tokenFamily ? { tokenFamily } : undefined)
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      await new Promise<void>(r => setTimeout(r, 0))
      expect(container.querySelector('.cortex-token-preset-popover')).toBeNull()
    })

    it('onPick routes through onChange with the selected token valuePx', async () => {
      const { onChange, input } = setupWithTokens({ tokenFamily: 'spacing' })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      // Wait for popover to appear before looking for token row
      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })

      // First MOCK_TOKEN: --spacing-sm = 8px
      const smRow = [...container.querySelectorAll('.cortex-token-preset-popover__list-row')]
        .find(r => r.textContent?.includes('--spacing-sm')) as HTMLButtonElement | undefined
      expect(smRow).not.toBeUndefined()
      smRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(8)
      }, { timeout: 500 })
    })

    it('row mousedown is preventDefault — typed value does not phantom-commit before pick', async () => {
      // Regression: clicking a token row after typing fired onChange twice — once for the
      // typed value (from blur on mousedown's focus shift) and once for the picked value.
      // Fix in TokenPresetPopover: onMouseDown={e => e.preventDefault()} on row buttons
      // keeps focus on the input so handleBlur never runs before onPick.
      const { onChange, input } = setupWithTokens({ tokenFamily: 'spacing' })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })

      const smRow = [...container.querySelectorAll('.cortex-token-preset-popover__list-row')]
        .find(r => r.textContent?.includes('--spacing-sm')) as HTMLButtonElement | undefined
      expect(smRow).not.toBeUndefined()

      // User typed a value before clicking the row — sets userTypedRef so blur would commit.
      input.value = '5'
      input.dispatchEvent(new Event('input', { bubbles: true }))

      // Mousedown on the row MUST be preventDefault — otherwise the input loses focus,
      // handleBlur fires, and onChange(5) commits before onPick fires.
      const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      smRow!.dispatchEvent(mousedown)
      expect(mousedown.defaultPrevented).toBe(true)

      // Pick still routes through onChange exactly once with the token's valuePx.
      smRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(8)
      }, { timeout: 500 })
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('onPick closes the popover after selection', async () => {
      const { input } = setupWithTokens({ tokenFamily: 'spacing' })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })

      const firstRow = container.querySelector('.cortex-token-preset-popover__list-row') as HTMLButtonElement
      firstRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).toBeNull()
      }, { timeout: 500 })
    })

    it('renders empty state when no project tokens are detected', async () => {
      const { input } = setupWithTokens({ tokenFamily: 'spacing' }, [])
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })

      // No rows; the empty-state block is shown instead.
      expect(container.querySelectorAll('.cortex-token-preset-popover__list-row')).toHaveLength(0)
      expect(container.querySelector('.cortex-token-preset-popover__empty-state')).not.toBeNull()
    })

    it('project tokens from context appear as popover rows', async () => {
      const { input } = setupWithTokens({ tokenFamily: 'spacing' })
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      await vi.waitFor(() => {
        const rows = container.querySelectorAll('.cortex-token-preset-popover__list-row')
        expect(rows.length).toBe(MOCK_TOKENS.length)
      }, { timeout: 500 })

      const rows = container.querySelectorAll('.cortex-token-preset-popover__list-row')
      expect(rows[0]!.textContent).toContain('--spacing-sm')
      expect(rows[1]!.textContent).toContain('--gap-lg')
    })

    it('tokens NOT matching spacing pattern are filtered out', async () => {
      const mixedTokens: readonly SpacingToken[] = [
        { name: '--spacing-sm', valuePx: 8, source: 'css-variable' },
        { name: '--color-primary', valuePx: 0, source: 'css-variable' }, // should be filtered
      ]
      const { input } = setupWithTokens({ tokenFamily: 'spacing' }, mixedTokens)
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-token-preset-popover')).not.toBeNull()
      }, { timeout: 500 })

      const rows = container.querySelectorAll('.cortex-token-preset-popover__list-row')
      expect(rows.length).toBe(1)
      expect(rows[0]!.textContent).toContain('--spacing-sm')
    })
  })

  // The `prefix` slot supports rendering an icon or richer markup inline-
  // left of the value — callers that only need plain text should prefer it
  // over the legacy `label` slot.
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

    it('feeds a string prefix into aria-label when tooltip and label are absent', () => {
      // Locks the a11y fallback chain `tooltip ?? label ?? (typeof prefix
      // === 'string' ? prefix : undefined)`. A prefix-only caller like
      // <NumericInput prefix="X" onChange={...} /> still produces an
      // accessible name so the input isn't orphaned for screen readers.
      setup({ prefix: 'X', tooltip: undefined, label: undefined })
      const input = container.querySelector('input') as HTMLInputElement
      expect(input.getAttribute('aria-label')).toBe('X')
    })

    it('does NOT feed a JSX prefix into aria-label (avoids accessible-name garbage)', () => {
      // JSX prefixes are icons, not text — silently serialising them into
      // aria-label would produce "[object Object]" or similar noise. The
      // fallback chain intentionally returns undefined so the caller must
      // provide tooltip or label to name the input.
      const iconOnly = <svg><path d="M0 0" /></svg>
      setup({ prefix: iconOnly, tooltip: undefined, label: undefined })
      const input = container.querySelector('input') as HTMLInputElement
      expect(input.getAttribute('aria-label')).toBeNull()
    })
  })
})
