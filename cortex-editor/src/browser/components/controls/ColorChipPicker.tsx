import type { JSX, RefObject } from 'preact'
import { useRef } from 'preact/hooks'
import type { ColorChip } from '../../token-detector.js'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss.js'

export interface ColorChipPickerProps {
  chips: readonly ColorChip[]
  /** Chip name currently applied to the selected element, or null if unlinked. */
  currentName: string | null
  onPick: (chip: ColorChip) => void
  onDismiss: () => void
  /** Elements that opened this popover. Clicks on them are treated as
   *  part of the popover surface so the trigger's own onClick is the
   *  single source of toggle truth. Prevents the mousedown-dismiss /
   *  click-reopen race on toggle buttons. */
  triggerRefs?: ReadonlyArray<RefObject<Element>>
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
  triggerRefs,
}: ColorChipPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useOutsideDismiss(ref, onDismiss, triggerRefs)

  if (chips.length === 0) {
    return (
      <div ref={ref} class="cortex-color-chip-picker cortex-color-chip-picker--empty">
        <span>No color chips defined in @theme</span>
      </div>
    )
  }

  const pageChips = chips.filter((c) => c.source === 'page')
  const themeChips = chips.filter((c) => c.source !== 'page')
  const showGroups = pageChips.length > 0 && themeChips.length > 0

  const renderOption = (c: ColorChip): JSX.Element => (
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
  )

  return (
    <div ref={ref} class="cortex-color-chip-picker" role="listbox">
      {showGroups ? (
        <>
          <div class="cortex-color-chip-picker__group-label" role="presentation">On this page</div>
          {pageChips.map(renderOption)}
          <div class="cortex-color-chip-picker__divider" role="presentation" />
          <div class="cortex-color-chip-picker__group-label" role="presentation">Theme colors</div>
          {themeChips.map(renderOption)}
        </>
      ) : (
        chips.map(renderOption)
      )}
    </div>
  )
}
