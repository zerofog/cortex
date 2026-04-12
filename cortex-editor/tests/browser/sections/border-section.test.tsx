import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { BorderSection, parseBorderValues, summarizeBorder } from '../../../src/browser/components/sections/BorderSection.js'
import type { BorderValues } from '../../../src/browser/components/sections/BorderSection.js'

// Mock @floating-ui/dom
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('BorderSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: BorderValues = {
    borderWidth: 1,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgb(0, 0, 0)',
    borderOpacity: 100,
    visible: true,
  }

  function setup(overrides?: Partial<Parameters<typeof BorderSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <BorderSection
        values={DEFAULT_VALUES}
        borderToken={null}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="border"', () => {
    setup()
    const root = container.querySelector('[data-section-id="border"]')
    expect(root).not.toBeNull()
  })

  it('renders border width input with SquareDashed prefix', () => {
    setup()
    // The width row has a NumericInput with a prefix (SVG icon)
    const prefixes = container.querySelectorAll('.cortex-numeric-input__prefix')
    expect(prefixes.length).toBeGreaterThanOrEqual(1)
    // The prefix should contain an SVG (SquareDashed icon)
    const svg = prefixes[0]?.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders border color swatch when no token', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch')
    expect(swatch).not.toBeNull()
  })

  it('renders TokenChip when borderToken is provided', () => {
    setup({ borderToken: 'border-blue-500' })
    const chip = container.querySelector('.cortex-token-chip')
    expect(chip).not.toBeNull()
    // No color swatch when token is present
    const swatch = container.querySelector('.cortex-color-input__swatch')
    expect(swatch).toBeNull()
  })

  it('eye toggle fires border-style none when visible', () => {
    const { onChange } = setup({ values: { ...DEFAULT_VALUES, visible: true } })
    // Find the eye toggle button (aria-label "Hide border")
    const eyeBtn = container.querySelector('[aria-label="Hide border"]') as HTMLButtonElement
    expect(eyeBtn).not.toBeNull()
    eyeBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'border-style', value: 'none' })
  })

  it('eye toggle fires border-style solid when hidden', () => {
    const { onChange } = setup({
      values: { ...DEFAULT_VALUES, visible: false, borderStyle: 'none' },
    })
    const eyeBtn = container.querySelector('[aria-label="Show border"]') as HTMLButtonElement
    expect(eyeBtn).not.toBeNull()
    eyeBtn.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'border-style', value: 'solid' })
  })

  it('width onChange fires border-width', () => {
    const { onChange } = setup()
    // Find the width NumericInput's <input> — it's the one in the width row
    const widthRow = container.querySelector('.cortex-border-section__width-row')
    expect(widthRow).not.toBeNull()
    const input = widthRow!.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    // NumericInput fires onChange on Enter: focus → set value → input event → Enter
    input.focus()
    input.value = '2'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ property: 'border-width', value: '2px' })
  })

  it('per-side expand toggles individual width inputs', async () => {
    setup()
    // Initially no per-side grid
    expect(container.querySelector('.cortex-border-section__per-side')).toBeNull()

    // Click the expand button
    const expandBtn = container.querySelector('[aria-label="Expand per-side widths"]') as HTMLButtonElement
    expect(expandBtn).not.toBeNull()
    expandBtn.click()
    // Preact state flush is async via setTimeout(0) — give it a tick.
    await new Promise((r) => setTimeout(r, 10))

    // Now per-side grid should be visible with 4 inputs
    const perSide = container.querySelector('.cortex-border-section__per-side')
    expect(perSide).not.toBeNull()
    const inputs = perSide!.querySelectorAll('input')
    expect(inputs.length).toBe(4)
  })

  it('per-side T input fires border-top-width', async () => {
    const { onChange } = setup()
    // Open per-side
    const expandBtn = container.querySelector('[aria-label="Expand per-side widths"]') as HTMLButtonElement
    expandBtn.click()
    await new Promise((r) => setTimeout(r, 10))

    const perSide = container.querySelector('.cortex-border-section__per-side')
    const labels = perSide!.querySelectorAll('.cortex-numeric-input__label')
    const topLabel = Array.from(labels).find((el) => el.textContent === 'T')
    expect(topLabel).toBeDefined()
    const topInput = topLabel!.closest('.cortex-numeric-input')!.querySelector('input') as HTMLInputElement
    topInput.focus()
    topInput.value = '3'
    topInput.dispatchEvent(new Event('input', { bubbles: true }))
    topInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ property: 'border-top-width', value: '3px' })
  })

  describe('parseBorderValues', () => {
    it('parses border properties from computed style', () => {
      const cs = {
        borderWidth: '2px',
        borderTopWidth: '2px',
        borderRightWidth: '2px',
        borderBottomWidth: '2px',
        borderLeftWidth: '2px',
        borderStyle: 'dashed',
        borderColor: 'rgb(255, 0, 0)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(2)
      expect(result.borderTopWidth).toBe(2)
      expect(result.borderRightWidth).toBe(2)
      expect(result.borderBottomWidth).toBe(2)
      expect(result.borderLeftWidth).toBe(2)
      expect(result.borderStyle).toBe('dashed')
      expect(result.borderColor).toBe('rgb(255, 0, 0)')
      expect(result.borderOpacity).toBe(100)
      expect(result.visible).toBe(true)
    })

    it('defaults to none style and 0 width', () => {
      const cs = {} as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(0)
      expect(result.borderStyle).toBe('none')
      expect(result.visible).toBe(false)
    })

    it('does not return borderRadius (moved to AppearanceSection)', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgb(0, 0, 0)',
        borderRadius: '8px',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result).not.toHaveProperty('borderRadius')
      expect(result).not.toHaveProperty('borderTopLeftRadius')
      expect(result).not.toHaveProperty('borderTopRightRadius')
      expect(result).not.toHaveProperty('borderBottomRightRadius')
      expect(result).not.toHaveProperty('borderBottomLeftRadius')
    })

    it('parses opacity from rgba border-color', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '1px',
        borderBottomWidth: '1px',
        borderLeftWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(0, 0, 0, 0.5)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderOpacity).toBe(50)
    })

    it('parses per-side widths individually', () => {
      const cs = {
        borderWidth: '1px',
        borderTopWidth: '1px',
        borderRightWidth: '2px',
        borderBottomWidth: '3px',
        borderLeftWidth: '4px',
        borderStyle: 'solid',
        borderColor: 'rgb(0, 0, 0)',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderTopWidth).toBe(1)
      expect(result.borderRightWidth).toBe(2)
      expect(result.borderBottomWidth).toBe(3)
      expect(result.borderLeftWidth).toBe(4)
    })
  })
})

describe('summarizeBorder', () => {
  it('returns "none" for no border', () => {
    expect(summarizeBorder({
      borderWidth: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderStyle: 'none', borderColor: '#000', borderOpacity: 100, visible: false,
    })).toBe('none')
  })

  it('returns width and style for visible border', () => {
    expect(summarizeBorder({
      borderWidth: 2, borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
      borderStyle: 'solid', borderColor: '#000', borderOpacity: 100, visible: true,
    })).toBe('2px solid')
  })

  it('returns "none" when width is 0 even if style is set', () => {
    expect(summarizeBorder({
      borderWidth: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
      borderStyle: 'solid', borderColor: '#000', borderOpacity: 100, visible: true,
    })).toBe('none')
  })
})
