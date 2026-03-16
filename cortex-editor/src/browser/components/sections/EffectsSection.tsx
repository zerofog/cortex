import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { Dropdown } from '../controls/Dropdown.js'

export interface EffectsChange {
  property: string
  value: string
}

export interface EffectsValues {
  opacity: number      // 0-100 (percentage)
  overflow: string
  cursor: string
  blur: number         // px
  backdropBlur: number // px
}

export interface EffectsSectionProps {
  values: EffectsValues
  onChange: (change: EffectsChange) => void
  onScrub?: (change: EffectsChange) => void
  onScrubEnd?: (change: EffectsChange) => void
}

function parseBlurValue(filter: string): number {
  const m = filter.match(/blur\(([\d.]+)px\)/)
  return m ? parseFloat(m[1]) : 0
}

/** Extract effects-related values from a CSSStyleDeclaration. */
export function parseEffectsValues(cs: CSSStyleDeclaration): EffectsValues {
  return {
    opacity: Math.round((parseFloat(cs.opacity) || 1) * 100),
    overflow: cs.overflow ?? 'visible',
    cursor: cs.cursor ?? 'auto',
    blur: parseBlurValue(cs.filter ?? ''),
    backdropBlur: parseBlurValue(
      cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
    ),
  }
}

const OVERFLOW_OPTIONS = [
  { value: 'visible', label: 'vis', title: 'Visible' },
  { value: 'hidden', label: 'hid', title: 'Hidden' },
  { value: 'scroll', label: 'scr', title: 'Scroll' },
  { value: 'auto', label: 'auto', title: 'Auto' },
]

const CURSOR_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'default', label: 'default' },
  { value: 'pointer', label: 'pointer' },
  { value: 'text', label: 'text' },
  { value: 'move', label: 'move' },
  { value: 'grab', label: 'grab' },
  { value: 'not-allowed', label: 'not-allowed' },
  { value: 'crosshair', label: 'crosshair' },
  { value: 'none', label: 'none' },
]

export function EffectsSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: EffectsSectionProps): JSX.Element {
  // Opacity handlers
  const handleOpacityChange = useCallback(
    (v: number) => onChange({ property: 'opacity', value: String(v / 100) }),
    [onChange],
  )
  const handleOpacityScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'opacity', value: String(v / 100) }) },
    [onScrub],
  )
  const handleOpacityScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'opacity', value: String(v / 100) }) },
    [onScrubEnd],
  )

  // Overflow handler
  const handleOverflowChange = useCallback(
    (v: string) => onChange({ property: 'overflow', value: v }),
    [onChange],
  )

  // Cursor handler
  const handleCursorChange = useCallback(
    (v: string) => onChange({ property: 'cursor', value: v }),
    [onChange],
  )

  // Blur handlers
  const handleBlurChange = useCallback(
    (v: number) => onChange({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }),
    [onChange],
  )
  const handleBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrub],
  )
  const handleBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrubEnd],
  )

  // Backdrop blur handlers
  const handleBackdropBlurChange = useCallback(
    (v: number) => onChange({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }),
    [onChange],
  )
  const handleBackdropBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrub],
  )
  const handleBackdropBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'backdrop-filter', value: v > 0 ? `blur(${v}px)` : 'none' }) },
    [onScrubEnd],
  )

  return (
    <div class="cortex-effects-section" data-section-id="effects">
      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Opacity</span>
        <NumericInput
          value={values.opacity}
          unit="%"
          label="OP"
          tooltip="Opacity"
          min={0}
          onChange={handleOpacityChange}
          onScrub={handleOpacityScrub}
          onScrubEnd={handleOpacityScrubEnd}
        />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Overflow</span>
        <SegmentedControl
          options={OVERFLOW_OPTIONS}
          value={values.overflow}
          onChange={handleOverflowChange}
          size="sm"
        />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Cursor</span>
        <Dropdown
          options={CURSOR_OPTIONS}
          value={values.cursor}
          onChange={handleCursorChange}
        />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">Blur</span>
        <NumericInput
          value={values.blur}
          unit="px"
          label="BL"
          tooltip="Blur"
          min={0}
          onChange={handleBlurChange}
          onScrub={handleBlurScrub}
          onScrubEnd={handleBlurScrubEnd}
        />
      </div>

      <div class="cortex-effects-section__group">
        <span class="cortex-section-label">BG Blur</span>
        <NumericInput
          value={values.backdropBlur}
          unit="px"
          label="BG"
          tooltip="Backdrop Blur"
          min={0}
          onChange={handleBackdropBlurChange}
          onScrub={handleBackdropBlurScrub}
          onScrubEnd={handleBackdropBlurScrubEnd}
        />
      </div>
    </div>
  )
}
