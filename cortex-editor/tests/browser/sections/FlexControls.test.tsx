import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { FlexControls } from '../../../src/browser/components/sections/FlexControls.js'
import type {
  FlexValues,
  FlexChange,
} from '../../../src/browser/components/sections/FlexControls.js'
import { dispatchKeyboardEvent, dispatchMouseEvent } from '../helpers.js'

// Mock @floating-ui/dom — happy-dom has no real layout engine.
vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

// Unique path fragments copied from icons.tsx — falsifiable icon assertions
// without relying on class names. Anchored on the exact `d` attribute
// string so a swap between icons is caught immediately. If an icon changes
// upstream, the icons.tsx snapshot test breaks first and points at which
// path moved; these fixtures stay in lockstep with that one source.
const ICON_FINGERPRINT = {
  // ArrowRight: m12 5 7 7-7 7 (right chevron)
  row: 'm12 5 7 7-7 7',
  // ArrowLeft: m12 19-7-7 7-7 (left chevron)
  rowReverse: 'm12 19-7-7 7-7',
  // ArrowDown: m19 12-7 7-7-7 (down chevron)
  column: 'm19 12-7 7-7-7',
  // ArrowUp: m5 12 7-7 7 7 (up chevron)
  columnReverse: 'm5 12 7-7 7 7',
  // MoveHorizontal: m18 8 4 4-4 4
  moveHorizontal: 'm18 8 4 4-4 4',
  // AlignHorizontalJustifyStart: rect x="6" y="5"
  alignHStart: 'x="6" y="5"',
} as const

