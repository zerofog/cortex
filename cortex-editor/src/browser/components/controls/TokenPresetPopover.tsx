import type { JSX, RefObject } from 'preact'
import { useRef, useEffect } from 'preact/hooks'
import { computePosition, flip, shift, autoUpdate } from '@floating-ui/dom'
import type { SpacingPreset } from '../../tokens/family.js'
import type { SpacingToken } from '../../../core/tailwind-resolver.js'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss.js'

/** Diagonal-stripe background for non-color value swatches (spacing, size). */
const PATTERN_BG =
  'repeating-linear-gradient(45deg, var(--cx-ink-ghost) 0, var(--cx-ink-ghost) 2px, transparent 2px, transparent 6px)'

export interface TokenPresetPopoverProps {
  readonly anchorRef: RefObject<Element>
  readonly presets: readonly SpacingPreset[]
  readonly tokens: readonly SpacingToken[]
  readonly onPick: (chosen: { name: string; valuePx: number; source: 'canonical' | 'project' }) => void
  readonly onDismiss: () => void
}

export function TokenPresetPopover({
  anchorRef,
  presets,
  tokens,
  onPick,
  onDismiss,
}: TokenPresetPopoverProps): JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null)

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
        // will retry. (Original M2 finding: raw rect ignores flip/shift, so a
        // popover near the right edge could render partially off-viewport.
        // Accepted risk; the dismiss-on-catch alternative breaks click flows.)
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
      <div class="cortex-token-preset-popover__chip-grid">
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            class="cortex-token-preset-popover__chip"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick({ name: preset.name, valuePx: preset.valuePx, source: 'canonical' })}
          >
            <span class="cortex-token-preset-popover__chip-name">{preset.name}</span>
            <span class="cortex-token-preset-popover__chip-value">{preset.valuePx}px</span>
          </button>
        ))}
      </div>
      {tokens.length > 0 && (
        <>
          <div class="cortex-token-preset-popover__divider" />
          <div class="cortex-token-preset-popover__list">
            {tokens.map((token) => (
              <button
                key={token.name}
                type="button"
                class="cortex-token-preset-popover__list-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick({ name: token.name, valuePx: token.valuePx, source: 'project' })}
              >
                <span
                  class="cortex-token-preset-popover__list-swatch"
                  style={{ background: PATTERN_BG }}
                  aria-hidden="true"
                />
                <span class="cortex-token-preset-popover__list-name">{token.name}</span>
                <span class="cortex-token-preset-popover__list-value">{token.valuePx}px</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
