/**
 * Pure data model + transforms for the polymorphic Effects section.
 *
 * The UI-domain Effect is a discriminated union of four kinds:
 *   - drop / inset  — stored in CSS `box-shadow`
 *   - layer-blur    — stored in CSS `filter: blur()`
 *   - backdrop-blur — stored in CSS `backdrop-filter: blur()`
 *
 * Layer-blur and backdrop-blur are singletons (max 1 of each per element).
 * Drop and inset shadows can have unlimited instances.
 *
 * This file owns three pure transformations:
 *   buildEffects:   EffectsValues -> Effect[]      (parse from CSS snapshot)
 *   commitEffects:  Effect[]      -> CSS strings   (serialize to three CSS properties)
 *   convertEffect:  Effect, type  -> Effect        (transmute discriminant + reshape fields)
 *
 * Plus the shared filter-function parser used by both build and commit:
 *   parseFilterFunctions: raw filter string -> { blur, rest }
 *
 * The component layer assigns and caches stable IDs via fingerprintEffect (below).
 */

import { parseBoxShadow, serializeBoxShadow } from '../../../core/shadow-utils.js'
import type { Shadow } from '../../../core/shadow-utils.js'
import type { EffectsValues } from './EffectsSection.js'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type EffectType = 'drop' | 'inset' | 'layer-blur' | 'backdrop-blur'

export type Effect =
  | { id: string; type: 'drop';          x: number; y: number; blur: number; spread: number; color: string }
  | { id: string; type: 'inset';         x: number; y: number; blur: number; spread: number; color: string }
  | { id: string; type: 'layer-blur';    blur: number }
  | { id: string; type: 'backdrop-blur'; blur: number }

const DEFAULT_SHADOW_FIELDS = {
  x: 0,
  y: 2,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.1)',
} as const

// ---------------------------------------------------------------------------
// parseFilterFunctions — single source of truth for filter-string parsing.
// Retires the separate parseBlurValue and replaceBlurInFilter helpers.
// ---------------------------------------------------------------------------

/**
 * Parse a CSS `filter` or `backdrop-filter` string into its blur value
 * (px-only — `blur(0)` without unit returns 0) and the remaining non-blur
 * function string. Preserves authored order of non-blur functions.
 *
 * Examples:
 *   ''                          -> { blur: 0,  rest: '' }
 *   'none'                      -> { blur: 0,  rest: '' }
 *   'blur(4px)'                 -> { blur: 4,  rest: '' }
 *   'grayscale(100%) blur(4px)' -> { blur: 4,  rest: 'grayscale(100%)' }
 *   'blur(4px) grayscale(50%)'  -> { blur: 4,  rest: 'grayscale(50%)' }
 */
