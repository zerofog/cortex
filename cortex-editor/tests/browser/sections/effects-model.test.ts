import { describe, it, expect } from 'vitest'
import {
  parseFilterFunctions,
  formatFilter,
  convertEffect,
  commitEffects,
  buildEffects,
  hasSingleton,
  isTypeOptionDisabled,
} from '../../../src/browser/components/sections/effects-model.js'
import type { Effect, EffectType } from '../../../src/browser/components/sections/effects-model.js'
import type { EffectsValues } from '../../../src/browser/components/sections/EffectsSection.js'

// ---------------------------------------------------------------------------
// parseFilterFunctions — single source of truth for filter-string parsing
// ---------------------------------------------------------------------------
describe('parseFilterFunctions', () => {
  it('returns empty for empty input', () => {
    expect(parseFilterFunctions('')).toEqual({ blur: 0, rest: '' })
  })

  it('returns empty for "none"', () => {
    expect(parseFilterFunctions('none')).toEqual({ blur: 0, rest: '' })
  })

  it('extracts blur(4px) -> blur: 4, rest: empty', () => {
    expect(parseFilterFunctions('blur(4px)')).toEqual({ blur: 4, rest: '' })
  })

  it('preserves non-blur functions before blur()', () => {
    expect(parseFilterFunctions('grayscale(100%) blur(4px)')).toEqual({
      blur: 4,
      rest: 'grayscale(100%)',
    })
  })

  it('preserves non-blur functions after blur()', () => {
    expect(parseFilterFunctions('blur(4px) grayscale(50%)')).toEqual({
      blur: 4,
      rest: 'grayscale(50%)',
    })
  })

  it('treats blur(0) without unit as no blur (no-px contract)', () => {
    // blur(0) without 'px' suffix is not matched — we require px-suffixed blur
    expect(parseFilterFunctions('blur(0)')).toEqual({ blur: 0, rest: '' })
  })
})

// ---------------------------------------------------------------------------
// formatFilter — reverse of parseFilterFunctions
// ---------------------------------------------------------------------------
describe('formatFilter', () => {
  it('returns "none" when both rest and blur are empty', () => {
    expect(formatFilter('', 0)).toBe('none')
  })

  it('returns just the rest when blur is 0', () => {
    expect(formatFilter('grayscale(100%)', 0)).toBe('grayscale(100%)')
  })

  it('returns just blur() when rest is empty', () => {
    expect(formatFilter('', 4)).toBe('blur(4px)')
  })

  it('combines rest and blur in order', () => {
    expect(formatFilter('grayscale(50%)', 4)).toBe('grayscale(50%) blur(4px)')
  })
})

// ---------------------------------------------------------------------------
// convertEffect — 12-transition table
// ---------------------------------------------------------------------------
const drop: Effect = { id: 'a', type: 'drop', x: 1, y: 2, blur: 8, spread: 0, color: '#000' }
const inset: Effect = { id: 'b', type: 'inset', x: 1, y: 2, blur: 8, spread: 0, color: '#000' }
const layerBlur: Effect = { id: 'c', type: 'layer-blur', blur: 4 }
const backdropBlur: Effect = { id: 'd', type: 'backdrop-blur', blur: 6 }

