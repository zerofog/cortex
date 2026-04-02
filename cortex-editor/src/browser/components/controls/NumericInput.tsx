import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

export interface NumericInputProps {
  value: number
  unit?: string
  label?: string
  tooltip?: string
  min?: number
  disabled?: boolean
  onChange: (value: number) => void
  onScrub?: (value: number) => void
  onScrubEnd?: (value: number) => void
  overridden?: boolean
  /** When true, shows '--' placeholder indicating shared elements have different values. */
  mixed?: boolean
}

function getStep(e: KeyboardEvent | WheelEvent): number {
  if (e.shiftKey) return 10
  if (e.altKey) return 0.1
  return 1
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10
}

export function NumericInput({
  value,
  unit,
  label,
  tooltip,
  min,
  disabled,
  onChange,
  onScrub,
  onScrubEnd,
  overridden,
  mixed,
}: NumericInputProps): JSX.Element {
  const [localValue, setLocalValue] = useState(String(value))
  const [isEditing, setIsEditing] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const localValueRef = useRef(String(value))
  const scrubStartX = useRef(0)
  const scrubStartValue = useRef(0)
  const scrubCleanupRef = useRef<(() => void) | null>(null)
  // Track whether the user actually typed in the input — prevents HMR-triggered
  // blurs from dispatching phantom edits with stale values.
  const userTypedRef = useRef(false)

  // Clean up scrub listeners if component unmounts mid-scrub
  useEffect(() => {
    return () => { scrubCleanupRef.current?.() }
  }, [])

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
      const next = clampValue(roundTenth(value + delta))
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
    userTypedRef.current = false
    inputRef.current?.select()
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const parsed = parseFloat(localValueRef.current)
    if (isNaN(parsed)) {
      const reverted = String(value)
      localValueRef.current = reverted
      setLocalValue(reverted)
      if (inputRef.current) inputRef.current.value = reverted
    } else {
      const clamped = clampValue(parsed)
      // Only commit if the user actually typed a new value — prevents HMR-triggered
      // blurs from dispatching phantom edits when React replaces DOM nodes.
      if (userTypedRef.current && clamped !== value) {
        onChange(clamped)
      }
      const str = String(clamped)
      localValueRef.current = str
      setLocalValue(str)
    }
    userTypedRef.current = false
  }, [value, onChange, clampValue])

  const handleInput = useCallback((e: Event) => {
    userTypedRef.current = true
    const v = (e.target as HTMLInputElement).value
    localValueRef.current = v
    setLocalValue(v)
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    const root = inputRef.current?.getRootNode() as Document | ShadowRoot
    if (root?.activeElement !== inputRef.current) return
    e.preventDefault()
    const step = getStep(e)
    const delta = e.deltaY < 0 ? step : -step
    const next = clampValue(roundTenth(value + delta))
    onChange(next)
  }, [value, onChange, clampValue])

  const handleScrubDown = useCallback((e: PointerEvent) => {
    if (isEditing) return
    scrubStartX.current = e.clientX
    scrubStartValue.current = value

    const target = e.currentTarget as HTMLElement
    try { target.setPointerCapture(e.pointerId) } catch {}

    setIsScrubbing(true)
    let hasMoved = false

    const handleMove = (me: PointerEvent) => {
      const delta = me.clientX - scrubStartX.current
      if (!hasMoved && Math.abs(delta) < 2) return // deadzone — ignore sub-pixel trackpad jitter
      hasMoved = true
      const next = clampValue(roundTenth(scrubStartValue.current + delta))
      localValueRef.current = String(next)
      setLocalValue(String(next))
      onScrub?.(next)
    }

    const cleanup = () => {
      scrubCleanupRef.current = null
      setIsScrubbing(false)
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', handleUp)
      target.removeEventListener('pointercancel', handleCancel)
    }

    const handleUp = (ue: PointerEvent) => {
      try { target.releasePointerCapture(ue.pointerId) } catch {}
      if (!hasMoved) {
        // Click without drag — just focus the input, don't commit
        inputRef.current?.focus()
        cleanup()
        return
      }
      const delta = ue.clientX - scrubStartX.current
      const next = clampValue(roundTenth(scrubStartValue.current + delta))
      if (onScrubEnd) {
        onScrubEnd(next)
      } else {
        onChange(next)
      }
      cleanup()
    }

    const handleCancel = () => {
      cleanup()
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', handleUp)
    target.addEventListener('pointercancel', handleCancel)
    scrubCleanupRef.current = cleanup
  }, [isEditing, value, onChange, onScrub, onScrubEnd, clampValue])

  return (
    <div
      class={[
        'cortex-numeric-input',
        isScrubbing && 'cortex-numeric-input--scrubbing',
        overridden && 'cortex-numeric-input--overridden',
        mixed && 'cortex-numeric-input--mixed',
      ].filter(Boolean).join(' ')}
      onPointerDown={disabled ? undefined : handleScrubDown}
      data-tooltip={tooltip}
      aria-disabled={disabled ? 'true' : undefined}
    >
      {label && <span class="cortex-numeric-input__label">{label}</span>}
      <input
        ref={inputRef}
        class="cortex-numeric-input__value"
        type="text"
        inputMode="numeric"
        aria-label={tooltip ?? label}
        value={mixed && !isEditing ? '' : localValue}
        placeholder={mixed ? '--' : undefined}
        disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
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
