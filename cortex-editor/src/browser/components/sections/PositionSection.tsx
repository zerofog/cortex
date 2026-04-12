import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { PositionDropdown } from '../controls/PositionDropdown.js'
import { NumericInput } from '../controls/NumericInput.js'
import { IconButton } from '../controls/IconButton.js'
import {
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from '../icons.js'

export interface PositionChange {
  property: string
  value: string
}

export interface PositionValues {
  position: string   // static | relative | absolute | fixed | sticky
  left: string       // computed left (e.g., "8px", "auto")
  top: string        // computed top
  zIndex: string     // computed z-index (e.g., "auto", "1")
  rotate: string     // CSS rotate property (e.g., "none", "45deg")
  scaleX: string     // from CSS scale property, for flip detection
  scaleY: string     // from CSS scale property, for flip detection
  justifySelf: string // computed justify-self (e.g., "auto", "start", "center", "end")
  alignSelf: string   // computed align-self (e.g., "auto", "start", "center", "end")
}

export interface PositionSectionProps {
  values: PositionValues
  onChange: (change: PositionChange) => void
  onScrub?: (change: PositionChange) => void
  onScrubEnd?: (change: PositionChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /**
   * True when the selected element's PARENT has display: flex / inline-flex /
   * grid / inline-grid. Drives the conditional render of the self-alignment
   * 6-button block — justify-self / align-self only have meaningful effects
   * inside flex/grid containers.
   *
   * Computed in Panel.tsx (hot path) from
   * `getComputedStyle(element.parentElement).display` so the section itself
   * never re-touches the layout pipeline.
   */
  parentIsFlexOrGrid?: boolean
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
    zIndex: cs.zIndex ?? 'auto',
    rotate: (cs as any).rotate ?? 'none',
    scaleX,
    scaleY,
    justifySelf: cs.justifySelf ?? 'auto',
    alignSelf: cs.alignSelf ?? 'auto',
  }
}

interface SelfAlignmentBlockProps {
  justifySelf: string
  alignSelf: string
  onChange: (change: PositionChange) => void
}

// Tightly-scoped sub-block; lives in this file because it has zero reuse
// outside PositionSection v2. Extract to its own module if a second consumer
// ever appears.
function SelfAlignmentBlock({
  justifySelf,
  alignSelf,
  onChange,
}: SelfAlignmentBlockProps): JSX.Element {
  const setJustify = useCallback(
    (value: string) => onChange({ property: 'justify-self', value }),
    [onChange],
  )
  const setAlign = useCallback(
    (value: string) => onChange({ property: 'align-self', value }),
    [onChange],
  )

  return (
    <div class="cortex-position-section__self-align">
      <div class="cortex-position-section__self-align-row">
        <IconButton
          icon={<AlignHorizontalJustifyStart size={14} />}
          ariaLabel="Justify self start"
          tooltip="Justify self · start"
          active={justifySelf === 'start' || justifySelf === 'flex-start'}
          onClick={() => setJustify('start')}
        />
        <IconButton
          icon={<AlignHorizontalJustifyCenter size={14} />}
          ariaLabel="Justify self center"
          tooltip="Justify self · center"
          active={justifySelf === 'center'}
          onClick={() => setJustify('center')}
        />
        <IconButton
          icon={<AlignHorizontalJustifyEnd size={14} />}
          ariaLabel="Justify self end"
          tooltip="Justify self · end"
          active={justifySelf === 'end' || justifySelf === 'flex-end'}
          onClick={() => setJustify('end')}
        />
      </div>
      <div class="cortex-position-section__self-align-row">
        <IconButton
          icon={<AlignVerticalJustifyStart size={14} />}
          ariaLabel="Align self start"
          tooltip="Align self · start"
          active={alignSelf === 'start' || alignSelf === 'flex-start'}
          onClick={() => setAlign('start')}
        />
        <IconButton
          icon={<AlignVerticalJustifyCenter size={14} />}
          ariaLabel="Align self center"
          tooltip="Align self · center"
          active={alignSelf === 'center'}
          onClick={() => setAlign('center')}
        />
        <IconButton
          icon={<AlignVerticalJustifyEnd size={14} />}
          ariaLabel="Align self end"
          tooltip="Align self · end"
          active={alignSelf === 'end' || alignSelf === 'flex-end'}
          onClick={() => setAlign('end')}
        />
      </div>
    </div>
  )
}

export function PositionSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  parentIsFlexOrGrid,
}: PositionSectionProps): JSX.Element {
  const isStatic = values.position === 'static'

  const handlePositionMode = useCallback(
    (v: string) => onChange({ property: 'position', value: v }),
    [onChange],
  )

  const handleXChange = useCallback(
    (v: number) => onChange({ property: 'left', value: `${v}px` }),
    [onChange],
  )

  const handleYChange = useCallback(
    (v: number) => onChange({ property: 'top', value: `${v}px` }),
    [onChange],
  )

  const handleZChange = useCallback(
    (v: number) => onChange({ property: 'z-index', value: `${v}` }),
    [onChange],
  )

  const handleXScrub = useCallback(
    (v: number) => onScrub?.({ property: 'left', value: `${v}px` }),
    [onScrub],
  )

  const handleYScrub = useCallback(
    (v: number) => onScrub?.({ property: 'top', value: `${v}px` }),
    [onScrub],
  )

  const handleXScrubEnd = useCallback(
    (v: number) => onScrubEnd?.({ property: 'left', value: `${v}px` }),
    [onScrubEnd],
  )

  const handleYScrubEnd = useCallback(
    (v: number) => onScrubEnd?.({ property: 'top', value: `${v}px` }),
    [onScrubEnd],
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
    const magnitude = Math.abs(parseFloat(values.scaleX)) || 1
    const newX = isFlippedH ? magnitude : -magnitude
    onChange({ property: 'scale', value: `${newX} ${values.scaleY}` })
  }, [isFlippedH, values.scaleX, values.scaleY, onChange])

  const handleFlipV = useCallback(() => {
    const magnitude = Math.abs(parseFloat(values.scaleY)) || 1
    const newY = isFlippedV ? magnitude : -magnitude
    onChange({ property: 'scale', value: `${values.scaleX} ${newY}` })
  }, [isFlippedV, values.scaleX, values.scaleY, onChange])

  const leftNum = parseFloat(values.left)
  const topNum = parseFloat(values.top)
  const xValue = isStatic ? 0 : (isNaN(leftNum) ? 0 : leftNum)
  const yValue = isStatic ? 0 : (isNaN(topNum) ? 0 : topNum)
  // z-index defaults to 'auto' (NaN); coerce to 0 for the numeric input.
  // Edits send the literal numeric string back, never 'auto'.
  const zValue = parseFloat(values.zIndex) || 0

  const isSticky = values.position === 'sticky'
  const isFixed = values.position === 'fixed'
  const xTooltip = isSticky ? 'Stick at left' : isFixed ? 'Left from viewport' : 'Left offset'
  const yTooltip = isSticky ? 'Stick at top' : isFixed ? 'Top from viewport' : 'Top offset'

  return (
    <div class="cortex-position-section" data-section-id="position">
      <div class="cortex-position-section__group">
        <PositionDropdown
          value={values.position}
          onChange={handlePositionMode}
        />
      </div>
      {parentIsFlexOrGrid && (
        <SelfAlignmentBlock
          justifySelf={values.justifySelf}
          alignSelf={values.alignSelf}
          onChange={onChange}
        />
      )}
      <div
        class={`cortex-position-section__xy-row${isStatic ? ' cortex-position-section__xy-row--disabled' : ''}`}
        data-tooltip={isStatic ? 'Set position mode to enable' : undefined}
      >
        <NumericInput value={xValue} unit={isStatic ? 'auto' : 'px'} prefix="X" tooltip={xTooltip} disabled={isStatic} onChange={handleXChange} onScrub={handleXScrub} onScrubEnd={handleXScrubEnd} />
        <NumericInput value={yValue} unit={isStatic ? 'auto' : 'px'} prefix="Y" tooltip={yTooltip} disabled={isStatic} onChange={handleYChange} onScrub={handleYScrub} onScrubEnd={handleYScrubEnd} />
        <NumericInput value={zValue} prefix="Z" tooltip="Z-index" onChange={handleZChange} />
      </div>
      <div class="cortex-position-section__rotate-row">
        <NumericInput
          value={rotateNum}
          unit="deg"
          prefix={<RotateCw size={12} />}
          tooltip="Rotation"
          onChange={handleRotateChange}
          onScrub={handleRotateScrub}
          onScrubEnd={handleRotateScrubEnd}
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
