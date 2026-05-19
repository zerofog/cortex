import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect, useMemo, useId } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'
import { ChevronDown } from '../icons.js'

export interface DropdownOption {
  value: string
  label: string
  tooltip?: string
  /** When true, the option renders greyed out and cannot be selected. */
  disabled?: boolean
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mixed?: boolean
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  mixed,
}: DropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const dropdownId = useId()

  const selected = options.find((o) => o.value === value)
  const selectedLabel = selected?.label ?? ''
  const displayLabel = mixed ? 'Mixed' : selectedLabel || placeholder
  const selectedTooltip = mixed ? 'Mixed values' : selected?.tooltip
  const listboxId = `${dropdownId}-listbox`

  const filtered = useMemo(() => {
    if (!filter) return options
    const lc = filter.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(lc))
  }, [options, filter])
  const activeOptionId = filtered[highlightIdx] ? `${dropdownId}-option-${highlightIdx}` : undefined

  // Position popover when opened — only on open, not on filter changes
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return
    let cancelled = false
    const trigger = triggerRef.current
    const popover = popoverRef.current
    // Set popover width to match trigger (position:fixed ignores relative parent)
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
        console.warn('[cortex] Dropdown positioning failed:', err instanceof Error ? err.message : err)
        // Fallback: position directly below trigger
        const rect = trigger.getBoundingClientRect()
        if (popoverRef.current) {
          popoverRef.current.style.left = `${rect.left}px`
          popoverRef.current.style.top = `${rect.bottom}px`
        }
      }
    })
    return () => { cancelled = true }
  }, [isOpen])

  // Focus filter input when opened
  useEffect(() => {
    if (isOpen) {
      filterRef.current?.focus()
      setHighlightIdx(0)
    }
  }, [isOpen])

  const open = useCallback(() => {
    setFilter('')
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setFilter('')
  }, [])

  const select = useCallback(
    (optValue: string) => {
      const opt = options.find((o) => o.value === optValue)
      if (opt?.disabled) return
      onChange(optValue)
      close()
    },
    [onChange, close, options],
  )

  const handleFilterInput = useCallback((e: Event) => {
    setFilter((e.target as HTMLInputElement).value)
    setHighlightIdx(0)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filtered.length > 0) setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filtered.length > 0) setHighlightIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[highlightIdx]) {
          select(filtered[highlightIdx].value)
        }
      }
    },
    [close, select, filtered, highlightIdx],
  )

  return (
    <div class={`cortex-dropdown${mixed ? ' cortex-dropdown--mixed' : ''}`}>
      <button
        ref={triggerRef}
        class="cortex-dropdown__trigger"
        type="button"
        role="combobox"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        data-tooltip={selectedTooltip}
        onClick={isOpen ? close : open}
      >
        <span class="cortex-dropdown__value">
          {displayLabel}
        </span>
        <span class={`cortex-dropdown__chevron${isOpen ? ' cortex-dropdown__chevron--open' : ''}`}>
          <ChevronDown size={12} />
        </span>
      </button>
      {isOpen && (
        <>
          <div class="cortex-dropdown__backdrop" onClick={close} />
          <div
            ref={popoverRef}
            class="cortex-dropdown__popover"
            style={{ position: 'fixed' }}
          >
            <input
              ref={filterRef}
              class="cortex-dropdown__filter"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              value={filter}
              onInput={handleFilterInput}
              onKeyDown={handleKeyDown}
              placeholder="Filter..."
            />
            <div class="cortex-dropdown__list" role="listbox" id={listboxId}>
              {filtered.length === 0 ? (
                <div class="cortex-dropdown__empty">No matches</div>
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={opt.value}
                    id={`${dropdownId}-option-${i}`}
                    class={[
                      'cortex-dropdown__option',
                      i === highlightIdx && 'cortex-dropdown__option--active',
                      !mixed && opt.value === value && 'cortex-dropdown__option--selected',
                      opt.disabled && 'cortex-dropdown__option--disabled',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={!mixed && opt.value === value ? 'true' : 'false'}
                    aria-disabled={opt.disabled ? 'true' : undefined}
                    data-tooltip={opt.tooltip}
                    onClick={() => select(opt.value)}
                  >
                    {opt.label}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
