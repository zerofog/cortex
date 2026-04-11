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

  // Task 3 (ZF0-1181): radius controls moved to AppearanceSection. The
  // BorderValues interface still carries the radius fields (Task 14 will
  // remove them), but BorderSection itself no longer renders a radius
  // NumericInput or a per-corner toggle. Those behaviours are now covered
  // by tests/browser/sections/AppearanceSection.test.ts.
  it('does not render a border-radius NumericInput any more (moved to AppearanceSection)', () => {
    setup()
    const labels = Array.from(
      container.querySelectorAll('.cortex-numeric-input__label'),
    ).map((el) => el.textContent)
    // "W" for width remains; "R" / "TL" / "TR" / "BR" / "BL" must be absent.
    expect(labels).toContain('W')
    expect(labels).not.toContain('R')
    expect(labels).not.toContain('TL')
    expect(labels).not.toContain('TR')
    expect(labels).not.toContain('BR')
    expect(labels).not.toContain('BL')
  })

  it('does not render the per-corner toggle button any more (moved to AppearanceSection)', () => {
    setup()
    expect(
      container.querySelector('.cortex-border-section__corner-toggle'),
    ).toBeNull()
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

describe('summarizeBorder', () => {
  it('returns "none" for no border', () => {
    expect(summarizeBorder({ borderWidth: 0, borderStyle: 'none', borderColor: '#000', borderRadius: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderBottomLeftRadius: 0 })).toBe('none')
  })

  it('returns width and style for visible border', () => {
    expect(summarizeBorder({ borderWidth: 2, borderStyle: 'solid', borderColor: '#000', borderRadius: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, borderBottomLeftRadius: 4 })).toBe('2px solid')
  })

  it('returns "none" when width is 0 even if style is set', () => {
    expect(summarizeBorder({ borderWidth: 0, borderStyle: 'solid', borderColor: '#000', borderRadius: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderBottomLeftRadius: 0 })).toBe('none')
  })
})
