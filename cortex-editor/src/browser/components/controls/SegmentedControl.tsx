import type { JSX } from 'preact'
import { useRef, useEffect, useCallback } from 'preact/hooks'

export interface SegmentedOption {
  value: string
  label?: string
  icon?: string
  title?: string
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return

    const activeBtn = track.querySelector(`[data-value="${value}"]`) as HTMLElement | null
    if (activeBtn) {
      indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`
      indicator.style.width = `${activeBtn.offsetWidth}px`
    }
  }, [value])

  const handleClick = useCallback(
    (optValue: string) => {
      if (optValue !== value) onChange(optValue)
    },
    [value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const idx = options.findIndex((o) => o.value === value)
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
    [options, value, onChange],
  )

  const sizeClass = size === 'sm' ? ' cortex-segmented--sm' : ''

  return (
    <div
      ref={trackRef}
      class={`cortex-segmented${sizeClass}`}
      role="radiogroup"
      onKeyDown={handleKeyDown}
    >
      <div ref={indicatorRef} class="cortex-segmented__indicator" />
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            class={`cortex-segmented__option${isActive ? ' cortex-segmented__option--active' : ''}`}
            role="radio"
            aria-checked={isActive ? 'true' : 'false'}
            tabindex={isActive ? 0 : -1}
            title={opt.title}
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
