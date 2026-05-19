import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { PositionDropdown } from '../controls/PositionDropdown.js'
import { NumericInput } from '../controls/NumericInput.js'
import { IconButton } from '../controls/IconButton.js'
import {
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  JustifySelfStart,
  JustifySelfCenter,
  JustifySelfEnd,
  AlignSelfStart,
  AlignSelfCenter,
  AlignSelfEnd,
} from '../icons.js'

export type PositionChange = SectionChange

export interface PositionValues {
  position: string   // static | relative | absolute | fixed | sticky
  left: string       // computed left (e.g., "8px", "auto")
  top: string        // computed top
  right: string      // computed right (e.g., "8px", "auto")
  bottom: string     // computed bottom
  zIndex: string     // computed z-index (e.g., "auto", "1")
  rotate: string     // CSS rotate property (e.g., "none", "45deg")
  scaleX: string     // from CSS scale property, for flip detection
  scaleY: string     // from CSS scale property, for flip detection
  justifySelf: string // computed justify-self (e.g., "auto", "start", "center", "end")
  alignSelf: string   // computed align-self (e.g., "auto", "start", "center", "end")
  /** Parent element's computed `display` (e.g. "block", "flex", "grid").
   *  Gates self-alignment controls — they only affect layout when the parent
   *  is a flex or grid container (or when this element is abs/fixed, in which
   *  case the abs-positioning containing block honors them). Default 'block'
   *  for elements with no parent so the controls hide. */
  parentDisplay: string
  /** Parent element's computed `flex-direction`. Only meaningful when
   *  parentDisplay is flex/inline-flex. Determines which axis align-self
   *  operates on: row* → cross axis is VERTICAL (top/middle/bottom);
   *  column* → cross axis is HORIZONTAL (left/center/right). For grid
   *  parents and abs/fixed elements, align-self always operates on the
   *  block axis (vertical in horizontal writing modes), so this field is
   *  ignored. Default 'row' for elements with no flex parent. */
  parentFlexDirection: string
}

