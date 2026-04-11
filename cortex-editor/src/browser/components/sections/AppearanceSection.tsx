import type { JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { Blend, Eye, EyeOff, SquareDashed } from '../icons.js'

// ---------------------------------------------------------------------------
// AppearanceSection (Task 3 / ZF0-1181)
//
// Renders the three "always visible" visual-tweak controls from the Panel v2
// spec (DESIGN.md § Appearance):
//
//   1. Opacity        — NumericInput + Blend icon prefix (0..100%)
//   2. Corner radius  — NumericInput + per-corner expand button
//   3. Visibility     — Eye / EyeOff icon toggle
//
// Opacity was previously rendered by EffectsSection. Corner-radius by
// BorderSection. This section is the consolidated home for all three.
// EffectsSection loses opacity entirely (types, parse, JSX). BorderSection
// stops rendering its radius rows but keeps the radius fields on
// `BorderValues` until Task 14 fully cleans up.
//
// CTF3 pilot: this section is the first in the codebase to actually READ
// `dimmedProperties` and apply a visual dim to its controls. Step 5 Simplify
// propagates the pattern across the remaining 7 sections. The dim class
// `cortex-appearance-section__control--dimmed` is defined in styles.css
// under the Panel v2 section.
// ---------------------------------------------------------------------------

export interface AppearanceChange {
  property: string
  value: string
}

export interface AppearanceValues {
  /** 0..100 — percentage form; the component emits 0..1 as CSS opacity. */
  opacity: number
  visibility: string
  borderRadius: number
  borderTopLeftRadius: number
  borderTopRightRadius: number
  borderBottomRightRadius: number
  borderBottomLeftRadius: number
}

export interface AppearanceSectionProps {
  values: AppearanceValues
  onChange: (change: AppearanceChange) => void
  onScrub?: (change: AppearanceChange) => void
  onScrubEnd?: (change: AppearanceChange) => void
  /** Set of CSS properties whose forced-state value differs from default. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
  /**
   * Opaque token that, when changed, resets local UI state (currently the
   * per-corner expansion). Panel.tsx passes a value derived from the selected
   * element's identity so switching elements collapses the corners UI back
   * to its uniform default. The prop is opaque on purpose — only equality
   * matters, callers should not introspect the string.
   */
  resetKey?: string
}

/**
 * Round trip safely: happy-dom returns `''` for missing computed style
 * numbers, and `parseFloat('')` is `NaN` — coerce every non-numeric result
 * to 0 so the NumericInputs never receive `NaN`.
 */
function toNumber(raw: string | undefined): number {
  const n = parseFloat(raw ?? '')
  return Number.isFinite(n) ? n : 0
}

/** Extract appearance-related values from a CSSStyleDeclaration. */
export function parseAppearanceValues(cs: CSSStyleDeclaration): AppearanceValues {
  // CSS opacity is 0..1; panel presents 0..100. Default to 1.0 (100%) when
  // the declaration is empty (happy-dom, uninitialised element).
  const rawOpacity = parseFloat(cs.opacity ?? '')
  const opacityUnit = Number.isFinite(rawOpacity) ? rawOpacity : 1
  return {
    opacity: Math.round(opacityUnit * 100),
    visibility: cs.visibility || 'visible',
    borderRadius: toNumber(cs.borderRadius),
    borderTopLeftRadius: toNumber(cs.borderTopLeftRadius),
    borderTopRightRadius: toNumber(cs.borderTopRightRadius),
    borderBottomRightRadius: toNumber(cs.borderBottomRightRadius),
    borderBottomLeftRadius: toNumber(cs.borderBottomLeftRadius),
  }
}

// Classes used for CTF3 dimming. Keeping them as string constants avoids
// typos in the six places `control--dimmed` gets conditionally appended.
const BASE_CONTROL = 'cortex-appearance-section__control'
const DIMMED = `${BASE_CONTROL}--dimmed`

function controlClass(variant: string, dimmed: boolean): string {
  return dimmed
    ? `${BASE_CONTROL} ${BASE_CONTROL}--${variant} ${DIMMED}`
    : `${BASE_CONTROL} ${BASE_CONTROL}--${variant}`
}

export function AppearanceSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  dimmedProperties,
  mixedProperties,
  resetKey,
}: AppearanceSectionProps): JSX.Element {
  const [perCorner, setPerCorner] = useState(false)

  // Per-corner expansion is local UI state; when Panel switches to a new
  // element the user almost never wants the previous element's "expanded"
  // state to leak through. Collapse whenever `resetKey` _changes_.
  //
  // NB: a naive `useEffect(…, [resetKey])` would ALSO fire on mount, which
  // races with any click that arrives before Preact flushes the mount
  // effect and silently wipes the user's `perCorner=true` back to `false`.
  // We skip the mount run via a ref and only reset on genuine transitions.
  const prevResetKeyRef = useRef<string | undefined>(resetKey)
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey
      setPerCorner(false)
    }
  }, [resetKey])

  // ── Opacity handlers ─────────────────────────────────────────────────────
  // NumericInput reports 0..100; CSS opacity expects 0..1. Convert at the
  // boundary so no downstream consumer (scrub, command stack, overrides) has
  // to know about the percentage representation.
  const toCssOpacity = (v: number): string => String(Math.max(0, Math.min(100, v)) / 100)
  const handleOpacityChange = useCallback(
    (v: number) => onChange({ property: 'opacity', value: toCssOpacity(v) }),
    [onChange],
  )
  const handleOpacityScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'opacity', value: toCssOpacity(v) }) },
    [onScrub],
  )
  const handleOpacityScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'opacity', value: toCssOpacity(v) }) },
    [onScrubEnd],
  )

  // ── Uniform radius handlers ──────────────────────────────────────────────
  const handleRadiusChange = useCallback(
    (v: number) => onChange({ property: 'border-radius', value: `${v}px` }),
    [onChange],
  )
  const handleRadiusScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-radius', value: `${v}px` }) },
    [onScrub],
  )
  const handleRadiusScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-radius', value: `${v}px` }) },
    [onScrubEnd],
  )

  // ── Per-corner radius handlers ───────────────────────────────────────────
  // Fresh-closed each render — the inline object is tiny and the callback
  // site is stable. If this ever shows up in a profile, hoist to `useMemo`.
  const cornerHandlers = (property: string) => ({
    onChange: (v: number) => onChange({ property, value: `${v}px` }),
    onScrub: onScrub ? (v: number) => onScrub({ property, value: `${v}px` }) : undefined,
    onScrubEnd: onScrubEnd ? (v: number) => onScrubEnd({ property, value: `${v}px` }) : undefined,
  })

  const handleToggleCorners = useCallback(() => setPerCorner((v) => !v), [])

  // ── Visibility handler ───────────────────────────────────────────────────
  // Depend on `values.visibility` directly rather than the derived `isHidden`
  // boolean so the callback identity only changes when the underlying value
  // actually changes (and not when a parent re-render produces a fresh bool
  // with the same truth value). `isHidden` is still computed below for the
  // aria-pressed state and icon selection.
  const handleToggleVisibility = useCallback(() => {
    onChange({
      property: 'visibility',
      value: values.visibility === 'hidden' ? 'visible' : 'hidden',
    })
  }, [onChange, values.visibility])
  const isHidden = values.visibility === 'hidden'

  // ── Dimming state ────────────────────────────────────────────────────────
  // Uniform radius dims on ANY radius change (uniform OR per-corner) because
  // the uniform input is the fall-back representation whenever per-corner
  // isn't expanded — hiding the dim on a per-corner change would miscommunicate
  // the forced-state delta.
  const opacityDimmed = dimmedProperties?.has('opacity') ?? false
  const visibilityDimmed = dimmedProperties?.has('visibility') ?? false
  const anyRadiusDimmed =
    dimmedProperties?.has('border-radius') ||
    dimmedProperties?.has('border-top-left-radius') ||
    dimmedProperties?.has('border-top-right-radius') ||
    dimmedProperties?.has('border-bottom-left-radius') ||
    dimmedProperties?.has('border-bottom-right-radius') ||
    false

  return (
    <div class="cortex-appearance-section" data-section-id="appearance">
      {/* ── Opacity ─────────────────────────────────── */}
      <div class={controlClass('opacity', opacityDimmed)}>
        <span class="cortex-appearance-section__icon" aria-hidden="true">
          <Blend size={14} />
        </span>
        <NumericInput
          value={values.opacity}
          unit="%"
          tooltip="Opacity"
          min={0}
          mixed={mixedProperties?.has('opacity')}
          onChange={handleOpacityChange}
          onScrub={handleOpacityScrub}
          onScrubEnd={handleOpacityScrubEnd}
        />
      </div>

      {/* ── Corner radius ───────────────────────────── */}
      <div class={controlClass('radius', anyRadiusDimmed)}>
        <div class="cortex-appearance-section__radius-row">
          {!perCorner && (
            <NumericInput
              value={values.borderRadius}
              unit="px"
              label="R"
              tooltip="Corner Radius"
              min={0}
              mixed={
                mixedProperties?.has('border-top-left-radius') ||
                mixedProperties?.has('border-top-right-radius') ||
                mixedProperties?.has('border-bottom-left-radius') ||
                mixedProperties?.has('border-bottom-right-radius')
              }
              onChange={handleRadiusChange}
              onScrub={handleRadiusScrub}
              onScrubEnd={handleRadiusScrubEnd}
            />
          )}
          <button
            class={`cortex-appearance-section__corner-toggle${perCorner ? ' cortex-appearance-section__corner-toggle--active' : ''}`}
            type="button"
            aria-pressed={perCorner ? 'true' : 'false'}
            aria-label={perCorner ? 'Uniform radius' : 'Per-corner radius'}
            data-tooltip={perCorner ? 'Uniform radius' : 'Per-corner radius'}
            onClick={handleToggleCorners}
          >
            <SquareDashed size={14} />
          </button>
        </div>
        {perCorner && (
          <div class="cortex-appearance-section__corners">
            <NumericInput
              value={values.borderTopLeftRadius}
              unit="px"
              label="TL"
              tooltip="Top Left Radius"
              min={0}
              mixed={mixedProperties?.has('border-top-left-radius')}
              {...cornerHandlers('border-top-left-radius')}
            />
            <NumericInput
              value={values.borderTopRightRadius}
              unit="px"
              label="TR"
              tooltip="Top Right Radius"
              min={0}
              mixed={mixedProperties?.has('border-top-right-radius')}
              {...cornerHandlers('border-top-right-radius')}
            />
            <NumericInput
              value={values.borderBottomRightRadius}
              unit="px"
              label="BR"
              tooltip="Bottom Right Radius"
              min={0}
              mixed={mixedProperties?.has('border-bottom-right-radius')}
              {...cornerHandlers('border-bottom-right-radius')}
            />
            <NumericInput
              value={values.borderBottomLeftRadius}
              unit="px"
              label="BL"
              tooltip="Bottom Left Radius"
              min={0}
              mixed={mixedProperties?.has('border-bottom-left-radius')}
              {...cornerHandlers('border-bottom-left-radius')}
            />
          </div>
        )}
      </div>

      {/* ── Visibility (eye toggle) ─────────────────── */}
      <div class={controlClass('visibility', visibilityDimmed)}>
        <button
          type="button"
          class={`cortex-appearance-section__visibility-toggle${isHidden ? ' cortex-appearance-section__visibility-toggle--hidden' : ''}`}
          aria-pressed={isHidden ? 'true' : 'false'}
          aria-label={isHidden ? 'Show element' : 'Hide element'}
          data-tooltip={isHidden ? 'Show element' : 'Hide element'}
          onClick={handleToggleVisibility}
        >
          {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
