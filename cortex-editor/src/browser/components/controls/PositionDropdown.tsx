/**
 * PositionDropdown — Panel v2 Task 5 (ZF0-1183)
 *
 * Cursor-pattern dropdown for the CSS `position` property. Unlike the
 * generic filter-based `Dropdown`, this control is purpose-built for a
 * fixed, small set of enum options:
 *   - full-width trigger showing icon + full label + chevron
 *   - popover listing all 5 options with per-option icon + label + checkmark
 *   - description bar at the bottom updating on hover/focus
 *   - NO filter input (5 options, no scan cost to justify one)
 *   - NO clear button (position always has a value, never empty)
 *
 * Positioning replicates `Dropdown.tsx` exactly: `computePosition(...).then(...)`
 * with a `position: fixed` popover so it escapes the panel's Shadow DOM
 * bounding box and measures correctly when the browser flips/shifts it.
 *
 * The option list is declared internally so callers only pass `value` /
 * `onChange` / `disabled`. Keeping the catalog private prevents a caller
 * from accidentally desyncing the icons/descriptions from the design system.
 */
import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'
import { Square, MoveDiagonal, Maximize, Pin, Paperclip, Check, ChevronDown } from '../icons.js'

export interface PositionOption {
  value: string
  label: string
  icon: JSX.Element
  description: string
}

export interface PositionDropdownProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

// Catalog is module-local so the 5 options + icons + descriptions stay
// in lockstep. Task 5 spec defines the exact strings; consumers cannot
// override them (that would defeat the purpose of a typed position picker).
const POSITION_OPTIONS: PositionOption[] = [
  {
    value: 'static',
    label: 'Static',
    icon: <Square size={14} />,
    description: 'Static — default position; element follows document flow',
  },
  {
    value: 'relative',
    label: 'Relative',
    icon: <MoveDiagonal size={14} />,
    description: 'Relative — positioned relative to its normal position',
  },
  {
    value: 'absolute',
    label: 'Absolute',
    icon: <Maximize size={14} />,
    description: 'Absolute — positioned relative to nearest positioned ancestor',
  },
  {
    value: 'fixed',
    label: 'Fixed',
    icon: <Pin size={14} />,
    description: 'Fixed — positioned relative to the viewport',
  },
  {
    value: 'sticky',
    label: 'Sticky',
    icon: <Paperclip size={14} />,
    description: 'Sticky — sticks to container edge when scrolling',
  },
]

function findIndex(value: string): number {
  const i = POSITION_OPTIONS.findIndex((o) => o.value === value)
  return i === -1 ? 0 : i
}

// Safe accessor — `findIndex` above guarantees the index is in range and
// POSITION_OPTIONS is a non-empty constant, so every read is defined.
// This helper keeps `noUncheckedIndexedAccess` happy without sprinkling
// `!` assertions across the render path.
function optionAt(idx: number): PositionOption {
  return POSITION_OPTIONS[idx] ?? POSITION_OPTIONS[0]!
}

