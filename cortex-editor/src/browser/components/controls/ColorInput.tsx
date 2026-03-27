import type { JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { ColorPicker } from './ColorPicker.js'

export interface ColorInputProps {
  value: string
  onChange: (hex: string) => void
  swatches?: string[]
}

export const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/** Convert any CSS color string to #rrggbb. Handles #rgb, #rrggbb, rgb(), rgba() (comma or space syntax). Returns #000000 if unparseable. */
export function rgbToHex(color: string): string {
  const trimmed = color.trim()
  // 6-digit hex
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  // 3-digit hex → expand
  const short = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  // rgb/rgba — comma or space-separated, possibly with decimals
  const m = trimmed.match(/rgba?\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)/)
  if (!m) return '#000000'
  const r = Math.round(Math.min(255, Math.max(0, parseFloat(m[1]!))))
  const g = Math.round(Math.min(255, Math.max(0, parseFloat(m[2]!))))
  const b = Math.round(Math.min(255, Math.max(0, parseFloat(m[3]!))))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function ColorInput({ value, onChange, swatches }: ColorInputProps): JSX.Element {
  const hexColor = rgbToHex(value)
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const editingHexRef = useRef<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : hexColor
  const [pickerOpen, setPickerOpen] = useState(false)
  const swatchRef = useRef<HTMLDivElement>(null)

  const handleHexInput = useCallback((e: Event) => {
    const v = (e.target as HTMLInputElement).value
    editingHexRef.current = v
    setEditingHex(v)
  }, [])

  const handleHexFocus = useCallback(() => {
    editingHexRef.current = hexColor
    setEditingHex(hexColor)
  }, [hexColor])

  const handleHexBlur = useCallback(() => {
    const current = editingHexRef.current
    if (current !== null && HEX_REGEX.test(current) && current.toLowerCase() !== hexColor.toLowerCase()) {
      onChange(current)
    }
    editingHexRef.current = null
    setEditingHex(null)
  }, [onChange, hexColor])

  const handleSwatchClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickerChange = useCallback((hex: string) => {
    onChange(hex)
  }, [onChange])

  return (
    <div class="cortex-color-input" ref={swatchRef}>
      <button
        type="button"
        class="cortex-color-input__swatch"
        style={{ backgroundColor: value }}
        onClick={handleSwatchClick}
        aria-label="Open color picker"
      />
      <input
        class="cortex-color-input__hex"
        type="text"
        aria-label="Hex color value"
        value={displayedHex}
        onInput={handleHexInput}
        onFocus={handleHexFocus}
        onBlur={handleHexBlur}
      />
      {pickerOpen && swatchRef.current && (
        <ColorPicker
          color={hexColor}
          onChange={handlePickerChange}
          onClose={handlePickerClose}
          anchor={swatchRef.current}
          swatches={swatches}
        />
      )}
    </div>
  )
}
