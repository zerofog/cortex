import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { Dropdown } from '../controls/Dropdown.js'

// ---------------------------------------------------------------------------
// EffectsSection — overflow, cursor, blur, backdrop-blur.
//
// Task 3 (ZF0-1181) moved `opacity` out of this section into the new
// AppearanceSection. Nothing in this file should reference opacity any more;
// if a grep turns anything up it's a regression — fix it in that commit, do
// not re-add a shadow copy here.
// ---------------------------------------------------------------------------

export interface EffectsChange {
  property: string
  value: string
}

export interface EffectsValues {
  overflow: string
  cursor: string
  blur: number         // px
  backdropBlur: number // px
  filterRaw: string    // raw filter string for non-destructive editing
  backdropFilterRaw: string // raw backdrop-filter string
}

export interface EffectsSectionProps {
  values: EffectsValues
  onChange: (change: EffectsChange) => void
  onScrub?: (change: EffectsChange) => void
  onScrubEnd?: (change: EffectsChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

function parseBlurValue(filter: string): number {
  const m = filter.match(/blur\(([\d.]+)px\)/)
  return m?.[1] ? parseFloat(m[1]) : 0
}

/** Replace or insert a blur() function in a filter string, preserving other functions. */
export function replaceBlurInFilter(existing: string, newBlur: number): string {
  const normalized = (!existing || existing === 'none') ? '' : existing
  const withoutBlur = normalized.replace(/blur\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
  if (newBlur === 0) return withoutBlur || 'none'
  return withoutBlur ? `${withoutBlur} blur(${newBlur}px)` : `blur(${newBlur}px)`
}

export function summarizeEffects(values: EffectsValues): string {
  const parts: string[] = []
  if (values.overflow !== 'visible') parts.push(values.overflow)
  if (values.blur > 0) parts.push(`blur ${values.blur}px`)
  if (values.backdropBlur > 0) parts.push(`bg-blur ${values.backdropBlur}px`)
  return parts.length > 0 ? parts.join(', ') : 'default'
}

/** Extract effects-related values from a CSSStyleDeclaration. */
export function parseEffectsValues(cs: CSSStyleDeclaration): EffectsValues {
  return {
    overflow: cs.overflow ?? 'visible',
    cursor: cs.cursor ?? 'auto',
    blur: parseBlurValue(cs.filter ?? ''),
    backdropBlur: parseBlurValue(
      cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
    ),
    filterRaw: cs.filter ?? '',
    backdropFilterRaw: cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
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

  // Blur handlers — preserve existing non-blur filter functions
  const handleBlurChange = useCallback(
    (v: number) => onChange({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }),
    [onChange, values.filterRaw],
  )
  const handleBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }) },
    [onScrub, values.filterRaw],
  )
  const handleBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }) },
    [onScrubEnd, values.filterRaw],
  )

  // Backdrop blur handlers — preserve existing non-blur backdrop-filter functions
  const handleBackdropBlurChange = useCallback(
    (v: number) => onChange({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }),
    [onChange, values.backdropFilterRaw],
  )
  const handleBackdropBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }) },
    [onScrub, values.backdropFilterRaw],
  )
  const handleBackdropBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }) },
    [onScrubEnd, values.backdropFilterRaw],
  )

  return (
    <div class="cortex-effects-section" data-section-id="effects">
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
