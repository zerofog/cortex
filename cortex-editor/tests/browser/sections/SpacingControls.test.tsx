import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { SpacingControls } from '../../../src/browser/components/sections/SpacingControls.js'
import type { SpacingControlsProps } from '../../../src/browser/components/sections/SpacingControls.js'

describe('SpacingControls', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_PADDING = { top: 0, right: 0, bottom: 0, left: 0 }
  const DEFAULT_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

  function setup(overrides?: Partial<SpacingControlsProps>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <SpacingControls
        padding={DEFAULT_PADDING}
        margin={DEFAULT_MARGIN}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('renders Spacing label with P/M prefix inputs', () => {
    setup()
    expect(container.textContent).toContain('Spacing')
    const labels = [...container.querySelectorAll('.cortex-spacing-row .cortex-numeric-input__prefix span')]
      .map((label) => label.textContent)
    expect(labels).toEqual(['P', 'P', 'M', 'M'])
    expect(container.textContent).not.toContain('\u2194')
    expect(container.textContent).not.toContain('\u2195')
  })

  it('renders a compact box model diagram with margin, border, padding, and content regions', () => {
    setup({
      boxSizing: 'border-box',
      padding: { top: 8, right: 12, bottom: 16, left: 20 },
      margin: { top: 2, right: 4, bottom: 6, left: 8 },
    })
    const diagram = container.querySelector('[data-testid="spacing-box-model-diagram"]')
    expect(diagram).not.toBeNull()
    expect(diagram!.getAttribute('data-box-sizing')).toBe('border-box')
    expect(diagram!.querySelector('.cortex-box-model__layer--margin')).not.toBeNull()
    expect(diagram!.querySelector('.cortex-box-model__layer--border')).not.toBeNull()
    expect(diagram!.querySelector('.cortex-box-model__layer--padding')).not.toBeNull()
    expect(diagram!.querySelector('.cortex-box-model__content')).not.toBeNull()

    expect(diagram!.querySelector('[data-layer="margin"][data-side="left"]')?.textContent).toBe('8')
    expect(diagram!.querySelector('[data-layer="padding"][data-side="bottom"]')?.textContent).toBe('16')
    expect(diagram!.textContent).toContain('content')
    expect(diagram!.textContent).toContain('border-box')
  })

  it('renders mixed side buttons as indeterminate', () => {
    setup({
      padding: { top: 8, right: 12, bottom: 16, left: 20 },
      mixedProperties: new Set(['padding-right']),
    })

    const rightPadding = container.querySelector('[data-layer="padding"][data-side="right"]')
    const leftPadding = container.querySelector('[data-layer="padding"][data-side="left"]')

    expect(rightPadding?.textContent).toBe('--')
    expect(rightPadding?.classList.contains('cortex-box-model__side--mixed')).toBe(true)
    expect(rightPadding?.getAttribute('aria-label')).toBe('Edit Padding right, mixed value')
    expect(leftPadding?.textContent).toBe('20')
  })

  it('dims the box model diagram when a spacing side is dimmed', () => {
    setup({
      dimmedProperties: new Set(['margin-left']),
    })

    const diagram = container.querySelector('[data-testid="spacing-box-model-diagram"]')
    expect(diagram?.classList.contains('cortex-control--dimmed')).toBe(true)
  })

  it('clicking a non-default padding side opens exact-side editing and emits only that padding property', async () => {
    const { onChange } = setup({
      padding: { top: 8, right: 12, bottom: 16, left: 20 },
      margin: DEFAULT_MARGIN,
    })

    const rightPaddingSelector = '[data-layer="padding"][data-side="right"]'
    const rightPadding = container.querySelector(rightPaddingSelector) as HTMLElement
    expect(rightPadding).not.toBeNull()
    rightPadding.click()

    await vi.waitFor(() => {
      expect(container.querySelector(`${rightPaddingSelector}[aria-pressed="true"]`)).not.toBeNull()
    }, { timeout: 500 })

    const editor = container.querySelector('[data-testid="spacing-box-model-side-editor"]')!
    expect(editor.textContent).toContain('Padding right')
    const input = editor.querySelector('.cortex-numeric-input input') as HTMLInputElement
    input.focus()
    input.value = '18'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onChange).toHaveBeenCalledWith({ property: 'padding-right', value: '18px' })
    expect(onChange).not.toHaveBeenCalledWith({ property: 'padding-top', value: '18px' })
    expect(onChange).not.toHaveBeenCalledWith({ property: 'padding-bottom', value: '18px' })
    expect(onChange).not.toHaveBeenCalledWith({ property: 'padding-left', value: '18px' })
  })

  it('clicking a margin side opens exact-side editing and allows negative values', async () => {
    const { onChange } = setup({
      padding: DEFAULT_PADDING,
      margin: { top: 0, right: 0, bottom: 0, left: 4 },
    })

    const leftMarginSelector = '[data-layer="margin"][data-side="left"]'
    const leftMargin = container.querySelector(leftMarginSelector) as HTMLElement
    expect(leftMargin).not.toBeNull()
    leftMargin.click()

    await vi.waitFor(() => {
      expect(container.querySelector(`${leftMarginSelector}[aria-pressed="true"]`)).not.toBeNull()
    }, { timeout: 500 })

    const editor = container.querySelector('[data-testid="spacing-box-model-side-editor"]')!
    expect(editor.textContent).toContain('Margin left')
    const input = editor.querySelector('.cortex-numeric-input input') as HTMLInputElement
    input.focus()
    input.value = '-12'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onChange).toHaveBeenCalledWith({ property: 'margin-left', value: '-12px' })
  })

  it('renders data-section attributes for padding and margin', () => {
    setup()
    expect(container.querySelector('[data-section="padding"]')).not.toBeNull()
    expect(container.querySelector('[data-section="margin"]')).not.toBeNull()
  })

  it('uses P/M text plus Lucide axis icons in prefix slots', () => {
    setup()
    const prefixes = container.querySelectorAll('.cortex-spacing-row .cortex-numeric-input__prefix')
    expect(prefixes.length).toBe(4)
    const svgInPrefixes = container.querySelectorAll('.cortex-spacing-row .cortex-numeric-input__prefix svg')
    expect(svgInPrefixes.length).toBe(4)

    // ArrowLeftRight: horizontal axis; ArrowUpDown: vertical axis. These path
    // fragments make the test falsifiable against an accidental icon swap.
    expect(prefixes[0].innerHTML).toContain('M4 7h16')
    expect(prefixes[1].innerHTML).toContain('M17 20V4')
    expect(prefixes[2].innerHTML).toContain('M4 7h16')
    expect(prefixes[3].innerHTML).toContain('M17 20V4')
  })

  it('padding uses padding-* properties', () => {
    const { onChange } = setup({ padding: { top: 10, right: 10, bottom: 10, left: 10 } })
    // Edit horizontal padding
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '20'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-left')
    const rightCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-right')
    expect(leftCall).toBeDefined()
    expect(rightCall).toBeDefined()
    expect(leftCall![0].value).toBe('20px')
    expect(rightCall![0].value).toBe('20px')
  })

  it('margin uses margin-* properties', () => {
    const { onChange } = setup({ margin: { top: 5, right: 5, bottom: 5, left: 5 } })
    const marginSection = container.querySelector('[data-section="margin"]')!
    const inputs = marginSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '15'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'margin-left')
    expect(leftCall).toBeDefined()
    expect(leftCall![0].value).toBe('15px')
  })

  it('lock button links H/V — editing horizontal padding updates all four sides', async () => {
    const { onChange } = setup({ padding: { top: 8, right: 8, bottom: 8, left: 8 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const lockBtn = paddingSection.querySelector('.cortex-lock-btn') as HTMLElement
    expect(lockBtn).not.toBeNull()
    lockBtn.click()
    await vi.waitFor(() => {
      expect(lockBtn.getAttribute('aria-pressed')).toBe('true')
    }, { timeout: 500 })

    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '16'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    // When locked, horizontal change should fire left, right, top, bottom
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-left' && c[0]?.value === '16px')
    const rightCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-right' && c[0]?.value === '16px')
    const topCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-top' && c[0]?.value === '16px')
    const bottomCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'padding-bottom' && c[0]?.value === '16px')
    expect(leftCall).toBeDefined()
    expect(rightCall).toBeDefined()
    expect(topCall).toBeDefined()
    expect(bottomCall).toBeDefined()
  })

  it('unlocked: axes independent — editing horizontal does not fire vertical', () => {
    const { onChange } = setup({ padding: { top: 8, right: 8, bottom: 8, left: 8 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '20'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    const leftCalls = onChange.mock.calls.filter((c: any) => c[0]?.property === 'padding-left')
    const topCalls = onChange.mock.calls.filter((c: any) => c[0]?.property === 'padding-top')
    expect(leftCalls.length).toBeGreaterThanOrEqual(1)
    // Top should NOT be fired when unlocked
    expect(topCalls.length).toBe(0)
  })

  it('margin allows negative values (no min=0 constraint)', () => {
    const { onChange } = setup({ margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    const marginSection = container.querySelector('[data-section="margin"]')!
    const inputs = marginSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '-10'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const leftCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'margin-left')
    expect(leftCall).toBeDefined()
    expect(leftCall![0].value).toBe('-10px')
  })

  it('padding min=0 prevents negative submission', () => {
    const { onChange } = setup({ padding: { top: 0, right: 0, bottom: 0, left: 0 } })
    const paddingSection = container.querySelector('[data-section="padding"]')!
    const inputs = paddingSection.querySelectorAll('.cortex-numeric-input input')
    const hInput = inputs[0] as HTMLInputElement
    hInput.focus()
    hInput.value = '-5'
    hInput.dispatchEvent(new Event('input', { bubbles: true }))
    hInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    // NumericInput should clamp to min=0 — the emitted value should be 0px, not -5px
    const negativeCalls = onChange.mock.calls.filter(
      (c: any) => c[0]?.property?.startsWith('padding-') && c[0]?.value === '-5px',
    )
    expect(negativeCalls.length).toBe(0)
  })

  it('renders two lock buttons (one per row)', () => {
    setup()
    const lockBtns = container.querySelectorAll('.cortex-lock-btn')
    expect(lockBtns.length).toBe(2)
  })
})
