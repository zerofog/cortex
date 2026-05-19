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
import {
  buildEffects,
  commitEffects,
  convertEffect,
  isTypeOptionDisabled,
  parseFilterFunctions,
  formatFilter,
} from './effects-model.js'
import type { Effect, EffectType } from './effects-model.js'

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

/**
 * Parse the blur() value from a CSS filter string. Returns 0 if no blur found.
 * Kept exported for backwards compatibility — delegates to parseFilterFunctions.
 */
export function parseBlurValue(filter: string): number {
  return parseFilterFunctions(filter).blur
}

/**
 * Replace or insert a blur() function in a filter string, preserving other functions.
 * Kept exported for backwards compatibility — delegates to parseFilterFunctions + formatFilter.
 */
export function replaceBlurInFilter(existing: string, newBlur: number): string {
  return formatFilter(parseFilterFunctions(existing).rest, newBlur)
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

// Per DESIGN.md line 304: "Type dropdown: Drop shadow, Inner shadow, Blur, Background blur"
const EFFECT_TYPE_OPTIONS = [
  { value: 'drop',          label: 'Drop shadow' },
  { value: 'inset',         label: 'Inner shadow' },
  { value: 'layer-blur',    label: 'Blur',          tooltip: 'Only one Blur per element' },
  { value: 'backdrop-blur', label: 'Background blur', tooltip: 'Only one Background blur per element' },
]

function isEffectEnabled(e: Effect): boolean {
  if (e.type === 'drop' || e.type === 'inset') {
    return e.x !== 0 || e.y !== 0 || e.blur !== 0 || e.spread !== 0
  }
  return e.blur !== 0
}

/** Stash payload for the eye-toggle restore — shape varies by effect kind. */
type StashEntry =
  | { kind: 'shadow'; x: number; y: number; blur: number; spread: number }
  | { kind: 'blur'; blur: number }

export function EffectsSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  swatches,
  dimmedProperties,
  mixedProperties,
}: EffectsSectionProps): JSX.Element {
  // Stable-ID cache: fingerprint -> id. Persists across renders so the same
  // structural shape always gets the same id, even when re-parsing the same
  // CSS snapshot. Without this, the eye-toggle stash and expanded-row state
  // would lose their tether on every parent re-render.
  const idCacheRef = useRef<Map<string, string>>(new Map())
  const idCounterRef = useRef(0)
  const getId = useCallback((fingerprint: string): string => {
    const cache = idCacheRef.current
    let id = cache.get(fingerprint)
    if (!id) {
      id = `effect-${idCounterRef.current++}`
      cache.set(fingerprint, id)
    }
    return id
  }, [])

  const effects = useMemo(() => buildEffects(values, getId), [values, getId])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Stash map keyed by stable Effect id, not array index. Cross-domain conversion
  // (shadow ↔ blur) drops the stash entry at the conversion call site so a stale
  // shadow payload can never leak into a blur restore.
  const stashRef = useRef<Map<string, StashEntry>>(new Map())

  // ---- Emission helpers ---------------------------------------------------

  const emit = useCallback(
    (phase: 'change' | 'scrub' | 'scrubEnd', nextEffects: Effect[]) => {
      const callback = phase === 'change' ? onChange : phase === 'scrub' ? onScrub : onScrubEnd
      if (!callback) return
      const { boxShadow, filter, backdropFilter } = commitEffects(
        nextEffects,
        values.filterRaw,
        values.backdropFilterRaw,
      )
      // Emit each property; Panel's microtask coalescer dedupes by (source, property, pseudo)
      // so unchanged properties are essentially free.
      callback({ property: 'box-shadow', value: boxShadow })
      callback({ property: 'filter', value: filter })
      callback({ property: 'backdrop-filter', value: backdropFilter })
    },
    [onChange, onScrub, onScrubEnd, values.filterRaw, values.backdropFilterRaw],
  )

  // ---- Field-level handlers (drop/inset rows) -----------------------------

  type ShadowField = 'x' | 'y' | 'blur' | 'spread' | 'color'

  const updateShadowField = useCallback(
    (id: string, field: ShadowField, value: number | string, phase: 'change' | 'scrub' | 'scrubEnd' = 'change') => {
      const next = effects.map((e) => {
        if (e.id !== id) return e
        if (e.type !== 'drop' && e.type !== 'inset') return e
        return { ...e, [field]: value }
      })
      emit(phase, next)
    },
    [effects, emit],
  )

  const updateBlurField = useCallback(
    (id: string, value: number, phase: 'change' | 'scrub' | 'scrubEnd' = 'change') => {
      const next = effects.map((e) => {
        if (e.id !== id) return e
        if (e.type !== 'layer-blur' && e.type !== 'backdrop-blur') return e
        return { ...e, blur: value } satisfies Effect
      })
      emit(phase, next)
    },
    [effects, emit],
  )

  // ---- Row-level handlers (apply across all effect types) -----------------

  const handleRemove = useCallback(
    (id: string) => {
      stashRef.current.delete(id)
      if (expandedId === id) setExpandedId(null)
      const next = effects.filter((e) => e.id !== id)
      emit('change', next)
    },
    [effects, emit, expandedId],
  )

  const handleTypeChange = useCallback(
    (id: string, newType: EffectType) => {
      const target = effects.find((e) => e.id === id)
      if (!target || target.type === newType) return

      // Singleton enforcement: silently no-op if the target type already exists elsewhere
      if ((newType === 'layer-blur' || newType === 'backdrop-blur') &&
          effects.some((e) => e.id !== id && e.type === newType)) {
        return
      }

      // Cross-domain conversion (shadow ↔ blur) drops any stash for this id —
      // the stash payload shape differs by kind and restoring stale state would corrupt.
      const isOldShadow = target.type === 'drop' || target.type === 'inset'
      const isNewShadow = newType === 'drop' || newType === 'inset'
      if (isOldShadow !== isNewShadow) {
        stashRef.current.delete(id)
      }

      const converted = convertEffect(target, newType)
      const next = effects.map((e) => (e.id === id ? converted : e))
      emit('change', next)
    },
    [effects, emit],
  )

  const handleEyeToggle = useCallback(
    (id: string) => {
      const target = effects.find((e) => e.id === id)
      if (!target) return
      const enabled = isEffectEnabled(target)

      let updated: Effect
      if (target.type === 'drop' || target.type === 'inset') {
        if (enabled) {
          stashRef.current.set(id, {
            kind: 'shadow',
            x: target.x, y: target.y, blur: target.blur, spread: target.spread,
          })
          updated = { ...target, x: 0, y: 0, blur: 0, spread: 0 }
        } else {
          const stashed = stashRef.current.get(id)
          stashRef.current.delete(id)
          const restore = stashed && stashed.kind === 'shadow'
            ? { x: stashed.x, y: stashed.y, blur: stashed.blur, spread: stashed.spread }
            : { x: DEFAULT_SHADOW.x, y: DEFAULT_SHADOW.y, blur: DEFAULT_SHADOW.blur, spread: DEFAULT_SHADOW.spread }
          updated = { ...target, ...restore }
        }
      } else {
        // layer-blur or backdrop-blur
        if (enabled) {
          stashRef.current.set(id, { kind: 'blur', blur: target.blur })
          updated = { ...target, blur: 0 }
        } else {
          const stashed = stashRef.current.get(id)
          stashRef.current.delete(id)
          const restoreBlur = stashed && stashed.kind === 'blur' ? stashed.blur : DEFAULT_SHADOW.blur
          updated = { ...target, blur: restoreBlur }
        }
      }
      const next = effects.map((e) => (e.id === id ? updated : e))
      emit('change', next)
    },
    [effects, emit],
  )

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // ---- Per-row dropdown options with singleton disable state ---------------

  const optionsForRow = useCallback(
    (rowIndex: number) =>
      EFFECT_TYPE_OPTIONS.map((opt) => ({
        ...opt,
        disabled: isTypeOptionDisabled(effects, rowIndex, opt.value as EffectType),
      })),
    [effects],
  )

  // ---- Per-property mixed/dimmed helpers ----------------------------------

  function dimmedForType(type: EffectType): boolean {
    if (type === 'drop' || type === 'inset') return isDimmed(dimmedProperties, 'box-shadow')
    if (type === 'layer-blur') return isDimmed(dimmedProperties, 'filter')
    return isDimmed(dimmedProperties, 'backdrop-filter')
  }

  function mixedForType(type: EffectType): boolean | undefined {
    if (type === 'drop' || type === 'inset') return mixedProperties?.has('box-shadow')
    if (type === 'layer-blur') return mixedProperties?.has('filter')
    return mixedProperties?.has('backdrop-filter')
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div class="cortex-effects-section" data-section-id="effects">
      <div class="cortex-effects-section__effects">
        {effects.map((effect, index) => {
          const isExpanded = expandedId === effect.id
          const enabled = isEffectEnabled(effect)
          const dimmed = dimmedForType(effect.type)
          const mixed = mixedForType(effect.type)
          return (
            <div
              class={`cortex-effects-section__row${dimmed ? ' cortex-control--dimmed' : ''}`}
              key={effect.id}
              data-expanded={String(isExpanded)}
              data-effect-type={effect.type}
            >
              <div class="cortex-effects-section__row-header">
                <button
                  class="cortex-effects-section__expand-btn"
                  type="button"
                  aria-label={isExpanded ? 'Collapse effect controls' : 'Expand effect controls'}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(effect.id)}
                >
                  <BoxShadow size={14} />
                </button>
                <div class="cortex-effects-section__type">
                  <Dropdown
                    options={optionsForRow(index)}
                    value={effect.type}
                    onChange={(v: string) => handleTypeChange(effect.id, v as EffectType)}
                  />
                </div>
                <IconButton
                  icon={enabled ? <Eye size={14} /> : <EyeClosed size={14} />}
                  ariaLabel={enabled ? 'Disable effect' : 'Enable effect'}
                  tooltip={enabled ? 'Disable effect' : 'Enable effect'}
                  onClick={() => handleEyeToggle(effect.id)}
                />
                <IconButton
                  icon={<Minus size={14} />}
                  ariaLabel="Remove effect"
                  tooltip="Remove effect"
                  onClick={() => handleRemove(effect.id)}
                />
              </div>
              {isExpanded && (effect.type === 'drop' || effect.type === 'inset') && (
                <div class="cortex-effects-section__detail">
                  <div class="cortex-effects-section__grid">
                    <NumericInput
                      value={effect.x}
                      unit="px"
                      label="X"
                      tooltip="Horizontal offset"
                      mixed={mixed}
                      onChange={(v: number) => updateShadowField(effect.id, 'x', v)}
                      onScrub={onScrub ? (v: number) => updateShadowField(effect.id, 'x', v, 'scrub') : undefined}
                      onScrubEnd={onScrubEnd ? (v: number) => updateShadowField(effect.id, 'x', v, 'scrubEnd') : undefined}
                    />
                    <NumericInput
                      value={effect.y}
                      unit="px"
                      label="Y"
                      tooltip="Vertical offset"
                      mixed={mixed}
                      onChange={(v: number) => updateShadowField(effect.id, 'y', v)}
                      onScrub={onScrub ? (v: number) => updateShadowField(effect.id, 'y', v, 'scrub') : undefined}
                      onScrubEnd={onScrubEnd ? (v: number) => updateShadowField(effect.id, 'y', v, 'scrubEnd') : undefined}
                    />
                    <NumericInput
                      value={effect.blur}
                      unit="px"
                      label="B"
                      tooltip="Blur radius"
                      min={0}
                      mixed={mixed}
                      onChange={(v: number) => updateShadowField(effect.id, 'blur', v)}
                      onScrub={onScrub ? (v: number) => updateShadowField(effect.id, 'blur', v, 'scrub') : undefined}
                      onScrubEnd={onScrubEnd ? (v: number) => updateShadowField(effect.id, 'blur', v, 'scrubEnd') : undefined}
                    />
                    <NumericInput
                      value={effect.spread}
                      unit="px"
                      label="S"
                      tooltip="Spread radius"
                      mixed={mixed}
                      onChange={(v: number) => updateShadowField(effect.id, 'spread', v)}
                      onScrub={onScrub ? (v: number) => updateShadowField(effect.id, 'spread', v, 'scrub') : undefined}
                      onScrubEnd={onScrubEnd ? (v: number) => updateShadowField(effect.id, 'spread', v, 'scrubEnd') : undefined}
                    />
                  </div>
                  <ColorInput
                    value={effect.color}
                    onChange={(hex: string) => updateShadowField(effect.id, 'color', hex)}
                    onScrub={onScrub ? (hex: string) => updateShadowField(effect.id, 'color', hex, 'scrub') : undefined}
                    onScrubEnd={onScrubEnd ? (hex: string) => updateShadowField(effect.id, 'color', hex, 'scrubEnd') : undefined}
                    swatches={swatches}
                    mixed={mixed}
                  />
                </div>
              )}
              {isExpanded && (effect.type === 'layer-blur' || effect.type === 'backdrop-blur') && (
                <div class="cortex-effects-section__detail">
                  <NumericInput
                    value={effect.blur}
                    unit="px"
                    label={effect.type === 'layer-blur' ? 'Blur' : 'BG Blur'}
                    tooltip={effect.type === 'layer-blur' ? 'Element blur' : 'Backdrop blur'}
                    min={0}
                    mixed={mixed}
                    onChange={(v: number) => updateBlurField(effect.id, v)}
                    onScrub={onScrub ? (v: number) => updateBlurField(effect.id, v, 'scrub') : undefined}
                    onScrubEnd={onScrubEnd ? (v: number) => updateBlurField(effect.id, v, 'scrubEnd') : undefined}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
