/**
 * A 3×3 grid of dot cells for picking a flex/grid alignment combination.
 * Click sets a position (main + cross axis alignment); double-click swaps
 * the clicked row (or column) for a temporary 3-button overlay that lets
 * the user pick a DISTRIBUTION value (`space-between`/`space-around`/
 * `space-evenly`) on that axis.
 *
 * Cell → onJustify/onAlign mapping (CSS roles, not screen coordinates):
 *
 *   Row 0 (top):    align='flex-start',  justify={flex-start|center|flex-end}
 *   Row 1 (center): align='center',      justify={flex-start|center|flex-end}
 *   Row 2 (bottom): align='flex-end',    justify={flex-start|center|flex-end}
 *
 * CSS role decoupling: callbacks fire by CSS role — `onJustify` owns main-
 * axis alignment, `onAlign` owns cross-axis. The grid is entirely unaware
 * of `flex-direction`; callers handle column-direction remapping so the
 * component drops cleanly into both flex and grid contexts.
 *
 * Disambiguation (test-pinnable deterministic behavior, not UX axis
 * inference):
 *   - First dblclick     → row overlay (cross-axis distribution)
 *   - Dblclick while in
 *     row overlay state  → column overlay (main-axis distribution)
 *   - Dblclick while in
 *     column overlay     → row overlay again
 *   - Click on overlay
 *     button             → fires onDistribute and dismisses
 *   - Click outside grid → dismisses without firing onDistribute
 *
 * Active cell detection: a cell is active iff `alignValue === alignForRow
 * && justifyValue === justifyForCol`. Non-canonical values (`stretch`,
 * `baseline`) leave the entire grid inactive — the caller falls back to
 * the X/Y dropdowns for those edge cases.
 *
 * No animation: DESIGN.md motion rules specify conditional controls mount
 * instantly. The overlay swap is plain show/hide, no transition.
 */
import type { JSX } from 'preact'
import { useState, useRef, useEffect, useCallback } from 'preact/hooks'

// CSS literals — never screen-coordinate strings. The 3 values for each
// axis are fixed by the spec; changing them means shipping a new control.
const ALIGN_VALUES = ['flex-start', 'center', 'flex-end'] as const
const JUSTIFY_VALUES = ['flex-start', 'center', 'flex-end'] as const

type AlignValue = (typeof ALIGN_VALUES)[number]
type JustifyValue = (typeof JUSTIFY_VALUES)[number]

interface DistributeOption {
  value: 'space-between' | 'space-around' | 'space-evenly'
  label: string
}

// Order mirrors the DESIGN.md catalog: between → around → evenly.
const DISTRIBUTE_OPTIONS: readonly DistributeOption[] = [
  { value: 'space-between', label: 'Space Between' },
  { value: 'space-around', label: 'Space Around' },
  { value: 'space-evenly', label: 'Space Evenly' },
] as const

// 3×3 accessible name lookup. Row index = align (top/center/bottom),
// column index = justify (left/center/right). The strings ride on
// aria-label so screen readers announce the position, not the coordinates.
const CELL_LABELS: readonly (readonly string[])[] = [
  ['Top left', 'Top center', 'Top right'],
  ['Center left', 'Center', 'Center right'],
  ['Bottom left', 'Bottom center', 'Bottom right'],
] as const

function alignForRow(row: number): AlignValue {
  return ALIGN_VALUES[row] ?? 'flex-start'
}

function justifyForCol(col: number): JustifyValue {
  return JUSTIFY_VALUES[col] ?? 'flex-start'
}

function cellLabel(row: number, col: number): string {
  return CELL_LABELS[row]?.[col] ?? 'Alignment cell'
}

export interface AlignmentGridProps {
  /** Current `justify-content` value (main axis). Used for active detection. */
  justifyValue: string
  /** Current `align-items` value (cross axis). Used for active detection. */
  alignValue: string
  /** Main-axis callback — fired on cell click. Always a CSS literal. */
  onJustify: (value: string) => void
  /** Cross-axis callback — fired on cell click. Always a CSS literal. */
  onAlign: (value: string) => void
  /**
   * Optional distribution callback. Fired when the user double-clicks a
   * cell and then picks a distribution option from the overlay. The
   * first argument identifies the axis ('main' on column overlay,
   * 'cross' on row overlay) so callers can route the CSS value to the
   * correct property (justify-content vs align-content/align-items).
   * Omit this prop if your caller doesn't support distribution — the
   * overlay still opens on dblclick but selecting an option is a no-op.
   */
  onDistribute?: (axis: 'main' | 'cross', value: string) => void
  /** Optional aria-label override for the grid container. */
  label?: string
}

interface OverlayState {
  axis: 'row' | 'col'
  index: number
}

/**
 * Returns true when the given row/column's CSS-role values match the
 * currently-applied alignment. Non-canonical values ('stretch',
 * 'baseline', 'start', 'end', etc.) never match any of the 9 cells,
 * leaving the grid silently inactive — that's intentional fallback
 * behavior documented in the plan.
 */
function isCellActive(
  row: number,
  col: number,
  alignValue: string,
  justifyValue: string,
): boolean {
  return alignValue === alignForRow(row) && justifyValue === justifyForCol(col)
}

