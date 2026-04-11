import type { JSX } from 'preact'

export interface IconButtonProps {
  /**
   * Icon node rendered inside the button. Caller is responsible for picking
   * an appropriate `size` on the Lucide icon (commonly 14 or 16 inside the
   * 28px square). The icon inherits `currentColor` from the button so the
   * default/active colour transitions hand off cleanly via CSS.
   */
  icon: JSX.Element
  /**
   * Required accessible name. Surfaced via `aria-label` on the button —
   * IconButton has no visible text label by design, so the aria string
   * is the only screen-reader handle.
   */
  ariaLabel: string
  /**
   * Optional hover tooltip text. Rendered via `data-tooltip` so it shares
   * the panel's tooltip mechanism (no native title-attribute flicker).
   * When omitted, the button still works — only the hover hint is hidden.
   */
  tooltip?: string
  /**
   * When `true`, paints the active ring + emits `aria-pressed="true"` so
   * the button reads as a toggle. When omitted/false the button is a
   * regular momentary control without the toggle semantics.
   */
  active?: boolean
  /** Click handler — fires for non-disabled buttons. */
  onClick: () => void
  /** Disables both interaction and the active-ring paint. */
  disabled?: boolean
}

/**
 * Reusable 28px square icon button matching the Panel v2 control height
 * spec (Task 4 / ZF0-1182). Used by PositionSection v2 (self-alignment
 * 6-button block + flip H/V pair) and any future Panel sections that need
 * an icon-only toggle. Active state renders a `--cx-select-muted` ring +
 * `aria-pressed="true"`; inactive renders flat with hover/focus feedback
 * supplied by the `.cortex-icon-button` CSS class in styles.css.
 *
 * Contract:
 * - 28px × 28px hit target (matches NumericInput / segmented control md /
 *   sizing trigger / panel header button — all 28px after Task 4 S6/S9).
 * - Border radius `--cx-radius-sm` so it visually fuses with the well row.
 * - Background transitions on hover via the well token; active uses the
 *   inset shadow + ring already shared with other panel controls.
 * - Icon colour follows `currentColor`, so the button-level color rule
 *   drives both default and active styling without per-icon overrides.
 */
export function IconButton({
  icon,
  ariaLabel,
  tooltip,
  active,
  onClick,
  disabled,
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={`cortex-icon-button${active ? ' cortex-icon-button--active' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={active ? 'true' : 'false'}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