export interface PositionSectionProps {
  values: PositionValues
  onChange: (change: PositionChange) => void
  onScrub?: (change: PositionChange) => void
  onScrubEnd?: (change: PositionChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /**
   * When true, the element's source override has exceeded the TTL without hmr_verified
   * arriving. Flows to NumericInput controls as the stale indicator (orange/yellow tint
   * with recovery tooltip). Sourced from Panel's elementSourceIsStale computation.
   */
  stale?: boolean
}

/** Extract position-related values from a CSSStyleDeclaration. */
export function parsePositionValues(cs: CSSStyleDeclaration): PositionValues {
  const scale = (cs as any).scale ?? 'none'
  let scaleX = '1'
  let scaleY = '1'
  if (scale !== 'none') {
    const parts = scale.split(/\s+/)
    scaleX = parts[0] ?? '1'
    scaleY = parts[1] ?? parts[0] ?? '1'
  }
  return {
    position: cs.position ?? 'static',
    left: cs.left ?? 'auto',
    top: cs.top ?? 'auto',
    right: cs.right ?? 'auto',
    bottom: cs.bottom ?? 'auto',
    zIndex: cs.zIndex ?? 'auto',
    rotate: (cs as any).rotate ?? 'none',
    scaleX,
    scaleY,
    justifySelf: cs.justifySelf ?? 'auto',
    alignSelf: cs.alignSelf ?? 'auto',
    parentDisplay: 'block',
    parentFlexDirection: 'row',
  }
}

/** Which spatial axis align-self operates on for this element's parent.
 *  Returns 'horizontal' (left/center/right labels + horizontal-shift icons)
 *  or 'vertical' (top/middle/bottom labels + vertical-shift icons).
 *
 *  - Abs/fixed elements: ALWAYS vertical — abs-positioned boxes are not
 *    flex items, so the parent's flex-direction does NOT determine their
 *    cross axis. align-self operates on the abs-positioning containing
 *    block's block axis (vertical in horizontal writing modes). This
 *    check comes FIRST because abs/fixed escapes the parent's layout
 *    system. (Caught by codex review on PR #161.)
 *  - Grid items: align-self is the block axis → vertical
 *  - Flex items (non-abs): cross axis depends on flex-direction
 *      row*    → cross is vertical
 *      column* → cross is horizontal
 *  - Default (block parent, abs not set): vertical
 *
 *  This is the core of the parent-aware UI: same CSS property write, but
 *  icons + labels + aria adapt to what the user will actually SEE happen
 *  on screen. Eliminates the v1 lie where align-self icons always showed
 *  vertical movement even when parent was column-flex (where align-self
 *  actually moves the element horizontally). */
export function alignSelfAxis(
  values: Pick<PositionValues, 'position' | 'parentDisplay' | 'parentFlexDirection'>,
): 'horizontal' | 'vertical' {
  // Abs/fixed escapes the parent's layout system — flex-direction does
  // not apply. Must come before the flex check.
  if (values.position === 'absolute' || values.position === 'fixed') return 'vertical'
  if (values.parentDisplay.includes('flex')) {
    const dir = values.parentFlexDirection
    if (dir === 'column' || dir === 'column-reverse') return 'horizontal'
    return 'vertical'
  }
  // Grid items align-self = block axis. Default = vertical.
  return 'vertical'
}

/** Whether justify-self would actually affect this element's layout.
 *  Per CSS Box Alignment Level 3 §10.2, justify-self is explicitly IGNORED
 *  on flex items — the main-axis position is fully owned by the parent's
 *  justify-content. So flex children get no justify-self row even though
 *  align-self still works on them. Grid items and abs-positioned boxes
 *  honor both. */
export function justifySelfApplies(values: Pick<PositionValues, 'position' | 'parentDisplay'>): boolean {
  if (values.position === 'absolute' || values.position === 'fixed') return true
  // Grid items honor justify-self; flex items do NOT.
  return values.parentDisplay.includes('grid')
}

/** Whether align-self would actually affect this element's layout.
 *  Honored on flex items (cross-axis), grid items (block-axis), and
 *  abs-positioned boxes. */
export function alignSelfApplies(values: Pick<PositionValues, 'position' | 'parentDisplay'>): boolean {
  if (values.position === 'absolute' || values.position === 'fixed') return true
  return values.parentDisplay.includes('flex') || values.parentDisplay.includes('grid')
}

interface SelfAlignmentBlockProps {
  values: Pick<PositionValues, 'position' | 'parentDisplay' | 'parentFlexDirection' | 'justifySelf' | 'alignSelf'>
  onChange: (change: PositionChange) => void
}

// Axis-specific icon and label sets — chosen at render time per row based
// on which spatial axis each CSS property is operating on for this parent.
// HORIZONTAL labels read left/center/right and pair with horizontal-shift
// icons (JustifySelf*). VERTICAL labels read top/middle/bottom and pair
// with vertical-shift icons (AlignSelf*). Names of the icons retain their
// CSS-property origin but the visual semantic is "anchor box left/center/
// right within cell" vs "anchor box top/middle/bottom within cell" — both
// are reusable across justify-self and align-self depending on parent.
const HORIZONTAL_AXIS = {
  startIcon: JustifySelfStart,
  centerIcon: JustifySelfCenter,
  endIcon: JustifySelfEnd,
  startLabel: 'left',
  centerLabel: 'center',
  endLabel: 'right',
} as const
const VERTICAL_AXIS = {
  startIcon: AlignSelfStart,
  centerIcon: AlignSelfCenter,
  endIcon: AlignSelfEnd,
  startLabel: 'top',
  centerLabel: 'middle',
  endLabel: 'bottom',
} as const

function SelfAlignmentBlock({
  values,
  onChange,
}: SelfAlignmentBlockProps): JSX.Element | null {
  // Toggle-to-clear: clicking the already-active button emits 'auto'
  // instead of re-emitting the same value. Matches Figma / Webflow /
  // Linear convention — every set is undoable via the inverse gesture.
  const setJustify = useCallback(
    (value: string) =>
      onChange({
        property: 'justify-self',
        value: values.justifySelf === value ? 'auto' : value,
      }),
    [onChange, values.justifySelf],
  )
  const setAlign = useCallback(
    (value: string) =>
      onChange({
        property: 'align-self',
        value: values.alignSelf === value ? 'auto' : value,
      }),
    [onChange, values.alignSelf],
  )

  const showJustify = justifySelfApplies(values)
  const showAlign = alignSelfApplies(values)
  if (!showJustify && !showAlign) return null

  // justify-self always operates on the horizontal axis when it applies
  // (grid inline axis or abs-positioning containing block). align-self
  // varies — see alignSelfAxis().
  const justifyAxis = HORIZONTAL_AXIS
  const alignAxis = alignSelfAxis(values) === 'horizontal' ? HORIZONTAL_AXIS : VERTICAL_AXIS

  // Capitalize for sentence-case in aria labels and tooltips.
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div class="cortex-position-section__self-align">
      {showJustify && (
        <div class="cortex-position-section__btn-group" role="group" aria-label={`Justify self ${justifyAxis.startLabel}/${justifyAxis.centerLabel}/${justifyAxis.endLabel}`}>
          <IconButton icon={<justifyAxis.startIcon size={14} />}  ariaLabel={`Justify self ${justifyAxis.startLabel}`}  tooltip={`Justify self · ${cap(justifyAxis.startLabel)}`}  active={values.justifySelf === 'start'}  onClick={() => setJustify('start')} />
          <IconButton icon={<justifyAxis.centerIcon size={14} />} ariaLabel={`Justify self ${justifyAxis.centerLabel}`} tooltip={`Justify self · ${cap(justifyAxis.centerLabel)}`} active={values.justifySelf === 'center'} onClick={() => setJustify('center')} />
          <IconButton icon={<justifyAxis.endIcon size={14} />}    ariaLabel={`Justify self ${justifyAxis.endLabel}`}    tooltip={`Justify self · ${cap(justifyAxis.endLabel)}`}    active={values.justifySelf === 'end'}    onClick={() => setJustify('end')} />
        </div>
      )}
      {showAlign && (
        <div class="cortex-position-section__btn-group" role="group" aria-label={`Align self ${alignAxis.startLabel}/${alignAxis.centerLabel}/${alignAxis.endLabel}`}>
          <IconButton icon={<alignAxis.startIcon size={14} />}  ariaLabel={`Align self ${alignAxis.startLabel}`}  tooltip={`Align self · ${cap(alignAxis.startLabel)}`}  active={values.alignSelf === 'start'}  onClick={() => setAlign('start')} />
          <IconButton icon={<alignAxis.centerIcon size={14} />} ariaLabel={`Align self ${alignAxis.centerLabel}`} tooltip={`Align self · ${cap(alignAxis.centerLabel)}`} active={values.alignSelf === 'center'} onClick={() => setAlign('center')} />
          <IconButton icon={<alignAxis.endIcon size={14} />}    ariaLabel={`Align self ${alignAxis.endLabel}`}    tooltip={`Align self · ${cap(alignAxis.endLabel)}`}    active={values.alignSelf === 'end'}    onClick={() => setAlign('end')} />
        </div>
      )}
    </div>
  )
}

