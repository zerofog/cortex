import type { JSX } from 'preact'
import { useCallback, useMemo } from 'preact/hooks'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'

export interface FillChange {
  property: string
  value: string
}

export interface FillValues {
  backgroundColor: string
  backgroundImage: string
}

export interface FillSectionProps {
  values: FillValues
  onChange: (change: FillChange) => void
  swatches?: string[]
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
}

/** Extract fill-related values from a CSSStyleDeclaration. */
export function parseFillValues(cs: CSSStyleDeclaration): FillValues {
  return {
    backgroundColor: cs.backgroundColor ?? 'rgba(0, 0, 0, 0)',
    backgroundImage: cs.backgroundImage ?? 'none',
  }
}

export function summarizeFill(values: FillValues): string {
  const bgImg = values.backgroundImage
  if (bgImg && bgImg !== 'none') {
    if (parseLinearGradient(bgImg)) return 'Gradient'
    return 'Image'
  }
  const { hex, alpha } = parseColor(values.backgroundColor)
  if (alpha === 0) return 'transparent'
  return alpha < 100 ? `${hex} ${alpha}%` : hex
}

const FILL_TYPE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
]

/** Parse a linear-gradient CSS value into angle + color stops. */
export function parseLinearGradient(css: string): { angle: number; stops: Array<{ color: string; position: number }> } | null {
  if (!css.startsWith('linear-gradient(')) return null
  // Extract the argument list inside linear-gradient(...)
  const inner = css.slice('linear-gradient('.length, -1)
  // Split on top-level commas (not inside parentheses)
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(inner.slice(start).trim())

  if (parts.length < 2) return null

  // First part might be angle or a color stop
  let angle = 180
  let stopStart = 0
  const angleMatch = parts[0]!.match(/^(-?[\d.]+)deg$/)
  const dirMatch = parts[0]!.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?$/)
  if (angleMatch) {
    angle = parseFloat(angleMatch[1]!)
    stopStart = 1
  } else if (dirMatch) {
    const primary = dirMatch[1]!
    const secondary = dirMatch[2]
    if (!secondary) {
      const dirs: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 }
      angle = dirs[primary] ?? 180
    } else {
      const pair = new Set([primary, secondary])
      if (pair.has('top') && pair.has('right')) angle = 45
      else if (pair.has('bottom') && pair.has('right')) angle = 135
      else if (pair.has('bottom') && pair.has('left')) angle = 225
      else if (pair.has('top') && pair.has('left')) angle = 315
      else return null // contradictory (e.g. "to top bottom")
    }
    stopStart = 1
  }

  const stops: Array<{ color: string; position: number }> = []
  for (let i = stopStart; i < parts.length; i++) {
    const part = parts[i]!
    // Extract position percentage from end
    const posMatch = part.match(/([\d.]+)%\s*$/)
    const position = posMatch ? parseFloat(posMatch[1]!) : (i - stopStart) / Math.max(1, parts.length - stopStart - 1) * 100
    // Color is everything before the position
    const color = posMatch ? part.slice(0, part.length - posMatch[0]!.length).trim() : part.trim()
    stops.push({ color, position })
  }

  return stops.length >= 2 ? { angle, stops } : null
}

/** Build a CSS linear-gradient string from angle + stops. */
function buildLinearGradient(angle: number, stops: Array<{ color: string; position: number }>): string {
  const parts = stops.map(s => `${s.color} ${Math.round(s.position)}%`)
  return `linear-gradient(${Math.round(angle)}deg, ${parts.join(', ')})`
}

