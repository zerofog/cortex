import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { FillSection, parseFillValues, parseLinearGradient, summarizeFill } from '../../../src/browser/components/sections/FillSection.js'
import type { FillValues } from '../../../src/browser/components/sections/FillSection.js'

// Mock @floating-ui/dom for ColorPicker (transitively used by ColorInput)
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('FillSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: FillValues = {
    backgroundColor: 'rgb(59, 130, 246)',
    backgroundImage: 'none',
  }

  function setup(overrides?: Partial<Parameters<typeof FillSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <FillSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="fill"', () => {
    setup()
    const root = container.querySelector('[data-section-id="fill"]')
    expect(root).not.toBeNull()
  })

  it('renders a color swatch with the correct background color', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
    expect(swatch).not.toBeNull()
    expect(swatch.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('emits background-color change from color input', async () => {
    const { onChange } = setup()
    const hexInput = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hexInput).not.toBeNull()
    hexInput.dispatchEvent(new Event('focus', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    hexInput.value = '#ff0000'
    hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    hexInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    const calls = onChange.mock.calls
    const bgCall = calls.find((c: any) => c[0]?.property === 'background-color')
    expect(bgCall).toBeDefined()
    expect(bgCall![0].value).toBe('#ff0000')
  })
})

describe('parseFillValues', () => {
  it('parses background color and image', () => {
    const cs = {
      backgroundColor: 'rgb(59, 130, 246)',
      backgroundImage: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgb(59, 130, 246)')
    expect(result.backgroundImage).toBe('none')
  })

  it('handles rgba background colors', () => {
    const cs = {
      backgroundColor: 'rgba(255, 0, 0, 0.5)',
      backgroundImage: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgba(255, 0, 0, 0.5)')
    expect(result.backgroundImage).toBe('none')
  })

  it('defaults to transparent and none when missing', () => {
    const cs = {} as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(result.backgroundImage).toBe('none')
  })

  it('preserves gradient background-image', () => {
    const cs = {
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'linear-gradient(180deg, rgb(59, 130, 246) 0%, rgb(0, 0, 0) 100%)',
    } as unknown as CSSStyleDeclaration
    const result = parseFillValues(cs)
    expect(result.backgroundImage).toBe('linear-gradient(180deg, rgb(59, 130, 246) 0%, rgb(0, 0, 0) 100%)')
  })
})

describe('parseLinearGradient', () => {
  it('parses angle + two stops with rgb colors', () => {
    const result = parseLinearGradient('linear-gradient(180deg, rgb(59, 130, 246) 0%, rgb(0, 0, 0) 100%)')
    expect(result).not.toBeNull()
    expect(result!.angle).toBe(180)
    expect(result!.stops).toHaveLength(2)
    expect(result!.stops[0]!.color).toBe('rgb(59, 130, 246)')
    expect(result!.stops[0]!.position).toBe(0)
    expect(result!.stops[1]!.color).toBe('rgb(0, 0, 0)')
    expect(result!.stops[1]!.position).toBe(100)
  })

  it('parses "to right" direction keyword', () => {
    const result = parseLinearGradient('linear-gradient(to right, #ff0000 0%, #0000ff 100%)')
    expect(result).not.toBeNull()
    expect(result!.angle).toBe(90)
  })

  it('parses "to top" direction keyword', () => {
    const result = parseLinearGradient('linear-gradient(to top, #ff0000 0%, #0000ff 100%)')
    expect(result).not.toBeNull()
    expect(result!.angle).toBe(0)
  })

  it('handles rgba stops', () => {
    const result = parseLinearGradient('linear-gradient(45deg, rgba(255, 0, 0, 0.5) 0%, rgba(0, 0, 255, 1) 100%)')
    expect(result).not.toBeNull()
    expect(result!.angle).toBe(45)
    expect(result!.stops[0]!.color).toBe('rgba(255, 0, 0, 0.5)')
    expect(result!.stops[1]!.color).toBe('rgba(0, 0, 255, 1)')
  })

  it('returns null for non-linear-gradient inputs', () => {
    expect(parseLinearGradient('none')).toBeNull()
    expect(parseLinearGradient('radial-gradient(circle, red, blue)')).toBeNull()
    expect(parseLinearGradient('#ff0000')).toBeNull()
  })

  it('handles gradient with no explicit angle (defaults to 180)', () => {
    const result = parseLinearGradient('linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)')
    expect(result).not.toBeNull()
    expect(result!.angle).toBe(180)
    expect(result!.stops).toHaveLength(2)
  })

  it('handles three-stop gradient', () => {
    const result = parseLinearGradient('linear-gradient(90deg, red 0%, green 50%, blue 100%)')
    expect(result).not.toBeNull()
    expect(result!.stops).toHaveLength(3)
    expect(result!.stops[1]!.position).toBe(50)
  })
})

describe('summarizeFill', () => {
  it('returns hex for solid color', () => {
    expect(summarizeFill({ backgroundColor: 'rgb(59, 130, 246)', backgroundImage: 'none' })).toBe('#3b82f6')
  })

  it('returns "transparent" for zero-alpha background', () => {
    expect(summarizeFill({ backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none' })).toBe('transparent')
  })

  it('returns "Gradient" for linear-gradient', () => {
    expect(summarizeFill({ backgroundColor: '#fff', backgroundImage: 'linear-gradient(180deg, #000 0%, #fff 100%)' })).toBe('Gradient')
  })
})
