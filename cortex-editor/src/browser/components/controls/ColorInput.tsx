import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'

export interface ColorInputProps {
  value: string
  onChange: (hex: string) => void
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

/** Convert any CSS color string to #RRGGBB. Returns #000000 if unparseable. */
export function rgbToHex(color: string): string {
  if (HEX_REGEX.test(color)) return color.toLowerCase()
  const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return '#000000'
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function ColorInput({ value, onChange }: ColorInputProps): JSX.Element {
  const hexColor = rgbToHex(value)
  const [editingHex, setEditingHex] = useState<string | null>(null)
  const displayedHex = editingHex !== null ? editingHex : hexColor

  const handleHexInput = useCallback((e: Event) => {
    setEditingHex((e.target as HTMLInputElement).value)
  }, [])

  const handleHexFocus = useCallback(() => {
    setEditingHex(hexColor)
  }, [hexColor])

  const handleHexBlur = useCallback(() => {
    if (editingHex !== null && HEX_REGEX.test(editingHex)) {
      onChange(editingHex)
    }
    setEditingHex(null)
  }, [editingHex, onChange])

  return (
    <div class="cortex-color-input">
      <div
        class="cortex-color-input__swatch"
        style={{ backgroundColor: value }}
      />
      <input
        class="cortex-color-input__hex"
        type="text"
        value={displayedHex}
        onInput={handleHexInput}
        onFocus={handleHexFocus}
        onBlur={handleHexBlur}
      />
    </div>
  )
}
