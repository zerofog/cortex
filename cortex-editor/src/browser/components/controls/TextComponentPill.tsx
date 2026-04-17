import type { JSX } from 'preact'
import { TokenChip } from './TokenChip.js'

export interface TextComponentPillProps {
  /** Bundle name rendered as the pill body (e.g. `heading-1`, `body-md`). */
  tokenName: string
  /** Open the TextComponentPicker to swap to a different bundle. */
  onSwap: () => void
  /** Remove the bundle class and replace with inline styles (unlink). */
  onUnlink: () => void
}

/**
 * Linked typography pill. Thin wrapper over TokenChip — swaps via body click,
 * unlinks via the chain icon. No swatch: typography pills are text-only to
 * distinguish them from color pills at a glance.
 */
export function TextComponentPill({
  tokenName,
  onSwap,
  onUnlink,
}: TextComponentPillProps): JSX.Element {
  return (
    <TokenChip
      tokenName={tokenName}
      onBodyClick={onSwap}
      onUnlink={onUnlink}
      ariaLabel={`Swap text component (currently ${tokenName})`}
    />
  )
}
