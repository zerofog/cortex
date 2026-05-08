import type { ComponentChildren, JSX } from 'preact'
import { useState, useRef, useCallback } from 'preact/hooks'
import { ColorPicker } from './ColorPicker.js'
import { NumericInput } from './NumericInput.js'
import { Eclipse } from '../icons.js'
import { oklchToHex } from '../../../core/oklch.js'

export interface ColorInputProps {
  value: string
  onChange: (color: string) => void
  onScrub?: (color: string) => void
  onScrubEnd?: (color: string) => void
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

interface EditableColor {
  hex: string
  alpha: number
  alphaWasExplicit: boolean
}

const NAMED_COLOR_HEX: Record<string, string> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  lime: '#00ff00',
  magenta: '#ff00ff',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  orange: '#ffa500',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  silver: '#c0c0c0',
  teal: '#008080',
  white: '#ffffff',
  yellow: '#ffff00',
}

const CSS_COLOR_KEYWORDS_REQUIRING_CONTEXT = new Set([
  'currentcolor',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
])

const CSS_NUMBER_PATTERN = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
const CSS_ALPHA_REGEX = new RegExp(`^(${CSS_NUMBER_PATTERN})(%)?$`)
const RGB_COLOR_REGEX = new RegExp(
  `^rgba?\\(\\s*(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})(?:\\s*(?:,|/)\\s*(${CSS_NUMBER_PATTERN}%?))?\\s*\\)$`,
  'i',
)
const HSL_COLOR_REGEX = new RegExp(
  `^hsla?\\(\\s*(${CSS_NUMBER_PATTERN})(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})%(?:\\s*,\\s*|\\s+)(${CSS_NUMBER_PATTERN})%(?:\\s*(?:,|/)\\s*(${CSS_NUMBER_PATTERN}%?))?\\s*\\)$`,
  'i',
)
const OKLCH_ALPHA_REGEX = new RegExp(`/\\s*(${CSS_NUMBER_PATTERN}%?)\\s*\\)$`, 'i')
const OKLCH_HAS_ALPHA_REGEX = /\/\s*[^)]+\s*\)$/i

function editableColor(hex: string, alpha = 100, alphaWasExplicit = false): EditableColor {
  return { hex, alpha, alphaWasExplicit }
}

function parseCssAlpha(alpha: string): number | null {
  const trimmed = alpha.trim()
  const match = trimmed.match(CSS_ALPHA_REGEX)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed)) return null
  const normalized = match[2] === '%' ? parsed / 100 : parsed
  return Math.round(Math.min(1, Math.max(0, normalized)) * 100)
}

/**
 * Convert any CSS color string to #rrggbb.
 * Handles #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla(), oklch() (comma or space syntax).
 * Returns #000000 if unparseable.
 */
export function rgbToHex(color: string): string {
  return parseEditableColor(color)?.hex ?? '#000000'
}

/**
 * Parse user-entered CSS colors into the canonical model emitted by Cortex.
 * This preserves the editor's source-edit safety while accepting the color
 * syntax designers naturally type: hex, rgb/rgba, hsl/hsla, oklch, and common
 * named colors.
 */
