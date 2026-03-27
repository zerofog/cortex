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

  const xValue = parseFloat(values.left) || 0
  const yValue = parseFloat(values.top) || 0
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
        <NumericInput value={xValue} unit="px" label="X" tooltip="Left offset" onChange={handleXChange} onScrub={handleXScrub} onScrubEnd={handleXScrubEnd} />
        <NumericInput value={yValue} unit="px" label="Y" tooltip="Top offset" onChange={handleYChange} onScrub={handleYScrub} onScrubEnd={handleYScrubEnd} />
        <NumericInput value={zValue} label="Z" tooltip="Z-index" onChange={handleZChange} />
      </div>
    </div>
  )
}
