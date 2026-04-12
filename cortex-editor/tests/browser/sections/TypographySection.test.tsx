import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { TypographySection } from '../../../src/browser/components/sections/TypographySection.js'
import type { TypographyValues } from '../../../src/browser/components/sections/TypographySection.js'

// Mock @floating-ui/dom for Dropdown
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('TypographySection v2 — dual mode', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: TypographyValues = {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: 'left',
    color: 'rgb(107, 114, 128)',
  }

  function setup(overrides?: Partial<Parameters<typeof TypographySection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <TypographySection
        values={DEFAULT_VALUES}
        availableWeights={['400', '500', '700']}
        onChange={onChange}
        mode="auto"
        detectedTokenClasses={[]}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  // Test 1: Mode A renders TokenChip for each detected class
  it('Mode A renders TokenChip for each detected class', () => {
    setup({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-sm', property: 'font-size' }],
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain('text-sm')
  })

  // Test 2: Mode B renders font-size NumericInput and text-align SegmentedControl
  it('Mode B renders font-size NumericInput and text-align SegmentedControl', () => {
    setup({ mode: 'b' })
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBeGreaterThan(0)
    const segmentedControl = container.querySelector('[role="radiogroup"]')
    expect(segmentedControl).not.toBeNull()
  })

  // Test 3: When detectedTokenClasses=[] and mode='auto', defaults to Mode B
  it('when detectedTokenClasses=[] and mode="auto", defaults to Mode B', () => {
    setup({ mode: 'auto', detectedTokenClasses: [] })
    // Mode B should show numeric inputs (CSS controls)
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBeGreaterThan(0)
    // No token chips should be visible
    const chips = container.querySelectorAll('.cortex-token-chip')
    expect(chips.length).toBe(0)
  })

  // Test 4: When detectedTokenClasses has entries and mode='auto', defaults to Mode A
  it('when detectedTokenClasses has entries and mode="auto", defaults to Mode A', () => {
    setup({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-sm', property: 'font-size' }],
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    // Mode A should NOT show numeric inputs
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBe(0)
  })

  // Test 5: Mode B fontSize onChange fires correct change
  it('Mode B fontSize onChange fires correct change', () => {
    const { onChange } = setup({ mode: 'b' })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Font size is the first numeric input in Mode B (after font-family dropdown)
    // Find it by checking the wrapper's tooltip
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.querySelector('[data-tooltip="Font Size"]') !== null
        || wrapper?.getAttribute('data-tooltip') === 'Font Size'
    }) as HTMLInputElement | undefined
    // If we can't find by tooltip, fall back to the first input with px unit
    const fallbackInput = szInput ?? inputs[0] as HTMLInputElement
    expect(fallbackInput).toBeDefined()
    fallbackInput.focus()
    fallbackInput.value = '14'
    fallbackInput.dispatchEvent(new Event('input', { bubbles: true }))
    fallbackInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const sizeCall = onChange.mock.calls.find((c: any) => c[0]?.property === 'font-size')
    expect(sizeCall).toBeDefined()
    expect(sizeCall![0].value).toBe('14px')
  })

  // Test 6: Mode B textAlign onChange fires correct change
  it('Mode B textAlign onChange fires correct change', () => {
    const { onChange } = setup({ mode: 'b' })
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    const centerBtn = alignGroup?.querySelector('[data-value="center"]') as HTMLElement
    expect(centerBtn).not.toBeNull()
    centerBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'text-align', value: 'center' })
  })

  // Test 7: Text-align uses Lucide icons (SVG elements, not emoji text)
  it('text-align uses Lucide icons (SVG, not emoji)', () => {
    setup({ mode: 'b' })
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    expect(alignGroup).not.toBeNull()
    const svgs = alignGroup!.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(4)
  })

  // Test 8: Mode A displays color chip with swatch
  it('Mode A displays color chip with resolved value for color', () => {
    setup({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-gray-900', property: 'color' }],
      values: { ...DEFAULT_VALUES, color: 'rgb(17,24,39)' },
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain('text-gray-900')
    // The swatch should have a backgroundColor matching the resolved value
    const swatch = chip!.querySelector('.cortex-token-chip__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(17, 24, 39)')
  })
})
