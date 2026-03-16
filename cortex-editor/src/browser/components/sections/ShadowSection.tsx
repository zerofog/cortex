import type { JSX } from 'preact'
import { useCallback, useMemo } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'

export interface ShadowChange {
  property: string
  value: string
}

export interface ShadowValues {
  boxShadow: string // raw CSS box-shadow value from getComputedStyle
}

export interface ShadowSectionProps {
  values: ShadowValues
  onChange: (change: ShadowChange) => void
}

export interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

/** Extract shadow-related values from a CSSStyleDeclaration. */
export function parseShadowValues(cs: CSSStyleDeclaration): ShadowValues {
  return {
    boxShadow: cs.boxShadow ?? 'none',
  }
}

/**
 * Split a box-shadow string on commas, respecting parentheses in rgba() values.
 * "2px 4px 8px rgba(0, 0, 0, 0.1), inset 1px 2px 3px #000"
 * -> ["2px 4px 8px rgba(0, 0, 0, 0.1)", "inset 1px 2px 3px #000"]
 */
function splitShadows(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

/**
 * Parse a single shadow string into a Shadow object.
 * Handles: "inset 2px 4px 8px 2px rgba(0, 0, 0, 0.1)"
 */
function parseSingleShadow(raw: string): Shadow {
  let s = raw.trim()

  // Check for 'inset' keyword
  const inset = /\binset\b/i.test(s)
  if (inset) {
    s = s.replace(/\binset\b/i, '').trim()
  }

  // Extract color from the end.
  // Match: #hex, rgb(...), rgba(...), or named color word at end
  const colorMatch = s.match(
    /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*$/,
  )
  let color = 'rgba(0, 0, 0, 0.1)'
  if (colorMatch && colorMatch.index !== undefined) {
    color = colorMatch[1]
    s = s.slice(0, colorMatch.index).trim()
  }

  // Extract numeric values from the remaining part
  const nums = s.match(/-?[\d.]+/g)?.map(Number) ?? []

  return {
    inset,
    x: nums[0] ?? 0,
    y: nums[1] ?? 0,
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    color,
  }
}

/** Parse a CSS box-shadow value into an array of Shadow objects. */
export function parseBoxShadow(value: string): Shadow[] {
  const trimmed = value.trim()
  if (trimmed === 'none' || trimmed === '') return []
  return splitShadows(trimmed).map(parseSingleShadow)
}

/** Serialize an array of Shadow objects to a CSS box-shadow string. */
export function serializeBoxShadow(shadows: Shadow[]): string {
  if (shadows.length === 0) return 'none'
  return shadows
    .map((s) => {
      const parts: string[] = []
      if (s.inset) parts.push('inset')
      parts.push(`${s.x}px`, `${s.y}px`, `${s.blur}px`, `${s.spread}px`, s.color)
      return parts.join(' ')
    })
    .join(', ')
}

const DEFAULT_SHADOW: Shadow = {
  inset: false,
  x: 0,
  y: 2,
  blur: 8,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.1)',
}

export function ShadowSection({
  values,
  onChange,
}: ShadowSectionProps): JSX.Element {
  const shadows = useMemo(() => parseBoxShadow(values.boxShadow), [values.boxShadow])

  const emitChange = useCallback(
    (updated: Shadow[]) => {
      onChange({ property: 'box-shadow', value: serializeBoxShadow(updated) })
    },
    [onChange],
  )

  const handleAdd = useCallback(() => {
    emitChange([...shadows, { ...DEFAULT_SHADOW }])
  }, [shadows, emitChange])

  const handleRemove = useCallback(
    (index: number) => {
      const updated = shadows.filter((_, i) => i !== index)
      emitChange(updated)
    },
    [shadows, emitChange],
  )

  const handleFieldChange = useCallback(
    (index: number, field: keyof Shadow, value: number | string | boolean) => {
      const updated = shadows.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      )
      emitChange(updated)
    },
    [shadows, emitChange],
  )

  return (
    <div class="cortex-shadow-section" data-section-id="shadow">
      <div class="cortex-shadow-section__header">
        <span class="cortex-section-label">Shadow</span>
        <button
          class="cortex-shadow-section__add"
          data-tooltip="Add shadow"
          onClick={handleAdd}
        >
          +
        </button>
      </div>

      {shadows.map((shadow, index) => (
        <div class="cortex-shadow-section__row" key={index}>
          <div class="cortex-shadow-section__grid">
            <NumericInput
              value={shadow.x}
              unit="px"
              label="X"
              tooltip="Horizontal offset"
              onChange={(v: number) => handleFieldChange(index, 'x', v)}
            />
            <NumericInput
              value={shadow.y}
              unit="px"
              label="Y"
              tooltip="Vertical offset"
              onChange={(v: number) => handleFieldChange(index, 'y', v)}
            />
            <NumericInput
              value={shadow.blur}
              unit="px"
              label="B"
              tooltip="Blur radius"
              min={0}
              onChange={(v: number) => handleFieldChange(index, 'blur', v)}
            />
            <NumericInput
              value={shadow.spread}
              unit="px"
              label="S"
              tooltip="Spread radius"
              onChange={(v: number) => handleFieldChange(index, 'spread', v)}
            />
          </div>
          <div class="cortex-shadow-section__controls">
            <ColorInput
              value={shadow.color}
              onChange={(hex: string) => handleFieldChange(index, 'color', hex)}
            />
            <button
              class="cortex-shadow-section__remove"
              data-tooltip="Remove shadow"
              onClick={() => handleRemove(index)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
