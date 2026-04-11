import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'

export interface BorderChange {
  property: string
  value: string
}

export interface BorderValues {
  borderWidth: number
  borderStyle: string
  borderColor: string
  borderRadius: number
  borderTopLeftRadius: number
  borderTopRightRadius: number
  borderBottomRightRadius: number
  borderBottomLeftRadius: number
}

export interface BorderSectionProps {
  values: BorderValues
  onChange: (change: BorderChange) => void
  onScrub?: (change: BorderChange) => void
  onScrubEnd?: (change: BorderChange) => void
  swatches?: string[]
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

/** Extract border-related values from a CSSStyleDeclaration. */
export function parseBorderValues(cs: CSSStyleDeclaration): BorderValues {
  return {
    borderWidth: parseFloat(cs.borderWidth) || 0,
    borderStyle: cs.borderStyle ?? 'none',
    borderColor: cs.borderColor ?? 'rgb(0, 0, 0)',
    borderRadius: parseFloat(cs.borderRadius) || 0,
    borderTopLeftRadius: parseFloat(cs.borderTopLeftRadius) || 0,
    borderTopRightRadius: parseFloat(cs.borderTopRightRadius) || 0,
    borderBottomRightRadius: parseFloat(cs.borderBottomRightRadius) || 0,
    borderBottomLeftRadius: parseFloat(cs.borderBottomLeftRadius) || 0,
  }
}

export function summarizeBorder(values: BorderValues): string {
  if (values.borderStyle === 'none' || values.borderWidth === 0) return 'none'
  return `${values.borderWidth}px ${values.borderStyle}`
}

const STYLE_OPTIONS = [
  { value: 'solid', icon: '\u2014', title: 'Solid' },
  { value: 'dashed', icon: '--', title: 'Dashed' },
  { value: 'dotted', icon: '\u00B7\u00B7', title: 'Dotted' },
  { value: 'none', icon: '\u2298', title: 'None' },
]

export function BorderSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  swatches,
  mixedProperties,
}: BorderSectionProps): JSX.Element {
  const handleWidthChange = useCallback(
    (v: number) => onChange({ property: 'border-width', value: `${v}px` }),
    [onChange],
  )
  const handleWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-width', value: `${v}px` }) },
    [onScrubEnd],
  )

  const handleStyleChange = useCallback(
    (v: string) => onChange({ property: 'border-style', value: v }),
    [onChange],
  )

  const handleColorChange = useCallback(
    (hex: string) => onChange({ property: 'border-color', value: hex }),
    [onChange],
  )

  return (
    <div class="cortex-border-section" data-section-id="border">
      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Width</span>
        <NumericInput
          value={values.borderWidth}
          unit="px"
          label="W"
          tooltip="Border Width"
          min={0}
          mixed={mixedProperties?.has('border-width')}
          onChange={handleWidthChange}
          onScrub={handleWidthScrub}
          onScrubEnd={handleWidthScrubEnd}
        />
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Style</span>
        <SegmentedControl
          options={STYLE_OPTIONS}
          value={values.borderStyle}
          onChange={handleStyleChange}
          size="sm"
        />
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Color</span>
        <ColorInput
          value={values.borderColor}
          onChange={handleColorChange}
          swatches={swatches}
          mixed={mixedProperties?.has('border-color')}
        />
      </div>

      {/* Task 3 (ZF0-1181): radius controls moved to AppearanceSection. This
          component still accepts the borderRadius / per-corner radius fields
          on BorderValues so Panel.tsx's parse path is unchanged, but no UI
          is rendered here. Task 14 (ZF0-1192) will fully remove the radius
          fields from BorderValues and parseBorderValues. */}
    </div>
  )
}
