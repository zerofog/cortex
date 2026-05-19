import type { JSX, ComponentChild } from 'preact'
import { useRef, useEffect, useCallback } from 'preact/hooks'

export interface SegmentedOption {
  value: string
  label?: string
  icon?: ComponentChild
  title?: string
  /** Per-option disable. Use when an option would silently no-op for the
   *  selected element (e.g. `display: inline` on a flex/grid child gets
   *  blockified by CSS; clicking it would do nothing). The button stays
   *  in the DOM at reduced opacity, ignores clicks, and is skipped in
   *  arrow-key navigation. Tooltip on hover explains why. */
  disabled?: boolean
  /** Tooltip shown when this option is disabled. Falls back to `title`. */
  disabledTooltip?: string
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  mixed?: boolean
  disabled?: boolean
  disabledTooltip?: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  mixed,
  disabled,
  disabledTooltip,
}: SegmentedControlProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return

    if (disabled || mixed) {
      indicator.style.width = '0'
      indicator.style.opacity = '0'
      return
    }

    const activeBtn = track.querySelector(`[data-value="${CSS.escape(value)}"]`) as HTMLElement | null
    if (activeBtn) {
      indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`
      indicator.style.width = `${activeBtn.offsetWidth}px`
      indicator.style.opacity = '1'
    } else {
      // No option matches (e.g. 'auto') — collapse the indicator
      indicator.style.width = '0'
      indicator.style.opacity = '0'
    }
  }, [value, mixed, disabled])

  const handleClick = useCallback(
    (optValue: string, optDisabled: boolean) => {
      if (disabled || optDisabled) return
      if (mixed || optValue !== value) onChange(optValue)
    },
    [disabled, mixed, value, onChange],
  )

  const hasActiveOption = options.some((opt) => opt.value === value)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const targetValue = (e.target as HTMLElement | null)?.getAttribute('data-value')
      if (disabled) return
      const focusedIdx = targetValue ? options.findIndex((o) => o.value === targetValue) : -1
      const idx =
        mixed || !hasActiveOption
          ? (focusedIdx >= 0 ? focusedIdx : 0)
          : options.findIndex((o) => o.value === value)
      if (idx === -1) return
      // Arrow-key navigation skips per-option disabled entries. Walk in
      // the requested direction until we land on an enabled option (or
      // come back to the starting index, meaning all others are disabled).
      let step = 0
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step = 1
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step = -1
      if (step === 0) return
      e.preventDefault()
      let next = (idx + step + options.length) % options.length
      while (next !== idx && options[next]?.disabled) {
        next = (next + step + options.length) % options.length
      }
      // If the walk wrapped back to the starting index, every other option
      // was disabled — there's nowhere to go, so don't fire onChange (which
      // would re-emit the current value as if it were a fresh selection).
      if (next === idx) return
      const target = options[next]
      if (target && !target.disabled) onChange(target.value)
    },
    [disabled, options, value, mixed, hasActiveOption, onChange],
  )

  const sizeClass = size === 'sm' ? ' cortex-segmented--sm' : ''
  const mixedClass = mixed ? ' cortex-segmented--mixed' : ''
  const disabledClass = disabled ? ' cortex-segmented--disabled' : ''

  return (
    <div
      ref={trackRef}
      class={`cortex-segmented${sizeClass}${mixedClass}${disabledClass}`}
      role="radiogroup"
      aria-disabled={disabled ? 'true' : undefined}
      onKeyDown={handleKeyDown}
    >
      <div ref={indicatorRef} class="cortex-segmented__indicator" />
      {mixed && <span class="cortex-segmented__mixed-label">Mixed</span>}
      {options.map((opt, index) => {
        const isActive = !mixed && opt.value === value
        const optDisabled = disabled || opt.disabled === true
        // Per-option tooltip precedence: option's own disabledTooltip
        // wins (most specific) → control-wide disabledTooltip → title.
        // Wholly-disabled control already had control-wide tooltip
        // semantics; per-option disable adds the option-specific layer
        // without breaking that.
        const tooltip = optDisabled
          ? (opt.disabledTooltip ?? disabledTooltip ?? opt.title)
          : opt.title
        return (
          <button
            key={opt.value}
            class={`cortex-segmented__option${isActive ? ' cortex-segmented__option--active' : ''}${opt.disabled && !disabled ? ' cortex-segmented__option--disabled' : ''}`}
            type="button"
            role="radio"
            aria-checked={isActive ? 'true' : 'false'}
            tabIndex={disabled || mixed || !hasActiveOption ? (index === 0 ? 0 : -1) : (isActive ? 0 : -1)}
            aria-disabled={optDisabled ? 'true' : undefined}
            aria-label={opt.label ? undefined : opt.title}
            data-tooltip={tooltip}
            data-value={opt.value}
            onClick={() => handleClick(opt.value, opt.disabled === true)}
          >
            {opt.icon && <span class="cortex-segmented__icon">{opt.icon}</span>}
            {opt.label && <span class="cortex-segmented__label">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
