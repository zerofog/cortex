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
import { useCallback, useMemo, useState } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { SegmentedControl, type SegmentedOption } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { AlignmentGrid } from '../controls/AlignmentGrid.js'
import { XYDropdown, type XYDropdownOption } from '../controls/XYDropdown.js'
import {
  ArrowRight,
  ArrowDown,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Lock,
  LockOpen,
} from '../icons.js'

export type GridChange = SectionChange

const GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP = 'Grid count requires repeat(N, 1fr)'

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
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
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

/** Reverse map grid canonical values to flex-spec values for AlignmentGrid's
 *  internal active-cell detection (which uses flex-start/flex-end). */
function gridAlignToFlexAlign(value: string): string {
  if (value === 'start') return 'flex-start'
  if (value === 'end') return 'flex-end'
  return value
}

// ── Option catalogs ────────────────────────────────────────────────

// Grid auto-flow — only row/column are canonical surface values. `row
// dense` / `column dense` are valid CSS but fall through to the
// "neither-active" state (SegmentedControl uses exact-match active
// detection), which is the correct read-only fallback.
const DIRECTION_OPTIONS: SegmentedOption[] = [
  { value: 'row', icon: <ArrowRight size={14} />, title: 'Row' },
  { value: 'column', icon: <ArrowDown size={14} />, title: 'Column' },
]

// Grid-specific X/Y catalogs. Grid alignment props accept `start`/`end`
// (NOT `flex-start`/`flex-end`) — these are genuinely different enum
// values from flex, so a shared catalog would ship wrong CSS. This is
// not a shadow copy of FlexControls' X_OPTIONS: the values differ by
// specification, the labels are axis-appropriate, and there are no
// per-item distribution entries (distribution lives exclusively on the
// AlignmentGrid's dblclick overlay for grid).
const GRID_X_OPTIONS: XYDropdownOption[] = [
  { value: 'start', label: 'Left', hint: 'Align items to the left of their grid cell.' },
  { value: 'center', label: 'Center', hint: 'Center items horizontally in their grid cell.' },
  { value: 'end', label: 'Right', hint: 'Align items to the right of their grid cell.' },
  { value: 'stretch', label: 'Stretch', hint: 'Stretch items to fill the grid cell width.' },
]

const GRID_Y_OPTIONS: XYDropdownOption[] = [
  { value: 'start', label: 'Top', hint: 'Align items to the top of their grid cell.' },
  { value: 'center', label: 'Center', hint: 'Center items vertically in their grid cell.' },
  { value: 'end', label: 'Bottom', hint: 'Align items to the bottom of their grid cell.' },
  { value: 'stretch', label: 'Stretch', hint: 'Stretch items to fill the grid cell height.' },
  { value: 'baseline', label: 'Baseline', hint: 'Align items along their text baseline.' },
]

// ── Component ──────────────────────────────────────────────────────

