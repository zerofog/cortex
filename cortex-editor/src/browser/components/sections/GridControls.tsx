/**
 * GridControls — Panel v2 Task 9 (ZF0-1187)
 *
 * Complete grid sub-panel composed from six sub-controls:
 *   1. Three-tier template parser/editor (cols/rows count OR min-width)
 *   2. Direction SegmentedControl (grid-auto-flow: row | column)
 *   3. AlignmentGrid — 3x3 click+dblclick picker (shared Task 7 control)
 *   4. X dropdown — justify-items catalog (start/center/end/stretch)
 *   5. Y dropdown — align-items catalog (start/center/end/stretch/baseline)
 *   6. Dual gap — two NumericInputs (column-gap + row-gap, NOT linked)
 *
 * =======================================================================
 * Grid axis mapping is INVARIANT under grid-auto-flow (unlike flex)
 * =======================================================================
 * The X dropdown always writes `justify-items` and the Y dropdown always
 * writes `align-items`, regardless of whether `grid-auto-flow` is `row`
 * or `column`. Unlike flex, where `flex-direction: column` swaps the
 * main/cross axis semantics, grid's item-alignment props are always
 * tied to the inline / block axes — `justify-items` is inline-axis,
 * `align-items` is block-axis — and these axes are fixed by the writing
 * mode, not the auto-flow direction.
 *
 * AlignmentGrid routing:
 *   - onJustify(v)      => `justify-items`    (per-item inline-axis alignment)
 *   - onAlign(v)        => `align-items`      (per-item block-axis alignment)
 *   - onDistribute('main', v) => `justify-content` (track distribution, inline axis)
 *   - onDistribute('cross', v)=> `align-content`   (track distribution, block axis)
 *
 * The split matters: the AlignmentGrid's 9-cell click targets
 * `justify-items` / `align-items` because those control per-item
 * alignment. Distribution values (space-between / space-around /
 * space-evenly) target `justify-content` / `align-content` because
 * those are track-distribution properties — individual items can't
 * take "space-between" values.
 *
 * =======================================================================
 * Three-tier template parser (parseGridTemplate)
 * =======================================================================
 * grid-template-columns / grid-template-rows is one of:
 *   - Simple:     `repeat(N, 1fr)`                        => editable count
 *   - Responsive: `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))` => editable min-width
 *   - Complex:    everything else                          => read-only raw string
 *
 * The parser only matches the whitelisted simple/responsive forms; any
 * minor deviation (min-content, px-literals, multi-track lists,
 * arbitrary function nesting) falls through to complex. That's the
 * right fallback — the panel is a viewer/editor, not a builder, so
 * unrecognized templates are displayed but never silently rewritten.
 */
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { SegmentedControl, type SegmentedOption } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { AlignmentGrid } from '../controls/AlignmentGrid.js'
import { XYDropdown, type XYDropdownOption } from '../controls/XYDropdown.js'
import {
  GalleryHorizontalEnd,
  GalleryVerticalEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  MoveHorizontal,
  MoveVertical,
} from '../icons.js'

export interface GridChange {
  property: string
  value: string
}

export interface GridValues {
  gridTemplateColumns: string
  gridTemplateRows: string
  gridAutoFlow: string
  justifyItems: string
  alignItems: string
  rowGap: number
  columnGap: number
}