export function AlignmentGrid({
  justifyValue,
  alignValue,
  onJustify,
  onAlign,
  onDistribute,
  label = 'Alignment grid',
}: AlignmentGridProps): JSX.Element {
  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Outside-click dismissal — attach a document listener only while the
  // overlay is open. The listener is intentionally registered on the
  // capture phase of `mousedown` so it fires BEFORE the cell's click
  // handler. happy-dom doesn't route Shadow DOM composed events
  // perfectly, so we fall back to comparing against event.target via the
  // grid ref, which works in both real browsers and happy-dom.
  useEffect(() => {
    if (!overlay) return
    const handler = (ev: MouseEvent) => {
      const target = ev.target as Node | null
      if (gridRef.current && target && gridRef.current.contains(target)) return
      setOverlay(null)
    }
    document.addEventListener('mousedown', handler, true)
    return () => {
      document.removeEventListener('mousedown', handler, true)
    }
  }, [overlay])

  const handleCellClick = useCallback(
    (event: MouseEvent, row: number, col: number) => {
      // Single-click never opens the overlay and never runs while the
      // overlay is already open — the overlay owns input during its
      // lifetime (cells are not rendered, so this is structurally enforced
      // too; the guard is defensive against a future refactor).
      if (overlay) return
      // Native dblclick delivers `click, click, dblclick` on the same
      // element. The second click has `event.detail === 2`, so skipping
      // detail > 1 suppresses the spurious second position fire while
      // still letting the dblclick handler open the overlay.
      if (event.detail > 1) return
      onJustify(justifyForCol(col))
      onAlign(alignForRow(row))
    },
    [overlay, onJustify, onAlign],
  )

  const handleCellDblClick = useCallback(
    (row: number, col: number) => {
      // Deterministic state machine — see component doc-comment.
      setOverlay((prev) => {
        if (prev === null) return { axis: 'row', index: row }
        if (prev.axis === 'row') return { axis: 'col', index: col }
        return { axis: 'row', index: row }
      })
    },
    [],
  )

  const handleDistributeClick = useCallback(
    (value: DistributeOption['value']) => {
      if (!overlay) return
      const axis: 'main' | 'cross' = overlay.axis === 'row' ? 'cross' : 'main'
      onDistribute?.(axis, value)
      setOverlay(null)
    },
    [overlay, onDistribute],
  )

  // Render helpers — keeping the JSX inline would push past the 80-col
  // comfort line for the cell loop, and the distinct row/col overlay
  // branches read clearer as small sub-renders.
  function renderCell(row: number, col: number): JSX.Element {
    const active = isCellActive(row, col, alignValue, justifyValue)
    const classes = [
      'cortex-alignment-grid__cell',
      active && 'cortex-alignment-grid__cell--active',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <button
        key={`cell-${row}-${col}`}
        type="button"
        class={classes}
        role="gridcell"
        aria-label={cellLabel(row, col)}
        aria-selected={active ? 'true' : 'false'}
        onClick={(event) => handleCellClick(event, row, col)}
        onDblClick={() => handleCellDblClick(row, col)}
        data-row={row}
        data-col={col}
      >
        <span class="cortex-alignment-grid__cell__dot" aria-hidden="true" />
      </button>
    )
  }

  function renderOverlayButton(
    opt: DistributeOption,
    axis: 'row' | 'col',
  ): JSX.Element {
    const ariaAxis = axis === 'row' ? 'cross axis' : 'main axis'
    return (
      <button
        key={`dist-${axis}-${opt.value}`}
        type="button"
        class="cortex-alignment-grid__distribute-btn"
        aria-label={`${opt.label} ${ariaAxis}`}
        onClick={() => handleDistributeClick(opt.value)}
      >
        {opt.label}
      </button>
    )
  }

  // Build the 9 cells once per render so we can omit the overlaid row/col
  // cheaply. The overlay element is positioned via `grid-column: 1 / -1`
  // or `grid-row: 1 / -1` so it occupies the exact footprint of the
  // replaced cells — no measurement, no absolute positioning.
  const cells: JSX.Element[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Skip cells that are currently covered by the overlay — the overlay
      // button-row takes their grid slots via grid-column/grid-row span.
      if (overlay) {
        if (overlay.axis === 'row' && row === overlay.index) continue
        if (overlay.axis === 'col' && col === overlay.index) continue
      }
      cells.push(renderCell(row, col))
    }
  }

  return (
    <div
      ref={gridRef}
      class="cortex-alignment-grid"
      role="grid"
      aria-label={label}
    >
      {cells}
      {overlay?.axis === 'row' && (
        <div
          class="cortex-alignment-grid__overlay cortex-alignment-grid__overlay--row"
          role="group"
          aria-label="Cross-axis distribution"
          // Grid indices are 1-based; span all 3 columns of the target row.
          // Inline styles (not CSS classes) are used because the row/column
          // index is dynamic — there's no stable set of modifiers to
          // precompile, and 3 rows × 2 axes × 3 values = too many to enumerate.
          style={{
            gridRow: `${overlay.index + 1} / ${overlay.index + 2}`,
            gridColumn: '1 / -1',
          }}
        >
          {DISTRIBUTE_OPTIONS.map((opt) => renderOverlayButton(opt, 'row'))}
        </div>
      )}
      {overlay?.axis === 'col' && (
        <div
          class="cortex-alignment-grid__overlay cortex-alignment-grid__overlay--col"
          role="group"
          aria-label="Main-axis distribution"
          style={{
            gridColumn: `${overlay.index + 1} / ${overlay.index + 2}`,
            gridRow: '1 / -1',
          }}
        >
          {DISTRIBUTE_OPTIONS.map((opt) => renderOverlayButton(opt, 'col'))}
        </div>
      )}
    </div>
  )
}
