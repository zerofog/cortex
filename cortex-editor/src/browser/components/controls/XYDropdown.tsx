/**
 * XYDropdown — Panel v2 Task 8 (ZF0-1186)
 *
 * Purpose-built enum picker for the X/Y alignment dropdowns inside
 * FlexControls (and, later, GridControls). Mirrors PositionDropdown's
 * Cursor-style visual pattern — icon + label + checkmark per row —
 * but accepts the option catalog as a PROP because the X/Y option
 * lists differ between flex and grid, and between the X and Y axes.
 *
 * Why not extend `Dropdown.tsx`? Dropdown.tsx keeps a hardcoded
 * `filter` state (lines 24, 28) that auto-focuses a filter input on
 * open; retrofitting a `disableFilter` prop would leave dead code
 * behind. A small, purpose-built picker is the elegant fit.
 *
 * Why not extend `PositionDropdown.tsx`? PositionDropdown's options
 * list is module-local by design — the position property has a fixed
 * catalog of 5 enum values the consumer should not be able to
 * override. X/Y is the opposite: the catalog is caller-supplied so
 * each axis can show axis-appropriate labels (Left/Center/Right for
 * row X, Top/Center/Bottom for row Y, etc.). A shared component with
 * a `options: prop` keeps the pattern DRY across flex and grid while
 * preserving PositionDropdown's frozen contract.
 *
 * Positioning, ARIA semantics, keyboard handling, and focus return
 * are deliberately copied from PositionDropdown so there's exactly
 * one interaction model for enum pickers across the panel.
 */
import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'
import { Check, ChevronDown } from '../icons.js'

export interface XYDropdownOption {
  value: string
  label: string
  icon?: JSX.Element
  /** Description shown at the bottom of the dropdown when this option is highlighted. */
  hint?: string
}

export interface XYDropdownProps {
  /** Caller-supplied enum catalog. Length >= 1. */
  options: XYDropdownOption[]
  /** Currently selected value. When not in `options`, the first option is highlighted on open. */
  value: string
  /** Fired on select. The caller decides which CSS property this maps to (see FlexControls). */
  onChange: (value: string) => void
  /**
   * Required ARIA label for the listbox — screen readers announce
   * this as the group name for the options. Use an axis-specific
   * string like "X alignment" or "Y alignment" so readers can
   * distinguish the two pickers inside the same section.
   */
  ariaLabel: string
  /**
   * Visual short label shown inside the trigger (e.g. "X" or "Y").
   * Rendered as a ghost-coloured prefix, like NumericInput's
   * `prefix` slot, so the picker reads as a tagged control.
   */
  axisLabel: string
  /**
   * Optional tooltip text — typically the resolved CSS property
   * name ("justify-content" / "align-items"). Surfaces via
   * `data-tooltip` on the trigger so it participates in the panel's
   * tooltip mechanism. Omit if the caller doesn't surface property
   * names (no fallback is inferred).
   */
  tooltip?: string
  /** Trigger id so the caller can pin it to a label or data attribute. */
  id?: string
  /** Disables interaction entirely. */
  disabled?: boolean
}

function findIndex(options: XYDropdownOption[], value: string): number {
  const i = options.findIndex((o) => o.value === value)
  return i === -1 ? 0 : i
}

