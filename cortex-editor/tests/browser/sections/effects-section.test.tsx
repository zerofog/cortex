import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import {
  EffectsSection,
  parseEffectsValues,
  replaceBlurInFilter,
  summarizeEffects,
  addShadow,
  parseBlurValue,
} from '../../../src/browser/components/sections/EffectsSection.js'
import type { EffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'
import { parseBoxShadow } from '../../../src/core/shadow-utils.js'

// Mock @floating-ui/dom for Dropdown
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

// ---------------------------------------------------------------------------
// parseEffectsValues
// ---------------------------------------------------------------------------
describe('parseEffectsValues', () => {
  it('extracts blur from filter "blur(4px)" -> blur: 4', () => {
    const cs = {
      boxShadow: 'none',
      filter: 'blur(4px)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(4)
  })

  it('extracts backdrop-blur from backdropFilter "blur(8px)" -> backdropBlur: 8', () => {
    const cs = {
      boxShadow: 'none',
      filter: '',
      backdropFilter: 'blur(8px)',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.backdropBlur).toBe(8)
  })

  it('defaults blur to 0 when filter has no blur (e.g., "grayscale(100%)")', () => {
    const cs = {
      boxShadow: 'none',
      filter: 'grayscale(100%)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(0)
  })

  it('handles combined filter values "blur(4px) grayscale(50%)" -> blur: 4', () => {
    const cs = {
      boxShadow: 'none',
      filter: 'blur(4px) grayscale(50%)',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.blur).toBe(4)
  })

  it('includes raw filter strings', () => {
    const cs = {
      boxShadow: 'none',
      filter: 'blur(4px) grayscale(50%)',
      backdropFilter: 'blur(8px)',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.filterRaw).toBe('blur(4px) grayscale(50%)')
    expect(result.backdropFilterRaw).toBe('blur(8px)')
  })

  it('extracts boxShadow from computed style', () => {
    const cs = {
      boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
      filter: '',
      backdropFilter: '',
    } as unknown as CSSStyleDeclaration
    const result = parseEffectsValues(cs)
    expect(result.boxShadow).toBe('0px 4px 8px rgba(0, 0, 0, 0.25)')
  })
})

// ---------------------------------------------------------------------------
// parseBlurValue
// ---------------------------------------------------------------------------
describe('parseBlurValue', () => {
  it('extracts blur value from filter string', () => {
    expect(parseBlurValue('blur(5px)')).toBe(5)
  })

  it('returns 0 for non-blur filter', () => {
    expect(parseBlurValue('grayscale(100%)')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseBlurValue('')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// replaceBlurInFilter
// ---------------------------------------------------------------------------
describe('replaceBlurInFilter', () => {
  it('replaces blur in combined filter, preserving other functions', () => {
    expect(replaceBlurInFilter('grayscale(50%) blur(4px)', 8)).toBe('grayscale(50%) blur(8px)')
  })

  it('adds blur to filter that has no blur', () => {
    expect(replaceBlurInFilter('grayscale(50%)', 4)).toBe('grayscale(50%) blur(4px)')
  })

  it('removes blur when set to 0, preserving other functions', () => {
    expect(replaceBlurInFilter('grayscale(50%) blur(4px)', 0)).toBe('grayscale(50%)')
  })

  it('returns none when removing blur from blur-only filter', () => {
    expect(replaceBlurInFilter('blur(4px)', 0)).toBe('none')
  })

  it('handles none input', () => {
    expect(replaceBlurInFilter('none', 4)).toBe('blur(4px)')
  })

  it('handles empty input', () => {
    expect(replaceBlurInFilter('', 4)).toBe('blur(4px)')
  })
})

// ---------------------------------------------------------------------------
// summarizeEffects
// ---------------------------------------------------------------------------
describe('summarizeEffects', () => {
  it('returns "none" when all values are default', () => {
    expect(summarizeEffects({
      boxShadow: 'none', blur: 0, backdropBlur: 0, filterRaw: '', backdropFilterRaw: '',
    })).toBe('none')
  })

  it('includes shadow count', () => {
    expect(summarizeEffects({
      boxShadow: '0px 4px 8px rgba(0,0,0,0.1)', blur: 0, backdropBlur: 0, filterRaw: '', backdropFilterRaw: '',
    })).toBe('1 shadow')
  })

  it('includes multiple shadows', () => {
    expect(summarizeEffects({
      boxShadow: '0px 4px 8px rgba(0,0,0,0.1), inset 1px 2px 3px #000',
      blur: 0, backdropBlur: 0, filterRaw: '', backdropFilterRaw: '',
    })).toBe('2 shadows')
  })

  it('includes blur', () => {
    expect(summarizeEffects({
      boxShadow: 'none', blur: 4, backdropBlur: 0, filterRaw: 'blur(4px)', backdropFilterRaw: '',
    })).toBe('blur 4px')
  })

  it('includes multiple non-default values', () => {
    expect(summarizeEffects({
      boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
      blur: 4, backdropBlur: 0, filterRaw: 'blur(4px)', backdropFilterRaw: '',
    })).toBe('1 shadow, blur 4px')
  })
})

// ---------------------------------------------------------------------------
// addShadow
// ---------------------------------------------------------------------------
describe('addShadow', () => {
  it('appends a default shadow to "none"', () => {
    const result = addShadow('none')
    const shadows = parseBoxShadow(result)
    expect(shadows.length).toBe(1)
    expect(shadows[0].inset).toBe(false)
    expect(shadows[0].blur).toBe(8)
  })

  it('appends a shadow to an existing shadow list', () => {
    const result = addShadow('0px 4px 8px rgba(0, 0, 0, 0.25)')
    const shadows = parseBoxShadow(result)
    expect(shadows.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// parseShadowList via parseBoxShadow (spec test 1)
// ---------------------------------------------------------------------------
describe('parseShadowList via parseBoxShadow', () => {
  it('parses "0px 4px 8px rgba(0,0,0,0.25)" into 1 shadow with correct values', () => {
    const shadows = parseBoxShadow('0px 4px 8px rgba(0,0,0,0.25)')
    expect(shadows.length).toBe(1)
    expect(shadows[0].x).toBe(0)
    expect(shadows[0].y).toBe(4)
    expect(shadows[0].blur).toBe(8)
    expect(shadows[0].spread).toBe(0)
    expect(shadows[0].inset).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// EffectsSection component
// ---------------------------------------------------------------------------
describe('EffectsSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: EffectsValues = {
    boxShadow: 'none',
    blur: 4,
    backdropBlur: 0,
    filterRaw: 'blur(4px)',
    backdropFilterRaw: '',
  }

  const TWO_SHADOWS_VALUES: EffectsValues = {
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1), inset 1px 2px 3px #000',
    blur: 0,
    backdropBlur: 0,
    filterRaw: '',
    backdropFilterRaw: '',
  }

  function setup(overrides?: Partial<Parameters<typeof EffectsSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <EffectsSection values={DEFAULT_VALUES} onChange={onChange} {...overrides} />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="effects"', () => {
    setup()
    const root = container.querySelector('[data-section-id="effects"]')
    expect(root).not.toBeNull()
  })

  it('does NOT render overflow or cursor controls (removed in v2)', () => {
    setup()
    expect(container.textContent).not.toContain('Overflow')
    expect(container.textContent).not.toContain('Cursor')
  })

  it('renders blur input with label "BL"', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const blurInput = Array.from(inputs).find((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent === 'BL'
    })
    expect(blurInput).toBeDefined()
    const input = blurInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('4')
  })

  it('renders backdrop blur input with label "BG"', () => {
    setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const bgBlurInput = Array.from(inputs).find((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent === 'BG'
    })
    expect(bgBlurInput).toBeDefined()
    const input = bgBlurInput!.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('0')
  })

  it('renders shadow rows for each shadow in boxShadow', () => {
    setup({ values: TWO_SHADOWS_VALUES })
    const rows = container.querySelectorAll('.cortex-effects-section__row')
    expect(rows.length).toBe(2)
  })

  it('renders no shadow rows when boxShadow is "none"', () => {
    setup()
    const rows = container.querySelectorAll('.cortex-effects-section__row')
    expect(rows.length).toBe(0)
  })

  // Spec test 2: + button fires onChange with default shadow
  // (The + button is in Panel.tsx headerAction, but addShadow is tested above)

  // Spec test 3: Remove button fires onChange removing entry
  it('remove button fires onChange removing the shadow entry', () => {
    const { onChange } = setup({ values: TWO_SHADOWS_VALUES })
    const removeButtons = container.querySelectorAll<HTMLButtonElement>(
      '.cortex-icon-button[aria-label="Remove shadow"]',
    )
    expect(removeButtons.length).toBe(2)
    // Click remove on the first shadow
    removeButtons[0].click()
    expect(onChange).toHaveBeenCalledTimes(1)
    const call = onChange.mock.calls[0][0]
    expect(call.property).toBe('box-shadow')
    // Verify the reconstructed value has only the inset shadow remaining
    const remaining = parseBoxShadow(call.value)
    expect(remaining.length).toBe(1)
    expect(remaining[0].inset).toBe(true)
  })

  // Spec test 4: Eye toggle disables shadow
  it('eye toggle disables a shadow by zeroing values', () => {
    const values: EffectsValues = {
      boxShadow: '0px 2px 8px 0px rgba(0, 0, 0, 0.1)',
      blur: 0,
      backdropBlur: 0,
      filterRaw: '',
      backdropFilterRaw: '',
    }
    const { onChange } = setup({ values })
    const eyeButton = container.querySelector<HTMLButtonElement>(
      '.cortex-icon-button[aria-label="Disable shadow"]',
    )
    expect(eyeButton).not.toBeNull()
    eyeButton!.click()
    expect(onChange).toHaveBeenCalledTimes(1)
    const call = onChange.mock.calls[0][0]
    expect(call.property).toBe('box-shadow')
    const shadows = parseBoxShadow(call.value)
    expect(shadows.length).toBe(1)
    // All positional values should be zeroed
    expect(shadows[0].x).toBe(0)
    expect(shadows[0].y).toBe(0)
    expect(shadows[0].blur).toBe(0)
    expect(shadows[0].spread).toBe(0)
  })

  // Spec test 5: Detail panel hidden by default, visible after expand click
  it('detail panel is hidden by default and visible after expand click', async () => {
    const values: EffectsValues = {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
      blur: 0,
      backdropBlur: 0,
      filterRaw: '',
      backdropFilterRaw: '',
    }
    setup({ values })
    // Detail should not be visible initially
    expect(container.querySelector('.cortex-effects-section__detail')).toBeNull()
    // Click expand
    const expandBtn = container.querySelector<HTMLButtonElement>(
      '.cortex-effects-section__expand-btn',
    )
    expect(expandBtn).not.toBeNull()
    expandBtn!.click()
    // Flush Preact's async rendering
    await new Promise(r => setTimeout(r, 0))
    // Detail should now be visible
    expect(container.querySelector('.cortex-effects-section__detail')).not.toBeNull()
    // Should have X, Y, B, S inputs
    const grid = container.querySelector('.cortex-effects-section__grid')
    expect(grid).not.toBeNull()
    const numericInputs = grid!.querySelectorAll('.cortex-numeric-input')
    expect(numericInputs.length).toBe(4)
  })

  // Spec test 6: Blur NumericInput fires filter change
  it('blur NumericInput fires filter change via keyboard', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    const blurInput = Array.from(inputs).find((el) => {
      const label = el.querySelector('.cortex-numeric-input__label')
      return label?.textContent === 'BL'
    })
    expect(blurInput).toBeDefined()
    const input = blurInput!.querySelector('input') as HTMLInputElement
    // NumericInput fires onChange on ArrowUp/ArrowDown keydown
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    // The onChange should fire with filter property (blur 4 + 1 = 5)
    const filterCalls = onChange.mock.calls.filter(
      (c: any) => c[0].property === 'filter',
    )
    expect(filterCalls.length).toBeGreaterThanOrEqual(1)
    expect(filterCalls[0][0].value).toContain('blur(5px)')
  })

  it('renders type dropdown with Drop shadow / Inner shadow options', () => {
    const values: EffectsValues = {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
      blur: 0,
      backdropBlur: 0,
      filterRaw: '',
      backdropFilterRaw: '',
    }
    setup({ values })
    const typeDropdown = container.querySelector('.cortex-effects-section__type .cortex-dropdown__trigger')
    expect(typeDropdown).not.toBeNull()
    expect(typeDropdown!.textContent).toContain('Drop shadow')
  })

  it('type dropdown shows "Inner shadow" for inset shadows', () => {
    const values: EffectsValues = {
      boxShadow: 'inset 0px 2px 8px rgba(0, 0, 0, 0.1)',
      blur: 0,
      backdropBlur: 0,
      filterRaw: '',
      backdropFilterRaw: '',
    }
    setup({ values })
    const typeDropdown = container.querySelector('.cortex-effects-section__type .cortex-dropdown__trigger')
    expect(typeDropdown).not.toBeNull()
    expect(typeDropdown!.textContent).toContain('Inner shadow')
  })
})
