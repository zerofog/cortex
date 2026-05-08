import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import {
  TypographySection,
  parseTypographyValues,
} from '../../../src/browser/components/sections/TypographySection.js'
import type {
  TypographyValues,
  TypographyChange,
} from '../../../src/browser/components/sections/TypographySection.js'
import type { TextComponent } from '../../../src/core/text-components.js'
import type { ColorChip } from '../../../src/browser/token-detector.js'
import {
  TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP,
  TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP,
} from '../../../src/browser/alignment-router.js'

/**
 * Replacement test suite for ZF0-1215 Task 18 — the section was rewritten to
 * the per-group linking API (TypographyChange discriminated union, bundle
 * + chip pills, picker popovers). The prior `mode` / `detectedTokenClasses`
 * props no longer exist; those tests were describe.skip'd pending this rewrite.
 *
 * Scope split with `typography-section.dispatch.test.tsx`:
 * - dispatch.test.tsx locks the Bug 2 regression (text- prefix on the
 *   text-component dispatch surface). That file is authoritative for
 *   link-text-component / unlink-text-component removeClass shape.
 * - This file covers rendering (linked vs unlinked vs degraded), plain
 *   property dispatch (font-size / line-height / letter-spacing / alignment
 *   / color), color-chip dispatch (link / unlink / swap), value parsing
 *   (color strings, context-aware alignment derivation), dimmed/mixed states,
 *   and the vertical-align height precondition.
 *
 * CLAUDE.md anti-patterns honored:
 *   - No shadow copies of production logic.
 *   - Every assertion targets a specific value or structure, not .toBeDefined().
 *   - Branches that differ only in input string use it.each (font-size vs
 *     line-height vs letter-spacing; color parsing variants) — one test per
 *     branch, not per input.
 *   - Scrub drag-simulation is skipped with an explicit happy-dom TODO
 *     (anti-pattern 3): NumericInput's drag machinery emits events
 *     happy-dom doesn't fully implement.
 */

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

const BUNDLES: readonly TextComponent[] = [
  { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
  { name: 'heading-1', fontSize: '32px', lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '700' },
]

const CHIPS: readonly ColorChip[] = [
  { name: 'brand-500', hex: '#3b82f6' },
  { name: 'gray-500', hex: '#6b7280' },
]

const DEFAULT_VALUES: TypographyValues = {
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: '400',
  lineHeight: 1.5,
  letterSpacing: 0,
  textAlign: 'left',
  verticalAlign: '',
  display: 'block',
  flexDirection: 'row',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  height: '24px',
  minHeight: '0px',
  canAlignVertically: false,
  verticalAlignDisabledReason: { code: 'no-height', tooltip: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP },
  color: 'rgb(107, 114, 128)',
}

let container: HTMLDivElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
})

function setup(
  overrides?: Partial<Parameters<typeof TypographySection>[0]>,
): {
  onChange: ReturnType<typeof vi.fn>
  onScrub: ReturnType<typeof vi.fn>
  onScrubEnd: ReturnType<typeof vi.fn>
} {
  container = document.createElement('div')
  document.body.appendChild(container)
  const onChange = vi.fn()
  const onScrub = vi.fn()
  const onScrubEnd = vi.fn()
  render(
    <TypographySection
      values={DEFAULT_VALUES}
      availableWeights={['400', '500', '700']}
      className=""
      onChange={onChange}
      onScrub={onScrub}
      onScrubEnd={onScrubEnd}
      textComponents={[...BUNDLES]}
      colorChips={[...CHIPS]}
      {...overrides}
    />,
    container,
  )
  return { onChange, onScrub, onScrubEnd }
}

function findInputByValue(expected: string): HTMLInputElement | undefined {
  const inputs = container.querySelectorAll('.cortex-numeric-input input')
  return Array.from(inputs).find(
    (i) => (i as HTMLInputElement).value === expected,
  ) as HTMLInputElement | undefined
}