export interface GridControlsProps {
  values: GridValues
  onChange: (change: GridChange) => void
  onScrub?: (change: GridChange) => void
  onScrubEnd?: (change: GridChange) => void
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

// ── Three-tier template parser ─────────────────────────────────────

export type GridTemplate =
  | { tier: 'simple'; count: number }
  | { tier: 'responsive'; minWidth: number; autoMode: 'auto-fit' | 'auto-fill' }
  | { tier: 'complex'; raw: string }

// Whitespace-tolerant regexes. Anchored end-to-end so partial matches
// inside a longer track list fall through to complex. Simple tier:
// `repeat(N, 1fr)` with any inner whitespace. Responsive tier:
// `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))` — `min-content` and
// other minmax forms intentionally fall through.
const SIMPLE_RE = /^\s*repeat\(\s*(\d+)\s*,\s*1fr\s*\)\s*$/
const RESPONSIVE_RE =
  /^\s*repeat\(\s*(auto-fit|auto-fill)\s*,\s*minmax\(\s*(\d+)px\s*,\s*1fr\s*\)\s*\)\s*$/

/**
 * Classify a `grid-template-columns` / `grid-template-rows` string into
 * one of three tiers. Pure, side-effect-free — exported so the test
 * suite can pin every path independently of the UI.
 */
export function parseGridTemplate(template: string): GridTemplate {
  const simple = SIMPLE_RE.exec(template)
  if (simple) {
    return { tier: 'simple', count: parseInt(simple[1]!, 10) }
  }
  const responsive = RESPONSIVE_RE.exec(template)
  if (responsive) {
    return {
      tier: 'responsive',
      autoMode: responsive[1] as 'auto-fit' | 'auto-fill',
      minWidth: parseInt(responsive[2]!, 10),
    }
  }
  return { tier: 'complex', raw: template }
}

// ── Alignment value canonicalization ───────────────────────────────

/**
 * Normalize a flex-spec alignment literal to its grid-spec equivalent.
 * AlignmentGrid emits `flex-start`/`flex-end` (correct in flex context),
 * but grid `justify-items`/`align-items` use `start`/`end` as the
 * canonical values. CSS Box Alignment L3 accepts both forms in grid
 * containers, but writing the canonical form keeps the dropdown UI in
 * sync with the live CSS — without this normalization the GRID_X/Y
 * dropdowns would silently fall back to index 0 after every grid click.
 * Pure, side-effect-free; values that don't need translation pass
 * through unchanged.
 */
function flexAlignToGridAlign(value: string): string {
  if (value === 'flex-start') return 'start'
  if (value === 'flex-end') return 'end'
  return value
}

// ── Option catalogs ────────────────────────────────────────────────

// Grid auto-flow — only row/column are canonical surface values. `row
// dense` / `column dense` are valid CSS but fall through to the
// "neither-active" state (SegmentedControl uses exact-match active
// detection), which is the correct read-only fallback.
const DIRECTION_OPTIONS: SegmentedOption[] = [
  { value: 'row', icon: <GalleryHorizontalEnd size={14} />, title: 'Row' },
  { value: 'column', icon: <GalleryVerticalEnd size={14} />, title: 'Column' },
]

// Grid-specific X/Y catalogs. Grid alignment props accept `start`/`end`
// (NOT `flex-start`/`flex-end`) — these are genuinely different enum
// values from flex, so a shared catalog would ship wrong CSS. This is
// not a shadow copy of FlexControls' X_OPTIONS: the values differ by
// specification, the labels are axis-appropriate, and there are no
// per-item distribution entries (distribution lives exclusively on the
// AlignmentGrid's dblclick overlay for grid).
const GRID_X_OPTIONS: XYDropdownOption[] = [
  { value: 'start', label: 'Left', icon: <AlignHorizontalJustifyStart size={14} /> },
  { value: 'center', label: 'Center', icon: <AlignHorizontalJustifyCenter size={14} /> },
  { value: 'end', label: 'Right', icon: <AlignHorizontalJustifyEnd size={14} /> },
  { value: 'stretch', label: 'Stretch', icon: <AlignHorizontalJustifyCenter size={14} /> },
]

const GRID_Y_OPTIONS: XYDropdownOption[] = [
  { value: 'start', label: 'Top', icon: <AlignVerticalJustifyStart size={14} /> },
  { value: 'center', label: 'Center', icon: <AlignVerticalJustifyCenter size={14} /> },
  { value: 'end', label: 'Bottom', icon: <AlignVerticalJustifyEnd size={14} /> },
  { value: 'stretch', label: 'Stretch', icon: <AlignVerticalJustifyCenter size={14} /> },
  { value: 'baseline', label: 'Baseline', icon: <AlignVerticalJustifyCenter size={14} /> },
]

// ── Component ──────────────────────────────────────────────────────

export function GridControls({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: GridControlsProps): JSX.Element {
  const {
    gridTemplateColumns,
    gridTemplateRows,
    gridAutoFlow,
    justifyItems,
    alignItems,
    rowGap,
    columnGap,
  } = values

  const cols = parseGridTemplate(gridTemplateColumns)
  const rows = parseGridTemplate(gridTemplateRows)

  // ── Direction ────────────────────────────────────────────────
  const handleDirection = useCallback(
    (v: string) => onChange({ property: 'grid-auto-flow', value: v }),
    [onChange],
  )

  // ── AlignmentGrid routing ────────────────────────────────────
  // Grid is CSS-role aligned to the item-alignment properties (not
  // direction-dependent), so the grid's output maps directly to the
  // per-item CSS role. Distribution routes to the track-distribution
  // props (justify-content / align-content) because individual items
  // can't take `space-between` values.
  //
  // AlignmentGrid emits the flex-spec literals `flex-start`/`flex-end`
  // (it's CSS-role-agnostic — those are correct in flex context).
  // Grid's `justify-items`/`align-items` accept them as legacy aliases,
  // but the canonical grid value is `start`/`end`. Canonicalize at the
  // write boundary so the value emitted matches what `parseLayoutValues`
  // reads back AND matches the GRID_X/Y_OPTIONS catalog values — without
  // this normalization the dropdown's strict-equality match would fall
  // through to index 0 after every grid click.
  const handleGridJustify = useCallback(
    (v: string) => onChange({ property: 'justify-items', value: flexAlignToGridAlign(v) }),
    [onChange],
  )
  const handleGridAlign = useCallback(
    (v: string) => onChange({ property: 'align-items', value: flexAlignToGridAlign(v) }),
    [onChange],
  )
  const handleGridDistribute = useCallback(
    (axis: 'main' | 'cross', v: string) => {
      const property = axis === 'main' ? 'justify-content' : 'align-content'
      onChange({ property, value: v })
    },
    [onChange],
  )

  // ── X / Y dropdowns ──────────────────────────────────────────
  // Unlike FlexControls, there is no direction-aware swap. The
  // tooltips are the literal CSS property names and NEVER change.
  const handleX = useCallback(
    (v: string) => onChange({ property: 'justify-items', value: v }),
    [onChange],
  )
  const handleY = useCallback(
    (v: string) => onChange({ property: 'align-items', value: v }),
    [onChange],
  )

  // ── Simple tier: Cols / Rows count reconstruction ────────────
  const handleColsCountChange = useCallback(
    (v: number) => {
      onChange({
        property: 'grid-template-columns',
        value: `repeat(${v}, 1fr)`,
      })
    },
    [onChange],
  )
  const handleRowsCountChange = useCallback(
    (v: number) => {
      onChange({
        property: 'grid-template-rows',
        value: `repeat(${v}, 1fr)`,
      })
    },
    [onChange],
  )

  // ── Responsive tier: min-width reconstruction ────────────────
  // autoMode (auto-fit vs auto-fill) is preserved from the parsed value
  // so reconstruction round-trips cleanly. The tier guard satisfies TS
  // narrowing — the input itself is only rendered inside the responsive
  // branch (see JSX below), so the early-return is never hit at runtime.
  const handleMinWidthChange = useCallback(
    (v: number) => {
      if (cols.tier !== 'responsive') return
      onChange({
        property: 'grid-template-columns',
        value: `repeat(${cols.autoMode}, minmax(${v}px, 1fr))`,
      })
    },
    [onChange, cols],
  )

  // ── Dual gap (NOT linked) ────────────────────────────────────
  // Each input fires exactly one property — unlike FlexControls'
  // single Gap that writes both axes. Grid's dual-axis surface is
  // genuinely two-axis: users expect to set column-gap and row-gap
  // independently.
  const handleColumnGapChange = useCallback(
    (v: number) => onChange({ property: 'column-gap', value: `${v}px` }),
    [onChange],
  )
  const handleColumnGapScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'column-gap', value: `${v}px` })
    },
    [onScrub],
  )
  const handleColumnGapScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'column-gap', value: `${v}px` })
    },
    [onScrubEnd],
  )
  const handleRowGapChange = useCallback(
    (v: number) => onChange({ property: 'row-gap', value: `${v}px` }),
    [onChange],
  )
  const handleRowGapScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'row-gap', value: `${v}px` })
    },
    [onScrub],
  )
  const handleRowGapScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'row-gap', value: `${v}px` })
    },
    [onScrubEnd],
  )

  return (
    <div class="cortex-grid-controls">
      {/* Template — three-tier parser-driven rendering.
          Cols/Rows/MinWidth NumericInputs intentionally do NOT forward
          onScrub/onScrubEnd: dragging a column count from 3→24 would
          trigger a cascade of full re-layouts on the iframe and the
          intermediate visual states are meaningless. Only commit-on-
          enter/blur is wired here. The dual gap inputs below DO forward
          scrub events because per-pixel gap dragging is interactive. */}
      <div class="cortex-grid-controls__template">
        {cols.tier === 'simple' && (
          <div class="cortex-grid-controls__cols">
            <NumericInput
              value={cols.count}
              label="Cols"
              tooltip="Columns (repeat count)"
              min={1}
              mixed={mixedProperties?.has('grid-template-columns')}
              onChange={handleColsCountChange}
            />
          </div>
        )}
        {rows.tier === 'simple' && (
          <div class="cortex-grid-controls__rows">
            <NumericInput
              value={rows.count}
              label="Rows"
              tooltip="Rows (repeat count)"
              min={1}
              mixed={mixedProperties?.has('grid-template-rows')}
              onChange={handleRowsCountChange}
            />
          </div>
        )}
        {cols.tier === 'responsive' && (
          <div class="cortex-grid-controls__minwidth">
            <NumericInput
              value={cols.minWidth}
              unit="px"
              label="Min"
              tooltip={`Min column width (${cols.autoMode})`}
              min={0}
              mixed={mixedProperties?.has('grid-template-columns')}
              onChange={handleMinWidthChange}
            />
          </div>
        )}
        {cols.tier === 'complex' && (
          <div class="cortex-grid-controls__raw" aria-label="Grid template columns (read-only)">
            <span class="cortex-grid-controls__raw-label">Template</span>
            <code class="cortex-grid-controls__raw-value">{cols.raw || '(none)'}</code>
          </div>
        )}
      </div>

      {/* Direction — icon-only segmented control, full width. */}
      <div class="cortex-grid-controls__direction">
        <span class="cortex-section-label">Direction</span>
        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={gridAutoFlow}
          onChange={handleDirection}
        />
      </div>

      {/* Alignment — grid + X/Y dropdowns share one row. */}
      <div class="cortex-grid-controls__align">
        <AlignmentGrid
          justifyValue={justifyItems}
          alignValue={alignItems}
          onJustify={handleGridJustify}
          onAlign={handleGridAlign}
          onDistribute={handleGridDistribute}
          label="Grid alignment"
        />
        <div class="cortex-grid-controls__xy">
          <div data-xy-axis="x" class="cortex-grid-controls__xy-field">
            <XYDropdown
              options={GRID_X_OPTIONS}
              value={justifyItems}
              onChange={handleX}
              ariaLabel="X alignment"
              axisLabel="X"
              tooltip="justify-items"
            />
          </div>
          <div data-xy-axis="y" class="cortex-grid-controls__xy-field">
            <XYDropdown
              options={GRID_Y_OPTIONS}
              value={alignItems}
              onChange={handleY}
              ariaLabel="Y alignment"
              axisLabel="Y"
              tooltip="align-items"
            />
          </div>
        </div>
      </div>

      {/* Dual gap — two side-by-side NumericInputs (NOT linked). */}
      <div class="cortex-grid-controls__gap">
        <div class="cortex-grid-controls__column-gap">
          <NumericInput
            value={columnGap}
            unit="px"
            prefix={<MoveHorizontal size={14} />}
            tooltip="Column gap"
            min={0}
            mixed={mixedProperties?.has('column-gap')}
            onChange={handleColumnGapChange}
            onScrub={handleColumnGapScrub}
            onScrubEnd={handleColumnGapScrubEnd}
          />
        </div>
        <div class="cortex-grid-controls__row-gap">
          <NumericInput
            value={rowGap}
            unit="px"
            prefix={<MoveVertical size={14} />}
            tooltip="Row gap"
            min={0}
            mixed={mixedProperties?.has('row-gap')}
            onChange={handleRowGapChange}
            onScrub={handleRowGapScrub}
            onScrubEnd={handleRowGapScrubEnd}
          />
        </div>
      </div>
    </div>
  )
}
