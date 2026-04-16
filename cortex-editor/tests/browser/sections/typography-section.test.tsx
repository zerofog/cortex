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

describe('TypographySection', () => {
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
        mode="b"
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="type"', () => {
    setup()
    const root = container.querySelector('[data-section-id="type"]')
    expect(root).not.toBeNull()
  })

  it('renders font-size NumericInput with correct value', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Font size input shows value 16
    const szInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '16') as HTMLInputElement | undefined
    expect(szInput).toBeDefined()
    expect(szInput!.value).toBe('16')
  })

  it('renders line-height and letter-spacing inputs', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // LH = 1.5, LS = 0
    const lhInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '1.5')
    const lsInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '0')
    expect(lhInput).toBeDefined()
    expect(lsInput).toBeDefined()
  })

  it('renders text align segmented control', () => {
    setup()
    const groups = container.querySelectorAll('[role="radiogroup"]')
    expect(groups.length).toBeGreaterThan(0)
  })

  it('renders color swatch and hex input', () => {
    setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput).not.toBeNull()
    // rgb(107, 114, 128) → #6b7280
    expect(hexInput.value).toBe('#6b7280')
  })

  it('parses rgba color format', () => {
    setup({ values: { ...DEFAULT_VALUES, color: 'rgba(59, 130, 246, 0.5)' } })
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput.value).toBe('#3b82f6')
  })

  it('parses modern rgb space syntax', () => {
    setup({ values: { ...DEFAULT_VALUES, color: 'rgb(59 130 246)' } })
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput.value).toBe('#3b82f6')
  })

  it('emits font-size change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    // Find input with value "16" (font-size)
    const szInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '16') as HTMLInputElement | undefined
    expect(szInput).toBeDefined()
    szInput!.focus()
    szInput!.value = '20'
    szInput!.dispatchEvent(new Event('input', { bubbles: true }))
    szInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const sizeCall = calls.find((c: any) => c[0]?.property === 'font-size')
    expect(sizeCall).toBeDefined()
    expect(sizeCall![0].value).toBe('20px')
  })

  it('emits line-height as unitless value', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const lhInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '1.5') as HTMLInputElement | undefined
    expect(lhInput).toBeDefined()
    lhInput!.focus()
    lhInput!.value = '1.8'
    lhInput!.dispatchEvent(new Event('input', { bubbles: true }))
    lhInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const lhCall = calls.find((c: any) => c[0]?.property === 'line-height')
    expect(lhCall).toBeDefined()
    expect(lhCall![0].value).toBe('1.8')
  })

  // Review finding 3d: letter-spacing formatting test
  it('emits letter-spacing with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const lsInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '0') as HTMLInputElement | undefined
    expect(lsInput).toBeDefined()
    lsInput!.focus()
    lsInput!.value = '2'
    lsInput!.dispatchEvent(new Event('input', { bubbles: true }))
    lsInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const lsCall = calls.find((c: any) => c[0]?.property === 'letter-spacing')
    expect(lsCall).toBeDefined()
    expect(lsCall![0].value).toBe('2px')
  })

  it('emits text-align change', () => {
    const { onChange } = setup()
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    const centerBtn = alignGroup?.querySelector('[data-value="center"]') as HTMLElement
    centerBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'text-align', value: 'center' })
  })

  it('validates hex input — accepts valid hex', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hexInput.focus()
    hexInput.value = '#ff0000'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    // Await re-render so handleHexBlur captures updated localHex
    await new Promise((r) => setTimeout(r, 10))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const calls = onChange.mock.calls
    const colorCall = calls.find((c: any) => c[0]?.property === 'color')
    expect(colorCall).toBeDefined()
    expect(colorCall![0].value).toBe('#ff0000')
  })

  it('validates hex input — rejects invalid, reverts', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    hexInput.focus()
    hexInput.value = 'notahex'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    // Await re-render so handleHexBlur sees the invalid localHex
    await new Promise((r) => setTimeout(r, 10))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    expect(hexInput.value).toBe('#6b7280')
    const calls = onChange.mock.calls
    const colorCall = calls.find((c: any) => c[0]?.property === 'color')
    expect(colorCall).toBeUndefined()
  })

  it('renders weight dropdown with named label', () => {
    setup()
    // In v2, font-family dropdown is first, weight dropdown is second
    const triggers = container.querySelectorAll('.cortex-dropdown__trigger')
    // Second dropdown should be the weight dropdown
    const weightTrigger = triggers[1]
    expect(weightTrigger?.textContent).toContain('400 - Regular')
  })

  it('color swatch shows computed color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(107, 114, 128)')
  })
})

// ── Dual-mode tests (merged from TypographySection.test.tsx to avoid
//    case-insensitive filesystem conflicts on macOS/Windows) ──────────

describe('TypographySection v2 — dual mode', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const V2_VALUES: TypographyValues = {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 1.5,
    letterSpacing: 0,
    textAlign: 'left',
    color: 'rgb(107, 114, 128)',
  }

  function setupV2(overrides?: Partial<Parameters<typeof TypographySection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <TypographySection
        values={V2_VALUES}
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

  it('Mode A renders TokenChip for each detected class', () => {
    setupV2({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-sm', property: 'font-size' }],
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain('text-sm')
  })

  it('Mode B renders font-size NumericInput and text-align SegmentedControl', () => {
    setupV2({ mode: 'b' })
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBeGreaterThan(0)
    const segmentedControl = container.querySelector('[role="radiogroup"]')
    expect(segmentedControl).not.toBeNull()
  })

  it('when detectedTokenClasses=[] and mode="auto", defaults to Mode B', () => {
    setupV2({ mode: 'auto', detectedTokenClasses: [] })
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBeGreaterThan(0)
    const chips = container.querySelectorAll('.cortex-token-chip')
    expect(chips.length).toBe(0)
  })

  it('when detectedTokenClasses has entries and mode="auto", defaults to Mode A', () => {
    setupV2({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-sm', property: 'font-size' }],
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    const numericInputs = container.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBe(0)
  })

  it('Mode B fontSize onChange fires correct change', () => {
    const { onChange } = setupV2({ mode: 'b' })
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.querySelector('[data-tooltip="Font Size"]') !== null
        || wrapper?.getAttribute('data-tooltip') === 'Font Size'
    }) as HTMLInputElement | undefined
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

  it('Mode B textAlign onChange fires correct change', () => {
    const { onChange } = setupV2({ mode: 'b' })
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    const centerBtn = alignGroup?.querySelector('[data-value="center"]') as HTMLElement
    expect(centerBtn).not.toBeNull()
    centerBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'text-align', value: 'center' })
  })

  it('text-align uses Lucide icons (SVG, not emoji)', () => {
    setupV2({ mode: 'b' })
    const groups = container.querySelectorAll('[role="radiogroup"]')
    const alignGroup = groups[groups.length - 1]
    expect(alignGroup).not.toBeNull()
    const svgs = alignGroup!.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(4)
  })

  it('Mode A displays color chip with resolved value for color', () => {
    setupV2({
      mode: 'auto',
      detectedTokenClasses: [{ className: 'text-gray-900', property: 'color' }],
      values: { ...V2_VALUES, color: 'rgb(17,24,39)' },
    })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain('text-gray-900')
    const swatch = chip!.querySelector('.cortex-token-chip__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(17, 24, 39)')
  })
})
