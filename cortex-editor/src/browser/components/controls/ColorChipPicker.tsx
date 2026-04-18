import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import type { ColorChip } from '../../token-detector.js'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss.js'

export interface ColorChipPickerProps {
  chips: readonly ColorChip[]
  /** Chip name currently applied to the selected element, or null if unlinked. */
  currentName: string | null
  onPick: (chip: ColorChip) => void
  onDismiss: () => void
}

/**
 * Popover listing named design-system color chips. Each option renders a
 * filled swatch, the token name, and the hex — supporting picking by sight,
 * name, or value. Opens from the SwatchBook icon (unlinked) or from a
 * linked ColorChipPill body (swap).
 *
 * Empty-state handling mirrors TextComponentPicker: if `chips` is empty the
 * popover mounts with a helpful message rather than closing silently.
 */
export function ColorChipPicker({
  chips,
  currentName,
  onPick,
  onDismiss,
}: ColorChipPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useOutsideDismiss(ref, onDismiss)

  if (chips.length === 0) {
    return (
      <div ref={ref} class="cortex-color-chip-picker cortex-color-chip-picker--empty">
        <span>No color chips defined in @theme</span>
      </div>
    )
  }

  return (
    <div ref={ref} class="cortex-color-chip-picker" role="listbox">
      {chips.map((c) => (
        <button
          key={c.name}
          type="button"
          role="option"
          aria-selected={c.name === currentName}
          class={`cortex-color-chip-picker__option${c.name === currentName ? ' cortex-color-chip-picker__option--active' : ''}`}
          onClick={() => onPick(c)}
        >
          <span
            class="cortex-color-chip-picker__swatch"
            style={{ backgroundColor: c.hex }}
            aria-hidden="true"
          />
          <span class="cortex-color-chip-picker__name">{c.name}</span>
          <span class="cortex-color-chip-picker__hex">{c.hex}</span>
        </button>
      ))}
    </div>
  )
}
