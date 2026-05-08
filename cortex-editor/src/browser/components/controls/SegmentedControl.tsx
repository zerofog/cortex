import type { JSX, ComponentChild } from 'preact'
import { useRef, useEffect, useCallback } from 'preact/hooks'

export interface SegmentedOption {
  value: string
  label?: string
  icon?: ComponentChild
  title?: string
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  mixed?: boolean
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  mixed,
}: SegmentedControlProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return

    if (mixed) {
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
  }, [value, mixed])

  const handleClick = useCallback(
    (optValue: string) => {
      if (mixed || optValue !== value) onChange(optValue)
    },
    [mixed, value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const targetValue = (e.target as HTMLElement | null)?.getAttribute('data-value')
      const focusedIdx = targetValue ? options.findIndex((o) => o.value === targetValue) : -1
      const idx = mixed ? (focusedIdx >= 0 ? focusedIdx : 0) : options.findIndex((o) => o.value === value)
      if (idx === -1) return
      let next = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        next = (idx + 1) % options.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        next = (idx - 1 + options.length) % options.length
      }
      const target = next >= 0 ? options[next] : undefined
      if (target) onChange(target.value)
    },
    [options, value, mixed, onChange],
  )

  const sizeClass = size === 'sm' ? ' cortex-segmented--sm' : ''
  const mixedClass = mixed ? ' cortex-segmented--mixed' : ''

  return (
    <div
      ref={trackRef}
      class={`cortex-segmented${sizeClass}${mixedClass}`}
      role="radiogroup"
      onKeyDown={handleKeyDown}
    >
      <div ref={indicatorRef} class="cortex-segmented__indicator" />
      {mixed && <span class="cortex-segmented__mixed-label">Mixed</span>}
      {options.map((opt, index) => {
        const isActive = !mixed && opt.value === value
        return (
          <button
            key={opt.value}
            class={`cortex-segmented__option${isActive ? ' cortex-segmented__option--active' : ''}`}
            type="button"
            role="radio"
            aria-checked={isActive ? 'true' : 'false'}
            tabIndex={mixed ? (index === 0 ? 0 : -1) : (opt.value === value ? 0 : -1)}
            aria-label={opt.label ? undefined : opt.title}
            data-tooltip={opt.title}
            data-value={opt.value}
            onClick={() => handleClick(opt.value)}
          >
            {opt.icon && <span class="cortex-segmented__icon">{opt.icon}</span>}
            {opt.label && <span class="cortex-segmented__label">{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
