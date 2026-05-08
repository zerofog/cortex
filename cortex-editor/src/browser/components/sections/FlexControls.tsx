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
 * must route through the shared `flexAxisToCssProperty` helper imported
 * from `alignment-router`.
 * Tests assert on the exact property name emitted for every code path.
 */
import type { JSX } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import { isDimmed } from './types.js'
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
  Lock,
  LockOpen,
} from '../icons.js'
import { flexAxisToCssProperty, isColumnDirection } from '../../alignment-router.js'

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
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

// ── X/Y axis mapping ────────────────────────────────────────────────

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
  { value: 'flex-start', label: 'Left', hint: 'Align children to the left of the row.' },
  { value: 'center', label: 'Center', hint: 'Center children along the main axis.' },
  { value: 'flex-end', label: 'Right', hint: 'Align children to the right of the row.' },
  { value: 'space-between', label: 'Space Between', hint: 'Distribute children with equal space between them.' },
  { value: 'space-around', label: 'Space Around', hint: 'Distribute children with equal space around them.' },
]

// Y dropdown catalog — vertical alignment (see DESIGN.md L229).
const Y_OPTIONS: XYDropdownOption[] = [
  { value: 'flex-start', label: 'Top', hint: 'Align children to the top of the cross axis.' },
  { value: 'center', label: 'Center', hint: 'Center children along the cross axis.' },
  { value: 'flex-end', label: 'Bottom', hint: 'Align children to the bottom of the cross axis.' },
  { value: 'stretch', label: 'Stretch', hint: 'Stretch children to fill the cross axis.' },
  { value: 'baseline', label: 'Baseline', hint: 'Align children along their text baseline.' },
]

// ── Component ───────────────────────────────────────────────────────

export function FlexControls({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  dimmedProperties,
  mixedProperties,
}: FlexControlsProps): JSX.Element {
  // `columnGap` is parsed into FlexValues but not destructured here:
  // the Gap input is single-axis, displays rowGap as the canonical
  // value, and emits BOTH row-gap and column-gap on edit. When the
  // source element has asymmetric gaps the difference is surfaced via
  // `mixedProperties` (set by Panel.tsx), not by rendering two numbers.
  const { flexDirection, justifyContent, alignItems, rowGap, columnGap, flexWrap } = values
  const column = isColumnDirection(flexDirection)
  const directionMixed = mixedProperties?.has('flex-direction') === true

  // ── Gap lock ─────────────────────────────────────────────────
  const [gapLocked, setGapLocked] = useState(true)
  const toggleGapLock = useCallback(() => setGapLocked(p => !p), [])

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
      if (directionMixed) return
      // X-axis (horizontal on screen) — main in row, cross in column.
      // Route via the single-source-of-truth helper so the swap is
      // enforced uniformly.
      onChange({
        property: flexAxisToCssProperty('x', flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection, directionMixed],
  )

  const handleGridAlign = useCallback(
    (v: string) => {
      if (directionMixed) return
      onChange({
        property: flexAxisToCssProperty('y', flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection, directionMixed],
  )

  const handleGridDistribute = useCallback(
    (axis: 'main' | 'cross', v: string) => {
      if (directionMixed) return
      onChange({
        property: flexAxisToCssProperty({ distribute: axis }, flexDirection),
        value: v,
      })
    },
    [onChange, flexDirection, directionMixed],
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
    (v: string) => {
      if (directionMixed) return
      onChange({ property: xProperty, value: v })
    },
    [onChange, xProperty, directionMixed],
  )
  const handleY = useCallback(
    (v: string) => {
      if (directionMixed) return
      onChange({ property: yProperty, value: v })
    },
    [onChange, yProperty, directionMixed],
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

  // Unlocked single-axis handlers — each fires ONE property.
  const handleColumnGapChange = useCallback(
    (v: number) => onChange({ property: 'column-gap', value: `${v}px` }),
    [onChange],
  )
  const handleColumnGapScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'column-gap', value: `${v}px` }) },
    [onScrub],
  )
  const handleColumnGapScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'column-gap', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleRowGapChange = useCallback(
    (v: number) => onChange({ property: 'row-gap', value: `${v}px` }),
    [onChange],
  )
  const handleRowGapScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'row-gap', value: `${v}px` }) },
    [onScrub],
  )
  const handleRowGapScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'row-gap', value: `${v}px` }) },
    [onScrubEnd],
  )

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
      <div class={`cortex-flex-controls__direction${isDimmed(dimmedProperties, 'flex-direction') ? ' cortex-control--dimmed' : ''}`}>
        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={flexDirection}
          onChange={handleDirection}
          mixed={directionMixed}
        />
      </div>

      {/* Alignment — grid + X/Y dropdowns share one row. */}
      <div class={`cortex-flex-controls__align${isDimmed(dimmedProperties, 'justify-content', 'align-items', 'align-content') ? ' cortex-control--dimmed' : ''}`}>
        <AlignmentGrid
          justifyValue={gridJustifyValue}
          alignValue={gridAlignValue}
          onJustify={handleGridJustify}
          onAlign={handleGridAlign}
          onDistribute={handleGridDistribute}
          label="Flex alignment grid"
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
              disabled={directionMixed}
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
              disabled={directionMixed}
            />
          </div>
        </div>
      </div>

      {/* Gap — lockable dual-axis. Locked = single input (both axes).
          Unlocked = independent Cols (column-gap) + Rows (row-gap). */}
      <div class={`cortex-flex-controls__gap${isDimmed(dimmedProperties, 'row-gap', 'column-gap') ? ' cortex-control--dimmed' : ''}`}>
        {gapLocked ? (
          <NumericInput
            value={gapValue}
            unit="px"
            prefix="Gap"
            tooltip="Gap (row-gap + column-gap)"
            min={0}
            mixed={gapMixed}
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

      {/* Wrap — tucked behind "More options" to keep the default view lean. */}
      <ExpandableOptions label="More options">
        <div class={`cortex-flex-controls__wrap${isDimmed(dimmedProperties, 'flex-wrap') ? ' cortex-control--dimmed' : ''}`}>
          <SegmentedControl
            options={WRAP_OPTIONS}
            value={flexWrap}
            onChange={handleWrap}
            mixed={mixedProperties?.has('flex-wrap')}
          />
        </div>
      </ExpandableOptions>
    </div>
  )
}
