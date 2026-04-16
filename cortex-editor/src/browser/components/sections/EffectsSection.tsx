import type { JSX } from 'preact'
import { useState, useCallback, useMemo, useRef } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput } from '../controls/ColorInput.js'
import { Dropdown } from '../controls/Dropdown.js'
import { parseBoxShadow, serializeBoxShadow } from '../../../core/shadow-utils.js'
import type { Shadow } from '../../../core/shadow-utils.js'
import { Eye, EyeClosed, BoxShadow, Minus } from '../icons.js'
import { IconButton } from '../controls/IconButton.js'

// Re-export for downstream consumers (tests, Panel, other sections)
export { parseBoxShadow, serializeBoxShadow }
export type { Shadow }

export type EffectsChange = SectionChange

export interface EffectsValues {
  boxShadow: string          // raw CSS box-shadow (from getComputedStyle)
  blur: number               // filter: blur(Npx)
  backdropBlur: number       // backdrop-filter: blur(Npx)
  filterRaw: string          // for round-tripping non-blur filter functions
  backdropFilterRaw: string  // for round-tripping non-blur backdrop-filter functions
}

export interface EffectsSectionProps {
  values: EffectsValues
  onChange: (change: EffectsChange) => void
  onScrub?: (change: EffectsChange) => void
  onScrubEnd?: (change: EffectsChange) => void
  swatches?: string[]
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

/** Parse the blur() value from a CSS filter string. Returns 0 if no blur found. */
export function parseBlurValue(filter: string): number {
  const m = filter.match(/blur\(([\d.]+)px\)/)
  return m?.[1] ? parseFloat(m[1]) : 0
}

/** Replace or insert a blur() function in a filter string, preserving other functions. */
export function replaceBlurInFilter(existing: string, newBlur: number): string {
  const normalized = (!existing || existing === 'none') ? '' : existing
  const withoutBlur = normalized.replace(/blur\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim()
  if (newBlur === 0) return withoutBlur || 'none'
  return withoutBlur ? `${withoutBlur} blur(${newBlur}px)` : `blur(${newBlur}px)`
}

/** Extract effects-related values from a CSSStyleDeclaration. */
export function parseEffectsValues(cs: CSSStyleDeclaration): EffectsValues {
  return {
    boxShadow: cs.boxShadow ?? 'none',
    blur: parseBlurValue(cs.filter ?? ''),
    backdropBlur: parseBlurValue(
      cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
    ),
    filterRaw: cs.filter ?? '',
    backdropFilterRaw: cs.backdropFilter ?? (cs as any).webkitBackdropFilter ?? '',
  }
}

export function summarizeEffects(values: EffectsValues): string {
  const parts: string[] = []
  const shadows = parseBoxShadow(values.boxShadow)
  if (shadows.length > 0) {
    parts.push(shadows.length === 1 ? '1 shadow' : `${shadows.length} shadows`)
  }
  if (values.blur > 0) parts.push(`blur ${values.blur}px`)
  if (values.backdropBlur > 0) parts.push(`bg-blur ${values.backdropBlur}px`)
  return parts.length > 0 ? parts.join(', ') : 'none'
}

/** Append a default shadow to the current box-shadow value. Returns the new CSS value. */
export function addShadow(currentBoxShadow: string): string {
  const shadows = parseBoxShadow(currentBoxShadow)
  return serializeBoxShadow([...shadows, { ...DEFAULT_SHADOW }])
}

const DEFAULT_SHADOW: Shadow = {
  inset: false,
  x: 0,
  y: 2,
  blur: 8,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.1)',
}

const SHADOW_TYPE_OPTIONS = [
  { value: 'drop', label: 'Drop shadow' },
  { value: 'inset', label: 'Inner shadow' },
]

/** A zeroed-out shadow used for the "disabled" (eye-off) state. */
const ZEROED_SHADOW: Omit<Shadow, 'inset' | 'color'> = {
  x: 0, y: 0, blur: 0, spread: 0,
}

function isShadowEnabled(s: Shadow): boolean {
  return s.x !== 0 || s.y !== 0 || s.blur !== 0 || s.spread !== 0
}

/** Shadow with a stable key and stashed values for eye toggle. */
interface KeyedShadow extends Shadow {
  _key: number
  /** Stashed values before disabling — restored when re-enabled. */
  _stash?: { x: number; y: number; blur: number; spread: number }
}

export function EffectsSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  swatches,
  dimmedProperties,
  mixedProperties,
}: EffectsSectionProps): JSX.Element {
  const [expandedKey, setExpandedKey] = useState<number | null>(null)
  // Stashed values per _key for eye toggle restore
  const stashRef = useRef<Map<number, { x: number; y: number; blur: number; spread: number }>>(new Map())

  const shadows = useMemo(() => {
    const parsed = parseBoxShadow(values.boxShadow)
    // Use array index as a stable key. Shadow order is preserved in the CSS
    // string, so indices are stable across single-property edits. Keys only
    // shift on add/remove, which is when we WANT the UI to re-layout.
    return parsed.map((s, i): KeyedShadow => ({ ...s, _key: i }))
  }, [values.boxShadow])

  const emitChange = useCallback(
    (updated: KeyedShadow[]) => {
      onChange({ property: 'box-shadow', value: serializeBoxShadow(updated) })
    },
    [onChange],
  )

  const handleRemove = useCallback(
    (index: number) => {
      // Shift stash keys down for indices above the removed shadow.
      // _key is index-based, so when shadow B at index 1 is removed,
      // shadow C shifts from index 2 → 1. Without shifting, C's stash
      // (keyed under 2) becomes orphaned and the eye re-enable falls
      // back to defaults instead of restoring the user's values.
      const shifted = new Map<number, { x: number; y: number; blur: number; spread: number }>()
      for (const [key, val] of stashRef.current) {
        if (key < index) shifted.set(key, val)
        else if (key > index) shifted.set(key - 1, val)
        // key === index: discard (removing this shadow)
      }
      stashRef.current = shifted

      // Shift expandedKey the same way — it also tracks _key (= index).
      setExpandedKey(prev => {
        if (prev === null || prev === index) return null
        return prev > index ? prev - 1 : prev
      })

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

  const handleTypeChange = useCallback(
    (index: number, type: string) => {
      handleFieldChange(index, 'inset', type === 'inset')
    },
    [handleFieldChange],
  )

  const handleEyeToggle = useCallback(
    (index: number) => {
      const shadow = shadows[index]
      if (!shadow) return
      const enabled = isShadowEnabled(shadow)
      if (enabled) {
        // Disable: stash current values, zero out
        stashRef.current.set(shadow._key, {
          x: shadow.x, y: shadow.y, blur: shadow.blur, spread: shadow.spread,
        })
        const updated = shadows.map((s, i) =>
          i === index ? { ...s, ...ZEROED_SHADOW } : s,
        )
        emitChange(updated)
      } else {
        // Enable: restore stashed values or apply default
        const stashed = stashRef.current.get(shadow._key)
        const restore = stashed ?? { x: DEFAULT_SHADOW.x, y: DEFAULT_SHADOW.y, blur: DEFAULT_SHADOW.blur, spread: DEFAULT_SHADOW.spread }
        stashRef.current.delete(shadow._key)
        const updated = shadows.map((s, i) =>
          i === index ? { ...s, ...restore } : s,
        )
        emitChange(updated)
      }
    },
    [shadows, emitChange],
  )

  const toggleExpand = useCallback((key: number) => {
    setExpandedKey(prev => prev === key ? null : key)
  }, [])

  // Blur handlers — preserve existing non-blur filter functions
  const handleBlurChange = useCallback(
    (v: number) => onChange({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }),
    [onChange, values.filterRaw],
  )
  const handleBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }) },
    [onScrub, values.filterRaw],
  )
  const handleBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'filter', value: replaceBlurInFilter(values.filterRaw, v) }) },
    [onScrubEnd, values.filterRaw],
  )

  // Backdrop blur handlers — preserve existing non-blur backdrop-filter functions
  const handleBackdropBlurChange = useCallback(
    (v: number) => onChange({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }),
    [onChange, values.backdropFilterRaw],
  )
  const handleBackdropBlurScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }) },
    [onScrub, values.backdropFilterRaw],
  )
  const handleBackdropBlurScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'backdrop-filter', value: replaceBlurInFilter(values.backdropFilterRaw, v) }) },
    [onScrubEnd, values.backdropFilterRaw],
  )

  return (
    <div class="cortex-effects-section" data-section-id="effects">
      {/* Shadow list */}
      <div class={`cortex-effects-section__shadows${isDimmed(dimmedProperties, 'box-shadow') ? ' cortex-control--dimmed' : ''}`}>
        {shadows.map((shadow, index) => {
          const isExpanded = expandedKey === shadow._key
          const enabled = isShadowEnabled(shadow)
          return (
            <div class="cortex-effects-section__row" key={shadow._key} data-expanded={String(isExpanded)}>
              <div class="cortex-effects-section__row-header">
                <button
                  class="cortex-effects-section__expand-btn"
                  type="button"
                  aria-label={isExpanded ? 'Collapse shadow controls' : 'Expand shadow controls'}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(shadow._key)}
                >
                  <BoxShadow size={14} />
                </button>
                <div class="cortex-effects-section__type">
                  <Dropdown
                    options={SHADOW_TYPE_OPTIONS}
                    value={shadow.inset ? 'inset' : 'drop'}
                    onChange={(v: string) => handleTypeChange(index, v)}
                  />
                </div>
                <IconButton
                  icon={enabled ? <Eye size={14} /> : <EyeClosed size={14} />}
                  ariaLabel={enabled ? 'Disable shadow' : 'Enable shadow'}
                  tooltip={enabled ? 'Disable shadow' : 'Enable shadow'}
                  onClick={() => handleEyeToggle(index)}
                />
                <IconButton
                  icon={<Minus size={14} />}
                  ariaLabel="Remove shadow"
                  tooltip="Remove shadow"
                  onClick={() => handleRemove(index)}
                />
              </div>
              {isExpanded && (
                <div class="cortex-effects-section__detail">
                  <div class="cortex-effects-section__grid">
                    <NumericInput
                      value={shadow.x}
                      unit="px"
                      label="X"
                      tooltip="Horizontal offset"
                      mixed={mixedProperties?.has('box-shadow')}
                      onChange={(v: number) => handleFieldChange(index, 'x', v)}
                    />
                    <NumericInput
                      value={shadow.y}
                      unit="px"
                      label="Y"
                      tooltip="Vertical offset"
                      mixed={mixedProperties?.has('box-shadow')}
                      onChange={(v: number) => handleFieldChange(index, 'y', v)}
                    />
                    <NumericInput
                      value={shadow.blur}
                      unit="px"
                      label="B"
                      tooltip="Blur radius"
                      min={0}
                      mixed={mixedProperties?.has('box-shadow')}
                      onChange={(v: number) => handleFieldChange(index, 'blur', v)}
                    />
                    <NumericInput
                      value={shadow.spread}
                      unit="px"
                      label="S"
                      tooltip="Spread radius"
                      mixed={mixedProperties?.has('box-shadow')}
                      onChange={(v: number) => handleFieldChange(index, 'spread', v)}
                    />
                  </div>
                  <ColorInput
                    value={shadow.color}
                    onChange={(hex: string) => handleFieldChange(index, 'color', hex)}
                    swatches={swatches}
                    mixed={mixedProperties?.has('box-shadow')}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Blur controls */}
      <div class="cortex-effects-section__blur-controls">
        <div class={isDimmed(dimmedProperties, 'filter') ? 'cortex-control--dimmed' : undefined}>
          <NumericInput
            value={values.blur}
            unit="px"
            label="BL"
            tooltip="Blur"
            min={0}
            mixed={mixedProperties?.has('filter')}
            onChange={handleBlurChange}
            onScrub={handleBlurScrub}
            onScrubEnd={handleBlurScrubEnd}
          />
        </div>
        <div class={isDimmed(dimmedProperties, 'backdrop-filter') ? 'cortex-control--dimmed' : undefined}>
          <NumericInput
            value={values.backdropBlur}
            unit="px"
            label="BG"
            tooltip="Background Blur"
            min={0}
            mixed={mixedProperties?.has('backdrop-filter')}
            onChange={handleBackdropBlurChange}
            onScrub={handleBackdropBlurScrub}
            onScrubEnd={handleBackdropBlurScrubEnd}
          />
        </div>
      </div>
    </div>
  )
}