export function PositionSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  dimmedProperties,
  stale,
}: PositionSectionProps): JSX.Element {
  const isStatic = values.position === 'static'

  const handlePositionMode = useCallback(
    (v: string) => onChange({ property: 'position', value: v }),
    [onChange],
  )

  // Edge-offset handlers — one per CSS property so absolute/fixed elements
  // can anchor to any combination of edges (e.g., bottom-right by setting
  // right + bottom and leaving top + left at 'auto'). The v1 X/Y-only
  // surface only exposed top + left, which silently broke anchoring to
  // the opposite corner. Webflow's per-edge pattern, adapted to our
  // compact panel.
  const makeEdgeHandler = (property: 'top' | 'right' | 'bottom' | 'left') => ({
    onChange: (v: number) => onChange({ property, value: `${v}px` }),
    onScrub: (v: number) => onScrub?.({ property, value: `${v}px` }),
    onScrubEnd: (v: number) => onScrubEnd?.({ property, value: `${v}px` }),
  })
  const topHandlers = makeEdgeHandler('top')
  const rightHandlers = makeEdgeHandler('right')
  const bottomHandlers = makeEdgeHandler('bottom')
  const leftHandlers = makeEdgeHandler('left')

  const handleZChange = useCallback(
    (v: number) => onChange({ property: 'z-index', value: `${v}` }),
    [onChange],
  )

  const rotateNum = values.rotate === 'none' ? 0 : parseFloat(values.rotate)
  const isFlippedH = parseFloat(values.scaleX) < 0
  const isFlippedV = parseFloat(values.scaleY) < 0

  const handleRotateChange = useCallback(
    (v: number) => onChange({ property: 'rotate', value: `${v}deg` }),
    [onChange],
  )
  const handleRotateScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'rotate', value: `${v}deg` }) },
    [onScrub],
  )
  const handleRotateScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'rotate', value: `${v}deg` }) },
    [onScrubEnd],
  )

  const handleFlipH = useCallback(() => {
    const parsed = parseFloat(values.scaleX)
    const magnitude = Number.isNaN(parsed) ? 1 : Math.abs(parsed)
    const newX = isFlippedH ? magnitude : -magnitude
    onChange({ property: 'scale', value: `${newX} ${values.scaleY}` })
  }, [isFlippedH, values.scaleX, values.scaleY, onChange])

  const handleFlipV = useCallback(() => {
    const parsed = parseFloat(values.scaleY)
    const magnitude = Number.isNaN(parsed) ? 1 : Math.abs(parsed)
    const newY = isFlippedV ? magnitude : -magnitude
    onChange({ property: 'scale', value: `${values.scaleX} ${newY}` })
  }, [isFlippedV, values.scaleX, values.scaleY, onChange])

  // CSS 'auto' parses to NaN; coerce to 0 so the numeric input renders a
  // value. The unit chip switches to 'auto' when the underlying value IS
  // auto, signalling the difference visually without breaking the spinner.
  const edgeNum = (raw: string): number => {
    const n = parseFloat(raw)
    return isNaN(n) ? 0 : n
  }
  const topNum = edgeNum(values.top)
  const rightNum = edgeNum(values.right)
  const bottomNum = edgeNum(values.bottom)
  const leftNum = edgeNum(values.left)
  const zValue = parseFloat(values.zIndex) || 0
  const edgeUnit = (raw: string): string => (isNaN(parseFloat(raw)) ? 'auto' : 'px')

  const isSticky = values.position === 'sticky'
  const isFixed = values.position === 'fixed'
  const isAbsolute = values.position === 'absolute'
  // Per-mode tooltip framing — keeps the same label across modes (T/R/B/L)
  // but explains what the edge MEANS for the current position kind. Hover
  // teaching beats forcing the designer to read CSS docs.
  const offsetMode =
    isStatic    ? 'Set position to relative, absolute, fixed, or sticky to use offsets'
  : isSticky    ? 'Stick when scrolled past this distance from the edge'
  : isFixed     ? 'Distance from the viewport edge'
  : isAbsolute  ? 'Distance from the containing block edge'
  :               'Nudge from normal flow' // relative
  const edgeTooltip = (edge: 'top' | 'right' | 'bottom' | 'left'): string =>
    isStatic ? offsetMode : `${edge.charAt(0).toUpperCase() + edge.slice(1)} — ${offsetMode}`

  return (
    <div class="cortex-position-section" data-section-id="position">
      <div class="cortex-position-section__group">
        <PositionDropdown
          value={values.position}
          onChange={handlePositionMode}
        />
      </div>
      <SelfAlignmentBlock values={values} onChange={onChange} />
      {/* Edge offsets row — T R B L always rendered for visual stability
          across mode switches (designer's mental model breaks when controls
          come and go). Disabled+tooltip when position is static, per user
          feedback that hiding them made the panel feel empty. All 4 edges
          enabled for any non-static position, so absolute/fixed elements
          can anchor to bottom-right (or any combination) by setting the
          desired edges and leaving others 'auto'. */}
      <div
        class={`cortex-position-section__xy-row${isDimmed(dimmedProperties, 'left', 'top', 'right', 'bottom') ? ' cortex-control--dimmed' : ''}`}
      >
        <NumericInput value={topNum}    unit={isStatic ? 'auto' : edgeUnit(values.top)}    prefix="T" tooltip={edgeTooltip('top')}    disabled={isStatic} tokenFamily="spacing" onChange={topHandlers.onChange}    onScrub={topHandlers.onScrub}    onScrubEnd={topHandlers.onScrubEnd}    stale={stale} />
        <NumericInput value={rightNum}  unit={isStatic ? 'auto' : edgeUnit(values.right)}  prefix="R" tooltip={edgeTooltip('right')}  disabled={isStatic} tokenFamily="spacing" onChange={rightHandlers.onChange}  onScrub={rightHandlers.onScrub}  onScrubEnd={rightHandlers.onScrubEnd}  stale={stale} />
        <NumericInput value={bottomNum} unit={isStatic ? 'auto' : edgeUnit(values.bottom)} prefix="B" tooltip={edgeTooltip('bottom')} disabled={isStatic} tokenFamily="spacing" onChange={bottomHandlers.onChange} onScrub={bottomHandlers.onScrub} onScrubEnd={bottomHandlers.onScrubEnd} stale={stale} />
        <NumericInput value={leftNum}   unit={isStatic ? 'auto' : edgeUnit(values.left)}   prefix="L" tooltip={edgeTooltip('left')}   disabled={isStatic} tokenFamily="spacing" onChange={leftHandlers.onChange}   onScrub={leftHandlers.onScrub}   onScrubEnd={leftHandlers.onScrubEnd}   stale={stale} />
      </div>
      <div class="cortex-position-section__z-row">
        <NumericInput value={zValue} prefix="Z" tooltip="Z-index — stacking order" onChange={handleZChange} stale={stale} />
      </div>
      <div class={`cortex-position-section__rotate-row${isDimmed(dimmedProperties, 'rotate', 'scale') ? ' cortex-control--dimmed' : ''}`}>
        <NumericInput
          value={rotateNum}
          unit="deg"
          prefix={<RotateCw size={12} />}
          tooltip="Rotation"
          onChange={handleRotateChange}
          onScrub={handleRotateScrub}
          onScrubEnd={handleRotateScrubEnd}
          stale={stale}
        />
        <IconButton
          icon={<FlipHorizontal size={14} />}
          ariaLabel="Flip horizontal"
          tooltip="Flip horizontal"
          active={isFlippedH}
          onClick={handleFlipH}
        />
        <IconButton
          icon={<FlipVertical size={14} />}
          ariaLabel="Flip vertical"
          tooltip="Flip vertical"
          active={isFlippedV}
          onClick={handleFlipV}
        />
      </div>
    </div>
  )
}
