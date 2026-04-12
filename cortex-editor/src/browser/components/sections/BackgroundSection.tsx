import type { JSX } from 'preact'
import { useCallback, useMemo } from 'preact/hooks'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TokenChip } from '../controls/TokenChip.js'

export interface BackgroundChange {
  property: string
  value: string
}

export interface BackgroundSectionProps {
  /** Resolved background color from getComputedStyle */
  backgroundColor: string
  /** Tailwind class name if detected (e.g. "bg-blue-500"), null if raw value */
  backgroundToken: string | null
  onChange: (change: BackgroundChange) => void
  swatches?: string[]
  dimmedProperties?: Set<string>
  mixedProperties?: Set<string>
}

/**
 * BackgroundSection — single background color with token detection.
 *
 * When a Tailwind utility class is detected on the element (e.g. `bg-blue-500`),
 * renders a TokenChip with an unlink action. Otherwise renders a ColorInput for
 * direct hex/alpha editing. Gradient backgrounds degrade gracefully to the
 * ColorInput path (gradient editing is out of scope).
 *
 * Business logic: this replaces the previous FillSection + CollapsibleSection
 * combo in Panel.tsx. The `+` button that adds a default background now lives
 * in the SectionGroup headerAction slot rather than in CollapsibleSection.
 */
export function BackgroundSection({
  backgroundColor,
  backgroundToken,
  onChange,
  swatches,
  mixedProperties,
}: BackgroundSectionProps): JSX.Element {
  const parsed = useMemo(() => parseColor(backgroundColor), [backgroundColor])

  const handleUnlink = useCallback(() => {
    onChange({ property: 'background-color', value: backgroundColor })
  }, [onChange, backgroundColor])

  const handleColorChange = useCallback(
    (color: string) => onChange({ property: 'background-color', value: color }),
    [onChange],
  )

  const handleAlphaChange = useCallback(
    (alpha: number) => {
      onChange({ property: 'background-color', value: formatColor(parsed.hex, alpha) })
    },
    [onChange, parsed.hex],
  )

  return (
    <div class="cortex-background-section" data-section-id="background">
      {backgroundToken !== null ? (
        <TokenChip
          tokenName={backgroundToken}
          resolvedValue={backgroundColor}
          onUnlink={handleUnlink}
        />
      ) : (
        <ColorInput
          value={backgroundColor}
          onChange={handleColorChange}
          alpha={parsed.alpha}
          onAlphaChange={handleAlphaChange}
          swatches={swatches}
          mixed={mixedProperties?.has('background-color')}
        />
      )}
    </div>
  )
}
