import type { JSX } from 'preact'
import { useCallback, useMemo } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TokenChip, isColorLike } from '../controls/TokenChip.js'
import { IconButton } from '../controls/IconButton.js'
import { Minus } from '../icons.js'

export type BackgroundChange = SectionChange

export interface BackgroundSectionProps {
  /** Resolved background color from getComputedStyle */
  backgroundColor: string
  /** Tailwind class name if detected (e.g. "bg-blue-500"), null if raw value */
  backgroundToken: string | null
  onChange: (change: BackgroundChange) => void
  /** When provided, renders a minus button at the row end that clears the fill. */
  onRemove?: () => void
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
  onRemove,
  swatches,
  dimmedProperties,
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

  // Reused in both the ColorInput trailing slot (raw value) and as a sibling
  // of TokenChip (linked token). One handler, one element — only the
  // composition differs depending on which surface renders the row.
  const removeButton = onRemove ? (
    <IconButton
      icon={<Minus size={14} />}
      ariaLabel="Remove background"
      tooltip="Remove background"
      onClick={onRemove}
    />
  ) : null

  return (
    <div class={`cortex-background-section${isDimmed(dimmedProperties, 'background-color') ? ' cortex-control--dimmed' : ''}`} data-section-id="background">
      {backgroundToken !== null ? (
        <div class="cortex-background-section__row">
          <TokenChip
            tokenName={backgroundToken}
            swatch={
              isColorLike(backgroundColor)
                ? { kind: 'color', value: backgroundColor }
                : { kind: 'pattern' }
            }
            onUnlink={handleUnlink}
          />
          {removeButton}
        </div>
      ) : (
        <ColorInput
          value={backgroundColor}
          onChange={handleColorChange}
          alpha={parsed.alpha}
          onAlphaChange={handleAlphaChange}
          swatches={swatches}
          mixed={mixedProperties?.has('background-color')}
          trailing={removeButton}
        />
      )}
    </div>
  )
}