export function XYDropdown({
  options,
  value,
  onChange,
  ariaLabel,
  axisLabel,
  tooltip,
  id,
  disabled = false,
}: XYDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(() => findIndex(options, value))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Guard against an empty options array — defensive, not a supported
  // call pattern. If a caller passes [] we render the trigger with a
  // dash label and disable opening.
  const effectivelyDisabled = disabled || options.length === 0
  const selected: XYDropdownOption | undefined =
    options[findIndex(options, value)] ?? options[0]
  const activeId = isOpen && options[highlightIdx]
    ? `cortex-xy-opt-${options[highlightIdx].value}`
    : undefined

  // Position the popover on open — same pattern as PositionDropdown.
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return
    let cancelled = false
    const trigger = triggerRef.current
    const popover = popoverRef.current
    popover.style.width = `${Math.max(trigger.offsetWidth, 160)}px`
    computePosition(trigger, popover, {
      placement: 'bottom-start',
      middleware: [flip(), shift()],
    }).then(({ x, y }) => {
      if (!cancelled && popoverRef.current) {
        popoverRef.current.style.left = `${x}px`
        popoverRef.current.style.top = `${y}px`
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn('[cortex] XYDropdown positioning failed:', err instanceof Error ? err.message : err)
        const rect = trigger.getBoundingClientRect()
        if (popoverRef.current) {
          popoverRef.current.style.left = `${rect.left}px`
          popoverRef.current.style.top = `${rect.bottom}px`
        }
      }
    })
    return () => { cancelled = true }
  }, [isOpen])

  // Re-sync highlight to the selected value while closed — matches
  // PositionDropdown test 10 (highlightIdx is locked while open so
  // keyboard navigation isn't clobbered mid-interaction).
  useEffect(() => {
    if (!isOpen) setHighlightIdx(findIndex(options, value))
  }, [value, isOpen, options])

  const open = useCallback(() => {
    if (effectivelyDisabled) return
    setHighlightIdx(findIndex(options, value))
    setIsOpen(true)
  }, [effectivelyDisabled, options, value])

  const close = useCallback(() => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  const select = useCallback(
    (optValue: string) => {
      onChange(optValue)
      setIsOpen(false)
      triggerRef.current?.focus()
    },
    [onChange],
  )

  const handleTriggerClick = useCallback(() => {
    if (effectivelyDisabled) return
    if (isOpen) close()
    else open()
  }, [effectivelyDisabled, isOpen, open, close])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => (i + 1) % options.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => (i - 1 + options.length) % options.length)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setHighlightIdx(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setHighlightIdx(options.length - 1)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const opt = options[highlightIdx]
        if (opt) select(opt.value)
      }
    },
    [isOpen, close, highlightIdx, options, select],
  )

  return (
    <div class="cortex-xy-dropdown">
      <button
        ref={triggerRef}
        class="cortex-xy-dropdown__trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-activedescendant={activeId}
        aria-label={`${axisLabel} — ${ariaLabel}`}
        data-tooltip={tooltip}
        disabled={effectivelyDisabled}
        id={id}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
      >
        <span class="cortex-xy-dropdown__trigger-axis" aria-hidden="true">
          {axisLabel}
        </span>
        {/* Icons only shown in dropdown options, not in the trigger. */}
        <span class="cortex-xy-dropdown__trigger-label">
          {selected?.label ?? '—'}
        </span>
        <span
          class={`cortex-xy-dropdown__chevron${isOpen ? ' cortex-xy-dropdown__chevron--open' : ''}`}
          aria-hidden="true"
        >
          <ChevronDown size={14} />
        </span>
      </button>
      {isOpen && (
        <>
          <div class="cortex-xy-dropdown__backdrop" onClick={close} />
          <div
            ref={popoverRef}
            class="cortex-xy-dropdown__popover"
            style={{ position: 'fixed' }}
          >
            <div
              class="cortex-xy-dropdown__list"
              role="listbox"
              aria-label={ariaLabel}
            >
              {options.map((opt, i) => {
                const isSelected = opt.value === value
                const isHighlighted = i === highlightIdx
                return (
                  <div
                    key={opt.value}
                    id={`cortex-xy-opt-${opt.value}`}
                    class={[
                      'cortex-xy-dropdown__option',
                      isHighlighted && 'cortex-xy-dropdown__option--highlighted',
                      isSelected && 'cortex-xy-dropdown__option--selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={isSelected ? 'true' : 'false'}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setHighlightIdx(i)}
                  >
                    {opt.icon && (
                      <span class="cortex-xy-dropdown__option-icon" aria-hidden="true">
                        {opt.icon}
                      </span>
                    )}
                    <span class="cortex-xy-dropdown__option-label">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <span class="cortex-xy-dropdown__option-check" aria-hidden="true">
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {options[highlightIdx]?.hint && (
              <div class="cortex-xy-dropdown__hint" aria-live="polite">
                {options[highlightIdx].hint}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
