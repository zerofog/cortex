import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'

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
}

export interface PositionSectionProps {
  values: PositionValues
  onChange: (change: PositionChange) => void
  onScrub?: (change: PositionChange) => void
  onScrubEnd?: (change: PositionChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
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
  }
}

const POSITION_MODE_OPTIONS = [
  { value: 'static', label: 'stat', title: 'Static' },
  { value: 'relative', label: 'rel', title: 'Relative' },
  { value: 'absolute', label: 'abs', title: 'Absolute' },
  { value: 'fixed', label: 'fix', title: 'Fixed' },
  { value: 'sticky', label: 'stky', title: 'Sticky' },
]

export function PositionSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
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
  const isFlippedH = values.scaleX === '-1'
  const isFlippedV = values.scaleY === '-1'

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
  const handleRotate90 = useCallback(() => {
    const current = values.rotate === 'none' ? 0 : parseFloat(values.rotate)
    const next = (current + 90) % 360
    onChange({ property: 'rotate', value: `${next}deg` })
  }, [values.rotate, onChange])

  const handleFlipH = useCallback(() => {
    const newX = isFlippedH ? '1' : '-1'
    onChange({ property: 'scale', value: `${newX} ${values.scaleY}` })
  }, [isFlippedH, values.scaleY, onChange])

  const handleFlipV = useCallback(() => {
    const newY = isFlippedV ? '1' : '-1'
    onChange({ property: 'scale', value: `${values.scaleX} ${newY}` })
  }, [isFlippedV, values.scaleX, onChange])

  const leftNum = parseFloat(values.left)
  const topNum = parseFloat(values.top)
  const xValue = isStatic ? 0 : (isNaN(leftNum) ? 0 : leftNum)
  const yValue = isStatic ? 0 : (isNaN(topNum) ? 0 : topNum)
  const zValue = parseFloat(values.zIndex) || 0

  return (
    <div class="cortex-position-section" data-section-id="position">
      <div class="cortex-position-section__group">
        <SegmentedControl
          options={POSITION_MODE_OPTIONS}
          value={values.position}
          onChange={handlePositionMode}
          size="sm"
        />
      </div>
      <div class={`cortex-position-section__xy-row${isStatic ? ' cortex-position-section__xy-row--disabled' : ''}`}>
        <NumericInput value={xValue} unit={isStatic ? 'auto' : 'px'} label="X" tooltip="Left offset" onChange={handleXChange} onScrub={handleXScrub} onScrubEnd={handleXScrubEnd} />
        <NumericInput value={yValue} unit={isStatic ? 'auto' : 'px'} label="Y" tooltip="Top offset" onChange={handleYChange} onScrub={handleYScrub} onScrubEnd={handleYScrubEnd} />
        <NumericInput value={zValue} label="Z" tooltip="Z-index" onChange={handleZChange} />
      </div>
      <div class="cortex-position-section__rotate-row">
        <NumericInput
          value={rotateNum}
          unit="deg"
          label="∠"
          tooltip="Rotation"
          onChange={handleRotateChange}
          onScrub={handleRotateScrub}
          onScrubEnd={handleRotateScrubEnd}
        />
        <button
          class="cortex-position-section__toggle"
          type="button"
          data-tooltip="Rotate 90°"
          aria-label="Rotate 90 degrees"
          onClick={handleRotate90}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 7a5 5 0 0 1 9-3" />
            <polyline points="11,1 11,4.5 7.5,4.5" />
          </svg>
        </button>
        <button
          class={`cortex-position-section__toggle${isFlippedH ? ' cortex-position-section__toggle--active' : ''}`}
          type="button"
          data-tooltip="Flip horizontal"
          aria-label="Flip horizontal"
          aria-pressed={isFlippedH ? 'true' : 'false'}
          onClick={handleFlipH}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 1v12M3 4l-2 3 2 3M11 4l2 3-2 3" />
          </svg>
        </button>
        <button
          class={`cortex-position-section__toggle${isFlippedV ? ' cortex-position-section__toggle--active' : ''}`}
          type="button"
          data-tooltip="Flip vertical"
          aria-label="Flip vertical"
          aria-pressed={isFlippedV ? 'true' : 'false'}
          onClick={handleFlipV}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 7h12M4 3L7 1l3 2M4 11l3 2 3-2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
