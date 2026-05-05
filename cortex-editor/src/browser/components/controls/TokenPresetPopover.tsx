import type { JSX, RefObject } from 'preact'
import { useRef, useEffect, useMemo } from 'preact/hooks'
import { computePosition, flip, shift, autoUpdate } from '@floating-ui/dom'
import type { SpacingToken } from '../../../core/tailwind-resolver.js'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss.js'

export interface TokenPresetPopoverProps {
  readonly anchorRef: RefObject<Element>
  readonly tokens: readonly SpacingToken[]
  readonly onPick: (chosen: { name: string; valuePx: number; source: SpacingToken['source'] }) => void
  readonly onDismiss: () => void
}

export function TokenPresetPopover({
  anchorRef,
  tokens,
  onPick,
  onDismiss,
}: TokenPresetPopoverProps): JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sort by valuePx ascending so the user can scan smallest → largest. The
  // resolver returns tokens in source-priority + insertion order (v4 → v3 →
  // css-variable, dedup by name), which means a Tailwind v4 default scale
  // produces 0, 1, 2, ..., 96 followed by 0.5, 1.5, 2.5, 3.5 (multiplier
  // emission order, not numeric value). Display sort fixes this without
  // changing the resolver's documented priority contract.
  const sortedTokens = useMemo(
    () => [...tokens].sort((a, b) => a.valuePx - b.valuePx),
    [tokens],
  )

  useOutsideDismiss(popoverRef, onDismiss, [anchorRef])

  useEffect(() => {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor || !popover) return

    let cancelled = false
    const update = () => {
      computePosition(anchor, popover, {
        placement: 'bottom-start',
        middleware: [flip(), shift()],
      }).then(({ x, y }) => {
        if (!cancelled && popoverRef.current) {
          popoverRef.current.style.left = `${x}px`
          popoverRef.current.style.top = `${y}px`
        }
      }).catch((err) => {
        if (cancelled) return
        // autoUpdate calls this on every scroll/resize/ancestor-mutation, so a
        // transient computePosition failure must NOT dismiss the popover —
        // that would close on incidental scroll. Fall back to the anchor's
        // current rect; if the result is off-screen, the next autoUpdate cycle
        // will retry.
        console.warn('[cortex] TokenPresetPopover positioning failed:', err instanceof Error ? err.message : err)
        const rect = anchor.getBoundingClientRect()
        if (popoverRef.current) {
          popoverRef.current.style.left = `${rect.left}px`
          popoverRef.current.style.top = `${rect.bottom}px`
        }
      })
    }
    const cleanupAutoUpdate = autoUpdate(anchor, popover, update)
    return () => {
      cancelled = true
      try {
        cleanupAutoUpdate()
      } catch (err) {
        console.warn('[cortex] TokenPresetPopover autoUpdate cleanup failed:', err instanceof Error ? err.message : err)
      }
    }
  }, [anchorRef])

  return (
    <div
      ref={popoverRef}
      class="cortex-token-preset-popover"
      style={{ position: 'fixed' }}
    >
      {tokens.length === 0 ? (
        <div class="cortex-token-preset-popover__empty-state">
          <span class="cortex-token-preset-popover__empty-state-title">No design tokens detected</span>
          <span class="cortex-token-preset-popover__empty-state-hint">
            Add <code>--spacing-*</code> to your CSS or configure Tailwind.
          </span>
        </div>
      ) : (
        <div class="cortex-token-preset-popover__list">
          {sortedTokens.map((token) => (
            <button
              key={token.name}
              type="button"
              class="cortex-token-preset-popover__list-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick({ name: token.name, valuePx: token.valuePx, source: token.source })}
            >
              <span class="cortex-token-preset-popover__list-name">{token.name}</span>
              <span class="cortex-token-preset-popover__list-value">{token.valuePx}px</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