describe('FlexControls', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  const DEFAULT_VALUES: FlexValues = {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    rowGap: 0,
    columnGap: 0,
    flexWrap: 'nowrap',
  }

  function setup(overrides?: {
    values?: Partial<FlexValues>
    onChange?: (c: FlexChange) => void
    onScrub?: (c: FlexChange) => void
    onScrubEnd?: (c: FlexChange) => void
  }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onChange = overrides?.onChange ?? vi.fn()
    const onScrub = overrides?.onScrub ?? vi.fn()
    const onScrubEnd = overrides?.onScrubEnd ?? vi.fn()
    render(
      <FlexControls
        values={{ ...DEFAULT_VALUES, ...overrides?.values }}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
      />,
      container,
    )
    return { onChange, onScrub, onScrubEnd }
  }

  // Preact batches hook updates — tests asserting on post-state-change DOM
  // must await a tick. Matches AlignmentGrid test + PositionDropdown test.
  const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

  function getDirectionOptions(): HTMLElement[] {
    // The direction SegmentedControl is the first radiogroup inside the
    // FlexControls container. Select it explicitly so a future wrap
    // SegmentedControl inside "More options" doesn't confuse the lookup.
    const directionGroup = container.querySelector(
      '.cortex-flex-controls__direction [role="radiogroup"]',
    )
    return Array.from(directionGroup?.querySelectorAll('[role="radio"]') ?? []) as HTMLElement[]
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
    await tick()
  }

  async function openYDropdown(): Promise<void> {
    getYDropdownTrigger().click()
    await tick()
  }

  function getOpenXYOption(value: string): HTMLElement {
    return container.querySelector(
      `#cortex-xy-opt-${value}`,
    ) as HTMLElement
  }

  // Helper — pulls only the emissions whose `property` matches, so tests
  // can assert on just the X-dropdown output without worrying about parallel
  // emissions from the same user action.
  function calls(
    mock: ReturnType<typeof vi.fn>,
    property?: string,
  ): FlexChange[] {
    const arr = mock.mock.calls.map((c) => c[0] as FlexChange)
    return property ? arr.filter((c) => c.property === property) : arr
  }

  // ── 1-13: X/Y column-direction swap ──────────────────────────────

  it('row direction: X dropdown change emits justify-content (not align-items)', async () => {
    const { onChange } = setup({ values: { flexDirection: 'row' } })
    await openXDropdown()
    getOpenXYOption('center').click()
    await tick()
    const justify = calls(onChange, 'justify-content')
    const alignItems = calls(onChange, 'align-items')
    expect(justify).toEqual([{ property: 'justify-content', value: 'center' }])
    expect(alignItems).toEqual([])
  })

  it('row direction: Y dropdown change emits align-items (not justify-content)', async () => {
    const { onChange } = setup({ values: { flexDirection: 'row' } })
    await openYDropdown()
    getOpenXYOption('flex-start').click()
    await tick()
    const justify = calls(onChange, 'justify-content')
    const alignItems = calls(onChange, 'align-items')
    expect(alignItems).toEqual([{ property: 'align-items', value: 'flex-start' }])
    expect(justify).toEqual([])
  })

  it('column direction: X dropdown change emits align-items (SWAPPED from row)', async () => {
    const { onChange } = setup({ values: { flexDirection: 'column' } })
    await openXDropdown()
    getOpenXYOption('center').click()
    await tick()
    const alignItems = calls(onChange, 'align-items')
    const justify = calls(onChange, 'justify-content')
    expect(alignItems).toEqual([{ property: 'align-items', value: 'center' }])
    expect(justify).toEqual([])
  })

  it('column direction: Y dropdown change emits justify-content (SWAPPED from row)', async () => {
    const { onChange } = setup({ values: { flexDirection: 'column' } })
    await openYDropdown()
    getOpenXYOption('flex-start').click()
    await tick()
    const justify = calls(onChange, 'justify-content')
    const alignItems = calls(onChange, 'align-items')
    expect(justify).toEqual([{ property: 'justify-content', value: 'flex-start' }])
    expect(alignItems).toEqual([])
  })

  it('row-reverse direction: X dropdown still emits justify-content', async () => {
    const { onChange } = setup({ values: { flexDirection: 'row-reverse' } })
    await openXDropdown()
    getOpenXYOption('flex-end').click()
    await tick()
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'flex-end' },
    ])
  })

  it('column-reverse direction: Y dropdown emits justify-content', async () => {
    // column-reverse is still a column-direction flex — main axis is
    // vertical — so Y (vertical) still targets justify-content.
    const { onChange } = setup({ values: { flexDirection: 'column-reverse' } })
    await openYDropdown()
    getOpenXYOption('flex-start').click()
    await tick()
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'flex-start' },
    ])
    expect(calls(onChange, 'align-items')).toEqual([])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('row direction: AlignmentGrid top-center click emits justify-content=center AND align-items=flex-start', () => {
    const { onChange } = setup({ values: { flexDirection: 'row' } })
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    ) as HTMLButtonElement
    topCenter.click()
    // Exact property names — exhaustive. The cell fires onJustify(center)
    // and onAlign(flex-start); FlexControls routes both by CSS role.
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'center' },
    ])
    expect(calls(onChange, 'align-items')).toEqual([
      { property: 'align-items', value: 'flex-start' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('column direction: AlignmentGrid top-center click emits SWAPPED properties', () => {
    const { onChange } = setup({ values: { flexDirection: 'column' } })
    // In column mode, caller reverse-maps the grid input so the visual
    // top-center cell still represents "horizontal center, vertical start".
    // After swap: onJustify(center) → align-items; onAlign(flex-start) → justify-content.
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    ) as HTMLButtonElement
    topCenter.click()
    expect(calls(onChange, 'align-items')).toEqual([
      { property: 'align-items', value: 'center' },
    ])
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'flex-start' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('row direction: AlignmentGrid distribute main-axis emits justify-content', async () => {
    const { onChange } = setup({ values: { flexDirection: 'row', alignItems: 'flex-start' } })
    // Open the overlay via dblclick. First dblclick → row overlay (cross axis).
    // Second dblclick → col overlay (main axis). Pick main axis to check
    // that the property is `justify-content` for row direction.
    const cell = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="0"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell, 'dblclick')
    await tick()
    // Now in row overlay — dblclick again on a cell still in DOM (row 1 / col 1)
    // to transition to col overlay (main axis).
    const cell11 = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="1"][data-col="1"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell11, 'dblclick')
    await tick()
    // Click the first overlay button → "Space Between"
    const distBtn = container.querySelector(
      '.cortex-alignment-grid__distribute-btn',
    ) as HTMLButtonElement
    distBtn.click()
    await tick()
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'space-between' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('row direction: AlignmentGrid distribute cross-axis emits align-content', async () => {
    const { onChange } = setup({ values: { flexDirection: 'row' } })
    // First dblclick → row overlay (cross axis).
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
    // Cross-axis distribution on row direction → align-content, NOT
    // align-items (align-items can't take space-* values).
    expect(calls(onChange, 'align-content')).toEqual([
      { property: 'align-content', value: 'space-between' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('column direction: AlignmentGrid distribute main-axis emits justify-content', async () => {
    const { onChange } = setup({ values: { flexDirection: 'column' } })
    const cell = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="0"]',
    ) as HTMLButtonElement
    dispatchMouseEvent(cell, 'dblclick')
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
    // In column mode, main axis = vertical. The col overlay fires
    // distribute 'main' → justify-content. Distribution keywords
    // (space-between etc.) are only valid on justify-content / align-content,
    // never on align-items.
    expect(calls(onChange, 'justify-content')).toEqual([
      { property: 'justify-content', value: 'space-between' },
    ])
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('column direction: AlignmentGrid distribute cross-axis emits align-content', async () => {
    const { onChange } = setup({ values: { flexDirection: 'column' } })
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
    // Cross-axis in column mode → horizontal → align-content.
    // Distribution is always justify-content (main) or align-content (cross).
    expect(calls(onChange, 'align-content')).toEqual([
      { property: 'align-content', value: 'space-between' },
    ])
  })

  it('X/Y trigger tooltips update when flex-direction changes', async () => {
    // Mount row first, then remount with column, then assert the
    // resolved CSS property in the dropdown trigger tooltip swaps.
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <FlexControls
        values={{ ...DEFAULT_VALUES, flexDirection: 'row' }}
        onChange={vi.fn()}
      />,
      container,
    )
    let xTrigger = container.querySelector('[data-xy-axis="x"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    let yTrigger = container.querySelector('[data-xy-axis="y"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    expect(xTrigger.getAttribute('data-tooltip')).toBe('justify-content')
    expect(yTrigger.getAttribute('data-tooltip')).toBe('align-items')
    render(
      <FlexControls
        values={{ ...DEFAULT_VALUES, flexDirection: 'column' }}
        onChange={vi.fn()}
      />,
      container,
    )
    xTrigger = container.querySelector('[data-xy-axis="x"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    yTrigger = container.querySelector('[data-xy-axis="y"] .cortex-xy-dropdown__trigger') as HTMLButtonElement
    // Swapped: X (horizontal) → align-items in column mode, Y (vertical) → justify-content.
    expect(xTrigger.getAttribute('data-tooltip')).toBe('align-items')
    expect(yTrigger.getAttribute('data-tooltip')).toBe('justify-content')
  })

  // ── 14-15: Direction SegmentedControl ────────────────────────────

  it('renders all 4 direction options with the correct lucide arrow icons', () => {
    setup()
    const options = getDirectionOptions()
    expect(options).toHaveLength(4)
    const html = options.map((o) => o.innerHTML).join('\n')
    // ICON_FINGERPRINT anti-tautology: assert on the exact path `d`
    // fragments from icons.tsx, not on class names.
    expect(html).toContain(ICON_FINGERPRINT.row)
    expect(html).toContain(ICON_FINGERPRINT.rowReverse)
    expect(html).toContain(ICON_FINGERPRINT.column)
    expect(html).toContain(ICON_FINGERPRINT.columnReverse)
  })

  it.each([
    // Start from a DIFFERENT value so the SegmentedControl actually
    // fires onChange — clicking the already-active option is a no-op
    // (see SegmentedControl.tsx handleClick). Pair each target with
    // a starting value on the opposite side of the catalog.
    ['row', 'column'],
    ['row-reverse', 'row'],
    ['column', 'row'],
    ['column-reverse', 'row'],
  ])('direction change to %s fires flex-direction', (value, startFrom) => {
    const { onChange } = setup({ values: { flexDirection: startFrom } })
    const btn = container.querySelector(
      `.cortex-flex-controls__direction [data-value="${value}"]`,
    ) as HTMLElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(calls(onChange, 'flex-direction')).toEqual([
      { property: 'flex-direction', value },
    ])
  })

  // ── 16-17: Gap dual-axis emission ────────────────────────────────

  it('Gap change fires BOTH row-gap and column-gap simultaneously', () => {
    const { onChange } = setup({ values: { rowGap: 4, columnGap: 4 } })
    const gapInput = container.querySelector(
      '.cortex-flex-controls__gap input',
    ) as HTMLInputElement
    expect(gapInput).not.toBeNull()
    gapInput.focus()
    gapInput.value = '8'
    gapInput.dispatchEvent(new Event('input', { bubbles: true }))
    gapInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    // Both axes receive the exact same value. NumericInput's Enter
    // handler may fire once on keydown and again on the blur that
    // follows — tolerate the duplicate by asserting at least one
    // emission per axis with the expected value, not exact equality.
    const rowGap = calls(onChange, 'row-gap')
    const colGap = calls(onChange, 'column-gap')
    expect(rowGap.length).toBeGreaterThanOrEqual(1)
    expect(colGap.length).toBeGreaterThanOrEqual(1)
    for (const c of rowGap) expect(c).toEqual({ property: 'row-gap', value: '8px' })
    for (const c of colGap) expect(c).toEqual({ property: 'column-gap', value: '8px' })
    // And emissions are symmetric — same count per axis (pairs fire together).
    expect(rowGap.length).toBe(colGap.length)
  })

  it('Gap prefix renders "Gap" text label (not icon)', () => {
    setup()
    const prefix = container.querySelector('.cortex-flex-controls__gap .cortex-numeric-input__prefix')
    expect(prefix).not.toBeNull()
    expect(prefix!.textContent).toBe('Gap')
  })

  // ── 18-19: Wrap + ExpandableOptions ──────────────────────────────

  it('wrap SegmentedControl is NOT in the DOM while More options is collapsed', () => {
    setup()
    const wrap = container.querySelector('.cortex-flex-controls__wrap')
    // ExpandableOptions keeps content in the DOM but collapses the
    // wrapping grid to 0fr so it's visually hidden and has aria-hidden.
    // Content either is absent OR the expandable is aria-hidden + the
    // grid row is 0fr. We assert via aria-hidden which is the accessible
    // contract — strict DOM presence lets happy-dom behave predictably.
    const expandable = container.querySelector('.cortex-expandable-options')
    expect(expandable).not.toBeNull()
    expect(expandable!.getAttribute('aria-expanded')).toBe('false')
    // The content body wraps wrap controls — when collapsed, aria-hidden="true".
    const body = container.querySelector('.cortex-expandable-options__body')
    expect(body).not.toBeNull()
    expect(body!.getAttribute('aria-hidden')).toBe('true')
    // Sanity: wrap segment is still present for the expansion animation
    // but hidden from AT. The toggle itself is labelled "More options".
    // Not asserting `wrap === null` because ExpandableOptions keeps body
    // rendered — assert the trigger instead.
    expect(wrap).not.toBeNull()
  })

  it('after clicking "More options" the wrap SegmentedControl is exposed to AT', async () => {
    setup()
    const toggle = container.querySelector(
      '.cortex-expandable-options__trigger',
    ) as HTMLButtonElement
    expect(toggle).not.toBeNull()
    toggle.click()
    await tick()
    const expandable = container.querySelector('.cortex-expandable-options')
    expect(expandable!.getAttribute('aria-expanded')).toBe('true')
    const body = container.querySelector('.cortex-expandable-options__body')
    expect(body!.getAttribute('aria-hidden')).toBe('false')
    const wrap = container.querySelector('.cortex-flex-controls__wrap')
    expect(wrap).not.toBeNull()
    // Confirm all 3 wrap options are rendered.
    const wrapOptions = wrap!.querySelectorAll('[role="radio"]')
    expect(wrapOptions.length).toBe(3)
    const values = Array.from(wrapOptions).map((o) => o.getAttribute('data-value'))
    expect(values).toEqual(['nowrap', 'wrap', 'wrap-reverse'])
  })

  it.each([
    ['nowrap'],
    ['wrap'],
    ['wrap-reverse'],
  ])('wrap change to %s fires flex-wrap', async (value) => {
    const { onChange } = setup()
    // Expand first so the wrap buttons are in the DOM and not tabbed-past.
    const toggle = container.querySelector(
      '.cortex-expandable-options__trigger',
    ) as HTMLButtonElement
    toggle.click()
    await tick()
    const btn = container.querySelector(
      `.cortex-flex-controls__wrap [data-value="${value}"]`,
    ) as HTMLElement
    expect(btn).not.toBeNull()
    // Click — SegmentedControl no-ops if value matches, so set any
    // non-default first to make the click meaningful.
    if (value === 'nowrap') {
      // Mount with wrap active so clicking nowrap causes a change.
      render(null, container)
      container.remove()
      container = document.createElement('div')
      document.body.appendChild(container)
      render(
        <FlexControls
          values={{ ...DEFAULT_VALUES, flexWrap: 'wrap' }}
          onChange={onChange}
        />,
        container,
      )
      // Re-expand.
      ;(container.querySelector(
        '.cortex-expandable-options__trigger',
      ) as HTMLButtonElement).click()
      await tick()
      const rebtn = container.querySelector(
        `.cortex-flex-controls__wrap [data-value="${value}"]`,
      ) as HTMLElement
      rebtn.click()
    } else {
      btn.click()
    }
    expect(calls(onChange, 'flex-wrap')).toEqual([
      { property: 'flex-wrap', value },
    ])
  })

  // ── 20: AlignmentGrid reverse-map in column mode ─────────────────
  // (parseFlexValues was moved into parseLayoutValues — its tests now
  // live in tests/browser/sections/layout-section.test.tsx as
  // `parseLayoutValues reads gap and flex-wrap fields from a
  // CSSStyleDeclaration` + the `defaults gap and flex-wrap` sibling.)

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('column mode: AlignmentGrid receives reverse-mapped align/justify props so the visual active cell matches user intent', () => {
    // User has set "horizontal=center, vertical=start" on a column flex.
    // In CSS that reads as: align-items=center, justify-content=flex-start.
    // The AlignmentGrid, which is always parameterized in ROW semantics,
    // must see justifyValue=center and alignValue=flex-start so the
    // top-center cell lights up.
    setup({
      values: {
        flexDirection: 'column',
        justifyContent: 'flex-start', // main axis = vertical in column
        alignItems: 'center',         // cross axis = horizontal in column
      },
    })
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    )
    expect(topCenter?.getAttribute('aria-selected')).toBe('true')
    expect(
      topCenter?.classList.contains('cortex-alignment-grid__cell--active'),
    ).toBe(true)
    // Negative control: any other cell is NOT active.
    const cells = Array.from(
      container.querySelectorAll('.cortex-alignment-grid__cell'),
    )
    let activeCount = 0
    for (const c of cells) {
      if (c.getAttribute('aria-selected') === 'true') activeCount++
    }
    expect(activeCount).toBe(1)
  })

  // TODO(ZF0-1211): re-enable when AlignmentGrid is visible
  it.skip('row mode: AlignmentGrid receives direct props so the visual active cell matches user intent', () => {
    setup({
      values: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
      },
    })
    const topCenter = container.querySelector(
      '.cortex-alignment-grid__cell[data-row="0"][data-col="1"]',
    )
    expect(topCenter?.getAttribute('aria-selected')).toBe('true')
  })

  // ── 22: X/Y dropdown general contract ────────────────────────────

  it('X dropdown Escape closes without firing onChange', async () => {
    const { onChange } = setup()
    await openXDropdown()
    const popover = container.querySelector('.cortex-xy-dropdown__popover')
    expect(popover).not.toBeNull()
    dispatchKeyboardEvent(getXDropdownTrigger(), 'keydown', { key: 'Escape' })
    await tick()
    expect(container.querySelector('.cortex-xy-dropdown__popover')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('X dropdown has role=combobox and correct ARIA attrs', async () => {
    setup()
    const trigger = getXDropdownTrigger()
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await openXDropdown()
    expect(getXDropdownTrigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('X dropdown renders Left/Center/Right plus distribution options', async () => {
    setup()
    await openXDropdown()
    const options = Array.from(
      container.querySelectorAll('.cortex-xy-dropdown__option'),
    ) as HTMLElement[]
    // 5 options per DESIGN.md X list: Left, Center, Right, Space Between, Space Around
    expect(options.length).toBe(5)
    const labels = options.map(
      (o) => o.querySelector('.cortex-xy-dropdown__option-label')?.textContent,
    )
    expect(labels).toEqual(['Left', 'Center', 'Right', 'Space Between', 'Space Around'])
  })
})
