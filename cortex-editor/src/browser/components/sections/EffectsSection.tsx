import type { JSX } from 'preact'
import { useState, useCallback, useMemo, useRef, useEffect } from 'preact/hooks'
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
  DEFAULT_SHADOW,
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

/** Extract effects-related values from a CSSStyleDeclaration. */
export function parseEffectsValues(cs: CSSStyleDeclaration): EffectsValues {
  // Safari < 18 only exposes the prefixed property on CSSStyleDeclaration.
  const csWithVendor = cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }
  const backdrop = cs.backdropFilter || csWithVendor.webkitBackdropFilter || ''
  return {
    boxShadow: cs.boxShadow ?? 'none',
    blur: parseFilterFunctions(cs.filter ?? '').blur,
    backdropBlur: parseFilterFunctions(backdrop).blur,
    filterRaw: cs.filter ?? '',
    backdropFilterRaw: backdrop,
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

// Per DESIGN.md line 304: "Type dropdown: Drop shadow, Inner shadow, Blur, Background blur"
const EFFECT_TYPE_OPTIONS = [
  { value: 'drop',          label: 'Drop shadow' },
  { value: 'inset',         label: 'Inner shadow' },
  { value: 'layer-blur',    label: 'Blur' },
  { value: 'backdrop-blur', label: 'Background blur' },
]

// Tooltips applied ONLY when the option is in the disabled state (sibling row
// holds the singleton). Avoids showing "Only one Blur per element" on the
// currently-active row's own selection, which would be confusing copy.
const DISABLED_TOOLTIP: Record<EffectType, string | undefined> = {
  'drop': undefined,
  'inset': undefined,
  'layer-blur': 'Only one Blur per element',
  'backdrop-blur': 'Only one Background blur per element',
}

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
  // Effects derived from values. IDs are position-based (drop-0, inset-1, layer-blur,
  // backdrop-blur), so value edits preserve identity — only structural changes
  // (add/remove/reorder) churn ids.
  const baseEffects = useMemo(() => buildEffects(values), [values])

  // Disabled singletons stay visible in the UI even when their blur is 0 (which
  // would normally drop them from buildEffects). This lets the eye toggle work
  // as a true on/off — the row persists with its stash entry available for restore.
  const [disabledSingletons, setDisabledSingletons] = useState<Set<'layer-blur' | 'backdrop-blur'>>(new Set())

  const effects = useMemo(() => {
    const result = [...baseEffects]
    // Augment with disabled singletons that buildEffects dropped (blur=0).
    for (const type of disabledSingletons) {
      if (!result.some((e) => e.type === type)) {
        result.push({ id: type, type, blur: 0 })
      }
    }
    return result
  }, [baseEffects, disabledSingletons])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Stash map keyed by Effect id. Shadow ids shift on add/remove, so handleRemove
  // remaps stash entries. Singleton ids ('layer-blur', 'backdrop-blur') are always
  // stable. Cross-domain conversion (shadow ↔ blur) drops the stash entry at the
  // conversion call site so a stale shadow payload can never leak into a blur restore.
  const stashRef = useRef<Map<string, StashEntry>>(new Map())

  // Baseline for per-property emit gating: the canonical CSS form of the
  // parent's last-committed state. We compare emitted CSS against this baseline
  // so we only fire onChange for properties the gesture actually changed.
  //
  // CRITICAL: baseline must come from `values` (parent state, only updates on
  // commit), NOT from our own last-emit cache. During a scrub, the parent
  // doesn't re-render — so `values` stays fixed through every scrub-move tick
  // AND through scrubEnd. This is the only way scrubEnd can detect "this value
  // is different from the pre-gesture baseline" and fire onScrubEnd to trigger
  // Panel.commitScrub → PropertyEditCommand → undo entry.
  //
  // A previous attempt used `lastEmittedCssRef` (cached last-emit) as baseline.
  // It defeated the scrubEnd commit: lastEmit matched scrubEnd's value, gating
  // suppressed the emit, no commit fired, scrubs left no undo trace, and Cmd+Z
  // then undid the *previous* gesture (e.g., the "+" that added the shadow).
  const baseline = useMemo(
    () => commitEffects(baseEffects, values.filterRaw, values.backdropFilterRaw),
    [baseEffects, values.filterRaw, values.backdropFilterRaw],
  )

  // Auto-scroll: when the user adds a new row via "+" or expands a row that's
  // below the fold, bring it into view. Tracks row count and expanded id changes.
  const rowsContainerRef = useRef<HTMLDivElement>(null)
  const prevEffectsCountRef = useRef(effects.length)
  useEffect(() => {
    if (effects.length > prevEffectsCountRef.current) {
      // A new row was added. `block: 'end'` puts the new row at the bottom edge
      // of the viewport; the CSS `scroll-margin-bottom` on `__row` adds padding
      // so the row sits comfortably above the panel edge instead of hugging it.
      const last = rowsContainerRef.current?.lastElementChild as HTMLElement | null
      last?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
    prevEffectsCountRef.current = effects.length
  }, [effects.length])

  useEffect(() => {
    if (!expandedId) return
    // Scroll the just-expanded row into view (block: 'nearest' avoids over-scroll
    // if the row is already mostly visible).
    const row = rowsContainerRef.current?.querySelector<HTMLElement>(
      `.cortex-effects-section__row[data-effect-id="${expandedId}"]`,
    )
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expandedId])

  // ---- Emission helpers ---------------------------------------------------

  // Properties emitted at least once during the current gesture. Once a
  // property is "touched", every later emit in the same gesture re-emits it —
  // even when its value returns to the pre-gesture baseline. Without this, a
  // scrub that moves a value away then back (0 → 15 → 0) would suppress the
  // return-to-0 tick, leaving the stale 15px override installed and skipping
  // the scrubEnd commit. Cleared at the end of every gesture (scrubEnd) and at
  // the start of every atomic 'change'.
  const touchedPropsRef = useRef<Set<'box-shadow' | 'filter' | 'backdrop-filter'>>(new Set())

  const emit = useCallback(
    (phase: 'change' | 'scrub' | 'scrubEnd', nextEffects: Effect[]) => {
      const callback = phase === 'change' ? onChange : phase === 'scrub' ? onScrub : onScrubEnd
      if (!callback) return
      // A 'change' is atomic — no scrub carry-over (also defends against a
      // cancelled scrub that never reached scrubEnd to clear the set).
      if (phase === 'change') touchedPropsRef.current.clear()
      const next = commitEffects(nextEffects, values.filterRaw, values.backdropFilterRaw)
      // Per-property gating: emit a property if it differs from the parent's
      // pre-gesture baseline OR if it was already touched this gesture. Both
      // sides live in the serialized coordinate system (commitEffects output),
      // so browser-normalization differences don't matter.
      const emitProp = (
        property: 'box-shadow' | 'filter' | 'backdrop-filter',
        value: string,
        baselineValue: string,
      ) => {
        const changed = value !== baselineValue
        if (changed || touchedPropsRef.current.has(property)) {
          callback({ property, value })
          if (changed) touchedPropsRef.current.add(property)
        }
      }
      emitProp('box-shadow', next.boxShadow, baseline.boxShadow)
      emitProp('filter', next.filter, baseline.filter)
      emitProp('backdrop-filter', next.backdropFilter, baseline.backdropFilter)
      if (phase === 'scrubEnd' || phase === 'change') touchedPropsRef.current.clear()
    },
    [onChange, onScrub, onScrubEnd, baseline, values.filterRaw, values.backdropFilterRaw],
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
      const idx = effects.findIndex((e) => e.id === id)
      if (idx === -1) return
      const target = effects[idx]!
      stashRef.current.delete(id)
      if (expandedId === id) setExpandedId(null)
      // If a singleton was hiding in disabledSingletons, drop it on remove.
      if (target.type === 'layer-blur' || target.type === 'backdrop-blur') {
        if (disabledSingletons.has(target.type)) {
          const next = new Set(disabledSingletons)
          next.delete(target.type)
          setDisabledSingletons(next)
        }
      }
      // Shift shadow stash entries: a shadow at index > idx will become index - 1
      // on the next render, so its id changes (drop-2 → drop-1). Pre-migrate the
      // stash so the eye-toggle restore still finds the right payload.
      if (target.type === 'drop' || target.type === 'inset') {
        const newStash = new Map<string, StashEntry>()
        effects.forEach((e, i) => {
          if (i === idx) return
          const entry = stashRef.current.get(e.id)
          if (!entry) return
          if (e.type === 'drop' || e.type === 'inset') {
            const newIdx = i > idx ? i - 1 : i
            const newId = `${e.type}-${newIdx}`
            newStash.set(newId, entry)
          } else {
            // Singleton ids don't shift
            newStash.set(e.id, entry)
          }
        })
        stashRef.current = newStash
      }
      const next = effects.filter((e) => e.id !== id)
      emit('change', next)
    },
    [effects, emit, expandedId, disabledSingletons],
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
        // layer-blur or backdrop-blur — keep the row visible across the disabled state
        if (enabled) {
          stashRef.current.set(id, { kind: 'blur', blur: target.blur })
          // Mark this singleton as "disabled but visible" so the next render
          // (which sees values.blur === 0 and would drop the row) still shows it.
          const nextDisabled = new Set(disabledSingletons)
          nextDisabled.add(target.type)
          setDisabledSingletons(nextDisabled)
          updated = { ...target, blur: 0 }
        } else {
          const stashed = stashRef.current.get(id)
          stashRef.current.delete(id)
          // No longer "disabled but visible" — values.blur > 0 will keep it on its own.
          if (disabledSingletons.has(target.type)) {
            const nextDisabled = new Set(disabledSingletons)
            nextDisabled.delete(target.type)
            setDisabledSingletons(nextDisabled)
          }
          const restoreBlur = stashed && stashed.kind === 'blur' ? stashed.blur : DEFAULT_SHADOW.blur
          updated = { ...target, blur: restoreBlur }
        }
      }
      const next = effects.map((e) => (e.id === id ? updated : e))
      emit('change', next)
    },
    [effects, emit, disabledSingletons],
  )

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // ---- Per-row dropdown options with singleton disable state ---------------

  const optionsForRow = useCallback(
    (rowIndex: number) =>
      EFFECT_TYPE_OPTIONS.map((opt) => {
        const disabled = isTypeOptionDisabled(effects, rowIndex, opt.value as EffectType)
        return {
          ...opt,
          disabled,
          // Tooltip surfaces only when the option is greyed out — otherwise
          // the user sees a sibling-row constraint on their own active selection.
          tooltip: disabled ? DISABLED_TOOLTIP[opt.value as EffectType] : undefined,
        }
      }),
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
      <div class="cortex-effects-section__effects" ref={rowsContainerRef}>
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
              data-effect-id={effect.id}
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