export function parseEditableColor(color: string): EditableColor | null {
  const trimmed = color.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'transparent') return editableColor('#000000', 0, true)
  // 6-digit hex
  if (HEX_REGEX.test(trimmed)) return editableColor(trimmed.toLowerCase())
  // 8-digit hex → split alpha into the opacity channel
  const hex8 = trimmed.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/)
  if (hex8) {
    return editableColor(
      `#${hex8[1]!.toLowerCase()}`,
      Math.round((parseInt(hex8[2]!, 16) / 255) * 100),
      true,
    )
  }
  // 3-digit hex → expand
  const short = trimmed.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (short) {
    return editableColor(
      `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase(),
    )
  }
  // rgb/rgba — comma or space-separated, possibly with decimals
  const rgbMatch = trimmed.match(RGB_COLOR_REGEX)
  if (rgbMatch) {
    const r = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[1]!))))
    const g = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[2]!))))
    const b = Math.round(Math.min(255, Math.max(0, parseFloat(rgbMatch[3]!))))
    const alpha = rgbMatch[4] === undefined ? 100 : parseCssAlpha(rgbMatch[4]!)
    if (alpha === null) return null
    return editableColor(
      `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`,
      alpha,
      rgbMatch[4] !== undefined,
    )
  }
  // hsl/hsla — convert to rgb (supports negative hue and hue > 360)
  const hslMatch = trimmed.match(HSL_COLOR_REGEX)
  if (hslMatch) {
    const h = ((parseFloat(hslMatch[1]!) % 360) + 360) % 360 / 360
    const s = Math.min(1, Math.max(0, parseFloat(hslMatch[2]!) / 100))
    const l = Math.min(1, Math.max(0, parseFloat(hslMatch[3]!) / 100))
    const [r, g, b] = hslToRgb(h, s, l)
    const alpha = hslMatch[4] === undefined ? 100 : parseCssAlpha(hslMatch[4]!)
    if (alpha === null) return null
    return editableColor(
      `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`,
      alpha,
      hslMatch[4] !== undefined,
    )
  }
  // oklch() — delegate to canonical converter (single source of truth)
  if (lower.startsWith('oklch(')) {
    const hex = oklchToHex(trimmed)
    if (!hex) return null
    const alphaMatch = trimmed.match(OKLCH_ALPHA_REGEX)
    if (OKLCH_HAS_ALPHA_REGEX.test(trimmed) && !alphaMatch) return null
    const alpha = alphaMatch ? parseCssAlpha(alphaMatch[1]!) : 100
    if (alpha === null) return null
    return editableColor(
      hex,
      alpha,
      alphaMatch !== null,
    )
  }

  const namedHex = NAMED_COLOR_HEX[lower]
  if (namedHex) return editableColor(namedHex)

  if (CSS_COLOR_KEYWORDS_REQUIRING_CONTEXT.has(lower)) {
    return null
  }

  if (typeof document !== 'undefined' && document.body && typeof getComputedStyle !== 'undefined') {
    const probe = document.createElement('span')
    probe.style.color = lower
    if (probe.style.color) {
      document.body.appendChild(probe)
      const computed = getComputedStyle(probe).color
      probe.remove()
      if (computed && computed.toLowerCase() !== lower) {
        return parseEditableColor(computed)
      }
    }
  }
  return null
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
  const parsed = parseEditableColor(trimmed)
  return parsed ? { hex: parsed.hex, alpha: parsed.alpha } : { hex: '#000000', alpha: 100 }
}

/** Format hex + alpha into a CSS color value. Returns hex when alpha=100, rgba() otherwise. */
export function formatColor(hex: string, alpha: number): string {
  if (alpha >= 100) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha) / 100})`
}

export function ColorInput({
  value,
  onChange,
  onScrub,
  onScrubEnd,
  alpha: alphaProp,
  onAlphaChange,
  swatches,
  mixed,
  trailing,
}: ColorInputProps): JSX.Element {
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

  const emitColor = useCallback((hex: string, a: number, options?: {
    syncAlpha?: boolean
    forceSyncAlpha?: boolean
    target?: (color: string) => void
  }) => {
    const nextAlpha = Math.round(Math.max(0, Math.min(100, a)))
    if (options?.syncAlpha && (options.forceSyncAlpha || nextAlpha !== alphaRef.current)) {
      onAlphaChange?.(nextAlpha)
    }
    ;(options?.target ?? onChange)(formatColor(hex, nextAlpha))
  }, [onChange, onAlphaChange])

  const handleHexInput = useCallback((e: Event) => {
    const v = (e.target as HTMLInputElement).value
    editingHexRef.current = v
    setEditingHex(v)
  }, [])

  const handleHexFocus = useCallback(() => {
    const next = mixed ? '' : hexColor
    editingHexRef.current = next
    setEditingHex(next)
  }, [hexColor, mixed])

  const handleHexBlur = useCallback(() => {
    const current = editingHexRef.current
    const parsedColor = current !== null && current.trim() !== '' ? parseEditableColor(current) : null
    if (parsedColor) {
      const nextAlpha = parsedColor.alphaWasExplicit ? parsedColor.alpha : (mixed ? 100 : alphaRef.current)
      const next = formatColor(parsedColor.hex, nextAlpha)
      const previous = formatColor(hexColor, alphaRef.current)
      if (mixed || next.toLowerCase() !== previous.toLowerCase()) {
        emitColor(parsedColor.hex, nextAlpha, {
          syncAlpha: parsedColor.alphaWasExplicit || mixed,
          forceSyncAlpha: mixed,
        })
      }
    }
    editingHexRef.current = null
    setEditingHex(null)
  }, [emitColor, hexColor, mixed])

  const handleSwatchClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickerChange = useCallback((hex: string) => {
    emitColor(hex, alphaRef.current)
  }, [emitColor])

  const handlePickerScrub = useCallback((hex: string) => {
    emitColor(hex, alphaRef.current, { target: onScrub })
  }, [emitColor, onScrub])

  const handlePickerScrubEnd = useCallback((hex: string) => {
    emitColor(hex, alphaRef.current, { target: onScrubEnd })
  }, [emitColor, onScrubEnd])

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
        aria-label="Color value"
        // `size={9}` drops the input's intrinsic min-content from the browser
        // default of 20 chars (~140px) to ~63px — enough to fit "#ffffffff"
        // (8-digit hex with alpha) plus one buffer char. Without this, the
        // default min-content forces a ~156px content floor on the hex slot
        // which, combined with the trailing IconButton in Background/Border,
        // pushes the whole row past the panel width. Typography's ColorInput
        // happens to work despite the same default because it has no trailing
        // button and therefore an extra ~34px of free space.
        size={9}
        value={mixed && editingHex === null ? '' : displayedHex}
        placeholder={mixed ? 'Mixed' : undefined}
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
            mixed={mixed}
          />
        </div>
      )}
      {trailing}
      {pickerOpen && swatchRef.current && (
        <ColorPicker
          color={hexColor}
          onChange={handlePickerChange}
          onScrub={onScrub ? handlePickerScrub : undefined}
          onScrubEnd={onScrubEnd ? handlePickerScrubEnd : undefined}
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
