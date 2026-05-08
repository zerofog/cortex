import type { JSX } from 'preact'
import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TokenChip, isColorLike } from '../controls/TokenChip.js'
import { ColorChipPicker } from '../controls/ColorChipPicker.js'
import { IconButton } from '../controls/IconButton.js'
import { Minus, SwatchBook } from '../icons.js'
import type { ColorChip } from '../../token-detector.js'

type BackgroundUtilityClass = `bg-${string}`

export type BackgroundChange =
  | SectionChange
  | { kind: 'link-background-token'; chip: ColorChip; removeClass?: BackgroundUtilityClass }
  | {
    kind: 'unlink-background-token'
    removeClass: BackgroundUtilityClass
    inline: Array<{ property: string; value: string }>
  }

export interface BackgroundSectionProps {
  /** Resolved background color from getComputedStyle */
  backgroundColor: string
  /** Tailwind class name if detected (e.g. "bg-blue-500"), null if raw value */
  backgroundToken: string | null
  onChange: (change: BackgroundChange) => void
  onScrub?: (change: SectionChange) => void
  onScrubEnd?: (change: SectionChange) => void
  /** When provided, renders a minus button at the row end that clears the fill. */
  onRemove?: () => void
  swatches?: string[]
  colorChips?: ColorChip[]
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
  onScrub,
  onScrubEnd,
  onRemove,
  swatches,
  colorChips,
  dimmedProperties,
  mixedProperties,
}: BackgroundSectionProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const tokenBodyRef = useRef<HTMLButtonElement>(null)
  const tokenButtonRef = useRef<HTMLButtonElement>(null)
  const parsed = useMemo(() => parseColor(backgroundColor), [backgroundColor])
  const backgroundTokenName = backgroundToken?.startsWith('bg-') ? backgroundToken.slice(3) : null
  const backgroundRemoveClass = backgroundToken?.startsWith('bg-')
    ? backgroundToken as BackgroundUtilityClass
    : undefined

  const handleUnlink = useCallback(() => {
    if (backgroundRemoveClass === undefined) return
    onChange({
      kind: 'unlink-background-token',
      removeClass: backgroundRemoveClass,
      inline: [{ property: 'background-color', value: backgroundColor }],
    })
  }, [onChange, backgroundColor, backgroundRemoveClass])

  const handleOpenPicker = useCallback(() => {
    setPickerOpen((open) => !open)
  }, [])

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickToken = useCallback(
    (chip: ColorChip) => {
      onChange({
        kind: 'link-background-token',
        chip,
        removeClass: backgroundRemoveClass,
      })
      setPickerOpen(false)
    },
    [onChange, backgroundRemoveClass],
  )

  const handleColorChange = useCallback(
    (color: string) => onChange({ property: 'background-color', value: color }),
    [onChange],
  )

  const handleColorScrub = useCallback(
    (color: string) => onScrub?.({ property: 'background-color', value: color }),
    [onScrub],
  )

  const handleColorScrubEnd = useCallback(
    (color: string) => onScrubEnd?.({ property: 'background-color', value: color }),
    [onScrubEnd],
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
  const tokenButton = (
    <button
      ref={tokenButtonRef}
      type="button"
      class="cortex-icon-button"
      aria-label="Link to color chip"
      data-tooltip="Link to color chip"
      onClick={handleOpenPicker}
    >
      <SwatchBook size={14} />
    </button>
  )
  const picker = pickerOpen ? (
    <ColorChipPicker
      chips={colorChips ?? []}
      currentName={backgroundTokenName}
      onPick={handlePickToken}
      onDismiss={handleClosePicker}
      triggerRefs={[tokenBodyRef, tokenButtonRef]}
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
            onBodyClick={handleOpenPicker}
            onUnlink={handleUnlink}
            ariaLabel={`Swap color chip (currently ${backgroundToken})`}
            bodyRef={tokenBodyRef}
          />
          {removeButton}
          {picker}
        </div>
      ) : (
        <div class="cortex-background-section__row cortex-background-section__row--raw">
          <ColorInput
            value={backgroundColor}
            onChange={handleColorChange}
            onScrub={onScrub ? handleColorScrub : undefined}
            onScrubEnd={onScrubEnd ? handleColorScrubEnd : undefined}
            alpha={parsed.alpha}
            onAlphaChange={handleAlphaChange}
            swatches={swatches}
            mixed={mixedProperties?.has('background-color')}
            trailing={
              <>
                {tokenButton}
                {removeButton}
              </>
            }
          />
          {picker}
        </div>
      )}
    </div>
  )
}
