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

  it('renders SZ label with font-size value', () => {
    setup()
    expect(container.textContent).toContain('SZ')
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('SZ')
    }) as HTMLInputElement | undefined
    expect(szInput).toBeDefined()
    expect(szInput!.value).toBe('16')
  })

  it('renders LH and LS inputs', () => {
    setup()
    expect(container.textContent).toContain('LH')
    expect(container.textContent).toContain('LS')
  })

  it('renders text align segmented control', () => {
    setup()
    expect(container.textContent).toContain('Align')
  })

  it('renders COL swatch and hex input', () => {
    setup()
    expect(container.textContent).toContain('COL')
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

  // Review finding 3b: expect().toBeDefined() instead of if guards
  it('emits font-size change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const szInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('SZ')
    }) as HTMLInputElement | undefined
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
    const lhInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('LH')
    }) as HTMLInputElement | undefined
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
    const lsInput = Array.from(inputs).find((i) => {
      const wrapper = i.closest('.cortex-numeric-input')
      return wrapper?.textContent?.includes('LS')
    }) as HTMLInputElement | undefined
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
    const trigger = container.querySelector('.cortex-dropdown__trigger')
    expect(trigger?.textContent).toContain('400 - Regular')
  })

  it('color swatch shows computed color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBeTruthy()
  })
})
