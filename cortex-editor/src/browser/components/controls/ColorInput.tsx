import type { ComponentChildren, JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { ColorPicker } from './ColorPicker.js'
import { NumericInput } from './NumericInput.js'
import { Eclipse } from '../icons.js'
import { oklchToHex } from '../../../core/oklch.js'

export interface ColorInputProps {
  value: string
  onChange: (color: string) => void
  alpha?: number
  onAlphaChange?: (alpha: number) => void
  swatches?: string[]
  /** When true, shows hatched swatch indicating shared elements have different colors. */
  mixed?: boolean
  /** Optional trailing element rendered as the last flex child inside the
   *  ColorInput row — used by BackgroundSection for the remove-fill minus,
   *  by BorderSection for the visibility eye toggle. Lives inside the same
   *  flex container as swatch / hex / opacity so all four items share one
   *  layout authority — no caller has to compose its own row, and the
   *  opacity input doesn't need a fixed width with shrink workarounds to
   *  avoid overlapping a sibling rendered outside the ColorInput. */
  trailing?: ComponentChildren
}

export const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/**
 * Convert any CSS color string to #rrggbb.
 * Handles #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla(), oklch() (comma or space syntax).
 * Returns #000000 if unparseable.
 */
export function rgbToHex(color: string): string {
  const trimmed = color.trim()
  // 6-digit hex
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  // 3-digit hex → expand
  const short = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  // rgb/rgba — comma or space-separated, possibly with decimals
  const rgbMatch = trimmed.match(/rgba?\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)/)
  if (rgbMatch) {
    const r = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[1]!))))
    const g = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[2]!))))
    const b = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[3]!))))
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }
  // hsl/hsla — convert to rgb (supports negative hue and hue > 360)
  const hslMatch = trimmed.match(/hsla?\(\s*(-?[\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/)
  if (hslMatch) {
    const h = ((parseFloat(hslMatch[1]!) % 360) + 360) % 360 / 360
    const s = parseFloat(hslMatch[2]!) / 100
    const l = parseFloat(hslMatch[3]!) / 100
    const [r, g, b] = hslToRgb(h, s, l)
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }
  // oklch() — delegate to canonical converter (single source of truth)
  if (trimmed.startsWith('oklch(')) {
    const hex = oklchToHex(trimmed)
    return hex ?? '#000000'
  }
  return '#000000'
}

/** HSL to RGB. All inputs/outputs in [0,1] except returns [0,255]. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hueToRgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return [
    Math.round(hueToRgb(h + 1/3) * 255),
    Math.round(hueToRgb(h) * 255),
    Math.round(hueToRgb(h - 1/3) * 255),
  ]
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

export function ColorInput({ value, onChange, alpha: alphaProp, onAlphaChange, swatches, mixed, trailing }: ColorInputProps): JSX.Element {
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

  // Alpha changes are dispatched solely by the parent's onAlphaChange handler
  // (which calls applyOverride with the formatted color). We do NOT also call
  // emitColor here — that would double-dispatch the edit.
  const handleAlphaChange = useCallback((a: number) => {
    onAlphaChange?.(Math.round(Math.max(0, Math.min(100, a))))
  }, [onAlphaChange])

  return (
    <div class={`cortex-color-input${mixed ? ' cortex-color-input--mixed' : ''}`} ref={swatchRef}>
      <button
        type="button"
        class="cortex-color-input__swatch"
        style={mixed ? undefined : { backgroundColor: value }}
        onClick={handleSwatchClick}
        aria-label="Open color picker"
      />
      <input
        class="cortex-color-input__hex"
        type="text"
        aria-label="Hex color value"
        // `size={9}` drops the input's intrinsic min-content from the browser
        // default of 20 chars (~140px) to ~63px — enough to fit "#ffffffff"
        // (8-digit hex with alpha) plus one buffer char. Without this, the
        // default min-content forces a ~156px content floor on the hex slot
        // which, combined with the trailing IconButton in Background/Border,
        // pushes the whole row past the panel width. Typography's ColorInput
        // happens to work despite the same default because it has no trailing
        // button and therefore an extra ~34px of free space.
        size={9}
        value={mixed ? '--' : displayedHex}
        onInput={handleHexInput}
        onFocus={handleHexFocus}
        onBlur={handleHexBlur}
      />
      {onAlphaChange && (
        <div class="cortex-color-input__opacity">
          <NumericInput
            value={currentAlpha}
            unit="%"
            prefix={<Eclipse size={14} />}
            tooltip="Opacity"
            min={0}
            onChange={handleAlphaChange}
          />
        </div>
      )}
      {trailing}
      {pickerOpen && swatchRef.current && (
        <ColorPicker
          color={hexColor}
          onChange={handlePickerChange}
          onClose={handlePickerClose}
          anchor={swatchRef.current}
          alpha={onAlphaChange ? currentAlpha : undefined}
          onAlphaChange={onAlphaChange ? handleAlphaChange : undefined}
          swatches={swatches}
        />
      )}
    </div>
  )
}