export function FillSection({
  values,
  onChange,
  swatches,
}: FillSectionProps): JSX.Element {
  // Gradient mode: base detection on successful parse (linear-gradient only).
  // Radial/conic gradients fall through to solid mode since we can't edit them.
  const gradient = useMemo(
    () => parseLinearGradient(values.backgroundImage),
    [values.backgroundImage],
  )
  const isGradient = gradient !== null
  const fillType = isGradient ? 'gradient' : 'solid'

  // Solid mode: parse color + alpha from backgroundColor
  const solidParsed = parseColor(values.backgroundColor)
  const solidAlpha = solidParsed.alpha

  const handleFillTypeChange = useCallback((type: string) => {
    if (type === 'gradient' && !isGradient) {
      // Switch to gradient: use current bg color as first stop.
      // If backgroundColor is transparent (alpha=0), use a neutral gray
      // instead of black — rgbToHex would strip the alpha channel.
      const { hex, alpha } = parseColor(values.backgroundColor)
      const startColor = alpha > 0 ? formatColor(hex, alpha) : '#9ca3af'
      onChange({ property: 'background-image', value: `linear-gradient(180deg, ${startColor} 0%, transparent 100%)` })
    } else if (type === 'solid' && isGradient) {
      // Switch to solid: clear gradient and revert background-color.
      // Use parseColor/formatColor to preserve alpha — rgbToHex strips it.
      const firstColor = gradient?.stops[0]?.color ?? values.backgroundColor
      const parsed = parseColor(firstColor)
      onChange({ property: 'background-image', value: 'none' })
      onChange({ property: 'background-color', value: formatColor(parsed.hex, parsed.alpha) })
    }
  }, [isGradient, gradient, values.backgroundColor, onChange])

  // -- Solid handlers --
  const handleBackgroundColorChange = useCallback(
    (color: string) => onChange({ property: 'background-color', value: color }),
    [onChange],
  )

  const handleSolidAlphaChange = useCallback(
    (alpha: number) => {
      onChange({ property: 'background-color', value: formatColor(solidParsed.hex, alpha) })
    },
    [onChange, solidParsed.hex],
  )

  // -- Gradient handlers --
  const handleAngleChange = useCallback(
    (angle: number) => {
      if (!gradient) return
      onChange({ property: 'background-image', value: buildLinearGradient(angle, gradient.stops) })
    },
    [gradient, onChange],
  )

  const handleGradientStopChange = useCallback(
    (index: number, color: string) => {
      if (!gradient) return
      const newStops = gradient.stops.map((s, i) => i === index ? { ...s, color } : s)
      onChange({ property: 'background-image', value: buildLinearGradient(gradient.angle, newStops) })
    },
    [gradient, onChange],
  )

  return (
    <div class="cortex-fill-section" data-section-id="fill">
      <div class="cortex-fill-section__type-row">
        <SegmentedControl
          options={FILL_TYPE_OPTIONS}
          value={fillType}
          onChange={handleFillTypeChange}
        />
      </div>

      {fillType === 'gradient' && gradient ? (
        <div class="cortex-fill-section__group">
          <div
            class="cortex-fill-section__gradient-preview"
            style={{ background: values.backgroundImage }}
          />
          <div class="cortex-fill-section__angle-row">
            <span class="cortex-section-label">Angle</span>
            <NumericInput
              value={gradient.angle}
              unit="deg"
              tooltip="Gradient Angle"
              onChange={handleAngleChange}
            />
          </div>
          <div class="cortex-fill-section__gradient-stops">
            {gradient.stops.slice(0, 2).map((stop, i) => (
              <div key={i} class="cortex-fill-section__gradient-stop">
                <span class="cortex-fill-section__gradient-stop-label">
                  {i === 0 ? 'Start' : 'End'}
                </span>
                <ColorInput
                  value={stop.color}
                  onChange={(color) => handleGradientStopChange(i, color)}
                  swatches={swatches}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div class="cortex-fill-section__group">
          <ColorInput
            value={values.backgroundColor}
            onChange={handleBackgroundColorChange}
            alpha={solidAlpha}
            onAlphaChange={handleSolidAlphaChange}
            swatches={swatches}
          />
        </div>
      )}
    </div>
  )
}
