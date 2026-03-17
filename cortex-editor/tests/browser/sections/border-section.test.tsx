import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { BorderSection, parseBorderValues } from '../../../src/browser/components/sections/BorderSection.js'
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
    borderStyle: 'solid',
    borderColor: 'rgb(0, 0, 0)',
    borderRadius: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 4,
  }

  function setup(overrides?: Partial<Parameters<typeof BorderSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <BorderSection
        values={DEFAULT_VALUES}
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

  it('renders border width input with label "W"', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const widthInput = Array.from(inputs).find((el) => el.textContent?.includes('W'))
    expect(widthInput).toBeDefined()
    const input = widthInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('1')
  })

  it('renders border style segmented control with solid/dashed/dotted/none', () => {
    setup()
    const groups = container.querySelectorAll('[role="radiogroup"]')
    expect(groups.length).toBeGreaterThanOrEqual(1)
    // Check that solid is active by default
    const solidBtn = container.querySelector('[data-value="solid"]')
    expect(solidBtn).not.toBeNull()
    expect(solidBtn!.getAttribute('aria-checked')).toBe('true')
    // Verify other options exist
    expect(container.querySelector('[data-value="dashed"]')).not.toBeNull()
    expect(container.querySelector('[data-value="dotted"]')).not.toBeNull()
    expect(container.querySelector('[data-value="none"]')).not.toBeNull()
  })

  it('renders border color swatch', () => {
    setup()
    const swatch = container.querySelector('.cortex-color-input__swatch')
    expect(swatch).not.toBeNull()
  })

  it('renders border radius input with label "R"', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const radiusInput = Array.from(inputs).find((el) => el.textContent?.includes('R'))
    expect(radiusInput).toBeDefined()
    const input = radiusInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('4')
  })

  it('renders per-corner toggle button', () => {
    setup()
    const toggle = container.querySelector('.cortex-border-section__corner-toggle')
    expect(toggle).not.toBeNull()
  })

  it('shows 4 corner inputs when per-corner is toggled', async () => {
    setup()
    const toggle = container.querySelector('.cortex-border-section__corner-toggle') as HTMLButtonElement
    expect(toggle).not.toBeNull()
    toggle.click()
    await new Promise((r) => setTimeout(r, 10))
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const labels = Array.from(inputs).map((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent
    }).filter(Boolean)
    expect(labels).toContain('TL')
    expect(labels).toContain('TR')
    expect(labels).toContain('BR')
    expect(labels).toContain('BL')
  })

  describe('parseBorderValues', () => {
    it('parses border properties from computed style', () => {
      const cs = {
        borderWidth: '2px',
        borderStyle: 'dashed',
        borderColor: 'rgb(255, 0, 0)',
        borderRadius: '8px',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        borderBottomRightRadius: '8px',
        borderBottomLeftRadius: '8px',
      } as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(2)
      expect(result.borderStyle).toBe('dashed')
      expect(result.borderColor).toBe('rgb(255, 0, 0)')
      expect(result.borderRadius).toBe(8)
      expect(result.borderTopLeftRadius).toBe(8)
      expect(result.borderTopRightRadius).toBe(8)
      expect(result.borderBottomRightRadius).toBe(8)
      expect(result.borderBottomLeftRadius).toBe(8)
    })

    it('defaults to none style and 0 width', () => {
      const cs = {} as unknown as CSSStyleDeclaration
      const result = parseBorderValues(cs)
      expect(result.borderWidth).toBe(0)
      expect(result.borderStyle).toBe('none')
      expect(result.borderRadius).toBe(0)
    })
  })
})