function typeAndCommit(input: HTMLInputElement, newValue: string): void {
  input.focus()
  input.value = newValue
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

function collectChanges(onChange: ReturnType<typeof vi.fn>): TypographyChange[] {
  return onChange.mock.calls.map((call) => call[0] as TypographyChange)
}

function findChange<K extends Extract<TypographyChange, { kind: string }>['kind']>(
  onChange: ReturnType<typeof vi.fn>,
  kind: K,
): Extract<TypographyChange, { kind: K }> | undefined {
  return collectChanges(onChange).find(
    (c): c is Extract<TypographyChange, { kind: K }> => 'kind' in c && c.kind === kind,
  )
}

function findPropertyChange(
  onChange: ReturnType<typeof vi.fn>,
  property: string,
): { property: string; value: string } | undefined {
  return collectChanges(onChange).find(
    (c): c is { property: string; value: string } => 'property' in c && c.property === property,
  )
}

function findAlignmentGroupByOptionValue(optionValue: string): HTMLElement {
  const groups = Array.from(
    container.querySelectorAll('.cortex-typography-section__align-row [role="radiogroup"]'),
  ) as HTMLElement[]
  const group = groups.find((g) => g.querySelector(`[data-value="${optionValue}"]`))
  if (!group) throw new Error(`Alignment radiogroup with option ${optionValue} not found`)
  return group
}

// ── Rendering ────────────────────────────────────────────────────────────

describe('TypographySection v2 — rendering', () => {
  it('renders root with data-section-id="type"', () => {
    setup()
    expect(container.querySelector('[data-section-id="type"]')).not.toBeNull()
  })

  describe('unlinked typography group (no bundle class detected)', () => {
    it('renders T button with correct aria-label', () => {
      setup({ className: '' })
      const tButton = container.querySelector('.cortex-typography-section__t-button')
      expect(tButton?.getAttribute('aria-label')).toBe('Link to text component')
    })

    it('renders font-size NumericInput with current value', () => {
      setup({ className: '' })
      expect(findInputByValue('16')?.value).toBe('16')
    })

    it('renders line-height + letter-spacing NumericInputs', () => {
      setup({ className: '' })
      expect(findInputByValue('1.5')?.value).toBe('1.5')
      expect(findInputByValue('0')?.value).toBe('0')
    })

    it('weight dropdown trigger shows compact label with numeric tooltip', () => {
      setup({ className: '' })
      const triggers = container.querySelectorAll('.cortex-dropdown__trigger')
      // Order: family dropdown → weight dropdown (pill replaces both when linked).
      expect(triggers[1]?.textContent).toContain('Regular')
      expect(triggers[1]?.textContent).not.toContain('400 - Regular')
      expect(triggers[1]?.getAttribute('data-tooltip')).toBe('font-weight: 400')
    })
  })

  describe('unlinked color group (no chip class detected)', () => {
    it('renders SwatchBook button with correct aria-label', () => {
      setup({ className: '' })
      const swatchBtn = container.querySelector(
        '.cortex-typography-section__swatchbook-button',
      )
      expect(swatchBtn?.getAttribute('aria-label')).toBe('Link to color chip')
    })

    it('renders ColorInput hex field populated from values.color', () => {
      setup({ className: '' })
      const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
      expect(hex.value).toBe('#6b7280')
    })

    it('renders color swatch with background matching values.color', () => {
      setup({ className: '' })
      const swatch = container.querySelector('.cortex-color-input__swatch') as HTMLElement
      expect(swatch.style.backgroundColor).toBe('rgb(107, 114, 128)')
    })
  })

  describe('linked typography group (bundle class detected)', () => {
    it('renders a pill whose text contains the bundle name', async () => {
      setup({ className: 'text-body-md' })
      await vi.waitFor(() => {
        const pill = container.querySelector('.cortex-token-chip')
        expect(pill?.textContent).toContain('body-md')
      }, { timeout: 500 })
    })

    it('does NOT render T button or raw weight/size/line/letter controls', async () => {
      // Both groups linked so neither ColorInput (which renders a NumericInput
      // for alpha) nor the typography raw controls are present. Asserting on
      // a mixed state would confuse alpha's NumericInput with a typography one.
      setup({ className: 'text-body-md text-brand-500' })
      await vi.waitFor(() => {
        expect(container.querySelectorAll('.cortex-token-chip')).toHaveLength(2)
      }, { timeout: 500 })
      expect(container.querySelector('.cortex-typography-section__t-button')).toBeNull()
      expect(container.querySelectorAll('.cortex-numeric-input')).toHaveLength(0)
    })
  })

  describe('linked color group (chip class detected)', () => {
    it('renders color chip pill with name, and hides ColorInput + SwatchBook', async () => {
      setup({ className: 'text-brand-500' })
      await vi.waitFor(() => {
        const pill = container.querySelector('.cortex-token-chip')
        expect(pill?.textContent).toContain('brand-500')
        expect(container.querySelector('.cortex-color-input__hex')).toBeNull()
        expect(
          container.querySelector('.cortex-typography-section__swatchbook-button'),
        ).toBeNull()
      }, { timeout: 500 })
    })
  })

  describe('degraded modes', () => {
    it('forces UNLINKED typography when textComponents is empty, even with matching className', async () => {
      // detectTextComponent short-circuits to null when bundles list is empty.
      // The section must fall through to UNLINKED state regardless of what
      // the className says. Asserting both positive (T button present) and
      // negative (no typography pill) — the color pill may still render if
      // the className has a matching chip, so we check the typography-side
      // specifically by asserting the T button is back.
      setup({ className: 'text-body-md', textComponents: [] })
      await vi.waitFor(() => {
        expect(container.querySelector('.cortex-typography-section__t-button')).not.toBeNull()
        // Typography raw controls must be present (weight/size/line/letter).
        expect(findInputByValue('16')).toBeDefined()
      }, { timeout: 500 })
    })

    it('forces UNLINKED color when colorChips is empty, even with matching className', async () => {
      setup({ className: 'text-brand-500', colorChips: [] })
      await vi.waitFor(() => {
        expect(
          container.querySelector('.cortex-typography-section__swatchbook-button'),
        ).not.toBeNull()
      }, { timeout: 500 })
    })

    it('renders UNLINKED for a partial-token className (e.g. text-sm with no matching bundle)', () => {
      setup({ className: 'text-sm' })
      // text-sm is a Tailwind utility, not a @theme bundle — our BUNDLES list
      // has body-md + heading-1 only. Detection must return null so pill
      // doesn't render, and raw controls take over.
      expect(container.querySelector('.cortex-typography-section__t-button')).not.toBeNull()
      expect(container.querySelector('.cortex-token-chip')).toBeNull()
    })
  })
})

// ── Plain-property dispatch ──────────────────────────────────────────────

describe('TypographySection v2 — plain property dispatch', () => {
  it.each([
    // [property, initial display value, new input, expected emitted value]
    ['font-size', '16', '20', '20px'],
    ['line-height', '1.5', '1.8', '1.8'],
    ['letter-spacing', '0', '2', '2px'],
  ])('emits %s with the correct unit format', (property, initial, typed, expected) => {
    const { onChange } = setup({ className: '' })
    const input = findInputByValue(initial)
    expect(input).toBeDefined()
    typeAndCommit(input!, typed)
    const call = findPropertyChange(onChange, property)
    expect(call?.value).toBe(expected)
  })

  it('emits horizontal alignment intent via the horizontal SegmentedControl', () => {
    const { onChange } = setup({ className: '' })
    const alignGroup = findAlignmentGroupByOptionValue('left')
    const centerBtn = alignGroup.querySelector('[data-value="center"]') as HTMLElement
    centerBtn.click()
    expect(onChange).toHaveBeenCalledWith({
      kind: 'typography-align',
      axis: 'horizontal',
      value: 'center',
    })
  })

  it('emits color change when a valid hex is entered and blurred', async () => {
    const { onChange } = setup({ className: '' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    await act(() => {
      hex.focus()
      hex.value = '#ff0000'
      hex.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() => {
      hex.dispatchEvent(new Event('blur', { bubbles: true }))
    })
    await vi.waitFor(() => {
      expect(findPropertyChange(onChange, 'color')?.value).toBe('#ff0000')
    }, { timeout: 500 })
  })

  it('reverts invalid hex input on blur AND suppresses color emission', async () => {
    const { onChange } = setup({ className: '' })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    await act(() => {
      hex.focus()
      hex.value = 'notahex'
      hex.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() => {
      hex.dispatchEvent(new Event('blur', { bubbles: true }))
    })
    await vi.waitFor(() => {
      expect(hex.value).toBe('#6b7280')
    }, { timeout: 500 })
    expect(findPropertyChange(onChange, 'color')).toBeUndefined()
  })

  it('renders disabled vertical alignment controls with Layout recovery tooltip when block height is content-sized', () => {
    const { onChange } = setup({ className: '' })
    const alignRow = container.querySelector('.cortex-typography-section__align-row')
    expect(alignRow).not.toBeNull()
    const groups = alignRow!.querySelectorAll('[role="radiogroup"]')
    expect(groups).toHaveLength(2)
    const verticalGroup = findAlignmentGroupByOptionValue('flex-start')
    const middle = verticalGroup.querySelector('[data-value="center"]') as HTMLElement
    expect(middle.getAttribute('aria-disabled')).toBe('true')
    expect(middle.getAttribute('data-tooltip')).toBe(TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP)
    middle.click()
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'typography-align', axis: 'vertical' }),
    )
  })

  it('renders disabled vertical alignment controls with display recovery tooltip for grid elements', () => {
    const { onChange } = setup({
      className: '',
      values: {
        ...DEFAULT_VALUES,
        display: 'grid',
        height: '80px',
        canAlignVertically: false,
        verticalAlignDisabledReason: { code: 'unsupported-display', tooltip: TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP },
      },
    })
    const verticalGroup = findAlignmentGroupByOptionValue('flex-start')
    const middle = verticalGroup.querySelector('[data-value="center"]') as HTMLElement

    expect(middle.getAttribute('aria-disabled')).toBe('true')
    expect(middle.getAttribute('data-tooltip')).toBe(TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP)
    middle.click()
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'typography-align', axis: 'vertical' }),
    )
  })

  it('emits vertical alignment intent when the element has Layout height room', () => {
    const { onChange } = setup({
      className: '',
      values: {
        ...DEFAULT_VALUES,
        height: '80px',
        canAlignVertically: true,
      },
    })
    const verticalGroup = findAlignmentGroupByOptionValue('flex-start')
    const top = verticalGroup.querySelector('[data-value="flex-start"]') as HTMLElement
    const middle = verticalGroup.querySelector('[data-value="center"]') as HTMLElement
    expect(middle.getAttribute('aria-disabled')).toBeNull()
    expect(top.getAttribute('tabindex')).toBe('0')
    middle.click()
    expect(onChange).toHaveBeenCalledWith({
      kind: 'typography-align',
      axis: 'vertical',
      value: 'center',
    })
  })
})

