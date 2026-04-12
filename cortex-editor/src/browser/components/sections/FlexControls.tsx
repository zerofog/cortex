/**
 * FlexControls — Panel v2 Task 8 (ZF0-1186)
 *
 * Complete flex sub-panel composed from six sub-controls:
 *   1. Direction SegmentedControl (row / row-reverse / column / column-reverse)
 *   2. AlignmentGrid — 3x3 click+dblclick picker (shared Task 7 control)
 *   3. X dropdown — axis-appropriate enum catalog
 *   4. Y dropdown — axis-appropriate enum catalog
 *   5. Gap NumericInput — emits both row-gap AND column-gap
 *   6. Wrap SegmentedControl — hidden inside a "More options" expandable
 *
 * =======================================================================
 * CRITICAL: X/Y column-direction CSS mapping swap (DESIGN.md L497)
 * =======================================================================
 * X/Y are SCREEN COORDINATES, not CSS role names. X is always horizontal,
 * Y is always vertical. The CSS property each axis maps to adapts based
 * on `flex-direction`:
 *
 *   row / row-reverse:
 *     X → justify-content  (main axis = horizontal)
 *     Y → align-items      (cross axis = vertical)
 *
 *   column / column-reverse:
 *     X → align-items      (cross axis = horizontal)
 *     Y → justify-content  (main axis = vertical)
 *
 * The AlignmentGrid is always parameterised in "row semantics" — it
 * accepts `justifyValue` (horizontal) and `alignValue` (vertical) and
 * fires onJustify/onAlign by CSS ROLE. FlexControls reverse-maps the
 * grid's output to the correct CSS property based on the current
 * `flexDirection`. Distribution (space-between / space-around /
 * space-evenly) follows the same swap on a separate helper — main axis
 * distribution → main-axis CSS property; cross axis distribution →
 * cross-axis CSS property (`align-content` in row, `justify-content`
 * in column).
 *
 * Silently writing the wrong CSS property is a trust vulnerability:
 * the user sees "X = Left" and rationally expects horizontal-start, but
 * column-flex would write the wrong axis. Every path through this file
 * must route through the single `flexAxisToCssProperty` helper below.
 * Tests assert on the exact property name emitted for every code path.
 */
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import type { SectionChange } from './types.js'
import { SegmentedControl, type SegmentedOption } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { AlignmentGrid } from '../controls/AlignmentGrid.js'
import { XYDropdown, type XYDropdownOption } from '../controls/XYDropdown.js'
import { ExpandableOptions } from '../controls/ExpandableOptions.js'
import {
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  MoveHorizontal,
} from '../icons.js'

export type FlexChange = SectionChange

export interface FlexValues {
  flexDirection: string
  justifyContent: string
  alignItems: string
  rowGap: number
  columnGap: number
  flexWrap: string
}

