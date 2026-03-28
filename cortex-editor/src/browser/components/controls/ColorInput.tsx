import type { JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { ColorPicker } from './ColorPicker.js'
import { NumericInput } from './NumericInput.js'

export interface ColorInputProps {
  value: string
  onChange: (color: string) => void
  alpha?: number
  onAlphaChange?: (alpha: number) => void
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

/** Parse any CSS color string into { hex, alpha }. Alpha is 0–100 integer. */
export function parseColor(color: string): { hex: string; alpha: number } {
  const trimmed = color.trim()
  if (trimmed === 'transparent') return { hex: '#000000', alpha: 0 }

  // 8-digit hex (#rrggbbaa)
  const hex8 = trimmed.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/)
  if (hex8) {
    return { hex: `#${hex8[1]!.toLowerCase()}`, alpha: Math.round((parseInt(hex8[2]!, 16) / 255) * 100) }
  }

  // rgba with alpha channel
  const rgba = trimmed.match(/rgba\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)[,/\s]+([\d.]+)\s*\)/)
  if (rgba) {
    const hex = rgbToHex(`rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`)
    return { hex, alpha: Math.round(parseFloat(rgba[4]!) * 100) }
  }

  // Everything else: delegate to rgbToHex, assume full opacity
  return { hex: rgbToHex(trimmed), alpha: 100 }
}

/** Format hex + alpha into a CSS color value. Returns hex when alpha=100, rgba() otherwise. */
export function formatColor(hex: string, alpha: number): string {
  if (alpha >= 100) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha) / 100})`
}

export function ColorInput({ value, onChange, alpha: alphaProp, onAlphaChange, swatches }: ColorInputProps): JSX.Element {
  const parsed = parseColor(value)
  const hexColor = parsed.hex
  const currentAlpha = alphaProp ?? parsed.alpha
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const editingHexRef = useRef<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : hexColor
  const [pickerOpen, setPickerOpen] = useState(false)
  const swatchRef = useRef<HTMLDivElement>(null)
  // Keep a ref for currentAlpha so callbacks always see the latest value
  const alphaRef = useRef(currentAlpha)
  alphaRef.current = currentAlpha

  const emitColor = useCallback((hex: string, a: number) => {
    onChange(onAlphaChange ? formatColor(hex, a) : hex)
  }, [onChange, onAlphaChange])

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
      emitColor(current, alphaRef.current)
    }
    editingHexRef.current = null
    setEditingHex(null)
  }, [emitColor, hexColor])

  const handleSwatchClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickerChange = useCallback((hex: string) => {
    emitColor(hex, alphaRef.current)
  }, [emitColor])

  const handleAlphaChange = useCallback((a: number) => {
    onAlphaChange?.(a)
    emitColor(hexColor, a)
  }, [onAlphaChange, emitColor, hexColor])

  const handlePickerAlphaChange = useCallback((a: number) => {
    onAlphaChange?.(a)
    emitColor(hexColor, a)
  }, [onAlphaChange, emitColor, hexColor])

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
      {onAlphaChange && (
        <div class="cortex-color-input__opacity">
          <NumericInput
            value={currentAlpha}
            unit="%"
            tooltip="Opacity"
            min={0}
            onChange={handleAlphaChange}
          />
        </div>
      )}
      {pickerOpen && swatchRef.current && (
        <ColorPicker
          color={hexColor}
          onChange={handlePickerChange}
          onClose={handlePickerClose}
          anchor={swatchRef.current}
          alpha={onAlphaChange ? currentAlpha : undefined}
          onAlphaChange={onAlphaChange ? handlePickerAlphaChange : undefined}
          swatches={swatches}
        />
      )}
    </div>
  )
}