// ── Color chip dispatch (text-component dispatch lives in dispatch.test.tsx) ──

describe('TypographySection v2 — color chip dispatch', () => {
  it('link-color-chip (unlinked → pick): removeClass is undefined', async () => {
    const { onChange } = setup({ className: '' })
    const swatchBtn = container.querySelector(
      '.cortex-typography-section__swatchbook-button',
    ) as HTMLElement
    swatchBtn.click()
    // Wait for picker popover to render
    await vi.waitFor(() => {
      const brandOpt = Array.from(
        container.querySelectorAll('.cortex-color-chip-picker__option'),
      ).find((o) => o.textContent?.includes('brand-500'))
      expect(brandOpt).toBeTruthy()
    }, { timeout: 500 })
    const brandOpt = Array.from(
      container.querySelectorAll('.cortex-color-chip-picker__option'),
    ).find((o) => o.textContent?.includes('brand-500')) as HTMLElement
    brandOpt.click()
    await vi.waitFor(() => {
      const link = findChange(onChange, 'link-color-chip')
      expect(link?.chip.name).toBe('brand-500')
      expect(link?.removeClass).toBeUndefined()
    }, { timeout: 500 })
  })

  it('link-color-chip (linked → swap via pill): removeClass is text-{prev}', async () => {
    const { onChange } = setup({ className: 'text-gray-500' })
    // Wait for token detection to render the pill
    let pill!: HTMLElement
    await vi.waitFor(() => {
      pill =
        (container.querySelector('.cortex-token-chip__body') as HTMLElement) ??
        (container.querySelector('button[aria-label*="Swap"]') as HTMLElement)
      expect(pill).toBeTruthy()
    }, { timeout: 500 })
    pill.click()
    // Wait for picker popover to render
    await vi.waitFor(() => {
      const brandOpt = Array.from(
        container.querySelectorAll('.cortex-color-chip-picker__option'),
      ).find((o) => o.textContent?.includes('brand-500'))
      expect(brandOpt).toBeTruthy()
    }, { timeout: 500 })
    const brandOpt = Array.from(
      container.querySelectorAll('.cortex-color-chip-picker__option'),
    ).find((o) => o.textContent?.includes('brand-500')) as HTMLElement
    brandOpt.click()
    await vi.waitFor(() => {
      const link = findChange(onChange, 'link-color-chip')
      expect(link?.chip.name).toBe('brand-500')
      expect(link?.removeClass).toBe('text-gray-500')
    }, { timeout: 500 })
  })

  it('unlink-color-chip: emits removeClass with text- prefix + inline color preserving rendered value', async () => {
    const { onChange } = setup({
      className: 'text-gray-500',
      values: { ...DEFAULT_VALUES, color: 'rgb(107, 114, 128)' },
    })
    // Wait for token detection to render the unlink button
    let unlinkBtn!: HTMLElement
    await vi.waitFor(() => {
      unlinkBtn = container.querySelector('button[aria-label="Detach token"]') as HTMLElement
      expect(unlinkBtn).toBeTruthy()
    }, { timeout: 500 })
    unlinkBtn.click()
    await vi.waitFor(() => {
      const unlink = findChange(onChange, 'unlink-color-chip')
      expect(unlink?.removeClass).toBe('text-gray-500')
      expect(unlink?.inline).toEqual([{ property: 'color', value: 'rgb(107, 114, 128)' }])
    }, { timeout: 500 })
  })
})

