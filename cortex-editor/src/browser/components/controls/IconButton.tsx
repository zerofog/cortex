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
 * Reusable 28px square icon button matching the other interactive panel
 * controls. Active state renders a `--cx-select-muted` ring + emits
 * `aria-pressed="true"` so the button reads as a toggle; inactive renders
 * flat. Icon colour inherits `currentColor` so default/active transitions
 * drive from the button-level color rule without per-icon overrides.
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