export function GridControls({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  dimmedProperties,
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

  const cols = useMemo(() => parseGridTemplate(gridTemplateColumns), [gridTemplateColumns])
  const rows = useMemo(() => parseGridTemplate(gridTemplateRows), [gridTemplateRows])
  const colsCountEditable = cols.tier === 'simple'
  const rowsCountEditable = rows.tier === 'simple'

  // ── Gap lock ─────────────────────────────────────────────────
  const [gapLocked, setGapLocked] = useState(true)
  const toggleGapLock = useCallback(() => setGapLocked(p => !p), [])

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
      if (cols.tier !== 'simple') return
      onChange({
        property: 'grid-template-columns',
        value: `repeat(${v}, 1fr)`,
      })
    },
    [onChange, cols.tier],
  )
  const handleRowsCountChange = useCallback(
    (v: number) => {
      if (rows.tier !== 'simple') return
      onChange({
        property: 'grid-template-rows',
        value: `repeat(${v}, 1fr)`,
      })
    },
    [onChange, rows.tier],
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

  // ── Gap ──────────────────────────────────────────────────────
  // Linked handlers fire BOTH axes (for locked mode).
  const handleGapChange = useCallback(
    (v: number) => {
      onChange({ property: 'row-gap', value: `${v}px` })
      onChange({ property: 'column-gap', value: `${v}px` })
    },
    [onChange],
  )
  const handleGapScrub = useCallback(
    (v: number) => {
      if (!onScrub) return
      onScrub({ property: 'row-gap', value: `${v}px` })
      onScrub({ property: 'column-gap', value: `${v}px` })
    },
    [onScrub],
  )
  const handleGapScrubEnd = useCallback(
    (v: number) => {
      if (!onScrubEnd) return
      onScrubEnd({ property: 'row-gap', value: `${v}px` })
      onScrubEnd({ property: 'column-gap', value: `${v}px` })
    },
    [onScrubEnd],
  )
  // Single-axis handlers (for unlocked mode).
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
      {/* Template + Direction — merged into one row. */}
      <div class={`cortex-grid-controls__template${isDimmed(dimmedProperties, 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow') ? ' cortex-control--dimmed' : ''}`}>
        <div class="cortex-grid-controls__cols">
          <NumericInput
            value={'count' in cols ? cols.count : 1}
            label="Cols"
            tooltip={colsCountEditable ? 'Columns (repeat count)' : GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP}
            min={1}
            disabled={!colsCountEditable}
            mixed={mixedProperties?.has('grid-template-columns')}
            onChange={handleColsCountChange}
          />
        </div>
        <div class="cortex-grid-controls__rows">
          <NumericInput
            value={'count' in rows ? rows.count : 1}
            label="Rows"
            tooltip={rowsCountEditable ? 'Rows (repeat count)' : GRID_COUNT_REQUIRES_SIMPLE_TOOLTIP}
            min={1}
            disabled={!rowsCountEditable}
            mixed={mixedProperties?.has('grid-template-rows')}
            onChange={handleRowsCountChange}
          />
        </div>
        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={gridAutoFlow}
          onChange={handleDirection}
          mixed={mixedProperties?.has('grid-auto-flow')}
        />
      </div>

      {/* Alignment — grid + X/Y dropdowns share one row. */}
      <div class={`cortex-grid-controls__align${isDimmed(dimmedProperties, 'justify-items', 'align-items', 'justify-content', 'align-content') ? ' cortex-control--dimmed' : ''}`}>
        <AlignmentGrid
          justifyValue={gridAlignToFlexAlign(justifyItems)}
          alignValue={gridAlignToFlexAlign(alignItems)}
          onJustify={handleGridJustify}
          onAlign={handleGridAlign}
          onDistribute={handleGridDistribute}
          label="Grid alignment grid"
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

      {/* Gap — lockable dual-axis. Locked = single input (both axes).
          Unlocked = independent Cols (column-gap) + Rows (row-gap). */}
      <div class={`cortex-grid-controls__gap${isDimmed(dimmedProperties, 'row-gap', 'column-gap') ? ' cortex-control--dimmed' : ''}`}>
        {gapLocked ? (
          <NumericInput
            value={rowGap}
            unit="px"
            prefix="Gap"
            tooltip="Gap (row-gap + column-gap)"
            min={0}
            mixed={mixedProperties?.has('row-gap') || mixedProperties?.has('column-gap')}
            tokenFamily="spacing"
            onChange={handleGapChange}
            onScrub={handleGapScrub}
            onScrubEnd={handleGapScrubEnd}
          />
        ) : (
          <>
            <NumericInput
              value={columnGap}
              unit="px"
              prefix="Cols"
              tooltip="Column gap"
              min={0}
              mixed={mixedProperties?.has('column-gap')}
              tokenFamily="spacing"
              onChange={handleColumnGapChange}
              onScrub={handleColumnGapScrub}
              onScrubEnd={handleColumnGapScrubEnd}
            />
            <NumericInput
              value={rowGap}
              unit="px"
              prefix="Rows"
              tooltip="Row gap"
              min={0}
              mixed={mixedProperties?.has('row-gap')}
              tokenFamily="spacing"
              onChange={handleRowGapChange}
              onScrub={handleRowGapScrub}
              onScrubEnd={handleRowGapScrubEnd}
            />
          </>
        )}
        <button
          class={`cortex-lock-btn${gapLocked ? ' cortex-lock-btn--active' : ''}`}
          type="button"
          aria-pressed={gapLocked ? 'true' : 'false'}
          aria-label={gapLocked ? 'Unlock gap axes' : 'Lock gap axes'}
          data-tooltip={gapLocked ? 'Unlock gap axes' : 'Lock gap axes'}
          onClick={toggleGapLock}
        >
          {gapLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
    </div>
  )
}