// ── Value parsing (ColorInput + parseTypographyValues) ───────────────────

describe('TypographySection v2 — color-string parsing', () => {
  it.each([
    ['rgba with alpha', 'rgba(59, 130, 246, 0.5)', '#3b82f6'],
    ['modern rgb space syntax', 'rgb(59 130 246)', '#3b82f6'],
    ['standard rgb commas', 'rgb(107, 114, 128)', '#6b7280'],
  ])('renders %s in hex input as %s', (_label, color, expectedHex) => {
    setup({ className: '', values: { ...DEFAULT_VALUES, color } })
    const hex = container.querySelector('.cortex-color-input__hex') as HTMLInputElement
    expect(hex.value).toBe(expectedHex)
  })
})

describe('parseTypographyValues', () => {
  function fakeCS(partial: Partial<CSSStyleDeclaration>): CSSStyleDeclaration {
    // Minimal shape — happy-dom doesn't give us a real CSSStyleDeclaration,
    // so we cast a plain object. Properties the function reads: fontFamily,
    // fontSize, fontWeight, lineHeight, letterSpacing, textAlign, color,
    // display, flexDirection, alignItems, justifyContent, height, minHeight.
    return {
      fontFamily: 'Inter',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '24px',
      letterSpacing: '0px',
      textAlign: 'left',
      color: 'rgb(0, 0, 0)',
      display: 'block',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      height: '24px',
      minHeight: '0px',
      ...partial,
    } as CSSStyleDeclaration
  }

  it('reads flex-column screen axes from align-items and justify-content', () => {
    const values = parseTypographyValues(
      fakeCS({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }),
    )
    expect(values.textAlign).toBe('center')
    expect(values.verticalAlign).toBe('flex-end')
  })

  it('reads flex-row screen axes from justify-content and align-items', () => {
    const values = parseTypographyValues(
      fakeCS({
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }),
    )
    expect(values.textAlign).toBe('right')
    expect(values.verticalAlign).toBe('center')
  })

  it('reads flex-row-reverse main-axis alignment as screen horizontal alignment', () => {
    const values = parseTypographyValues(
      fakeCS({
        display: 'flex',
        flexDirection: 'row-reverse',
        justifyContent: 'flex-start',
        alignItems: 'center',
      }),
    )
    expect(values.textAlign).toBe('right')
    expect(values.verticalAlign).toBe('center')
  })

  it('reads flex-column-reverse main-axis alignment as screen vertical alignment', () => {
    const values = parseTypographyValues(
      fakeCS({
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
      }),
    )
    expect(values.textAlign).toBe('right')
    expect(values.verticalAlign).toBe('flex-end')
  })

  it('leaves horizontal control unselected for unsupported flex alignment values', () => {
    expect(
      parseTypographyValues(fakeCS({
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
      })).textAlign,
    ).toBe('')
    expect(
      parseTypographyValues(fakeCS({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      })).textAlign,
    ).toBe('')
  })

  it('keeps block vertical alignment disabled until height or min-height creates space', () => {
    const contentSized = parseTypographyValues(fakeCS({ display: 'block', height: '24px' }))
    expect(contentSized.textAlign).toBe('left')
    expect(contentSized.verticalAlign).toBe('')
    expect(contentSized.canAlignVertically).toBe(false)
    expect(contentSized.verticalAlignDisabledReason).toEqual({ code: 'no-height', tooltip: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP })

    const tall = parseTypographyValues(fakeCS({ display: 'block', height: '80px' }))
    expect(tall.canAlignVertically).toBe(true)
    expect(tall.verticalAlignDisabledReason).toBeNull()

    const minTall = parseTypographyValues(fakeCS({ display: 'block', minHeight: '80px' }))
    expect(minTall.canAlignVertically).toBe(true)
    expect(minTall.verticalAlignDisabledReason).toBeNull()
  })

  it('disables vertical alignment for grid displays instead of treating them as block', () => {
    const values = parseTypographyValues(fakeCS({ display: 'grid', height: '80px' }))
    expect(values.textAlign).toBe('left')
    expect(values.verticalAlign).toBe('')
    expect(values.canAlignVertically).toBe(false)
    expect(values.verticalAlignDisabledReason).toEqual({ code: 'unsupported-display', tooltip: TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP })
  })
})

