import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { AlignmentGrid } from '../../../src/browser/components/controls/AlignmentGrid.js'
import { dispatchMouseEvent } from '../helpers.js'

/**
 * AlignmentGrid tests.
 *
 * The tests follow CLAUDE.md's Test Anti-Patterns rules:
 *  - falsifiable assertions (exact callback arguments, not toBeDefined)
 *  - no shadow copies (we never reimplement the cell mapping)
 *  - active-state checks assert BOTH aria-selected and class
 *  - negative controls on every state test
 *  - distribution tests assert exact axis + value pair
 *
 * The disambiguation state machine is a test-pinnable contract:
 *   first dblclick  → row overlay
 *   dblclick while
 *   in row overlay  → column overlay
 *   dblclick while
 *   in col overlay  → row overlay (back to start)
 * A failing test here would indicate a UX regression, not just an
 * implementation change — lock it down.
 */
describe('AlignmentGrid', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(overrides?: Partial<Parameters<typeof AlignmentGrid>[0]>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onJustify = vi.fn()
    const onAlign = vi.fn()
    const onDistribute = vi.fn()
    render(
      <AlignmentGrid
        justifyValue="flex-start"
        alignValue="flex-start"
        onJustify={onJustify}
        onAlign={onAlign}
        onDistribute={onDistribute}
        {...overrides}
      />,
      container,
    )
    return { onJustify, onAlign, onDistribute }
  }

  function getGrid(): HTMLElement {
    return container.querySelector('.cortex-alignment-grid') as HTMLElement
  }

  function getCells(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll('.cortex-alignment-grid__cell'),
    ) as HTMLButtonElement[]
  }

  function getCell(row: number, col: number): HTMLButtonElement {
    return container.querySelector(
      `.cortex-alignment-grid__cell[data-row="${row}"][data-col="${col}"]`,
    ) as HTMLButtonElement
  }

  function getOverlay(): HTMLElement | null {
    return container.querySelector('.cortex-alignment-grid__overlay')
  }

  function getDistributeButtons(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll('.cortex-alignment-grid__distribute-btn'),
    ) as HTMLButtonElement[]
  }

  function dblclick(el: Element): void {
    dispatchMouseEvent(el, 'dblclick')
  }

  // ── render ────────────────────────────────────────────────────────

  it('renders exactly 9 cells', () => {
    setup()
    expect(getCells().length).toBe(9)
  })

  it('every cell has role="gridcell"', () => {
    setup()
    for (const cell of getCells()) {
      expect(cell.getAttribute('role')).toBe('gridcell')
    }
  })

  it('grid container has role="grid" and the default aria-label', () => {
    setup()
    const grid = getGrid()
    expect(grid).not.toBeNull()
    expect(grid.getAttribute('role')).toBe('grid')
    expect(grid.getAttribute('aria-label')).toBe('Alignment grid')
  })

  it('grid container uses a caller-supplied aria-label when provided', () => {
    setup({ label: 'Flex alignment' })
    expect(getGrid().getAttribute('aria-label')).toBe('Flex alignment')
  })

  it('every cell has a distinct position aria-label', () => {
    setup()
    const labels = getCells().map((c) => c.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Top left',
      'Top center',
      'Top right',
      'Center left',
      'Center',
      'Center right',
      'Bottom left',
      'Bottom center',
      'Bottom right',
    ])
  })

  // ── click → position ──────────────────────────────────────────────

  it('clicking the top-left cell fires onJustify(flex-start) AND onAlign(flex-start)', () => {
    const { onJustify, onAlign, onDistribute } = setup({
      justifyValue: 'center',
      alignValue: 'center',
    })
    getCell(0, 0).click()
    expect(onJustify).toHaveBeenCalledTimes(1)
    expect(onJustify).toHaveBeenCalledWith('flex-start')
    expect(onAlign).toHaveBeenCalledTimes(1)
    expect(onAlign).toHaveBeenCalledWith('flex-start')
    // Single click never fires distribution — this guards against
    // callback cross-talk if the click-vs-dblclick handlers were ever
    // merged into the same event.
    expect(onDistribute).not.toHaveBeenCalled()
  })

  it('clicking the center cell fires onJustify(center) AND onAlign(center)', () => {
    const { onJustify, onAlign } = setup()
    getCell(1, 1).click()
    expect(onJustify).toHaveBeenCalledWith('center')
    expect(onAlign).toHaveBeenCalledWith('center')
  })

  it('clicking the bottom-right cell fires onJustify(flex-end) AND onAlign(flex-end)', () => {
    const { onJustify, onAlign } = setup()
    getCell(2, 2).click()
    expect(onJustify).toHaveBeenCalledWith('flex-end')
    expect(onAlign).toHaveBeenCalledWith('flex-end')
  })

  it('clicking a middle-column / top-row cell fires the correct cross mapping', () => {
    // Regression guard against a row↔column swap: (row 0, col 1) must
    // fire onAlign=flex-start and onJustify=center, NOT the reverse.
    const { onJustify, onAlign } = setup()
    getCell(0, 1).click()
    expect(onJustify).toHaveBeenCalledWith('center')
    expect(onAlign).toHaveBeenCalledWith('flex-start')
  })

  // ── active state ──────────────────────────────────────────────────

  it('center cell is active when alignValue=center AND justifyValue=center', () => {
    setup({ justifyValue: 'center', alignValue: 'center' })
    const center = getCell(1, 1)
    expect(center.getAttribute('aria-selected')).toBe('true')
    expect(center.classList.contains('cortex-alignment-grid__cell--active')).toBe(true)
    // Negative control: no other cell is active.
    for (const cell of getCells()) {
      if (cell === center) continue
      expect(cell.getAttribute('aria-selected')).toBe('false')
      expect(cell.classList.contains('cortex-alignment-grid__cell--active')).toBe(false)
    }
  })

  it('non-canonical alignValue (stretch) replaces the column with a span indicator', () => {
    // stretch is a span value — the 3 cells in the column determined by
    // justifyValue (center → col 1) are replaced by a span element with
    // 3 vertical bars. The remaining 6 cells are inactive.
    setup({ justifyValue: 'center', alignValue: 'stretch' })
    const cells = getCells()
    expect(cells.length).toBe(6)
    // No remaining cell is active — the span owns the visual indicator.
    for (const cell of cells) {
      expect(cell.getAttribute('aria-selected')).toBe('false')
      expect(cell.classList.contains('cortex-alignment-grid__cell--active')).toBe(false)
    }
    // Span element is rendered.
    const span = container.querySelector('.cortex-alignment-grid__span--col')
    expect(span).not.toBeNull()
    const bars = span!.querySelectorAll('.cortex-alignment-grid__span-bar')
    expect(bars.length).toBe(3)
  })

  it('non-canonical justifyValue (space-between) replaces the row with a span indicator', () => {
    // space-between is a distribution value — the 3 cells in the row
    // determined by alignValue (center → row 1) are replaced by a span
    // element with 3 bars. The remaining 6 cells are inactive.
    setup({ justifyValue: 'space-between', alignValue: 'center' })
    const cells = getCells()
    expect(cells.length).toBe(6)
    for (const cell of cells) {
      expect(cell.getAttribute('aria-selected')).toBe('false')
    }
    // Span element is rendered.
    const span = container.querySelector('.cortex-alignment-grid__span--row')
    expect(span).not.toBeNull()
    const bars = span!.querySelectorAll('.cortex-alignment-grid__span-bar')
    expect(bars.length).toBe(3)
  })

  // ── dblclick → overlay ────────────────────────────────────────────

  it('double-clicking opens a row overlay covering the target row', async () => {
    setup()
    expect(getOverlay()).toBeNull()
    dblclick(getCell(0, 1))
    await vi.waitFor(() => {
      const overlay = getOverlay()
      expect(overlay).not.toBeNull()
      expect(overlay!.classList.contains('cortex-alignment-grid__overlay--row')).toBe(true)
      // The row's 3 cells (row=0) must be removed from the DOM — the
      // overlay takes their place. This is the "replaces" contract.
      expect(getCell(0, 0)).toBeNull()
      expect(getCell(0, 1)).toBeNull()
      expect(getCell(0, 2)).toBeNull()
      // The remaining 6 cells (rows 1 and 2) are still rendered.
      expect(getCells().length).toBe(6)
      expect(getCell(1, 0)).not.toBeNull()
      expect(getCell(2, 2)).not.toBeNull()
    }, { timeout: 500 })
  })

  it('row overlay renders exactly 3 distribution buttons with the canonical labels', async () => {
    setup()
    dblclick(getCell(0, 0))
    await vi.waitFor(() => {
      const buttons = getDistributeButtons()
      expect(buttons.length).toBe(3)
      expect(buttons.map((b) => b.textContent)).toEqual([
        'Space Between',
        'Space Around',
        'Space Evenly',
      ])
      // Each button carries a falsifiable aria-label including the axis
      // so screen readers disambiguate main vs cross.
      expect(buttons[0]?.getAttribute('aria-label')).toBe('Space Between cross axis')
      expect(buttons[1]?.getAttribute('aria-label')).toBe('Space Around cross axis')
      expect(buttons[2]?.getAttribute('aria-label')).toBe('Space Evenly cross axis')
    }, { timeout: 500 })
  })

  it('clicking a row-overlay distribution button fires onDistribute(cross, value) and dismisses the overlay', async () => {
    const { onDistribute } = setup()
    dblclick(getCell(0, 1))
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    const buttons = getDistributeButtons()
    // Click "Space Between" — index 0
    buttons[0]!.click()
    await vi.waitFor(() => {
      expect(onDistribute).toHaveBeenCalledTimes(1)
      expect(onDistribute).toHaveBeenCalledWith('cross', 'space-between')
      // Overlay dismissed — full 9-cell grid restored.
      expect(getOverlay()).toBeNull()
      expect(getCells().length).toBe(9)
    }, { timeout: 500 })
  })

  it('a second dblclick while a row overlay is open transitions to a column overlay', async () => {
    setup()
    // Open row overlay first.
    dblclick(getCell(0, 1))
    await vi.waitFor(() => {
      expect(getOverlay()?.classList.contains('cortex-alignment-grid__overlay--row')).toBe(true)
    }, { timeout: 500 })
    // Second dblclick on a cell that's still in the DOM (rows 1 or 2)
    // — the column index is what drives the col overlay. Pick (2, 2)
    // so the expected column is 2.
    dblclick(getCell(2, 2))
    await vi.waitFor(() => {
      const secondOverlay = getOverlay()
      expect(secondOverlay).not.toBeNull()
      expect(secondOverlay!.classList.contains('cortex-alignment-grid__overlay--col')).toBe(true)
      // Column 2 is now covered → its 3 cells (0,2), (1,2), (2,2) are gone.
      expect(getCell(0, 2)).toBeNull()
      expect(getCell(1, 2)).toBeNull()
      expect(getCell(2, 2)).toBeNull()
      // Cells in columns 0 and 1 remain.
      expect(getCell(0, 0)).not.toBeNull()
      expect(getCell(1, 1)).not.toBeNull()
    }, { timeout: 500 })
  })

  it('clicking a column-overlay distribution button fires onDistribute(main, value)', async () => {
    const { onDistribute } = setup()
    dblclick(getCell(0, 2)) // open row overlay
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    dblclick(getCell(2, 0)) // transition to column overlay (col 0)
    await vi.waitFor(() => {
      expect(getOverlay()?.classList.contains('cortex-alignment-grid__overlay--col')).toBe(true)
    }, { timeout: 500 })
    const buttons = getDistributeButtons()
    expect(buttons.length).toBe(3)
    // Click "Space Evenly" — index 2.
    buttons[2]!.click()
    await vi.waitFor(() => {
      expect(onDistribute).toHaveBeenCalledTimes(1)
      expect(onDistribute).toHaveBeenCalledWith('main', 'space-evenly')
      expect(getOverlay()).toBeNull()
    }, { timeout: 500 })
  })

  it('a third dblclick after a col overlay cycles back to a row overlay', async () => {
    setup()
    dblclick(getCell(0, 0)) // row overlay
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    dblclick(getCell(1, 1)) // col overlay
    await vi.waitFor(() => {
      expect(getOverlay()?.classList.contains('cortex-alignment-grid__overlay--col')).toBe(true)
    }, { timeout: 500 })
    dblclick(getCell(2, 2)) // back to row overlay
    await vi.waitFor(() => {
      const overlay = getOverlay()
      expect(overlay).not.toBeNull()
      expect(overlay!.classList.contains('cortex-alignment-grid__overlay--row')).toBe(true)
    }, { timeout: 500 })
  })

  // ── outside-click dismissal ───────────────────────────────────────

  it('clicking outside the grid dismisses an open overlay WITHOUT firing onDistribute', async () => {
    const { onDistribute } = setup()
    dblclick(getCell(0, 1))
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    // Dispatch a mousedown on document.body (outside the grid).
    dispatchMouseEvent(document.body, 'mousedown')
    await vi.waitFor(() => {
      expect(getOverlay()).toBeNull()
      expect(onDistribute).not.toHaveBeenCalled()
      // Grid restored to 9 cells.
      expect(getCells().length).toBe(9)
    }, { timeout: 500 })
  })

  // ── optional onDistribute ─────────────────────────────────────────

  it('onDistribute is optional: dblclick opens overlay, clicking a button is a no-op (no throw)', async () => {
    // Omit onDistribute entirely. The overlay should still open, and
    // clicking a button should not throw — the callback is optional.
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <AlignmentGrid
        justifyValue="flex-start"
        alignValue="flex-start"
        onJustify={vi.fn()}
        onAlign={vi.fn()}
      />,
      container,
    )
    dblclick(getCell(0, 0))
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    const buttons = getDistributeButtons()
    expect(buttons.length).toBe(3)
    // This must not throw even though onDistribute is undefined.
    expect(() => buttons[0]!.click()).not.toThrow()
    // And the overlay still dismisses after the click.
    await vi.waitFor(() => {
      expect(getOverlay()).toBeNull()
    }, { timeout: 500 })
  })

  // ── click-vs-dblclick isolation ───────────────────────────────────

  it('single click while an overlay is open does NOT fire position callbacks', async () => {
    // Regression guard: once the overlay is open, the row cells are
    // removed from the DOM — but the remaining cells are still in the
    // document. Clicking one of them must not accidentally pivot the
    // overlay via a stray onJustify/onAlign fire.
    const { onJustify, onAlign, onDistribute } = setup()
    dblclick(getCell(0, 0)) // row 0 overlay
    await vi.waitFor(() => {
      expect(getOverlay()).not.toBeNull()
    }, { timeout: 500 })
    onJustify.mockClear()
    onAlign.mockClear()
    // Click a cell in row 1 (still in DOM) — this IS currently handled
    // by handleCellClick's overlay guard. The overlay shouldn't forward
    // the click as a distribution selection either.
    getCell(1, 1).click()
    await vi.waitFor(() => {
      expect(onJustify).not.toHaveBeenCalled()
      expect(onAlign).not.toHaveBeenCalled()
      expect(onDistribute).not.toHaveBeenCalled()
    }, { timeout: 500 })
  })

  it('native dblclick sequence (click+click+dblclick) fires position callbacks exactly once', async () => {
    // Browsers deliver `click, click, dblclick` on a physical double-
    // click. Without event.detail guarding, both clicks would fire
    // onJustify + onAlign, producing two spurious position updates per
    // dblclick. handleCellClick skips `detail > 1` so only the first
    // click (detail=1) runs its callbacks.
    const { onJustify, onAlign } = setup()
    const cell = getCell(2, 2)
    dispatchMouseEvent(cell, 'click', { detail: 1 })
    dispatchMouseEvent(cell, 'click', { detail: 2 })
    dispatchMouseEvent(cell, 'dblclick')
    await vi.waitFor(() => {
      // Exactly one fire, not two. The first click sets the position;
      // the dblclick opens the overlay on top of that state.
      expect(onJustify).toHaveBeenCalledTimes(1)
      expect(onJustify).toHaveBeenCalledWith('flex-end')
      expect(onAlign).toHaveBeenCalledTimes(1)
      expect(onAlign).toHaveBeenCalledWith('flex-end')
      // And the overlay is open (row overlay, since it's the first dblclick).
      const overlay = getOverlay()
      expect(overlay).not.toBeNull()
      expect(overlay!.classList.contains('cortex-alignment-grid__overlay--row')).toBe(true)
    }, { timeout: 500 })
  })
})
