import type { JSX } from 'preact'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'
import { parseBoxShadow, serializeBoxShadow } from '../../../core/shadow-utils.js'
import type { Shadow } from '../../../core/shadow-utils.js'

// Re-export for downstream consumers (tests, other sections)
export { parseBoxShadow, serializeBoxShadow }
export type { Shadow }

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
  swatches?: string[]
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
}

/** Extract shadow-related values from a CSSStyleDeclaration. */
export function parseShadowValues(cs: CSSStyleDeclaration): ShadowValues {
  return {
    boxShadow: cs.boxShadow ?? 'none',
  }
}

export const DEFAULT_SHADOW: Shadow = {
  inset: false,
  x: 0,
  y: 2,
  blur: 8,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.1)',
}

export function summarizeShadow(values: ShadowValues): string {
  const shadows = parseBoxShadow(values.boxShadow)
  if (shadows.length === 0) return 'none'
  return shadows.length === 1 ? '1 shadow' : `${shadows.length} shadows`
}

/** Append a default shadow to the current box-shadow value. Returns the new CSS value. */
export function addShadow(currentBoxShadow: string): string {
  const shadows = parseBoxShadow(currentBoxShadow)
  return serializeBoxShadow([...shadows, { ...DEFAULT_SHADOW }])
}

/** Shadow with a stable key for list rendering. */
interface KeyedShadow extends Shadow {
  _key: number
}

export function ShadowSection({
  values,
  onChange,
  swatches,
}: ShadowSectionProps): JSX.Element {
  const nextKeyRef = useRef(0)

  const shadows = useMemo(() => {
    const parsed = parseBoxShadow(values.boxShadow)
    return parsed.map((s): KeyedShadow => ({ ...s, _key: nextKeyRef.current++ }))
  }, [values.boxShadow])

  const emitChange = useCallback(
    (updated: KeyedShadow[]) => {
      onChange({ property: 'box-shadow', value: serializeBoxShadow(updated) })
    },
    [onChange],
  )

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
      {shadows.map((shadow, index) => (
        <div class="cortex-shadow-section__row" key={shadow._key}>
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
              swatches={swatches}
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
