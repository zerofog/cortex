import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect, useMemo } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'

export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
}: DropdownProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  const filtered = useMemo(() => {
    if (!filter) return options
    const lc = filter.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(lc))
  }, [options, filter])

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
      onChange(optValue)
      close()
    },
    [onChange, close],
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
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => Math.max(i - 1, 0))
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
    <div class="cortex-dropdown">
      <button
        ref={triggerRef}
        class="cortex-dropdown__trigger"
        role="combobox"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        onClick={isOpen ? close : open}
      >
        <span class="cortex-dropdown__value">
          {selectedLabel || placeholder}
        </span>
        <span class={`cortex-dropdown__chevron${isOpen ? ' cortex-dropdown__chevron--open' : ''}`}>
          &#9662;
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
              value={filter}
              onInput={handleFilterInput}
              onKeyDown={handleKeyDown}
              placeholder="Filter..."
            />
            <div class="cortex-dropdown__list" role="listbox">
              {filtered.length === 0 ? (
                <div class="cortex-dropdown__empty">No matches</div>
              ) : (
                filtered.map((opt, i) => (
                  <div
                    key={opt.value}
                    class={[
                      'cortex-dropdown__option',
                      i === highlightIdx && 'cortex-dropdown__option--active',
                      opt.value === value && 'cortex-dropdown__option--selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={opt.value === value ? 'true' : 'false'}
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