describe('convertEffect', () => {
  it('identity: returns the same reference for same-type', () => {
    expect(convertEffect(drop, 'drop')).toBe(drop)
  })

  it('drop -> inset: flips discriminant, keeps all fields', () => {
    const r = convertEffect(drop, 'inset')
    expect(r).toEqual({ ...drop, type: 'inset' })
  })

  it('inset -> drop: flips discriminant, keeps all fields', () => {
    const r = convertEffect(inset, 'drop')
    expect(r).toEqual({ ...inset, type: 'drop' })
  })

  it('drop -> layer-blur: keeps blur only', () => {
    expect(convertEffect(drop, 'layer-blur')).toEqual({ id: 'a', type: 'layer-blur', blur: 8 })
  })

  it('drop -> backdrop-blur: keeps blur only', () => {
    expect(convertEffect(drop, 'backdrop-blur')).toEqual({ id: 'a', type: 'backdrop-blur', blur: 8 })
  })

  it('inset -> layer-blur: keeps blur only', () => {
    expect(convertEffect(inset, 'layer-blur')).toEqual({ id: 'b', type: 'layer-blur', blur: 8 })
  })

  it('inset -> backdrop-blur: keeps blur only', () => {
    expect(convertEffect(inset, 'backdrop-blur')).toEqual({ id: 'b', type: 'backdrop-blur', blur: 8 })
  })

  it('layer-blur -> drop: defaults x=0, y=2, spread=0, color', () => {
    expect(convertEffect(layerBlur, 'drop')).toEqual({
      id: 'c',
      type: 'drop',
      x: 0,
      y: 2,
      blur: 4,
      spread: 0,
      color: 'rgba(0, 0, 0, 0.1)',
    })
  })

  it('layer-blur -> inset: defaults x=0, y=2, spread=0, color', () => {
    expect(convertEffect(layerBlur, 'inset')).toEqual({
      id: 'c',
      type: 'inset',
      x: 0,
      y: 2,
      blur: 4,
      spread: 0,
      color: 'rgba(0, 0, 0, 0.1)',
    })
  })

  it('layer-blur -> backdrop-blur: keeps blur', () => {
    expect(convertEffect(layerBlur, 'backdrop-blur')).toEqual({
      id: 'c',
      type: 'backdrop-blur',
      blur: 4,
    })
  })

  it('backdrop-blur -> drop: defaults x=0, y=2, spread=0, color', () => {
    expect(convertEffect(backdropBlur, 'drop')).toEqual({
      id: 'd',
      type: 'drop',
      x: 0,
      y: 2,
      blur: 6,
      spread: 0,
      color: 'rgba(0, 0, 0, 0.1)',
    })
  })

  it('backdrop-blur -> inset: defaults x=0, y=2, spread=0, color', () => {
    expect(convertEffect(backdropBlur, 'inset')).toEqual({
      id: 'd',
      type: 'inset',
      x: 0,
      y: 2,
      blur: 6,
      spread: 0,
      color: 'rgba(0, 0, 0, 0.1)',
    })
  })

  it('backdrop-blur -> layer-blur: keeps blur', () => {
    expect(convertEffect(backdropBlur, 'layer-blur')).toEqual({
      id: 'd',
      type: 'layer-blur',
      blur: 6,
    })
  })

  it('id is preserved through every cross-type conversion', () => {
    const types: EffectType[] = ['drop', 'inset', 'layer-blur', 'backdrop-blur']
    const all = [drop, inset, layerBlur, backdropBlur]
    for (const e of all) {
      for (const t of types) {
        expect(convertEffect(e, t).id).toBe(e.id)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// commitEffects — Effect[] -> three CSS strings
// ---------------------------------------------------------------------------
describe('commitEffects', () => {
  it('empty list -> all three properties "none"', () => {
    expect(commitEffects([], '', '')).toEqual({
      boxShadow: 'none',
      filter: 'none',
      backdropFilter: 'none',
    })
  })

  it('drops only -> serialized box-shadow, filter/backdrop "none"', () => {
    const r = commitEffects([drop], '', '')
    expect(r.boxShadow).toBe('1px 2px 8px 0px #000')
    expect(r.filter).toBe('none')
    expect(r.backdropFilter).toBe('none')
  })

  it('layer-blur only -> box-shadow "none", filter blur(4px)', () => {
    const r = commitEffects([layerBlur], '', '')
    expect(r.boxShadow).toBe('none')
    expect(r.filter).toBe('blur(4px)')
    expect(r.backdropFilter).toBe('none')
  })

  it('backdrop-blur only -> backdrop-filter blur(6px)', () => {
    const r = commitEffects([backdropBlur], '', '')
    expect(r.boxShadow).toBe('none')
    expect(r.filter).toBe('none')
    expect(r.backdropFilter).toBe('blur(6px)')
  })

  it('preserves non-blur filter functions when no layer-blur present', () => {
    const r = commitEffects([], 'grayscale(100%) blur(4px)', '')
    expect(r.filter).toBe('grayscale(100%)')
  })

  it('preserves non-blur filter functions when layer-blur changes value', () => {
    const r = commitEffects([{ ...layerBlur, blur: 12 }], 'grayscale(100%) blur(4px)', '')
    expect(r.filter).toBe('grayscale(100%) blur(12px)')
  })

  it('drop + layer-blur + backdrop-blur: all three properties emit', () => {
    const r = commitEffects([drop, layerBlur, backdropBlur], '', '')
    expect(r.boxShadow).toBe('1px 2px 8px 0px #000')
    expect(r.filter).toBe('blur(4px)')
    expect(r.backdropFilter).toBe('blur(6px)')
  })

  it('multiple shadows preserve order', () => {
    const second: Effect = { id: 'e', type: 'inset', x: 5, y: 6, blur: 0, spread: 0, color: '#fff' }
    const r = commitEffects([drop, second], '', '')
    expect(r.boxShadow).toBe('1px 2px 8px 0px #000, inset 5px 6px 0px 0px #fff')
  })
})

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------
describe('hasSingleton', () => {
  it('returns true when the list contains the singleton type', () => {
    expect(hasSingleton([drop, layerBlur], 'layer-blur')).toBe(true)
  })

  it('returns false when absent', () => {
    expect(hasSingleton([drop, backdropBlur], 'layer-blur')).toBe(false)
  })
})

describe('isTypeOptionDisabled', () => {
  it('drop/inset options are never disabled', () => {
    expect(isTypeOptionDisabled([drop, layerBlur], 0, 'drop')).toBe(false)
    expect(isTypeOptionDisabled([drop, layerBlur], 0, 'inset')).toBe(false)
  })

  it('layer-blur option is disabled if ANOTHER row holds it', () => {
    // row 0 is the drop; layer-blur lives at row 1; from row 0's perspective, layer-blur is disabled
    expect(isTypeOptionDisabled([drop, layerBlur], 0, 'layer-blur')).toBe(true)
  })

  it('layer-blur option is NOT disabled for the row that already holds it (self-row)', () => {
    // row 1 IS the layer-blur; converting to itself is identity and shouldn't be greyed out
    expect(isTypeOptionDisabled([drop, layerBlur], 1, 'layer-blur')).toBe(false)
  })

  it('backdrop-blur enforcement mirrors layer-blur', () => {
    expect(isTypeOptionDisabled([drop, backdropBlur], 0, 'backdrop-blur')).toBe(true)
    expect(isTypeOptionDisabled([drop, backdropBlur], 1, 'backdrop-blur')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildEffects — CSS snapshot to Effect[]
// IDs are deterministic from position+type. No id cache needed.
// ---------------------------------------------------------------------------
const EMPTY_VALUES: EffectsValues = {
  boxShadow: 'none',
  blur: 0,
  backdropBlur: 0,
  filterRaw: '',
  backdropFilterRaw: '',
}

describe('buildEffects', () => {
  it('empty values -> empty list', () => {
    expect(buildEffects(EMPTY_VALUES)).toEqual([])
  })

  it('single drop shadow -> one drop effect with id "drop-0"', () => {
    const result = buildEffects({ ...EMPTY_VALUES, boxShadow: '1px 2px 8px 0px rgba(0, 0, 0, 0.1)' })
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('drop')
    expect(result[0]?.id).toBe('drop-0')
  })

  it('layer-blur only -> one layer-blur effect with id "layer-blur"', () => {
    const result = buildEffects({ ...EMPTY_VALUES, blur: 4, filterRaw: 'blur(4px)' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'layer-blur', type: 'layer-blur', blur: 4 })
  })

  it('mixed: shadow + layer-blur + backdrop-blur in this order', () => {
    const result = buildEffects({
      boxShadow: '1px 2px 8px 0px #000',
      blur: 4,
      backdropBlur: 6,
      filterRaw: 'blur(4px)',
      backdropFilterRaw: 'blur(6px)',
    })
    expect(result.map((e) => e.type)).toEqual(['drop', 'layer-blur', 'backdrop-blur'])
  })

  it('id is stable across builds with identical input', () => {
    const v: EffectsValues = { ...EMPTY_VALUES, boxShadow: '1px 2px 8px 0px #000' }
    const a = buildEffects(v)
    const b = buildEffects(v)
    expect(a[0]?.id).toBe(b[0]?.id)
  })

  it('id is stable across builds when only field values change (regression: bug 1)', () => {
    // The Codex review caught this: editing x/y/blur/color should NOT mint a new id.
    // Otherwise expandedId and stash lookups by id break on every edit.
    const before: EffectsValues = { ...EMPTY_VALUES, boxShadow: '0px 0px 8px 0px #000' }
    const after: EffectsValues = { ...EMPTY_VALUES, boxShadow: '5px 5px 12px 2px #fff' }
    expect(buildEffects(before)[0]?.id).toBe(buildEffects(after)[0]?.id)
  })

  it('round-trip: commitEffects(buildEffects(values)) preserves the shape (sans whitespace)', () => {
    const v: EffectsValues = {
      boxShadow: '1px 2px 8px 0px #000',
      blur: 4,
      backdropBlur: 0,
      filterRaw: 'blur(4px)',
      backdropFilterRaw: '',
    }
    const effects = buildEffects(v)
    const out = commitEffects(effects, v.filterRaw, v.backdropFilterRaw)
    expect(out.boxShadow).toBe('1px 2px 8px 0px #000')
    expect(out.filter).toBe('blur(4px)')
    expect(out.backdropFilter).toBe('none')
  })

  it('two identical shadows get distinct ids by position', () => {
    const v: EffectsValues = {
      ...EMPTY_VALUES,
      boxShadow: '0px 0px 4px 0px #000, 0px 0px 4px 0px #000',
    }
    const result = buildEffects(v)
    expect(result).toHaveLength(2)
    expect(result[0]?.id).toBe('drop-0')
    expect(result[1]?.id).toBe('drop-1')
  })
})
