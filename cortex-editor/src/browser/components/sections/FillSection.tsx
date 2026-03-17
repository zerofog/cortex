import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { ColorInput } from '../controls/ColorInput.js'

export interface FillChange {
  property: string
  value: string
}

export interface FillValues {
  backgroundColor: string
}

export interface FillSectionProps {
  values: FillValues
  onChange: (change: FillChange) => void
  swatches?: string[]
}

/** Extract fill-related values from a CSSStyleDeclaration. */
export function parseFillValues(cs: CSSStyleDeclaration): FillValues {
  return {
    backgroundColor: cs.backgroundColor ?? 'rgba(0, 0, 0, 0)',
  }
}

export function FillSection({
  values,
  onChange,
  swatches,
}: FillSectionProps): JSX.Element {
  const handleBackgroundColorChange = useCallback(
    (hex: string) => onChange({ property: 'background-color', value: hex }),
    [onChange],
  )

  return (
    <div class="cortex-fill-section" data-section-id="fill">
      <div class="cortex-fill-section__group">
        <span class="cortex-section-label">Fill</span>
        <ColorInput
          value={values.backgroundColor}
          onChange={handleBackgroundColorChange}
          swatches={swatches}
        />
      </div>
    </div>
  )
}
