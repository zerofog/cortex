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
 * IDs are assigned by buildEffects from position+type (`drop-0`, `inset-1`,
 * `layer-blur`, `backdrop-blur`). The fingerprint-cache approach planned
 * earlier was reversed after a codex review found it minted new ids on every
 * value edit — position-based ids are simpler and have the same stability
 * for the only cases that matter.
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

/**
 * Canonical default shadow used by both the "+" button (handleEffectAdd) and
 * convertEffect's blur → shadow path. Single source of truth — duplicating
 * blur:8 here vs elsewhere caused divergent UX between the add and convert flows.
 */
export const DEFAULT_SHADOW = {
  inset: false,
  x: DEFAULT_SHADOW_FIELDS.x,
  y: DEFAULT_SHADOW_FIELDS.y,
  blur: 8,
  spread: DEFAULT_SHADOW_FIELDS.spread,
  color: DEFAULT_SHADOW_FIELDS.color,
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
// buildEffects — CSS snapshot to Effect[]
// ---------------------------------------------------------------------------

/**
 * Pure derivation from an `EffectsValues` snapshot to an `Effect[]` list.
 *
 * Order: shadows first (in box-shadow declaration order), then layer-blur singleton
 * (if present), then backdrop-blur singleton (if present). Cross-property ordering
 * is not preserved by CSS — there is no shared ordering to recover, so we impose this.
 *
 * IDs are derived deterministically from position and type:
 *   - Shadows: `${type}-${index}`  (e.g., `drop-0`, `inset-1`)
 *   - Singletons: just the type name (`layer-blur`, `backdrop-blur`)
 *
 * This keeps ids stable across value edits (a shadow at position 1 is always
 * `drop-1` regardless of its current x/y/color). The CALLER is responsible for
 * shifting stash/expanded state when shadows are added/removed and positions
 * shift — see handleRemove in EffectsSection.tsx.
 */
export function buildEffects(values: EffectsValues): Effect[] {
  const effects: Effect[] = []
  const shadows = parseBoxShadow(values.boxShadow)
  // Clamp blur at the model boundary: blur cannot be negative. x/y/spread are
  // NOT clamped to non-negative (shadows legitimately offset up/left and spread
  // inward), only NaN-guarded. A malformed CSS source could otherwise corrupt
  // the round-trip with NaN/negative blur.
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)

  shadows.forEach((shadow, index) => {
    const type: 'drop' | 'inset' = shadow.inset ? 'inset' : 'drop'
    effects.push({
      id: `${type}-${index}`,
      type,
      x: Number.isFinite(shadow.x) ? shadow.x : 0,
      y: Number.isFinite(shadow.y) ? shadow.y : 0,
      blur: clamp(shadow.blur),
      spread: Number.isFinite(shadow.spread) ? shadow.spread : 0,
      color: shadow.color,
    })
  })

  const layerBlur = clamp(values.blur)
  if (layerBlur > 0) {
    effects.push({ id: 'layer-blur', type: 'layer-blur', blur: layerBlur })
  }
  const backdropBlur = clamp(values.backdropBlur)
  if (backdropBlur > 0) {
    effects.push({ id: 'backdrop-blur', type: 'backdrop-blur', blur: backdropBlur })
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
  // Discriminant-driven narrowing — switch on newType so the compiler enforces
  // exhaustiveness when a fifth Effect kind is added. Casts via `as Extract<>`
  // would silently accept that future addition; this won't.
  switch (newType) {
    case 'drop':
    case 'inset':
      if (effect.type === 'drop' || effect.type === 'inset') {
        return { id, type: newType, x: effect.x, y: effect.y, blur: effect.blur, spread: effect.spread, color: effect.color }
      }
      return {
        id,
        type: newType,
        x: DEFAULT_SHADOW_FIELDS.x,
        y: DEFAULT_SHADOW_FIELDS.y,
        blur: effect.blur,
        spread: DEFAULT_SHADOW_FIELDS.spread,
        color: DEFAULT_SHADOW_FIELDS.color,
      }
    case 'layer-blur':
    case 'backdrop-blur':
      return { id, type: newType, blur: effect.blur }
  }
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
