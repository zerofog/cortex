import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
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
}: BorderSectionProps): JSX.Element {
  const [perCorner, setPerCorner] = useState(false)

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

  const handleRadiusChange = useCallback(
    (v: number) => onChange({ property: 'border-radius', value: `${v}px` }),
    [onChange],
  )
  const handleRadiusScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-radius', value: `${v}px` }) },
    [onScrub],
  )
  const handleRadiusScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-radius', value: `${v}px` }) },
    [onScrubEnd],
  )

  const handleToggleCorners = useCallback(() => setPerCorner((v) => !v), [])

  // Per-corner handlers — created in render since they're used immediately
  const cornerHandlers = (property: string) => ({
    onChange: (v: number) => onChange({ property, value: `${v}px` }),
    onScrub: onScrub ? (v: number) => onScrub({ property, value: `${v}px` }) : undefined,
    onScrubEnd: onScrubEnd ? (v: number) => onScrubEnd({ property, value: `${v}px` }) : undefined,
  })

  return (
    <div class="cortex-border-section" data-section-id="border">
      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Border</span>
        <NumericInput
          value={values.borderWidth}
          unit="px"
          label="W"
          tooltip="Border Width"
          min={0}
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
        />
      </div>

      <div class="cortex-border-section__group">
        <span class="cortex-section-label">Radius</span>
        <div class="cortex-border-section__radius-row">
          {!perCorner && (
            <NumericInput
              value={values.borderRadius}
              unit="px"
              label="R"
              tooltip="Border Radius"
              min={0}
              onChange={handleRadiusChange}
              onScrub={handleRadiusScrub}
              onScrubEnd={handleRadiusScrubEnd}
            />
          )}
          <button
            class={`cortex-border-section__corner-toggle${perCorner ? ' cortex-border-section__corner-toggle--active' : ''}`}
            type="button"
            data-tooltip={perCorner ? 'Uniform radius' : 'Per-corner radius'}
            onClick={handleToggleCorners}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 14H2v-3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {perCorner && (
        <div class="cortex-border-section__corners">
          <NumericInput
            value={values.borderTopLeftRadius}
            unit="px"
            label="TL"
            tooltip="Top Left Radius"
            min={0}
            {...cornerHandlers('border-top-left-radius')}
          />
          <NumericInput
            value={values.borderTopRightRadius}
            unit="px"
            label="TR"
            tooltip="Top Right Radius"
            min={0}
            {...cornerHandlers('border-top-right-radius')}
          />
          <NumericInput
            value={values.borderBottomRightRadius}
            unit="px"
            label="BR"
            tooltip="Bottom Right Radius"
            min={0}
            {...cornerHandlers('border-bottom-right-radius')}
          />
          <NumericInput
            value={values.borderBottomLeftRadius}
            unit="px"
            label="BL"
            tooltip="Bottom Left Radius"
            min={0}
            {...cornerHandlers('border-bottom-left-radius')}
          />
        </div>
      )}
    </div>
  )
}
