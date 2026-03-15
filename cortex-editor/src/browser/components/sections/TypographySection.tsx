import type { JSX } from 'preact'
import { useState, useRef, useCallback, useMemo } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { Dropdown } from '../controls/Dropdown.js'

export interface TypographyChange {
  property: string
  value: string
}

export interface TypographyValues {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
  textAlign: string
  color: string
}

export interface TypographySectionProps {
  values: TypographyValues
  availableWeights: string[]
  onChange: (change: TypographyChange) => void
  onScrub?: (change: TypographyChange) => void
  onScrubEnd?: (change: TypographyChange) => void
}

/** Extract typography-related values from a CSSStyleDeclaration. */
export function parseTypographyValues(cs: CSSStyleDeclaration): TypographyValues {
  const fontSize = parseFloat(cs.fontSize) || 16
  return {
    fontFamily: cs.fontFamily ?? '',
    fontSize,
    fontWeight: cs.fontWeight ?? '400',
    lineHeight: cs.lineHeight === 'normal' ? 1.5 : (parseFloat(cs.lineHeight) / fontSize) || 1.5,
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
    textAlign: cs.textAlign ?? 'left',
    color: cs.color ?? 'rgb(0, 0, 0)',
  }
}

/** Get available weights for a font family from document.fonts. */
export function getWeightsForFamily(family: string): string[] {
  if (!document.fonts?.[Symbol.iterator]) return ['400']
  const weights = new Set<string>()
  for (const face of document.fonts) {
    const f = face as FontFace
    const faceName = stripCSSQuotes(f.family)
    if (faceName === family) {
      const w = f.weight
      // Variable fonts report ranges like "100 900"
      if (w.includes(' ')) {
        const parts = w.split(' ').map(Number)
        const min = parts[0] ?? 400
        const max = parts[1] ?? 400
        for (const std of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
          if (std >= min && std <= max) weights.add(String(std))
        }
      } else {
        weights.add(w)
      }
    }
  }
  return weights.size > 0
    ? [...weights].sort((a, b) => Number(a) - Number(b))
    : ['100', '200', '300', '400', '500', '600', '700', '800', '900']
}

const WEIGHT_LABELS: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semibold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
}

const ALIGN_OPTIONS = [
  { value: 'left', icon: '≡←', title: 'Left' },
  { value: 'center', icon: '≡', title: 'Center' },
  { value: 'right', icon: '≡→', title: 'Right' },
  { value: 'justify', icon: '≡↔', title: 'Justify' },
]

