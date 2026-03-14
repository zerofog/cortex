import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
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
  availableFonts: string[]
  availableWeights: string[]
  onChange: (change: TypographyChange) => void
  onScrub?: (change: TypographyChange) => void
  onScrubEnd?: (change: TypographyChange) => void
}

/** Extract typography-related values from a CSSStyleDeclaration. */
export function parseTypographyValues(cs: CSSStyleDeclaration): TypographyValues {
  const fontSize = parseFloat(cs.fontSize) || 16
  return {
    fontFamily: cs.fontFamily,
    fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight === 'normal' ? 1.5 : parseFloat(cs.lineHeight) / fontSize,
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
    textAlign: cs.textAlign,
    color: cs.color,
  }
}

/** Detect font families available in the current document. */
export function getAvailableFonts(): string[] {
  if (!document.fonts?.[Symbol.iterator]) return []
  const families = new Set<string>()
  for (const face of document.fonts) {
    families.add((face as FontFace).family.replace(/^["']|["']$/g, ''))
  }
  return [...families].sort()
}

/** Get available weights for a font family from document.fonts. */
export function getWeightsForFamily(family: string): string[] {
  if (!document.fonts?.[Symbol.iterator]) return ['400']
  const weights = new Set<string>()
  for (const face of document.fonts) {
    const f = face as FontFace
    const faceName = f.family.replace(/^["']|["']$/g, '')
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
    : ['400']
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
  availableFonts,
  availableWeights,
  onChange,
  onScrub,
  onScrubEnd,
}: TypographySectionProps): JSX.Element {
  const hexColor = rgbToHex(values.color) ?? values.color
  const [localHex, setLocalHex] = useState(hexColor)
  const [isEditingHex, setIsEditingHex] = useState(false)

  // Sync localHex from computed value when not editing
  if (!isEditingHex && localHex !== hexColor) {
    setLocalHex(hexColor)
  }

  // Build font options — always include current font
  const currentFontClean = values.fontFamily.replace(/^["']|["']$/g, '').split(',')[0].trim()
  const fontOptions = (() => {
    const fonts = new Set(availableFonts)
    fonts.add(currentFontClean)
    return [...fonts].sort().map((f) => ({ value: f, label: f }))
  })()

  const weightOptions = availableWeights.map((w) => ({
    value: w,
    label: WEIGHT_LABELS[w] ?? w,
  }))

  // Always include current weight
  if (!availableWeights.includes(values.fontWeight)) {
    weightOptions.push({
      value: values.fontWeight,
      label: WEIGHT_LABELS[values.fontWeight] ?? values.fontWeight,
    })
  }

  const handleFontChange = useCallback(
    (v: string) => onChange({ property: 'font-family', value: v }),
    [onChange],
  )
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

  const handleHexInput = useCallback((e: Event) => {
    setLocalHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setIsEditingHex(true)
  }, [])

  const handleHexBlur = useCallback(() => {
    setIsEditingHex(false)
    if (HEX_REGEX.test(localHex)) {
      onChange({ property: 'color', value: localHex })
    } else {
      setLocalHex(hexColor)
    }
  }, [localHex, hexColor, onChange])

  return (
    <div class="cortex-typography-section" data-section-id="type">
      <div class="cortex-typography-section__group">
        <span class="cortex-section-label">Font</span>
        <Dropdown
          options={fontOptions}
          value={currentFontClean}
          onChange={handleFontChange}
          placeholder="Select font..."
        />
      </div>

      <div class="cortex-typography-section__row">
        <div class="cortex-typography-section__field">
          <NumericInput
            value={values.fontSize}
            unit="px"
            label="SZ"
            min={1}
            onChange={handleFontSizeChange}
            onScrub={handleFontSizeScrub}
            onScrubEnd={handleFontSizeScrubEnd}
          />
        </div>
        <div class="cortex-typography-section__field">
          <span class="cortex-typography-section__inline-label">WT</span>
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
          />
          <input
            class="cortex-color-input__hex"
            type="text"
            value={localHex}
            onInput={handleHexInput}
            onFocus={handleHexFocus}
            onBlur={handleHexBlur}
          />
        </div>
      </div>
    </div>
  )
}
