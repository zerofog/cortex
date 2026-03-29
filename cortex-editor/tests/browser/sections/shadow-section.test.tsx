import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import {
  ShadowSection,
  parseBoxShadow,
  serializeBoxShadow,
  summarizeShadow,
  addShadow,
} from '../../../src/browser/components/sections/ShadowSection.js'
import type { ShadowValues } from '../../../src/browser/components/sections/ShadowSection.js'

// Mock @floating-ui/dom for ColorPicker (transitively used by ColorInput)
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('parseBoxShadow', () => {
  it('returns empty array for "none"', () => {
    expect(parseBoxShadow('none')).toEqual([])
  })

  it('parses a single shadow', () => {
    const result = parseBoxShadow('2px 4px 8px rgba(0, 0, 0, 0.1)')
    expect(result).toEqual([
      { x: 2, y: 4, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.1)', inset: false },
    ])
  })

  it('parses shadow with spread', () => {
    const result = parseBoxShadow('2px 4px 8px 2px #000')
    expect(result).toHaveLength(1)
    expect(result[0].spread).toBe(2)
  })

  it('parses inset shadow', () => {
    const result = parseBoxShadow('inset 0px 2px 4px rgba(0, 0, 0, 0.06)')
    expect(result).toHaveLength(1)
    expect(result[0].inset).toBe(true)
    expect(result[0].x).toBe(0)
    expect(result[0].y).toBe(2)
    expect(result[0].blur).toBe(4)
  })

  it('parses multiple shadows (comma-separated, respecting rgba() parens)', () => {
    const result = parseBoxShadow(
      '2px 4px 8px rgba(0, 0, 0, 0.1), inset 0px 1px 2px rgba(255, 255, 255, 0.5)',
    )
    expect(result).toHaveLength(2)
    expect(result[0].x).toBe(2)
    expect(result[0].inset).toBe(false)
    expect(result[1].inset).toBe(true)
    expect(result[1].y).toBe(1)
  })

  it('handles negative offsets', () => {
    const result = parseBoxShadow('-2px -4px 8px #000')
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(-2)
    expect(result[0].y).toBe(-4)
  })

  // Browser computed style puts color FIRST — this is the critical fix
  it('parses browser computed format (color first)', () => {
    const result = parseBoxShadow('rgba(0, 0, 0, 0.1) 0px 2px 8px 0px')
    expect(result).toEqual([
      { x: 0, y: 2, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.1)', inset: false },
    ])
  })

  it('parses browser computed multi-shadow (color first)', () => {
    const result = parseBoxShadow(
      'rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px',
    )
    expect(result).toHaveLength(2)
    expect(result[0].y).toBe(1)
    expect(result[0].blur).toBe(3)
    expect(result[0].color).toBe('rgba(0, 0, 0, 0.1)')
    expect(result[1].y).toBe(1)
    expect(result[1].blur).toBe(2)
    expect(result[1].spread).toBe(-1)
  })

  it('parses browser computed inset with color first', () => {
    const result = parseBoxShadow('inset rgba(0, 0, 0, 0.5) 0px 2px 4px 0px')
    expect(result).toHaveLength(1)
    expect(result[0].inset).toBe(true)
    expect(result[0].y).toBe(2)
    expect(result[0].blur).toBe(4)
    expect(result[0].color).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('parses browser computed with hex color first', () => {
    const result = parseBoxShadow('#000000 0px 4px 6px -1px')
    expect(result).toEqual([
      { x: 0, y: 4, blur: 6, spread: -1, color: '#000000', inset: false },
    ])
  })
})

describe('serializeBoxShadow', () => {
  it('serializes empty array to "none"', () => {
    expect(serializeBoxShadow([])).toBe('none')
  })

  it('serializes a single shadow', () => {
    const result = serializeBoxShadow([
      { x: 2, y: 4, blur: 8, spread: 0, color: 'rgba(0, 0, 0, 0.1)', inset: false },
    ])
    expect(result).toBe('2px 4px 8px 0px rgba(0, 0, 0, 0.1)')
  })

  it('serializes inset shadow with "inset" prefix', () => {
    const result = serializeBoxShadow([
      { x: 0, y: 2, blur: 4, spread: 0, color: 'rgba(0, 0, 0, 0.06)', inset: true },
    ])
    expect(result).toBe('inset 0px 2px 4px 0px rgba(0, 0, 0, 0.06)')
  })
})

describe('ShadowSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: ShadowValues = {
    boxShadow: '2px 4px 8px rgba(0, 0, 0, 0.1)',
  }

  function setup(overrides?: Partial<Parameters<typeof ShadowSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <ShadowSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="shadow"', () => {
    setup()
    const root = container.querySelector('[data-section-id="shadow"]')
    expect(root).not.toBeNull()
  })

  it('renders shadow rows for each parsed shadow', () => {
    setup()
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows).toHaveLength(1)
  })

  it('does not render add button (lifted to CollapsibleSection header in Panel)', () => {
    setup()
    const addBtn = container.querySelector('.cortex-shadow-section__add')
    expect(addBtn).toBeNull()
  })

  it('shows no shadow rows when box-shadow is none', () => {
    setup({ values: { boxShadow: 'none' } })
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows).toHaveLength(0)
  })

  it('renders multiple shadow rows for multi-shadow values', () => {
    setup({
      values: {
        boxShadow:
          '2px 4px 8px rgba(0, 0, 0, 0.1), inset 0px 1px 2px rgba(255, 255, 255, 0.5)',
      },
    })
    const rows = container.querySelectorAll('.cortex-shadow-section__row')
    expect(rows).toHaveLength(2)
  })

  it('passes swatches to ColorInput when provided', () => {
    const testSwatches = ['#ef4444', '#3b82f6', '#22c55e']
    setup({ swatches: testSwatches })
    // ColorInput receives swatches prop — verify it renders the shadow row's color control
    const colorInputs = container.querySelectorAll('.cortex-color-input')
    expect(colorInputs.length).toBeGreaterThan(0)
    // The swatches prop is threaded through to ColorPicker on open;
    // we verify the ColorInput rendered (prop accepted without error)
  })
})

describe('summarizeShadow', () => {
  it('returns "none" when box-shadow is none', () => {
    expect(summarizeShadow({ boxShadow: 'none' })).toBe('none')
  })

  it('returns "1 shadow" for single shadow', () => {
    expect(summarizeShadow({ boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)' })).toBe('1 shadow')
  })

  it('returns count for multiple shadows', () => {
    expect(summarizeShadow({ boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1), inset 0px 1px 2px rgba(0, 0, 0, 0.05)' })).toBe('2 shadows')
  })
})

describe('addShadow', () => {
  it('adds a default shadow to "none"', () => {
    const result = parseBoxShadow(addShadow('none'))
    expect(result).toHaveLength(1)
    expect(result[0]!.y).toBe(2)
    expect(result[0]!.blur).toBe(8)
  })

  it('appends to existing shadows', () => {
    const result = parseBoxShadow(addShadow('0px 4px 16px rgba(0, 0, 0, 0.2)'))
    expect(result).toHaveLength(2)
  })
})
