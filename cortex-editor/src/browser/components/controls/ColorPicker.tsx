import type { JSX } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { computePosition, flip, shift } from '@floating-ui/dom'
import 'vanilla-colorful/hex-color-picker.js'

export interface ColorPickerProps {
  color: string
  onChange: (hex: string) => void
  onClose: () => void
  anchor: HTMLElement
  alpha?: number
  onAlphaChange?: (alpha: number) => void
  swatches?: string[]
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db',
  '#e5e7eb', '#f3f4f6', '#f9fafb', '#ffffff',
]

export function ColorPicker({
  color,
  onChange,
  onClose,
  anchor,
  alpha = 100,
  onAlphaChange,
  swatches: swatchesProp,
}: ColorPickerProps): JSX.Element {
  const displaySwatches = swatchesProp ?? SWATCHES
  const popoverRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLElement>(null)

  const [editingHex, setEditingHex] = useState<string | null>(null)
  const editingHexRef = useRef<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : color

  // Position popover via floating-ui
  useEffect(() => {
    if (!popoverRef.current) return
    let cancelled = false
    computePosition(anchor, popoverRef.current, {
      placement: 'bottom-start',
      middleware: [flip(), shift({ padding: 8 })],
    })
      .then(({ x, y }) => {
        if (!cancelled && popoverRef.current) {
          popoverRef.current.style.left = `${x}px`
          popoverRef.current.style.top = `${y}px`
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn(
            '[cortex] ColorPicker positioning failed:',
            err instanceof Error ? err.message : err,
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [anchor])

  // Sync color prop to web component
  useEffect(() => {
    const picker = pickerRef.current
    if (!picker) return
    ;(picker as any).color = color
  }, [color])

  // Subscribe to color-changed event once (use ref for onChange to avoid re-subscribing)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const picker = pickerRef.current
    if (!picker) return
    const handleColorChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && typeof detail.value === 'string' && HEX_REGEX.test(detail.value)) {
        onChangeRef.current(detail.value)
      }
    }
    picker.addEventListener('color-changed', handleColorChanged)
    return () => {
      picker.removeEventListener('color-changed', handleColorChanged)
    }
  }, [])

  const handleHexFocus = useCallback(() => {
    editingHexRef.current = color
    setEditingHex(color)
  }, [color])

  const handleHexInput = useCallback((e: Event) => {
    const v = (e.target as HTMLInputElement).value
    editingHexRef.current = v
    setEditingHex(v)
  }, [])

  const handleHexBlur = useCallback(() => {
    const current = editingHexRef.current
    if (current !== null && HEX_REGEX.test(current)) {
      onChange(current)
    }
    editingHexRef.current = null
    setEditingHex(null)
  }, [onChange])

  const handleSwatchClick = useCallback(
    (hex: string) => {
      onChange(hex)
    },
    [onChange],
  )

  return (
    <>
      <div class="cortex-color-picker__backdrop" onClick={onClose} />
      <div
        ref={popoverRef}
        class="cortex-color-picker__popover"
        style={{ position: 'fixed' }}
      >
        <hex-color-picker ref={pickerRef} />

        <div class="cortex-color-picker__inputs">
          <div class="cortex-color-picker__hex-row">
            <span class="cortex-color-picker__label">Hex</span>
            <input
              class="cortex-color-picker__hex-input"
              type="text"
              value={displayedHex}
              onFocus={handleHexFocus}
              onInput={handleHexInput}
              onBlur={handleHexBlur}
            />
          </div>
          {onAlphaChange && (
            <div class="cortex-color-picker__alpha-row">
              <span class="cortex-color-picker__label">Alpha</span>
              <input
                class="cortex-color-picker__alpha-input"
                type="number"
                min={0}
                max={100}
                value={alpha}
                onInput={(e: Event) => {
                  const val = parseInt((e.target as HTMLInputElement).value, 10)
                  if (!isNaN(val)) onAlphaChange(Math.max(0, Math.min(100, val)))
                }}
              />
              <span class="cortex-color-picker__unit">%</span>
            </div>
          )}
        </div>

        <div class="cortex-color-picker__swatches">
          {displaySwatches.map((hex, idx) => (
            <button
              key={`${hex}-${idx}`}
              class={`cortex-color-picker__swatch${hex === color ? ' cortex-color-picker__swatch--active' : ''}`}
              style={{ backgroundColor: hex }}
              onClick={() => handleSwatchClick(hex)}
              type="button"
              aria-label={`Set color to ${hex}`}
            />
          ))}
        </div>
      </div>
    </>
  )
}