export interface FlexControlsProps {
  values: FlexValues
  onChange: (change: FlexChange) => void
  onScrub?: (change: FlexChange) => void
  onScrubEnd?: (change: FlexChange) => void
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

// ── X/Y axis mapping ────────────────────────────────────────────────

/** Screen-coordinate axis role — never a CSS property name. */
type ScreenAxis = 'x' | 'y'

/** Distribution axis relative to the flex main/cross axis (NOT screen). */
type DistributeAxis = 'main' | 'cross'

type FlexCssProperty =
  | 'justify-content'
  | 'align-items'
  | 'align-content'

function isColumnDirection(direction: string): boolean {
  return direction === 'column' || direction === 'column-reverse'
}

/**
 * Single source of truth for the X/Y → CSS property mapping. Every
 * callback handler inside FlexControls routes through this helper so
 * the swap logic lives in exactly one place. Bypassing this function
 * (writing CSS property names directly in a handler) re-introduces the
 * silent-wrong-property bug the helper exists to prevent — keep the
 * call surface narrow and the helper pure.
 */
function flexAxisToCssProperty(
  role: ScreenAxis | { distribute: DistributeAxis },
  direction: string,
): FlexCssProperty {
  const column = isColumnDirection(direction)
  if (typeof role === 'string') {
    if (role === 'x') return column ? 'align-items' : 'justify-content'
    /* role === 'y' */ return column ? 'justify-content' : 'align-items'
  }
  // Distribution keywords (space-between, space-around, space-evenly) are
  // only valid on justify-content and align-content — never on align-items.
  // The AlignmentGrid already maps row overlay → 'cross' and col overlay →
  // 'main' in a direction-agnostic way, so no direction swap is needed here.
  if (role.distribute === 'main') return 'justify-content'
  /* cross */ return 'align-content'
}

// ── Option catalogs ─────────────────────────────────────────────────

const DIRECTION_OPTIONS: SegmentedOption[] = [
  { value: 'row', icon: <ArrowRight size={14} />, title: 'Row' },
  { value: 'row-reverse', icon: <ArrowLeft size={14} />, title: 'Row reverse' },
  { value: 'column', icon: <ArrowDown size={14} />, title: 'Column' },
  { value: 'column-reverse', icon: <ArrowUp size={14} />, title: 'Column reverse' },
]

const WRAP_OPTIONS: SegmentedOption[] = [
  { value: 'nowrap', label: 'No wrap', title: 'No wrap' },
  { value: 'wrap', label: 'Wrap', title: 'Wrap' },
  { value: 'wrap-reverse', label: 'Reverse', title: 'Wrap reverse' },
]

// X dropdown catalog — horizontal alignment (see DESIGN.md L228).
// Distribution values (space-between, space-around) are included in
// the catalog because they're valid targets when the user wants to
// spread items along the main axis without the dblclick overlay
// interaction — the dropdown is the fallback path.
const X_OPTIONS: XYDropdownOption[] = [
  { value: 'flex-start', label: 'Left', icon: <AlignHorizontalJustifyStart size={14} /> },
  { value: 'center', label: 'Center', icon: <AlignHorizontalJustifyCenter size={14} /> },
  { value: 'flex-end', label: 'Right', icon: <AlignHorizontalJustifyEnd size={14} /> },
  { value: 'space-between', label: 'Space Between', icon: <AlignHorizontalJustifyCenter size={14} /> },
  { value: 'space-around', label: 'Space Around', icon: <AlignHorizontalJustifyCenter size={14} /> },
]

// Y dropdown catalog — vertical alignment (see DESIGN.md L229).
const Y_OPTIONS: XYDropdownOption[] = [
  { value: 'flex-start', label: 'Top', icon: <AlignVerticalJustifyStart size={14} /> },
  { value: 'center', label: 'Center', icon: <AlignVerticalJustifyCenter size={14} /> },
  { value: 'flex-end', label: 'Bottom', icon: <AlignVerticalJustifyEnd size={14} /> },
  { value: 'stretch', label: 'Stretch', icon: <AlignVerticalJustifyCenter size={14} /> },
  { value: 'baseline', label: 'Baseline', icon: <AlignVerticalJustifyCenter size={14} /> },
]

// ── Component ───────────────────────────────────────────────────────

export function FlexControls({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: FlexControlsProps): JSX.Element {
  // `columnGap` is parsed into FlexValues but not destructured here:
  // the Gap input is single-axis, displays rowGap as the canonical
  // value, and emits BOTH row-gap and column-gap on edit. When the
  // source element has asymmetric gaps the difference is surfaced via
  // `mixedProperties` (set by Panel.tsx), not by rendering two numbers.
  const { flexDirection, justifyContent, alignItems, rowGap, flexWrap } = values
  const column = isColumnDirection(flexDirection)

  // ── Direction ────────────────────────────────────────────────
  const handleDirection = useCallback(
    (v: string) => onChange({ property: 'flex-direction', value: v }),
    [onChange],
  )

  // ── AlignmentGrid reverse-map ────────────────────────────────
  // The grid always speaks CSS roles — `justifyValue` is the main
  // axis, `alignValue` is the cross axis. In column mode the on-
  // screen semantics are swapped, so we pass the swapped values in
  // and reverse-map the outputs on the way out.
  const gridJustifyValue = column ? alignItems : justifyContent
  const gridAlignValue = column ? justifyContent : alignItems

  const handleGridJustify = useCallback(
    (v: string) => {
      // X-axis (horizontal on screen) — main in row, cross in column.
      // Route via the single-source-of-truth helper so the swap is
      // enforced uniformly.
      onChange({
        property: flexAxisToCssProperty('x', flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection],
  )

  const handleGridAlign = useCallback(
    (v: string) => {
      onChange({
        property: flexAxisToCssProperty('y', flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection],
  )

  const handleGridDistribute = useCallback(
    (axis: 'main' | 'cross', v: string) => {
      onChange({
        property: flexAxisToCssProperty({ distribute: axis }, flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection],
  )

  // ── X / Y dropdowns ──────────────────────────────────────────
  // `flexAxisToCssProperty` gives us both the routing property AND
  // the tooltip label in one place — the tooltip is always the exact
  // CSS property name that the next selection will write, so users
  // can see what "X = Center" actually emits in column mode.
  const xProperty = flexAxisToCssProperty('x', flexDirection)
  const yProperty = flexAxisToCssProperty('y', flexDirection)

  // The value currently rendered in the X dropdown reflects the CSS
  // property it targets — in column mode that's `align-items`, not
  // `justify-content`. Y is the mirror.
  const xValue = column ? alignItems : justifyContent
  const yValue = column ? justifyContent : alignItems

  const handleX = useCallback(
    (v: string) => onChange({ property: xProperty, value: v }),
    [onChange, xProperty],
  )
  const handleY = useCallback(
    (v: string) => onChange({ property: yProperty, value: v }),
    [onChange, yProperty],
  )

  // ── Gap (linked axes) ────────────────────────────────────────
  // Gap is a single input but fires TWO changes — one for each
  // CSS longhand — so callers applying overrides get both
  // row-gap and column-gap in the same batch. This mirrors the
  // linked-axes pattern used in SpacingSection's padding/margin
  // inputs when the lock is engaged.
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

  // Gap displays row-gap as the canonical value — if the two axes
  // disagree (e.g. pre-existing CSS sets row-gap: 4px; column-gap: 8px),
  // the panel shows row-gap until the user types a new value, at which
  // point the two-callback dispatch re-converges them.
  const gapValue = rowGap

  const gapMixed = mixedProperties?.has('row-gap') || mixedProperties?.has('column-gap')

  // ── Wrap ─────────────────────────────────────────────────────
  const handleWrap = useCallback(
    (v: string) => onChange({ property: 'flex-wrap', value: v }),
    [onChange],
  )

  return (
    <div class="cortex-flex-controls">
      {/* Direction — icon-only segmented control, full width. */}
      <div class="cortex-flex-controls__direction">
        <span class="cortex-section-label">Direction</span>
        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={flexDirection}
          onChange={handleDirection}
        />
      </div>

      {/* Alignment — grid + X/Y dropdowns share one row. */}
      <div class="cortex-flex-controls__align">
        <AlignmentGrid
          justifyValue={gridJustifyValue}
          alignValue={gridAlignValue}
          onJustify={handleGridJustify}
          onAlign={handleGridAlign}
          onDistribute={handleGridDistribute}
          label="Flex alignment"
        />
        <div class="cortex-flex-controls__xy">
          <div data-xy-axis="x" class="cortex-flex-controls__xy-field">
            <XYDropdown
              options={X_OPTIONS}
              value={xValue}
              onChange={handleX}
              ariaLabel="X alignment"
              axisLabel="X"
              tooltip={xProperty}
            />
          </div>
          <div data-xy-axis="y" class="cortex-flex-controls__xy-field">
            <XYDropdown
              options={Y_OPTIONS}
              value={yValue}
              onChange={handleY}
              ariaLabel="Y alignment"
              axisLabel="Y"
              tooltip={yProperty}
            />
          </div>
        </div>
      </div>

      {/* Gap — linked axes via a single NumericInput. */}
      <div class="cortex-flex-controls__gap">
        <NumericInput
          value={gapValue}
          unit="px"
          prefix={<MoveHorizontal size={14} />}
          tooltip="Gap"
          min={0}
          mixed={gapMixed}
          onChange={handleGapChange}
          onScrub={handleGapScrub}
          onScrubEnd={handleGapScrubEnd}
        />
      </div>

      {/* Wrap — tucked behind "More options" to keep the default view lean. */}
      <ExpandableOptions label="More options">
        <div class="cortex-flex-controls__wrap">
          <span class="cortex-section-label">Wrap</span>
          <SegmentedControl
            options={WRAP_OPTIONS}
            value={flexWrap}
            onChange={handleWrap}
            size="sm"
          />
        </div>
      </ExpandableOptions>
    </div>
  )
}
