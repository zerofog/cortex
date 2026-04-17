import type { JSX } from 'preact'
import { TokenChip } from './TokenChip.js'

export interface ColorChipPillProps {
  /** Chip token name, typically prefixed for context (e.g. `text-gray-900`). */
  tokenName: string
  /** Browser-ready hex for the leading color swatch. */
  hex: string
  /** Open the ColorChipPicker to swap to a different named chip. */
  onSwap: () => void
  /** Remove the color class and replace with inline color (unlink). */
  onUnlink: () => void
}

/**
 * Linked color chip pill. Thin wrapper over TokenChip — swaps via body click,
 * unlinks via the chain icon. The swatch is always a color fill (chips are,
 * by construction, CSS colors — `resolveColorChips` returns `{name, hex}`).
 */
export function ColorChipPill({
  tokenName,
  hex,
  onSwap,
  onUnlink,
}: ColorChipPillProps): JSX.Element {
  return (
    <TokenChip
      tokenName={tokenName}
      swatch={{ kind: 'color', value: hex }}
      onBodyClick={onSwap}
      onUnlink={onUnlink}
      ariaLabel={`Swap color chip (currently ${tokenName})`}
    />
  )
}
