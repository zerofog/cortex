import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import {
  EffectsSection,
  parseEffectsValues,
  summarizeEffects,
  addShadow,
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
// parseBlurValue / replaceBlurInFilter — retired from EffectsSection.tsx exports.
// Coverage moved to effects-model.test.ts (parseFilterFunctions + formatFilter).
//
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

  // ── Regression: detail panel must survive a parent re-render after onChange ──
  //
  // User report: scrubbing an X input collapses the detail panel on mouse
  // release. Root cause hypothesis: the external-change-detection useEffect
  // misidentifies our own emit as external and clears expandedId. This test
  // simulates the round-trip (emit → parent applies override → re-render with
  // new values) and asserts the detail panel stays open.
  it('detail panel survives onChange round-trip (regression: scrub collapse)', async () => {
    // Setup a stateful wrapper so the parent re-renders with the emitted value.
    container = document.createElement('div')
    document.body.appendChild(container)

    function Wrapper() {
      const initial: EffectsValues = {
        boxShadow: '0px 2px 8px 0px rgba(0, 0, 0, 0.1)',
        blur: 0, backdropBlur: 0, filterRaw: '', backdropFilterRaw: '',
      }
      const [v, setV] = useState(initial)
      const commit = (c: { property: string; value: string }) => {
        if (c.property === 'box-shadow') setV((prev) => ({ ...prev, boxShadow: c.value }))
      }
      return <EffectsSection values={v} onChange={commit} onScrubEnd={commit} />
    }
    render(<Wrapper />, container)

    // Expand the row
    const expandBtn = container.querySelector<HTMLButtonElement>('.cortex-effects-section__expand-btn')
    expandBtn!.click()
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-effects-section__detail')).not.toBeNull()
    })

    // Fire onChange on the X input (simulating scrub-end / typing commit)
    const xInput = container.querySelector<HTMLInputElement>('.cortex-effects-section__grid input')
    expect(xInput).not.toBeNull()
    xInput!.focus()
    xInput!.value = '15.1'
    xInput!.dispatchEvent(new Event('input', { bubbles: true }))
    xInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    // Detail must still be visible after the round-trip
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-effects-section__detail')).not.toBeNull()
    })
  })

  it('does NOT render overflow or cursor controls (removed in v2)', () => {
    setup()
    expect(container.textContent).not.toContain('Overflow')
    expect(container.textContent).not.toContain('Cursor')
  })

  // ── Polymorphic empty state + per-effect rendering ─────────────────
  //
  // After the polymorphic refactor, the section renders ONE row per Effect.
  // Empty state: header + "+" only, no rows of any kind. Layer blur and
  // backdrop blur are first-class rows in the list (not a separate bottom
  // block); they're singletons (max 1 of each per element).

  const EMPTY_VALUES: EffectsValues = {
    boxShadow: 'none',
    blur: 0,
    backdropBlur: 0,
    filterRaw: '',
    backdropFilterRaw: '',
  }

  it('renders zero rows when there are no effects (empty state)', () => {
    setup({ values: EMPTY_VALUES })
    expect(container.querySelectorAll('.cortex-effects-section__row').length).toBe(0)
    // No legacy BL/BG block lingering
    expect(container.querySelector('.cortex-effects-section__blur-controls')).toBeNull()
  })

  it('renders a layer-blur row when values.blur > 0', () => {
    setup({ values: { ...EMPTY_VALUES, blur: 4, filterRaw: 'blur(4px)' } })
    const rows = container.querySelectorAll<HTMLElement>('.cortex-effects-section__row[data-effect-type="layer-blur"]')
    expect(rows.length).toBe(1)
  })

  it('renders a backdrop-blur row when values.backdropBlur > 0', () => {
    setup({ values: { ...EMPTY_VALUES, backdropBlur: 8, backdropFilterRaw: 'blur(8px)' } })
    const rows = container.querySelectorAll<HTMLElement>('.cortex-effects-section__row[data-effect-type="backdrop-blur"]')
    expect(rows.length).toBe(1)
  })

  it('renders shadow rows for each shadow in boxShadow', () => {
    setup({ values: TWO_SHADOWS_VALUES })
    const rows = container.querySelectorAll('.cortex-effects-section__row')
    expect(rows.length).toBe(2)
  })

  // ── Per-property emit gating (regression: H1 from silent-failure-hunter) ──
  //
  // A shadow edit (X scrub) must NOT also emit unchanged filter or
  // backdrop-filter. Panel.applyOverride installs `!important` overrides
  // eagerly — re-emitting unchanged values would leak stale overrides on
  // properties the gesture never touched.
  it('shadow X scrub emits only box-shadow, not filter or backdrop-filter', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    function Wrapper() {
      const initial: EffectsValues = {
        boxShadow: '0px 2px 8px 0px rgba(0, 0, 0, 0.1)',
        blur: 0, backdropBlur: 0, filterRaw: '', backdropFilterRaw: '',
      }
      const [v, setV] = useState(initial)
      const commit = (c: { property: string; value: string }) => {
        if (c.property === 'box-shadow') setV((prev) => ({ ...prev, boxShadow: c.value }))
        if (c.property === 'filter') setV((prev) => ({ ...prev, filterRaw: c.value }))
        if (c.property === 'backdrop-filter') setV((prev) => ({ ...prev, backdropFilterRaw: c.value }))
      }
      // Capture every onChange emission so the assertion can prove nothing
      // outside box-shadow fires.
      ;(Wrapper as any)._mock = vi.fn(commit)
      return <EffectsSection values={v} onChange={(Wrapper as any)._mock} onScrubEnd={(Wrapper as any)._mock} />
    }
    render(<Wrapper />, container)

    // Expand and edit X
    const expandBtn = container.querySelector<HTMLButtonElement>('.cortex-effects-section__expand-btn')
    expandBtn!.click()
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-effects-section__detail')).not.toBeNull()
    })
    const xInput = container.querySelector<HTMLInputElement>('.cortex-effects-section__grid input')
    xInput!.focus()
    xInput!.value = '15.1'
    xInput!.dispatchEvent(new Event('input', { bubbles: true }))
    xInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    await vi.waitFor(() => {
      const mock = (Wrapper as any)._mock as ReturnType<typeof vi.fn>
      const properties = mock.mock.calls.map((c: any) => c[0].property)
      expect(properties).toContain('box-shadow')
      // Critical: filter and backdrop-filter must NOT be in the call list
      expect(properties).not.toContain('filter')
      expect(properties).not.toContain('backdrop-filter')
    })
  })

  // ── disabledSingletons keep-row (regression: codex round 1 Bug 2) ──
  //
  // After eye-toggling a layer-blur row off, blur becomes 0. buildEffects
  // would normally drop the row (blur > 0 guard), but disabledSingletons
  // augmentation must keep it visible so the user can re-enable.
  it('layer-blur row stays visible after eye toggle (disabled state)', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)

    function Wrapper() {
      const initial: EffectsValues = {
        boxShadow: 'none', blur: 4, backdropBlur: 0,
        filterRaw: 'blur(4px)', backdropFilterRaw: '',
      }
      const [v, setV] = useState(initial)
      const commit = (c: { property: string; value: string }) => {
        if (c.property === 'filter') {
          // Parse blur from filter string for state update
          const m = c.value.match(/blur\(([\d.]+)px\)/)
          setV((prev) => ({ ...prev, blur: m?.[1] ? parseFloat(m[1]) : 0, filterRaw: c.value }))
        }
      }
      return <EffectsSection values={v} onChange={commit} />
    }
    render(<Wrapper />, container)

    // The layer-blur row should be present initially
    expect(container.querySelector('[data-effect-type="layer-blur"]')).not.toBeNull()

    // Click the eye to disable
    const layerBlurRow = container.querySelector<HTMLElement>('[data-effect-type="layer-blur"]')!
    const eyeBtn = layerBlurRow.querySelector<HTMLButtonElement>('.cortex-icon-button[aria-label="Disable effect"]')
    expect(eyeBtn).not.toBeNull()
    eyeBtn!.click()

    // Row must STILL be present after eye-toggle even though values.blur is now 0
    await vi.waitFor(() => {
      expect(container.querySelector('[data-effect-type="layer-blur"]')).not.toBeNull()
    })
  })

  it('renders no rows when all effect values are zero/none', () => {
    setup({ values: EMPTY_VALUES })
    const rows = container.querySelectorAll('.cortex-effects-section__row')
    expect(rows.length).toBe(0)
  })

  // Spec test 2: + button fires onChange with default shadow
  // (The + button is in Panel.tsx headerAction, but addShadow is tested above)

  // Spec test 3: Remove button fires onChange removing entry
  it('remove button fires onChange removing the shadow entry', () => {
    const { onChange } = setup({ values: TWO_SHADOWS_VALUES })
    const removeButtons = container.querySelectorAll<HTMLButtonElement>(
      '.cortex-icon-button[aria-label="Remove effect"]',
    )
    expect(removeButtons.length).toBe(2)
    // Click remove on the first shadow
    removeButtons[0].click()
    // Polymorphic emit fires once per CSS property (box-shadow, filter, backdrop-filter).
    // Find the box-shadow change in the call list.
    const boxShadowCall = onChange.mock.calls
      .map((c: any) => c[0])
      .find((c: any) => c.property === 'box-shadow')
    expect(boxShadowCall).toBeDefined()
    const remaining = parseBoxShadow(boxShadowCall.value)
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
      '.cortex-icon-button[aria-label="Disable effect"]',
    )
    expect(eyeButton).not.toBeNull()
    eyeButton!.click()
    // Polymorphic emit fires once per CSS property — find box-shadow.
    const boxShadowCall = onChange.mock.calls
      .map((c: any) => c[0])
      .find((c: any) => c.property === 'box-shadow')
    expect(boxShadowCall).toBeDefined()
    const shadows = parseBoxShadow(boxShadowCall.value)
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
    await vi.waitFor(() => {
      // Detail should now be visible
      expect(container.querySelector('.cortex-effects-section__detail')).not.toBeNull()
      // Should have X, Y, B, S inputs
      const grid = container.querySelector('.cortex-effects-section__grid')
      expect(grid).not.toBeNull()
      const numericInputs = grid!.querySelectorAll('.cortex-numeric-input')
      expect(numericInputs.length).toBe(4)
    }, { timeout: 500 })
  })

  // Spec test 6: Blur NumericInput on layer-blur row fires filter change via keyboard
  it('blur NumericInput on layer-blur row fires filter change via keyboard', async () => {
    // DEFAULT_VALUES has blur:4 → renders a layer-blur row. Expand it to access
    // the Blur input.
    const { onChange } = setup()
    const layerBlurRow = container.querySelector<HTMLElement>(
      '.cortex-effects-section__row[data-effect-type="layer-blur"]',
    )
    expect(layerBlurRow).not.toBeNull()
    const expandBtn = layerBlurRow!.querySelector<HTMLButtonElement>(
      '.cortex-effects-section__expand-btn',
    )
    expect(expandBtn).not.toBeNull()
    expandBtn!.click()
    await vi.waitFor(() => {
      const inputs = layerBlurRow!.querySelectorAll('.cortex-numeric-input')
      const blurInput = Array.from(inputs).find((el) => {
        const label = el.querySelector('.cortex-numeric-input__label')
        return label?.textContent === 'Blur'
      })
      expect(blurInput).toBeDefined()
      const input = blurInput!.querySelector('input') as HTMLInputElement
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      // Polymorphic emit fires three onChange calls (one per CSS property).
      // Find the filter call with blur(5px).
      const filterCalls = onChange.mock.calls
        .map((c: any) => c[0])
        .filter((c: any) => c.property === 'filter')
      expect(filterCalls.length).toBeGreaterThanOrEqual(1)
      expect(filterCalls.some((c: any) => c.value.includes('blur(5px)'))).toBe(true)
    }, { timeout: 500 })
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