/** Strip surrounding quotes from CSS values like font-family. */
export function stripCSSQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/** Parse any CSS color format to #RRGGBB. Returns null if unparseable. */
function rgbToHex(color: string): string | null {
  const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return null
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function TypographySection({
  values,
  availableWeights,
  onChange,
  onScrub,
  onScrubEnd,
}: TypographySectionProps): JSX.Element {
  const hexColor = rgbToHex(values.color) ?? values.color
  const colorInputRef = useRef<HTMLInputElement>(null)
  // Nullable editing state: null = not editing (show computed hexColor), string = user's input
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : hexColor

  const weightOptions = useMemo(() => {
    const opts = availableWeights.map((w) => ({
      value: w,
      label: WEIGHT_LABELS[w] ? `${w} - ${WEIGHT_LABELS[w]}` : w,
    }))
    // Always include current weight
    if (!availableWeights.includes(values.fontWeight)) {
      opts.push({
        value: values.fontWeight,
        label: WEIGHT_LABELS[values.fontWeight] ? `${values.fontWeight} - ${WEIGHT_LABELS[values.fontWeight]}` : values.fontWeight,
      })
    }
    return opts
  }, [availableWeights, values.fontWeight])

  const handleWeightChange = useCallback(
    (v: string) => onChange({ property: 'font-weight', value: v }),
    [onChange],
  )
  const handleAlignChange = useCallback(
    (v: string) => onChange({ property: 'text-align', value: v }),
    [onChange],
  )

  // Review finding 2c: individual useCallback handlers instead of factory
  const handleFontSizeChange = useCallback(
    (v: number) => onChange({ property: 'font-size', value: `${v}px` }),
    [onChange],
  )
  const handleFontSizeScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'font-size', value: `${v}px` }) },
    [onScrub],
  )
  const handleFontSizeScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'font-size', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleLineHeightChange = useCallback(
    (v: number) => onChange({ property: 'line-height', value: String(v) }),
    [onChange],
  )
  const handleLineHeightScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'line-height', value: String(v) }) },
    [onScrub],
  )
  const handleLineHeightScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'line-height', value: String(v) }) },
    [onScrubEnd],
  )
  const handleLetterSpacingChange = useCallback(
    (v: number) => onChange({ property: 'letter-spacing', value: `${v}px` }),
    [onChange],
  )
  const handleLetterSpacingScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'letter-spacing', value: `${v}px` }) },
    [onScrub],
  )
  const handleLetterSpacingScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'letter-spacing', value: `${v}px` }) },
    [onScrubEnd],
  )

  const handleSwatchClick = useCallback(() => {
    colorInputRef.current?.click()
  }, [])

  const handleColorPick = useCallback((e: Event) => {
    const hex = (e.target as HTMLInputElement).value
    onChange({ property: 'color', value: hex })
  }, [onChange])

  const handleHexInput = useCallback((e: Event) => {
    setEditingHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setEditingHex(hexColor)
  }, [hexColor])

  const handleHexBlur = useCallback(() => {
    if (editingHex !== null && HEX_REGEX.test(editingHex)) {
      onChange({ property: 'color', value: editingHex })
    }
    setEditingHex(null)
  }, [editingHex, onChange])

  return (
    <div class="cortex-typography-section" data-section-id="type">
      <span class="cortex-section-label">Font</span>
      <div class="cortex-typography-section__row">
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.fontSize}
            unit="px"
            label="SZ"
            tooltip="Font Size"
            min={1}
            onChange={handleFontSizeChange}
            onScrub={handleFontSizeScrub}
            onScrubEnd={handleFontSizeScrubEnd}
          />
        </div>
        <div class="cortex-typography-section__field">
          <span class="cortex-typography-section__inline-label" data-tooltip="Font Weight">WT</span>
          <Dropdown
            options={weightOptions}
            value={values.fontWeight}
            onChange={handleWeightChange}
          />
        </div>
      </div>

      <div class="cortex-typography-section__row">
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.lineHeight}
            label="LH"
            tooltip="Line Height"
            onChange={handleLineHeightChange}
            onScrub={handleLineHeightScrub}
            onScrubEnd={handleLineHeightScrubEnd}
          />
        </div>
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.letterSpacing}
            unit="px"
            label="LS"
            tooltip="Letter Spacing"
            onChange={handleLetterSpacingChange}
            onScrub={handleLetterSpacingScrub}
            onScrubEnd={handleLetterSpacingScrubEnd}
          />
        </div>
      </div>

      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">Align</span>
        <SegmentedControl
          options={ALIGN_OPTIONS}
          value={values.textAlign}
          onChange={handleAlignChange}
          size="sm"
        />
      </div>

      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">COL</span>
        <div class="cortex-color-input">
          <div
            class="cortex-color-input__swatch"
            style={{ backgroundColor: values.color }}
            onClick={handleSwatchClick}
          />
          <input
            ref={colorInputRef}
            class="cortex-color-input__native"
            type="color"
            value={hexColor}
            onInput={handleColorPick}
          />
          <input
            class="cortex-color-input__hex"
            type="text"
            value={displayedHex}
            onInput={handleHexInput}
            onFocus={handleHexFocus}
            onBlur={handleHexBlur}
          />
        </div>
      </div>
    </div>
  )
}
