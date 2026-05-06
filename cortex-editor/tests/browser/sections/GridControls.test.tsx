import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import {
  GridControls,
  parseGridTemplate,
} from '../../../src/browser/components/sections/GridControls.js'
import type {
  GridValues,
  GridChange,
} from '../../../src/browser/components/sections/GridControls.js'
import { dispatchMouseEvent, dispatchKeyboardEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom has no real layout engine.
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

// Falsifiable icon assertions. Each fragment is copied from icons.tsx so
// a swap is caught immediately — the icons.tsx snapshot test breaks first
// and points at the moved path, these fixtures stay in lockstep.
const ICON_FINGERPRINT = {
  // LayoutGrid / GalleryHorizontalEnd / GalleryVerticalEnd — row/column direction icons
  gridRow: 'M5 12h14',            // ArrowRight — items flow horizontally
  gridColumn: 'M12 5v14',         // ArrowDown  — items flow vertically
  // MoveHorizontal: m18 8 4 4-4 4
  moveHorizontal: 'm18 8 4 4-4 4',
  // MoveVertical: m8 18 4 4 4-4
  moveVertical: 'm8 18 4 4 4-4',
  // AlignHorizontalJustifyStart: rect x="6" y="5"
  alignHStart: 'x="6" y="5"',
  // AlignVerticalJustifyStart: rect x="5" y="16"
  alignVStart: 'x="5" y="16"',
} as const

describe('parseGridTemplate', () => {
  it('parses simple repeat(N, 1fr) with single digit', () => {
    expect(parseGridTemplate('repeat(3, 1fr)')).toEqual({
      tier: 'simple',
      count: 3,
    })
  })

  it('parses simple repeat with inner whitespace', () => {
    expect(parseGridTemplate('repeat( 3 , 1fr )')).toEqual({
      tier: 'simple',
      count: 3,
    })
  })

  it('parses simple repeat with multi-digit count', () => {
    expect(parseGridTemplate('repeat(12, 1fr)')).toEqual({
      tier: 'simple',
      count: 12,
    })
  })

  it('parses responsive repeat(auto-fit, minmax(Npx, 1fr))', () => {
    expect(parseGridTemplate('repeat(auto-fit, minmax(200px, 1fr))')).toEqual({
      tier: 'responsive',
      minWidth: 200,
      autoMode: 'auto-fit',
    })
  })

  it('parses responsive repeat(auto-fill, minmax(Npx, 1fr))', () => {
    expect(parseGridTemplate('repeat(auto-fill, minmax(120px, 1fr))')).toEqual({
      tier: 'responsive',
      minWidth: 120,
      autoMode: 'auto-fill',
    })
  })

  it('parses responsive with whitespace tolerance', () => {
    expect(
      parseGridTemplate('repeat( auto-fit , minmax( 200px , 1fr ) )'),
    ).toEqual({ tier: 'responsive', minWidth: 200, autoMode: 'auto-fit' })
  })

  it('returns complex for arbitrary track lists', () => {
    expect(parseGridTemplate('1fr 2fr auto')).toEqual({
      tier: 'complex',
      raw: '1fr 2fr auto',
    })
  })

  it('returns complex for repeat with min-content (not Npx)', () => {
    // minmax(min-content, 1fr) MUST fall through to complex — only the
    // Npx variant is considered responsive.
    expect(
      parseGridTemplate('repeat(auto-fit, minmax(min-content, 1fr))'),
    ).toEqual({ tier: 'complex', raw: 'repeat(auto-fit, minmax(min-content, 1fr))' })
  })

  it('returns complex for repeat(N, 100px) (not 1fr)', () => {
    // Only `1fr` matches the simple tier — fixed-px repeat is complex.
    expect(parseGridTemplate('repeat(3, 100px)')).toEqual({
      tier: 'complex',
      raw: 'repeat(3, 100px)',
    })
  })

  it('returns complex for empty string', () => {
    // Empty / unset template is legitimately unparseable — complex
    // tier renders a read-only display which is the right fallback.
    expect(parseGridTemplate('')).toEqual({ tier: 'complex', raw: '' })
  })

  it('returns complex for "none" literal', () => {
    expect(parseGridTemplate('none')).toEqual({
      tier: 'complex',
      raw: 'none',
    })
  })
})

describe('GridControls', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: GridValues = {
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    gridAutoFlow: 'row',
    justifyItems: 'stretch',
    alignItems: 'stretch',
    rowGap: 0,
    columnGap: 0,
  }

  function setup(overrides?: {
    values?: Partial<GridValues>
    onChange?: (c: GridChange) => void
    onScrub?: (c: GridChange) => void
    onScrubEnd?: (c: GridChange) => void
  }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = overrides?.onChange ?? vi.fn()
    const onScrub = overrides?.onScrub ?? vi.fn()
    const onScrubEnd = overrides?.onScrubEnd ?? vi.fn()
    render(
      <GridControls
        values={{ ...DEFAULT_VALUES, ...overrides?.values }}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
      />,
      container,
    )
    return { onChange, onScrub, onScrubEnd }
  }

  const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

  function getDirectionOptions(): HTMLElement[] {
    const group = container.querySelector(
      '.cortex-grid-controls__template [role="radiogroup"]',
    )
    return Array.from(group?.querySelectorAll('[role="radio"]') ?? []) as HTMLElement[]
  }

  function getXDropdownTrigger(): HTMLButtonElement {
    return container.querySelector(
      '[data-xy-axis="x"] .cortex-xy-dropdown__trigger',
    ) as HTMLButtonElement
  }

  function getYDropdownTrigger(): HTMLButtonElement {
    return container.querySelector(
      '[data-xy-axis="y"] .cortex-xy-dropdown__trigger',
    ) as HTMLButtonElement
  }

  async function openXDropdown(): Promise<void> {
    getXDropdownTrigger().click()
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-xy-dropdown__popover')).not.toBeNull()
    }, { timeout: 500 })
  }

  async function openYDropdown(): Promise<void> {
    getYDropdownTrigger().click()
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-xy-dropdown__popover')).not.toBeNull()
    }, { timeout: 500 })
  }

  function getOpenXYOption(value: string): HTMLElement {
    return container.querySelector(
      `#cortex-xy-opt-${value}`,
    ) as HTMLElement
  }

  // Helper — pulls only the emissions whose `property` matches.
  function calls(
    mock: ReturnType<typeof vi.fn>,
    property?: string,
  ): GridChange[] {
    const arr = mock.mock.calls.map((c) => c[0] as GridChange)
    return property ? arr.filter((c) => c.property === property) : arr
  }

  // ── X/Y dropdown → justify-items / align-items ────────────────

  it('X dropdown change emits justify-items (NO swap, unlike flex)', async () => {
    const { onChange } = setup()
    await openXDropdown()
    getOpenXYOption('center').click()
    await vi.waitFor(() => {
      expect(calls(onChange, 'justify-items')).toEqual([
        { property: 'justify-items', value: 'center' },
      ])
    }, { timeout: 500 })
    // Negative control: align-items is NOT touched by the X dropdown.
    expect(calls(onChange, 'align-items')).toEqual([])
  })

  it('Y dropdown change emits align-items (NO swap, unlike flex)', async () => {
    const { onChange } = setup()
    await openYDropdown()
    getOpenXYOption('start').click()
    await vi.waitFor(() => {
      expect(calls(onChange, 'align-items')).toEqual([
        { property: 'align-items', value: 'start' },
      ])
    }, { timeout: 500 })
    expect(calls(onChange, 'justify-items')).toEqual([])
  })

  it('X/Y mapping is invariant under grid-auto-flow: column', async () => {
    // Grid does NOT swap on auto-flow — this is the key structural
    // difference from FlexControls. X is always justify-items, Y is
    // always align-items, regardless of grid-auto-flow.
    const { onChange } = setup({ values: { gridAutoFlow: 'column' } })
    await openXDropdown()
    getOpenXYOption('center').click()
    await vi.waitFor(() => {
      expect(calls(onChange, 'justify-items')).toEqual([
        { property: 'justify-items', value: 'center' },
      ])
    }, { timeout: 500 })
    expect(calls(onChange, 'align-items')).toEqual([])
  })

  it('X/Y trigger tooltips are the CSS property names (no swap under column auto-flow)', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <GridControls
        values={{ ...DEFAULT_VALUES, gridAutoFlow: 'row' }}
        onChange={vi.fn()}
      />,
      container,
    )
    let x = container.querySelector('[data-xy-axis="x"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    let y = container.querySelector('[data-xy-axis="y"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    expect(x.getAttribute('data-tooltip')).toBe('justify-items')
    expect(y.getAttribute('data-tooltip')).toBe('align-items')
    render(
      <GridControls
        values={{ ...DEFAULT_VALUES, gridAutoFlow: 'column' }}
        onChange={vi.fn()}
      />,
      container,
    )
    x = container.querySelector('[data-xy-axis="x"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    y = container.querySelector('[data-xy-axis="y"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    // Tooltips unchanged — grid X/Y is invariant under auto-flow.
    expect(x.getAttribute('data-tooltip')).toBe('justify-items')
    expect(y.getAttribute('data-tooltip')).toBe('align-items')
  })

  // ── AlignmentGrid ──────────────────────────────────────────────

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('AlignmentGrid top-center click emits canonical grid values (justify-items=center, align-items=start)', () => {
    const { onChange } = setup({ values: { justifyItems: 'start', alignItems: 'start' } })
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    ) as HTMLButtonElement
    topCenter.click()
    // AlignmentGrid emits flex-spec literals (flex-start/center/flex-end)
    // because it's CSS-role-agnostic and those are correct in flex.
    // GridControls canonicalizes flex-start → start and flex-end → end
    // before writing to justify-items/align-items so the emitted value
    // matches what GRID_X/Y_OPTIONS render and what parseLayoutValues
    // reads back. Without canonicalization, the dropdown's strict-equality
    // match would fall through to index 0 after every grid click.
    expect(calls(onChange, 'justify-items')).toEqual([
      { property: 'justify-items', value: 'center' },
    ])
    expect(calls(onChange, 'align-items')).toEqual([
      { property: 'align-items', value: 'start' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('AlignmentGrid bottom-right click canonicalizes flex-end → end', () => {
    const { onChange } = setup()
    const bottomRight = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="2"][data-col="2"]',
    ) as HTMLButtonElement
    bottomRight.click()
    // Regression guard for the flex-end → end half of the canonicalization
    // table — top-center exercises only flex-start. A future refactor that
    // drops one branch of flexAlignToGridAlign would survive the previous
    // test alone.
    expect(calls(onChange, 'justify-items')).toEqual([
      { property: 'justify-items', value: 'end' },
    ])
    expect(calls(onChange, 'align-items')).toEqual([
      { property: 'align-items', value: 'end' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('AlignmentGrid active cell highlights correctly with grid canonical values', () => {
    // GridControls passes grid values (start/end) through gridAlignToFlexAlign
    // so AlignmentGrid's internal flex-start/flex-end matching works.
    setup({ values: { justifyItems: 'center', alignItems: 'start' } })
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    )
    expect(topCenter?.classList.contains('cortex-alignment-grid__cell--active')).toBe(true)
    // Negative: no other cell is active
    const allCells = Array.from(container.querySelectorAll('.cortex-alignment-grid__cell'))
    const activeCells = allCells.filter(c => c.classList.contains('cortex-alignment-grid__cell--active'))
    expect(activeCells.length).toBe(1)
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('AlignmentGrid distribute main-axis emits justify-content (track distribution, not item align)', async () => {
    const { onChange } = setup({ values: { justifyItems: 'start', alignItems: 'start' } })
    // First dblclick → row overlay (cross axis). Second dblclick on a
    // different cell → col overlay (main axis).
    const cell00 = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="0"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell00, 'dblclick')
    await tick()
    const cell11 = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="1"][data-col="1"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell11, 'dblclick')
    await tick()
    const distBtn = container.querySelector(
      '.cortex-alignment-grid__distribute-btn',
    ) as HTMLButtonElement
    distBtn.click()
    await tick()
    // Main-axis distribution in grid → justify-content (track layout,
    // NOT justify-items — items can't have "space-between").
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'space-between' },
    ])
    // And it MUST NOT touch the per-item alignment props.
    expect(calls(onChange, 'justify-items')).toEqual([])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('AlignmentGrid distribute cross-axis emits align-content', async () => {
    const { onChange } = setup({ values: { justifyItems: 'start', alignItems: 'start' } })
    const cell = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="1"][data-col="1"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell, 'dblclick')
    await tick()
    const distBtn = container.querySelector(
      '.cortex-alignment-grid__distribute-btn',
    ) as HTMLButtonElement
    distBtn.click()
    await tick()
    expect(calls(onChange, 'align-content')).toEqual([
      { property: 'align-content', value: 'space-between' },
    ])
    // Again: NOT align-items.
    expect(calls(onChange, 'align-items')).toEqual([])
  })

  // ── Direction SegmentedControl ────────────────────────────────

  it('renders both direction options with the correct lucide icons', () => {
    setup()
    const options = getDirectionOptions()
    expect(options).toHaveLength(2)
    const html = options.map((o) => o.innerHTML).join('\n')
    expect(html).toContain(ICON_FINGERPRINT.gridRow)
    expect(html).toContain(ICON_FINGERPRINT.gridColumn)
  })

  it.each([
    ['row', 'column'],
    ['column', 'row'],
  ])('direction change to %s fires grid-auto-flow', (value, startFrom) => {
    const { onChange } = setup({ values: { gridAutoFlow: startFrom } })
    const btn = container.querySelector(
      `.cortex-grid-controls__template [data-value="${value}"]`,
    ) as HTMLElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(calls(onChange, 'grid-auto-flow')).toEqual([
      { property: 'grid-auto-flow', value },
    ])
  })

  it('grid-auto-flow: "row dense" leaves both segments unhighlighted', () => {
    setup({ values: { gridAutoFlow: 'row dense' } })
    const options = getDirectionOptions()
    for (const opt of options) {
      expect(opt.getAttribute('aria-checked')).toBe('false')
    }
  })

  // ── Three-tier rendering ──────────────────────────────────────

  it('simple tier: Cols NumericInput is enabled and shows the count', () => {
    setup({
      values: {
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
      },
    })
    const cols = container.querySelector(
      '.cortex-grid-controls__cols input',
    ) as HTMLInputElement
    expect(cols).not.toBeNull()
    expect(cols.disabled).toBe(false)
    expect(cols.value).toBe('4')
  })

  it('simple tier: Rows NumericInput is enabled and shows the count', () => {
    setup({
      values: {
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(5, 1fr)',
      },
    })
    const rows = container.querySelector(
      '.cortex-grid-controls__rows input',
    ) as HTMLInputElement
    expect(rows).not.toBeNull()
    expect(rows.value).toBe('5')
  })

  it.each([
    ['complex columns', 'gridTemplateColumns', '.cortex-grid-controls__cols', '1fr 2fr auto', 'grid-template-columns'],
    ['complex rows', 'gridTemplateRows', '.cortex-grid-controls__rows', '1fr 2fr auto', 'grid-template-rows'],
    ['responsive columns', 'gridTemplateColumns', '.cortex-grid-controls__cols', 'repeat(auto-fit, minmax(200px, 1fr))', 'grid-template-columns'],
    ['responsive rows', 'gridTemplateRows', '.cortex-grid-controls__rows', 'repeat(auto-fill, minmax(120px, 1fr))', 'grid-template-rows'],
  ] as const)('non-simple %s template disables count input with explanation', (_label, property, selector, template, emittedProperty) => {
    const onChange = vi.fn()
    setup({
      values: {
        [property]: template,
      },
      onChange,
    })
    const field = container.querySelector(selector) as HTMLElement
    const numeric = field.querySelector('.cortex-numeric-input') as HTMLElement
    const input = field.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(numeric.getAttribute('aria-disabled')).toBe('true')
    expect(numeric.getAttribute('data-tooltip')).toBe('Grid count requires repeat(N, 1fr)')

    input.focus()
    input.value = '5'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(calls(onChange, emittedProperty)).toEqual([])
  })

  // Responsive/complex template tiers removed from UI — simple tier only.
  it.skip('responsive tier: Cols is hidden, MinWidth input shows instead', () => {
    setup({
      values: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      },
    })
    // Cols input not in the DOM when responsive.
    const cols = container.querySelector('.cortex-grid-controls__cols input')
    expect(cols).toBeNull()
    // Min-width input IS in the DOM.
    const minw = container.querySelector(
      '.cortex-grid-controls__minwidth input',
    ) as HTMLInputElement
    expect(minw).not.toBeNull()
    expect(minw.value).toBe('200')
  })

  it.skip('complex tier: read-only raw CSS shown, neither Cols nor MinWidth editable', () => {
    setup({ values: { gridTemplateColumns: '1fr 2fr auto' } })
    expect(container.querySelector('.cortex-grid-controls__cols input')).toBeNull()
    expect(container.querySelector('.cortex-grid-controls__minwidth input')).toBeNull()
    const raw = container.querySelector('.cortex-grid-controls__raw') as HTMLElement
    expect(raw).not.toBeNull()
    expect(raw.textContent).toContain('1fr 2fr auto')
  })

  // ── Simple tier reconstruct emissions ─────────────────────────

  it('simple tier: changing cols from 3 to 5 emits repeat(5, 1fr)', () => {
    const { onChange } = setup({
      values: { gridTemplateColumns: 'repeat(3, 1fr)' },
    })
    const input = container.querySelector(
      '.cortex-grid-controls__cols input',
    ) as HTMLInputElement
    input.focus()
    input.value = '5'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const emissions = calls(onChange, 'grid-template-columns')
    expect(emissions.length).toBeGreaterThanOrEqual(1)
    for (const c of emissions) {
      expect(c).toEqual({
        property: 'grid-template-columns',
        value: 'repeat(5, 1fr)',
      })
    }
  })

  it('simple tier: changing rows from 2 to 4 emits repeat(4, 1fr)', () => {
    const { onChange } = setup({
      values: { gridTemplateRows: 'repeat(2, 1fr)' },
    })
    const input = container.querySelector(
      '.cortex-grid-controls__rows input',
    ) as HTMLInputElement
    input.focus()
    input.value = '4'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const emissions = calls(onChange, 'grid-template-rows')
    expect(emissions.length).toBeGreaterThanOrEqual(1)
    for (const c of emissions) {
      expect(c).toEqual({
        property: 'grid-template-rows',
        value: 'repeat(4, 1fr)',
      })
    }
  })

  // ── Responsive tier reconstruct emissions ─────────────────────

  it.skip('responsive tier: changing min-width from 200 to 240 emits repeat(auto-fit, minmax(240px, 1fr))', () => {
    const { onChange } = setup({
      values: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      },
    })
    const input = container.querySelector(
      '.cortex-grid-controls__minwidth input',
    ) as HTMLInputElement
    input.focus()
    input.value = '240'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const emissions = calls(onChange, 'grid-template-columns')
    expect(emissions.length).toBeGreaterThanOrEqual(1)
    for (const c of emissions) {
      expect(c).toEqual({
        property: 'grid-template-columns',
        value: 'repeat(auto-fit, minmax(240px, 1fr))',
      })
    }
  })

  it.skip('responsive auto-fill: changing min-width preserves the autoMode', () => {
    const { onChange } = setup({
      values: {
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      },
    })
    const input = container.querySelector(
      '.cortex-grid-controls__minwidth input',
    ) as HTMLInputElement
    input.focus()
    input.value = '160'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const emissions = calls(onChange, 'grid-template-columns')
    expect(emissions.length).toBeGreaterThanOrEqual(1)
    for (const c of emissions) {
      expect(c).toEqual({
        property: 'grid-template-columns',
        value: 'repeat(auto-fill, minmax(160px, 1fr))',
      })
    }
  })

  // ── Lockable gap ──────────────────────────────────────────────

  it('gap defaults to locked — single "Gap" input fires BOTH axes', () => {
    const { onChange } = setup({ values: { columnGap: 4, rowGap: 4 } })
    const inputs = container.querySelectorAll('.cortex-grid-controls__gap input')
    expect(inputs.length).toBe(1)
    const input = inputs[0] as HTMLInputElement
    input.focus()
    input.value = '8'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const colGap = calls(onChange, 'column-gap')
    const rowGap = calls(onChange, 'row-gap')
    expect(colGap.length).toBeGreaterThanOrEqual(1)
    expect(rowGap.length).toBeGreaterThanOrEqual(1)
  })

  it('unlocked column-gap input fires ONLY column-gap (not row-gap)', async () => {
    const { onChange } = setup({ values: { columnGap: 4, rowGap: 4 } })
    // Unlock
    const lockBtn = container.querySelector('.cortex-grid-controls__gap .cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.cortex-grid-controls__gap input').length).toBe(2)
    }, { timeout: 500 })
    const inputs = container.querySelectorAll('.cortex-grid-controls__gap input')
    expect(inputs.length).toBe(2)
    const input = inputs[0] as HTMLInputElement
    input.focus()
    input.value = '12'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const colGap = calls(onChange, 'column-gap')
    const rowGap = calls(onChange, 'row-gap')
    expect(colGap.length).toBeGreaterThanOrEqual(1)
    for (const c of colGap) {
      expect(c).toEqual({ property: 'column-gap', value: '12px' })
    }
    expect(rowGap).toEqual([])
  })

  it('unlocked row-gap input fires ONLY row-gap (not column-gap)', async () => {
    const { onChange } = setup({ values: { columnGap: 4, rowGap: 4 } })
    const lockBtn = container.querySelector('.cortex-grid-controls__gap .cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.cortex-grid-controls__gap input').length).toBe(2)
    }, { timeout: 500 })
    const inputs = container.querySelectorAll('.cortex-grid-controls__gap input')
    const input = inputs[1] as HTMLInputElement
    input.focus()
    input.value = '16'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const rowGap = calls(onChange, 'row-gap')
    const colGap = calls(onChange, 'column-gap')
    expect(rowGap.length).toBeGreaterThanOrEqual(1)
    for (const c of rowGap) {
      expect(c).toEqual({ property: 'row-gap', value: '16px' })
    }
    expect(colGap).toEqual([])
  })

  it('unlocked gap shows text prefixes "Cols" and "Rows" (no icons)', async () => {
    setup()
    const lockBtn = container.querySelector('.cortex-grid-controls__gap .cortex-lock-btn') as HTMLButtonElement
    lockBtn.click()
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.cortex-grid-controls__gap input').length).toBe(2)
    }, { timeout: 500 })
    const prefixes = container.querySelectorAll('.cortex-grid-controls__gap .cortex-numeric-input__prefix')
    expect(prefixes.length).toBe(2)
    expect(prefixes[0]!.textContent).toBe('Cols')
    expect(prefixes[1]!.textContent).toBe('Rows')
    // No SVG icons inside gap prefixes
    const svgs = container.querySelectorAll('.cortex-grid-controls__gap .cortex-numeric-input__prefix svg')
    expect(svgs.length).toBe(0)
  })

  // ── X/Y dropdown contract ─────────────────────────────────────

  it('X dropdown has role=combobox and correct ARIA attrs', async () => {
    setup()
    const trigger = getXDropdownTrigger()
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await openXDropdown()
    expect(getXDropdownTrigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('X dropdown Escape closes without firing onChange', async () => {
    const { onChange } = setup()
    await openXDropdown()
    const popover = container.querySelector('.cortex-xy-dropdown__popover')
    expect(popover).not.toBeNull()
    dispatchKeyboardEvent(getXDropdownTrigger(), 'keydown', { key: 'Escape' })
    await vi.waitFor(() => {
      expect(container.querySelector('.cortex-xy-dropdown__popover')).toBeNull()
    }, { timeout: 500 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('X dropdown renders grid-specific Left/Center/Right options (start/center/end values)', async () => {
    setup()
    await openXDropdown()
    const options = Array.from(
      container.querySelectorAll('.cortex-xy-dropdown__option'),
    ) as HTMLElement[]
    // Grid uses `start`/`end`, not `flex-start`/`flex-end`. Confirm the
    // enum values by scraping the option IDs (ID schema is
    // cortex-xy-opt-${value}).
    const ids = options.map((o) => o.id)
    expect(ids).toContain('cortex-xy-opt-start')
    expect(ids).toContain('cortex-xy-opt-center')
    expect(ids).toContain('cortex-xy-opt-end')
    // And the legacy flex literals are NOT present.
    expect(ids).not.toContain('cortex-xy-opt-flex-start')
  })

  it('Y dropdown renders grid-specific Top/Center/Bottom options', async () => {
    setup()
    await openYDropdown()
    const options = Array.from(
      container.querySelectorAll('.cortex-xy-dropdown__option'),
    ) as HTMLElement[]
    const ids = options.map((o) => o.id)
    expect(ids).toContain('cortex-xy-opt-start')
    expect(ids).toContain('cortex-xy-opt-center')
    expect(ids).toContain('cortex-xy-opt-end')
  })
})
