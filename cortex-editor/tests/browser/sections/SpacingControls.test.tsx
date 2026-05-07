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
    expect(container.textContent).toContain('P')
    expect(container.textContent).toContain('M')
    expect(container.textContent).not.toContain('\u2194')
    expect(container.textContent).not.toContain('\u2195')
  })

  it('renders data-section attributes for padding and margin', () => {
    setup()
    expect(container.querySelector('[data-section="padding"]')).not.toBeNull()
    expect(container.querySelector('[data-section="margin"]')).not.toBeNull()
  })

  it('uses P/M text plus Lucide axis icons in prefix slots', () => {
    setup()
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    expect(prefixes.length).toBe(4)
    const svgInPrefixes = container.querySelectorAll('.cortex-numeric-input__prefix svg')
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
