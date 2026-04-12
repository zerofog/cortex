import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { LayoutSection, parseLayoutValues } from '../../../src/browser/components/sections/LayoutSection.js'
import type { LayoutValues } from '../../../src/browser/components/sections/LayoutSection.js'

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

describe('LayoutSection', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: LayoutValues = {
    display: 'block',
    visibility: 'visible',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    rowGap: 0,
    columnGap: 0,
    flexWrap: 'nowrap',
    gridTemplateColumns: 'none',
    gridTemplateRows: 'none',
    gridAutoFlow: 'row',
    justifyItems: 'stretch',
    width: '320',
    height: '48',
    minWidth: '0px',
    maxWidth: 'none',
    minHeight: '0px',
    maxHeight: 'none',
  }

  function setup(overrides?: Partial<Parameters<typeof LayoutSection>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = vi.fn()
    render(
      <LayoutSection
        values={DEFAULT_VALUES}
        onChange={onChange}
        {...overrides}
      />,
      container,
    )
    return { onChange }
  }

  it('has data-section-id="layout"', () => {
    setup()
    const root = container.querySelector('[data-section-id="layout"]')
    expect(root).not.toBeNull()
  })

  it('renders display segmented control with block active', () => {
    setup()
    const displayGroup = container.querySelector('[role="radiogroup"]')
    expect(displayGroup).not.toBeNull()
    const active = container.querySelector('[aria-checked="true"]')
    expect(active).not.toBeNull()
  })

  it('renders visibility row when display is not none', () => {
    setup()
    expect(container.textContent).toContain('Visibility')
  })

  it('hides visibility row when display is none', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'none' } })
    const visSection = container.querySelector('[data-group="visibility"]')
    expect(visSection === null || visSection.getAttribute('data-hidden') === 'true').toBe(true)
  })

  it('shows flex direction only for flex display', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.textContent).toContain('Direction')
  })

  it('hides flex direction for block display', () => {
    setup()
    expect(container.textContent).not.toContain('Direction')
  })

  it('shows FlexControls for flex display (Task 8 — Justify/Align replaced by AlignmentGrid + X/Y dropdowns)', () => {
    // Task 8 extracted the inline Justify/Align SegmentedControls into
    // FlexControls — which renders an AlignmentGrid and X/Y dropdowns
    // instead of text-labelled segmented controls. The old "Justify"
    // and "Align" labels no longer appear for flex display; for grid
    // display they still exist (see the next test).
    setup({ values: { ...DEFAULT_VALUES, display: 'flex' } })
    expect(container.querySelector('.cortex-flex-controls')).not.toBeNull()
    expect(container.querySelector('.cortex-alignment-grid')).not.toBeNull()
    // X and Y dropdown triggers must both be present.
    expect(
      container.querySelector('[data-xy-axis="x"] .cortex-xy-dropdown__trigger'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-xy-axis="y"] .cortex-xy-dropdown__trigger'),
    ).not.toBeNull()
  })

  it('renders GridControls for grid display (Task 9 / ZF0-1187)', () => {
    setup({ values: { ...DEFAULT_VALUES, display: 'grid' } })
    // The text-labeled Justify/Align branch was replaced by GridControls
    // in Task 9 — the presence of the grid-controls subtree + its X/Y
    // dropdowns is the new falsifiable assertion.
    expect(container.querySelector('.cortex-grid-controls')).not.toBeNull()
    expect(
      container.querySelector('.cortex-grid-controls [data-xy-axis="x"] .cortex-xy-dropdown__trigger'),
    ).not.toBeNull()
    expect(
      container.querySelector('.cortex-grid-controls [data-xy-axis="y"] .cortex-xy-dropdown__trigger'),
    ).not.toBeNull()
    // Direction segmented control is present.
    expect(
      container.querySelector('.cortex-grid-controls__direction [role="radiogroup"]'),
    ).not.toBeNull()
  })

  it('hides GridControls and FlexControls for block display', () => {
    setup()
    expect(container.querySelector('.cortex-grid-controls')).toBeNull()
    expect(container.querySelector('.cortex-flex-controls')).toBeNull()
  })

  it('renders W and H sizing inputs', () => {
    setup()
    expect(container.textContent).toContain('W')
    expect(container.textContent).toContain('H')
  })

  it('emits display change on segmented control click', () => {
    const { onChange } = setup()
    const flexBtn = container.querySelector('[data-value="flex"]') as HTMLElement
    flexBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'display', value: 'flex' })
  })

  it('emits visibility change', () => {
    const { onChange } = setup()
    const groups = container.querySelectorAll('[role="radiogroup"]')
    // Visibility is the second radiogroup — assert it exists before clicking
    expect(groups.length).toBeGreaterThanOrEqual(2)
    const hiddenBtn = groups[1].querySelector('[data-value="hidden"]') as HTMLElement
    hiddenBtn?.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'visibility', value: 'hidden' })
  })

  // Review finding 3b: use expect().toBeDefined() instead of if guard
  it('emits width change with px suffix', () => {
    const { onChange } = setup()
    const inputs = container.querySelectorAll('.cortex-numeric-input input')
    const widthInput = inputs[0] as HTMLInputElement
    expect(widthInput).toBeDefined()
    widthInput.focus()
    widthInput.value = '400'
    widthInput.dispatchEvent(new Event('input', { bubbles: true }))
    widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const calls = onChange.mock.calls
    const widthCall = calls.find((c: any) => c[0]?.property === 'width')
    expect(widthCall).toBeDefined()
    expect(widthCall![0].value).toBe('400px')
  })

  it('handles auto width gracefully', () => {
    setup({ values: { ...DEFAULT_VALUES, width: 'auto' } })
    const inputs = container.querySelectorAll('.cortex-numeric-input')
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('renders sizing dropdown triggers for W and H', () => {
    setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    expect(triggers.length).toBe(2)
  })

  it('emits fit-content when width mode changed to fit', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const fitOption = container.querySelector('[data-value="fit"]') as HTMLElement
    expect(fitOption).not.toBeNull()
    fitOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: 'fit-content' })
  })

  it('emits 100% when width mode changed to fill', async () => {
    const { onChange } = setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const fillOption = container.querySelector('[data-value="fill"]') as HTMLElement
    expect(fillOption).not.toBeNull()
    fillOption.click()
    expect(onChange).toHaveBeenCalledWith({ property: 'width', value: '100%' })
  })

  it('shows min-width input when toggled on', async () => {
    setup()
    const triggers = container.querySelectorAll('.cortex-sizing-trigger')
    ;(triggers[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 10))
    const minToggle = container.querySelector('[data-action="toggle-min"]') as HTMLElement
    expect(minToggle).not.toBeNull()
    minToggle.click()
    await new Promise((r) => setTimeout(r, 10))
    // Re-render should show Min label
    expect(container.textContent).toContain('Min')
  })

  it('parseLayoutValues includes min/max fields', () => {
    const cs = {
      display: 'block',
      visibility: 'visible',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      width: '320px',
      height: '48px',
      minWidth: '100px',
      maxWidth: '500px',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    expect(result.minWidth).toBe('100px')
    expect(result.maxWidth).toBe('500px')
  })

  it('parseLayoutValues reads gap and flex-wrap fields from a CSSStyleDeclaration', () => {
    const cs = {
      display: 'flex',
      visibility: 'visible',
      flexDirection: 'column-reverse',
      justifyContent: 'center',
      alignItems: 'flex-end',
      rowGap: '12px',
      columnGap: '8px',
      flexWrap: 'wrap-reverse',
      width: 'auto',
      height: 'auto',
      minWidth: '0px',
      maxWidth: 'none',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    expect(result.rowGap).toBe(12)
    expect(result.columnGap).toBe(8)
    expect(result.flexWrap).toBe('wrap-reverse')
    // Confirm the existing fields still flow through.
    expect(result.flexDirection).toBe('column-reverse')
    expect(result.justifyContent).toBe('center')
    expect(result.alignItems).toBe('flex-end')
  })

  it('parseLayoutValues defaults gap and flex-wrap when fields are absent', () => {
    // CSSStyleDeclaration always returns '' (empty string) for unset
    // longhand getters, so the parser must coerce '' to the same defaults
    // an unstyled element would render with.
    const cs = {
      display: 'block',
      visibility: 'visible',
      flexDirection: '',
      justifyContent: '',
      alignItems: '',
      rowGap: '',
      columnGap: '',
      flexWrap: '',
      width: 'auto',
      height: 'auto',
      minWidth: '0px',
      maxWidth: 'none',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    expect(result.rowGap).toBe(0)
    expect(result.columnGap).toBe(0)
    expect(result.flexWrap).toBe('nowrap')
    expect(result.flexDirection).toBe('row')
    expect(result.justifyContent).toBe('flex-start')
    expect(result.alignItems).toBe('stretch')
  })

  it('parseLayoutValues reads grid fields from a CSSStyleDeclaration', () => {
    const cs = {
      display: 'grid',
      visibility: 'visible',
      flexDirection: '',
      justifyContent: '',
      alignItems: 'center',
      rowGap: '',
      columnGap: '',
      flexWrap: '',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
      gridAutoFlow: 'column',
      justifyItems: 'center',
      width: 'auto',
      height: 'auto',
      minWidth: '0px',
      maxWidth: 'none',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    expect(result.gridTemplateColumns).toBe('repeat(3, 1fr)')
    expect(result.gridTemplateRows).toBe('repeat(2, 1fr)')
    expect(result.gridAutoFlow).toBe('column')
    expect(result.justifyItems).toBe('center')
    // alignItems reuses the existing field; confirm it still flows through.
    expect(result.alignItems).toBe('center')
  })

  it('parseLayoutValues defaults grid fields when absent', () => {
    // Same contract as the flex defaults test — '' falls back to the
    // same defaults an unstyled element would render with.
    const cs = {
      display: 'block',
      visibility: 'visible',
      flexDirection: '',
      justifyContent: '',
      alignItems: '',
      rowGap: '',
      columnGap: '',
      flexWrap: '',
      gridTemplateColumns: '',
      gridTemplateRows: '',
      gridAutoFlow: '',
      justifyItems: '',
      width: 'auto',
      height: 'auto',
      minWidth: '0px',
      maxWidth: 'none',
      minHeight: '0px',
      maxHeight: 'none',
    } as unknown as CSSStyleDeclaration
    const result = parseLayoutValues(cs)
    // 'none' is the computed-value default for grid-template-*; it
    // parses to the complex tier in GridControls (read-only "(none)").
    expect(result.gridTemplateColumns).toBe('none')
    expect(result.gridTemplateRows).toBe('none')
    expect(result.gridAutoFlow).toBe('row')
    expect(result.justifyItems).toBe('stretch')
  })
})