// ── Dimmed + mixed state wiring ──────────────────────────────────────────

describe('TypographySection v2 — dimmed + mixed props', () => {
  it('dimmedProperties.has("font-family") dims the family row', () => {
    setup({
      className: '',
      dimmedProperties: new Set(['font-family']),
    })
    const familyRow = container.querySelector('.cortex-typography-section__row--with-t')
    expect(familyRow?.className).toContain('cortex-control--dimmed')
  })

  it('dimmedProperties.has("font-size") dims the weight/size row (not the family row)', () => {
    setup({
      className: '',
      dimmedProperties: new Set(['font-size']),
    })
    // The family row must NOT be dimmed when only font-size is dimmed.
    const familyRow = container.querySelector('.cortex-typography-section__row--with-t')
    expect(familyRow?.className).not.toContain('cortex-control--dimmed')
    // SOME other row must be dimmed.
    const dimmedRow = Array.from(
      container.querySelectorAll('.cortex-typography-section__row'),
    ).find((r) => r.className.includes('cortex-control--dimmed'))
    expect(dimmedRow).toBeTruthy()
  })

  it('mixedProperties.has("font-weight") renders the weight dropdown as Mixed', () => {
    setup({
      className: '',
      mixedProperties: new Set(['font-weight']),
    })
    const triggers = container.querySelectorAll('.cortex-dropdown__trigger')
    expect(triggers[1]?.textContent).toContain('Mixed')
  })

  it('mixedProperties.has("text-align") renders alignment segmented control as Mixed', () => {
    setup({
      className: '',
      mixedProperties: new Set(['text-align']),
    })
    const alignGroup = container.querySelector('.cortex-typography-section__align-row [role="radiogroup"]')
    expect(alignGroup?.textContent).toContain('Mixed')
  })

  it('maps flex-row mixed properties to the same screen axes as alignment writes', () => {
    setup({
      className: '',
      values: {
        ...DEFAULT_VALUES,
        display: 'flex',
        flexDirection: 'row',
        textAlign: 'center',
        verticalAlign: 'center',
        canAlignVertically: true,
      },
      mixedProperties: new Set(['align-items']),
    })
    expect(findAlignmentGroupByOptionValue('left').textContent).not.toContain('Mixed')
    expect(findAlignmentGroupByOptionValue('flex-start').textContent).toContain('Mixed')
  })

  it('maps flex-column mixed properties to the same screen axes as alignment writes', () => {
    setup({
      className: '',
      values: {
        ...DEFAULT_VALUES,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'right',
        verticalAlign: 'center',
        canAlignVertically: true,
      },
      mixedProperties: new Set(['align-items']),
    })
    expect(findAlignmentGroupByOptionValue('left').textContent).toContain('Mixed')
    expect(findAlignmentGroupByOptionValue('flex-start').textContent).not.toContain('Mixed')
  })
})

// ── Scrub lifecycle (happy-dom cannot simulate drag) ─────────────────────

describe('TypographySection v2 — scrub lifecycle', () => {
  // TODO: requires real drag/pointer events. NumericInput tests own this
  // surface; integrating at the section level in happy-dom would be theatre
  // per CLAUDE.md test anti-pattern 3.
  it.skip(
    'font-size scrub fires onScrub during drag and onScrubEnd on release',
    () => {},
  )
})