export function PositionDropdown({
  value,
  onChange,
  disabled = false,
}: PositionDropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(findIndex(value))
  // `hoverIdx` tracks the option currently under the pointer; null falls
  // back to the highlighted (keyboard) or selected option for the
  // description bar. Separating these keeps keyboard + mouse interactions
  // from fighting each other mid-hover.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const selected = optionAt(findIndex(value))

  // Description bar priority: pointer hover > keyboard highlight >
  // current selection. On open, highlight resets to the selected option
  // so the default description mirrors the current value.
  const describedIdx = hoverIdx ?? highlightIdx
  const describedOption = optionAt(describedIdx)
  const activeId = isOpen ? `cortex-position-opt-${optionAt(highlightIdx).value}` : undefined

  // Position the popover — only on open, replicating Dropdown.tsx.
  // `position: fixed` + computePosition is the Shadow-DOM-safe pattern:
  // the popover escapes its ancestor's transform/overflow contexts so
  // flip()/shift() work when the panel is near the viewport edge.
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return
    let cancelled = false
    const trigger = triggerRef.current
    const popover = popoverRef.current
    popover.style.width = `${trigger.offsetWidth}px`
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
        console.warn('[cortex] PositionDropdown positioning failed:', err instanceof Error ? err.message : err)
        const rect = trigger.getBoundingClientRect()
        if (popoverRef.current) {
          popoverRef.current.style.left = `${rect.left}px`
          popoverRef.current.style.top = `${rect.bottom}px`
        }
      }
    })
    return () => { cancelled = true }
  }, [isOpen])

  // When value changes while closed, keep the default highlight in sync
  // so the next open shows a description matching the new selection.
  useEffect(() => {
    if (!isOpen) setHighlightIdx(findIndex(value))
  }, [value, isOpen])

  const open = useCallback(() => {
    if (disabled) return
    setHighlightIdx(findIndex(value))
    setHoverIdx(null)
    setIsOpen(true)
  }, [disabled, value])

  const close = useCallback(() => {
    setIsOpen(false)
    setHoverIdx(null)
    // Return focus to trigger so screen-readers / keyboard users don't
    // land on document.body after Escape.
    triggerRef.current?.focus()
  }, [])

  const select = useCallback(
    (optValue: string) => {
      onChange(optValue)
      setIsOpen(false)
      setHoverIdx(null)
      triggerRef.current?.focus()
    },
    [onChange],
  )

  const handleTriggerClick = useCallback(() => {
    if (disabled) return
    if (isOpen) close()
    else open()
  }, [disabled, isOpen, open, close])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => (i + 1) % POSITION_OPTIONS.length)
        setHoverIdx(null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => (i - 1 + POSITION_OPTIONS.length) % POSITION_OPTIONS.length)
        setHoverIdx(null)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setHighlightIdx(0)
        setHoverIdx(null)
      } else if (e.key === 'End') {
        e.preventDefault()
        setHighlightIdx(POSITION_OPTIONS.length - 1)
        setHoverIdx(null)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        select(optionAt(highlightIdx).value)
      }
    },
    [isOpen, close, highlightIdx, select],
  )

  return (
    <div class="cortex-position-dropdown">
      <button
        ref={triggerRef}
        class="cortex-position-dropdown__trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-activedescendant={activeId}
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
      >
        <span class="cortex-position-dropdown__trigger-icon" aria-hidden="true">
          {selected.icon}
        </span>
        <span class="cortex-position-dropdown__trigger-label">
          {selected.label}
        </span>
        <span
          class={`cortex-position-dropdown__chevron${isOpen ? ' cortex-position-dropdown__chevron--open' : ''}`}
          aria-hidden="true"
        >
          <ChevronDown size={14} />
        </span>
      </button>
      {isOpen && (
        <>
          <div class="cortex-position-dropdown__backdrop" onClick={close} />
          <div
            ref={popoverRef}
            class="cortex-position-dropdown__popover"
            style={{ position: 'fixed' }}
          >
            <div
              class="cortex-position-dropdown__list"
              role="listbox"
              aria-label="Position mode"
            >
              {POSITION_OPTIONS.map((opt, i) => {
                const isSelected = opt.value === value
                const isHighlighted = i === highlightIdx
                return (
                  <div
                    key={opt.value}
                    id={`cortex-position-opt-${opt.value}`}
                    class={[
                      'cortex-position-dropdown__option',
                      isHighlighted && 'cortex-position-dropdown__option--highlighted',
                      isSelected && 'cortex-position-dropdown__option--selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={isSelected ? 'true' : 'false'}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => {
                      setHoverIdx(i)
                      setHighlightIdx(i)
                    }}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    <span class="cortex-position-dropdown__option-icon" aria-hidden="true">
                      {opt.icon}
                    </span>
                    <span class="cortex-position-dropdown__option-label">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <span class="cortex-position-dropdown__option-check" aria-hidden="true">
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div class="cortex-position-dropdown__description">
              {describedOption.description}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
