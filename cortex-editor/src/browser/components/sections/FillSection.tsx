import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { ColorInput } from '../controls/ColorInput.js'
import { NumericInput } from '../controls/NumericInput.js'

export interface FillChange {
  property: string
  value: string
}

export interface FillValues {
  backgroundColor: string  // CSS color string from getComputedStyle
  opacity: number          // 0-100 (percentage)
}

export interface FillSectionProps {
  values: FillValues
  onChange: (change: FillChange) => void
  onScrub?: (change: FillChange) => void
  onScrubEnd?: (change: FillChange) => void
}

/** Extract fill-related values from a CSSStyleDeclaration. */
export function parseFillValues(cs: CSSStyleDeclaration): FillValues {
  return {
    backgroundColor: cs.backgroundColor ?? 'rgba(0, 0, 0, 0)',
    opacity: Math.round((parseFloat(cs.opacity) || 1) * 100),
  }
}

export function FillSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: FillSectionProps): JSX.Element {
  const handleBackgroundColorChange = useCallback(
    (hex: string) => onChange({ property: 'background-color', value: hex }),
    [onChange],
  )

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

  return (
    <div class="cortex-fill-section" data-section-id="fill">
      <div class="cortex-fill-section__group">
        <span class="cortex-section-label">Fill</span>
        <ColorInput
          value={values.backgroundColor}
          onChange={handleBackgroundColorChange}
        />
      </div>

      <div class="cortex-fill-section__group">
        <span class="cortex-section-label">Opacity</span>
        <NumericInput
          value={values.opacity}
          unit="%"
          min={0}
          onChange={handleOpacityChange}
          onScrub={handleOpacityScrub}
          onScrubEnd={handleOpacityScrubEnd}
        />
      </div>
    </div>
  )
}