export function parseFilterFunctions(raw: string): { blur: number; rest: string } {
  if (!raw || raw === 'none') return { blur: 0, rest: '' }
  const blurMatch = raw.match(/blur\(([\d.]+)px\)/)
  const blur = blurMatch?.[1] ? parseFloat(blurMatch[1]) : 0
  const rest = raw
    .replace(/blur\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { blur, rest }
}

/**
 * Format a filter string from a non-blur "rest" and a blur value.
 * Returns 'none' when both are empty/zero so the CSS property clears cleanly.
 */
export function formatFilter(rest: string, blur: number): string {
  if (blur === 0) return rest || 'none'
  return rest ? `${rest} blur(${blur}px)` : `blur(${blur}px)`
}

// ---------------------------------------------------------------------------
// fingerprintEffect — structural identity for stable IDs.
// ---------------------------------------------------------------------------

/**
 * Input shape for fingerprintEffect — an Effect without its id.
 * Spelled out as an explicit union (rather than Omit<Effect, 'id'>) so TS
 * narrows cleanly at each variant call site.
 */
export type FingerprintInput =
  | { type: 'drop';          x: number; y: number; blur: number; spread: number; color: string }
  | { type: 'inset';         x: number; y: number; blur: number; spread: number; color: string }
  | { type: 'layer-blur';    blur: number }
  | { type: 'backdrop-blur'; blur: number }

/**
 * Generate a stable structural fingerprint for an Effect (sans id).
 *
 * The component caches a Map<fingerprint, id> across renders so that re-parsing
 * the same CSS snapshot produces the same per-row IDs. This lets the eye-toggle
 * stash, expanded-row state, and DOM identity all key by an id that survives
 * re-renders without React reconciliation churn.
 *
 * Contract:
 *   - Determinism: same inputs always produce the same output.
 *   - Collision behavior for non-singletons: two identical shadows in source
 *     must produce DIFFERENT fingerprints — that's what positionalIndex is for.
 *   - Singletons (layer-blur, backdrop-blur): at most one per element by
 *     definition, so the type name alone is sufficient — pass positionalIndex = -1
 *     from the caller for singletons; the function may ignore it for those types.
 *
 * @param effect Effect without its assigned id.
 * @param positionalIndex Caller-provided disambiguator. >=0 for shadows, -1 for singletons.
 * @returns A string suitable for Map keys.
 */
export function fingerprintEffect(
  effect: FingerprintInput,
  positionalIndex: number,
): string {
  if (effect.type === 'layer-blur' || effect.type === 'backdrop-blur') {
    return effect.type
  }
  return [
    effect.type,
    effect.x,
    effect.y,
    effect.blur,
    effect.spread,
    effect.color,
    positionalIndex,
  ].join('|')
}

// ---------------------------------------------------------------------------
// buildEffects — CSS snapshot to Effect[]
// ---------------------------------------------------------------------------

/**
 * Pure derivation from an `EffectsValues` snapshot to an `Effect[]` list.
 *
 * Order: shadows first (in box-shadow declaration order), then layer-blur singleton
 * (if present), then backdrop-blur singleton (if present). Cross-property ordering
 * is not preserved by CSS — there is no shared ordering to recover, so we impose this.
 *
 * The `getId` callback lets the component's stable-ID cache hand back an existing id
 * or mint a fresh one based on the structural fingerprint.
 */
export function buildEffects(
  values: EffectsValues,
  getId: (fingerprint: string) => string,
): Effect[] {
  const effects: Effect[] = []
  const shadows = parseBoxShadow(values.boxShadow)

  shadows.forEach((shadow, index) => {
    const type: 'drop' | 'inset' = shadow.inset ? 'inset' : 'drop'
    const fp = fingerprintEffect(
      { type, x: shadow.x, y: shadow.y, blur: shadow.blur, spread: shadow.spread, color: shadow.color },
      index,
    )
    effects.push({
      id: getId(fp),
      type,
      x: shadow.x,
      y: shadow.y,
      blur: shadow.blur,
      spread: shadow.spread,
      color: shadow.color,
    })
  })

  if (values.blur > 0) {
    const fp = fingerprintEffect({ type: 'layer-blur', blur: values.blur }, -1)
    effects.push({ id: getId(fp), type: 'layer-blur', blur: values.blur })
  }

  if (values.backdropBlur > 0) {
    const fp = fingerprintEffect({ type: 'backdrop-blur', blur: values.backdropBlur }, -1)
    effects.push({ id: getId(fp), type: 'backdrop-blur', blur: values.backdropBlur })
  }

  return effects
}

// ---------------------------------------------------------------------------
// commitEffects — Effect[] to CSS strings (all three properties, every call).
// ---------------------------------------------------------------------------

/**
 * Pure serialization from an Effect[] list to the three derived CSS values.
 * Returns all three on every call — Panel's microtask coalescer dedupes by
 * (source, property, pseudo) so emitting unchanged values is free.
 *
 * Empty drops/insets → `box-shadow: 'none'`.
 * Missing layer-blur → `filter` clears any blur() but preserves other functions
 *                       (or returns 'none' if nothing else remains).
 * Mirror logic for backdrop-blur.
 */
export function commitEffects(
  effects: Effect[],
  filterRaw: string,
  backdropFilterRaw: string,
): { boxShadow: string; filter: string; backdropFilter: string } {
  const shadows: Shadow[] = effects
    .filter((e): e is Extract<Effect, { type: 'drop' | 'inset' }> => e.type === 'drop' || e.type === 'inset')
    .map((e) => ({
      inset: e.type === 'inset',
      x: e.x,
      y: e.y,
      blur: e.blur,
      spread: e.spread,
      color: e.color,
    }))

  const layerBlur = effects.find(
    (e): e is Extract<Effect, { type: 'layer-blur' }> => e.type === 'layer-blur',
  )
  const backdropBlur = effects.find(
    (e): e is Extract<Effect, { type: 'backdrop-blur' }> => e.type === 'backdrop-blur',
  )

  const { rest: filterRest } = parseFilterFunctions(filterRaw)
  const { rest: backdropFilterRest } = parseFilterFunctions(backdropFilterRaw)

  return {
    boxShadow: serializeBoxShadow(shadows),
    filter: formatFilter(filterRest, layerBlur?.blur ?? 0),
    backdropFilter: formatFilter(backdropFilterRest, backdropBlur?.blur ?? 0),
  }
}

// ---------------------------------------------------------------------------
// convertEffect — transmute an Effect to a different type.
// ---------------------------------------------------------------------------

/**
 * Convert an Effect from its current type to a target type. The id is preserved
 * through conversion; the CALLER is responsible for dropping any stale stash
 * entries keyed by id when crossing the shadow↔blur domain boundary.
 *
 * Field reshape rules:
 *   - drop ↔ inset             : keep all fields, flip discriminant
 *   - shadow → blur            : keep `blur` only, discard x/y/spread/color
 *   - blur   → shadow          : keep `blur`, default x=0, y=2, spread=0, color
 *   - layer-blur ↔ backdrop    : keep `blur`
 *   - identity (same type)     : no-op short-circuit (returns the same reference)
 */
export function convertEffect(effect: Effect, newType: EffectType): Effect {
  if (effect.type === newType) return effect

  const { id } = effect
  const oldType = effect.type
  const isOldShadow = oldType === 'drop' || oldType === 'inset'
  const isNewShadow = newType === 'drop' || newType === 'inset'

  if (isOldShadow && isNewShadow) {
    // drop ↔ inset: keep all fields, flip discriminant
    const shadow = effect as Extract<Effect, { type: 'drop' | 'inset' }>
    return {
      id,
      type: newType as 'drop' | 'inset',
      x: shadow.x,
      y: shadow.y,
      blur: shadow.blur,
      spread: shadow.spread,
      color: shadow.color,
    }
  }

  if (isOldShadow && !isNewShadow) {
    // shadow → blur: keep blur only
    const shadow = effect as Extract<Effect, { type: 'drop' | 'inset' }>
    return { id, type: newType as 'layer-blur' | 'backdrop-blur', blur: shadow.blur }
  }

  if (!isOldShadow && isNewShadow) {
    // blur → shadow: keep blur, default x/y/spread/color
    const blur = effect as Extract<Effect, { type: 'layer-blur' | 'backdrop-blur' }>
    return {
      id,
      type: newType as 'drop' | 'inset',
      x: DEFAULT_SHADOW_FIELDS.x,
      y: DEFAULT_SHADOW_FIELDS.y,
      blur: blur.blur,
      spread: DEFAULT_SHADOW_FIELDS.spread,
      color: DEFAULT_SHADOW_FIELDS.color,
    }
  }

  // blur ↔ blur: keep blur
  const blur = effect as Extract<Effect, { type: 'layer-blur' | 'backdrop-blur' }>
  return { id, type: newType as 'layer-blur' | 'backdrop-blur', blur: blur.blur }
}

// ---------------------------------------------------------------------------
// Singleton helpers — small predicates for UI logic.
// ---------------------------------------------------------------------------

/** Whether the list already contains an effect of the given (singleton) type. */
export function hasSingleton(effects: Effect[], type: 'layer-blur' | 'backdrop-blur'): boolean {
  return effects.some((e) => e.type === type)
}

/**
 * Whether the type dropdown option for `option` should be disabled for the row
 * at index `rowIndex`. Singletons are disabled when ANOTHER row already holds them.
 */
export function isTypeOptionDisabled(
  effects: Effect[],
  rowIndex: number,
  option: EffectType,
): boolean {
  if (option !== 'layer-blur' && option !== 'backdrop-blur') return false
  return effects.some((e, i) => e.type === option && i !== rowIndex)
}
