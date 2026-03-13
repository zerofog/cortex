import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

export interface NumericInputProps {
  value: number
  unit?: string
  label?: string
  min?: number
  onChange: (value: number) => void
  onScrub?: (value: number) => void
  onScrubEnd?: (value: number) => void
}

function getStep(e: KeyboardEvent | WheelEvent): number {
  if (e.shiftKey) return 10
  if (e.altKey) return 0.1
  return 1
}

export function NumericInput({
  value,
  unit,
  label,
  min,
  onChange,
  onScrub,
  onScrubEnd,
}: NumericInputProps): JSX.Element {
  const [localValue, setLocalValue] = useState(String(value))
  const [isEditing, setIsEditing] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const localValueRef = useRef(String(value))
  const scrubStartX = useRef(0)
  const scrubStartValue = useRef(0)

  // Keep ref in sync so event handlers always read the latest value
  localValueRef.current = localValue

  useEffect(() => {
    if (!isEditing) {
      setLocalValue(String(value))
    }
  }, [value, isEditing])

  const clampValue = useCallback((v: number) => {
    return min !== undefined ? Math.max(min, v) : v
  }, [min])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = getStep(e)
      const delta = e.key === 'ArrowUp' ? step : -step
      const next = clampValue(Math.round((value + delta) * 10) / 10)
      onChange(next)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const parsed = parseFloat(localValueRef.current)
      if (!isNaN(parsed)) {
        onChange(clampValue(parsed))
      }
      setIsEditing(false)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setLocalValue(String(value))
      setIsEditing(false)
      inputRef.current?.blur()
    }
  }, [value, onChange, clampValue])

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    inputRef.current?.select()
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const parsed = parseFloat(localValueRef.current)
    if (isNaN(parsed)) {
      // Force revert: update both ref and state, and directly set the DOM
      // value in case Preact skips the re-render (state may not have changed)
      const reverted = String(value)
      localValueRef.current = reverted
      setLocalValue(reverted)
      if (inputRef.current) inputRef.current.value = reverted
    } else {
      const clamped = clampValue(parsed)
      if (clamped !== value) {
        onChange(clamped)
      }
      const str = String(clamped)
      localValueRef.current = str
      setLocalValue(str)
    }
  }, [value, onChange, clampValue])

  const handleInput = useCallback((e: Event) => {
    const v = (e.target as HTMLInputElement).value
    localValueRef.current = v
    setLocalValue(v)
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    if (document.activeElement !== inputRef.current) return
    e.preventDefault()
    const step = getStep(e)
    const delta = e.deltaY < 0 ? step : -step
    const next = clampValue(Math.round((value + delta) * 10) / 10)
    onChange(next)
  }, [value, onChange, clampValue])

  const handleScrubDown = useCallback((e: PointerEvent) => {
    if (isEditing) return
    scrubStartX.current = e.clientX
    scrubStartValue.current = value

    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch {}

    setIsScrubbing(true)

    const handleMove = (me: PointerEvent) => {
      const delta = me.clientX - scrubStartX.current
      const next = clampValue(Math.round((scrubStartValue.current + delta) * 10) / 10)
      onScrub?.(next)
    }

    const cleanup = () => {
      setIsScrubbing(false)
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      target.removeEventListener('pointercancel', handleCancel)
    }

    const handleUp = (ue: PointerEvent) => {
      try { target.releasePointerCapture(ue.pointerId) } catch {}
      const delta = ue.clientX - scrubStartX.current
      const next = clampValue(Math.round((scrubStartValue.current + delta) * 10) / 10)
      onScrubEnd?.(next)
      onChange(next)
      cleanup()
    }

    const handleCancel = () => {
      cleanup()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
    target.addEventListener('pointercancel', handleCancel)
  }, [isEditing, value, onChange, onScrub, onScrubEnd, clampValue])

  return (
    <div
      class={`cortex-numeric-input ${isScrubbing ? 'cortex-numeric-input--scrubbing' : ''}`}
      onPointerDown={handleScrubDown}
    >
      {label && <span class="cortex-numeric-input__label">{label}</span>}
      <input
        ref={inputRef}
        class="cortex-numeric-input__value"
        type="text"
        inputMode="numeric"
        value={localValue}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onWheel={handleWheel}
      />
      {unit && <span class="cortex-numeric-input__unit">{unit}</span>}
    </div>
  )
}
