import type { JSX } from 'preact'
import { useState, useCallback, useMemo, useRef } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TokenChip, isColorLike } from '../controls/TokenChip.js'
import { ColorChipPicker } from '../controls/ColorChipPicker.js'
import { IconButton } from '../controls/IconButton.js'
import {
  Eye,
  EyeClosed,
  Minus,
  SquareDashed,
  SquareSideTop,
  SquareSideRight,
  SquareSideBottom,
  SquareSideLeft,
  SwatchBook,
} from '../icons.js'
import type { ColorChip } from '../../token-detector.js'

type BorderUtilityClass = `border-${string}`

export type BorderChange =
  | SectionChange
  | { kind: 'link-border-token'; chip: ColorChip; removeClass?: BorderUtilityClass }
  | {
    kind: 'unlink-border-token'
    removeClass: BorderUtilityClass
    inline: Array<{ property: string; value: string }>
  }

export interface BorderValues {
  borderWidth: number
  borderTopWidth: number
  borderRightWidth: number
  borderBottomWidth: number
  borderLeftWidth: number
  borderStyle: string
  borderColor: string
  borderOpacity: number
  visible: boolean
}

export interface BorderSectionProps {
  values: BorderValues
  /** Tailwind class name if detected (e.g. "border-blue-500"), null if raw value */
  borderToken: string | null
  onChange: (change: BorderChange) => void
  onScrub?: (change: SectionChange) => void
  onScrubEnd?: (change: SectionChange) => void
  /** When provided, renders a minus button at the row end that clears the border. */
  onRemove?: () => void
  swatches?: string[]
  colorChips?: ColorChip[]
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

/** Extract border-related values from a CSSStyleDeclaration. */
export function parseBorderValues(cs: CSSStyleDeclaration): BorderValues {
  const color = cs.borderColor ?? 'rgb(0, 0, 0)'
  // Parse alpha from rgba — e.g., "rgba(0, 0, 0, 0.5)" → 50
  // Only match rgba() with exactly 4 values to avoid capturing the blue channel from rgb()
  const alphaMatch = color.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
  const alpha = alphaMatch?.[1] ? Math.round(parseFloat(alphaMatch[1]) * 100) : 100
  const style = cs.borderStyle ?? 'none'
  return {
    borderWidth: parseFloat(cs.borderWidth) || 0,
    borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
    borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
    borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
    borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
    borderStyle: style,
    borderColor: color,
    borderOpacity: alpha,
    // `visible` is the RENDER bit — whether the border actually paints —
    // not the existence bit. `hidden` and `none` both paint nothing; the
    // eye toggle uses `hidden` so the border stays present (and the section
    // stays open) while invisible. Existence is owned by `borderWidth` and
    // surfaced to the panel via `summarizeBorder`.
    visible: style !== 'none' && style !== 'hidden',
  }
}

export function summarizeBorder(values: BorderValues): string {
  // Two signals determine existence:
  //
  // 1. borderStyle === 'hidden' → the user actively hid this border via the
  //    eye toggle. The border EXISTS but is invisible. Don't collapse the
  //    section. Note: per CSS spec §8.5.3, getComputedStyle zeroes
  //    border-width when border-style is 'none' or 'hidden', so we CANNOT
  //    rely on borderWidth alone to detect existence in this state — the
  //    spec forcibly sets it to 0 even though the user's specified width is
  //    non-zero. Checking style first dodges that trap.
  //
  // 2. borderWidth > 0 AND borderStyle is NOT 'hidden' → normal visible
  //    border with a painted width.
  //
  // Only the explicit minus button (which zeroes width AND leaves style as
  // 'solid' or 'none') should collapse the section.
  if (values.borderStyle === 'hidden') return 'hidden'
  if (values.borderWidth === 0) return 'none'
  return `${values.borderWidth}px ${values.borderStyle}`
}

/**
 * BorderSection v2 — color + opacity + visibility, width + per-side expand.
 *
 * Row 1: [swatch+hex] [opacity %] [eye toggle]
 * Row 2: [SquareDashed icon] [width px] [per-side toggle]
 * Per-side (expanded): 2×2 grid of T/R/B/L individual widths.
 *
 * Business logic: this replaces the previous v1 BorderSection that had
 * width/style/color rows plus radius controls. Radius is now owned by
 * AppearanceSection. The border style segmented control is replaced by
 * an eye toggle (none ↔ solid) since dashed/dotted are rare enough to
 * not warrant permanent UI. The `+` button that creates a border now
 * lives in the SectionGroup headerAction slot in Panel.tsx.
 */
export function BorderSection({
  values,
  borderToken,
  onChange,
  onScrub,
  onScrubEnd,
  onRemove,
  swatches,
  colorChips,
  dimmedProperties,
  mixedProperties,
}: BorderSectionProps): JSX.Element {
  const [perSideOpen, setPerSideOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const tokenBodyRef = useRef<HTMLButtonElement>(null)
  const tokenButtonRef = useRef<HTMLButtonElement>(null)

  const parsed = useMemo(() => parseColor(values.borderColor), [values.borderColor])
  const borderTokenName = borderToken?.startsWith('border-') ? borderToken.slice(7) : null
  const borderRemoveClass = borderToken?.startsWith('border-')
    ? borderToken as BorderUtilityClass
    : undefined

  // ── Row 1: Color ──────────────────────────────────────────────────

  const handleColorChange = useCallback(
    (hex: string) => onChange({ property: 'border-color', value: hex }),
    [onChange],
  )

  const handleColorScrub = useCallback(
    (hex: string) => onScrub?.({ property: 'border-color', value: hex }),
    [onScrub],
  )

  const handleColorScrubEnd = useCallback(
    (hex: string) => onScrubEnd?.({ property: 'border-color', value: hex }),
    [onScrubEnd],
  )

  const handleUnlink = useCallback(() => {
    if (borderRemoveClass === undefined) return
    onChange({
      kind: 'unlink-border-token',
      removeClass: borderRemoveClass,
      inline: [{ property: 'border-color', value: values.borderColor }],
    })
  }, [onChange, values.borderColor, borderRemoveClass])

  const handleOpenPicker = useCallback(() => {
    setPickerOpen((open) => !open)
  }, [])

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handlePickToken = useCallback(
    (chip: ColorChip) => {
      onChange({
        kind: 'link-border-token',
        chip,
        removeClass: borderRemoveClass,
      })
      setPickerOpen(false)
    },
    [onChange, borderRemoveClass],
  )

  const handleAlphaChange = useCallback(
    (alpha: number) => {
      onChange({ property: 'border-color', value: formatColor(parsed.hex, alpha) })
    },
    [onChange, parsed.hex],
  )

  // ── Row 1: Visibility toggle ──────────────────────────────────────

  const handleVisibilityToggle = useCallback(() => {
    // CSS spec §8.5.3: when border-style is 'none' or 'hidden', the UA
    // forcibly zeroes the computed border-width regardless of the specified
    // value. If we just flip style to 'hidden', getComputedStyle will
    // report width=0 on the next render, summarizeBorder will return 'none',
    // and the section will collapse — the user sees "hide" as "delete".
    //
    // Workaround: snapshot all 5 width properties into the override manager
    // BEFORE the style transition, so Panel's useMemo can recover the
    // specified widths from the override store (see the `border-*-width`
    // override post-process block in Panel.tsx, modeled on the width/height
    // pattern). The 6 synchronous onChange calls all land in the same
    // scrubPreviousRef batch and commit as a single undo entry via the
    // microtask deferred commit in applyOverride.
    //
    // `hidden` (rather than `none`) is chosen because it preserves the box
    // model identically for non-table elements — no reflow when toggling.
    // `solid` is the re-show default since BorderSection doesn't expose
    // dashed/dotted in the v2 design.
    if (values.visible) {
      onChange({ property: 'border-width', value: `${values.borderWidth}px` })
      onChange({ property: 'border-top-width', value: `${values.borderTopWidth}px` })
      onChange({ property: 'border-right-width', value: `${values.borderRightWidth}px` })
      onChange({ property: 'border-bottom-width', value: `${values.borderBottomWidth}px` })
      onChange({ property: 'border-left-width', value: `${values.borderLeftWidth}px` })
      onChange({ property: 'border-style', value: 'hidden' })
    } else {
      onChange({ property: 'border-style', value: 'solid' })
    }
  }, [
    onChange,
    values.visible,
    values.borderWidth,
    values.borderTopWidth,
    values.borderRightWidth,
    values.borderBottomWidth,
    values.borderLeftWidth,
  ])

  // ── Row 2: Width ──────────────────────────────────────────────────
  // The uniform width input edits ALL 5 width properties (shorthand + 4
  // per-side) in one gesture. Without this, the shorthand alone would lose
  // the cascade to orphan per-side overrides that sit later in the
  // override manager's Map (longhand declared after shorthand wins — see
  // the setBorderWidths comment in Panel.tsx for the full explanation).
  // The 5 synchronous calls batch into one undo entry via microtask commit.

  const handleWidthChange = useCallback(
    (v: number) => {
      const val = `${v}px`
      onChange({ property: 'border-width', value: val })
      onChange({ property: 'border-top-width', value: val })
      onChange({ property: 'border-right-width', value: val })
      onChange({ property: 'border-bottom-width', value: val })
      onChange({ property: 'border-left-width', value: val })
    },
    [onChange],
  )
  const handleWidthScrub = useCallback(
    (v: number) => {
      if (!onScrub) return
      const val = `${v}px`
      onScrub({ property: 'border-width', value: val })
      onScrub({ property: 'border-top-width', value: val })
      onScrub({ property: 'border-right-width', value: val })
      onScrub({ property: 'border-bottom-width', value: val })
      onScrub({ property: 'border-left-width', value: val })
    },
    [onScrub],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => {
      if (!onScrubEnd) return
      const val = `${v}px`
      onScrubEnd({ property: 'border-width', value: val })
      onScrubEnd({ property: 'border-top-width', value: val })
      onScrubEnd({ property: 'border-right-width', value: val })
      onScrubEnd({ property: 'border-bottom-width', value: val })
      onScrubEnd({ property: 'border-left-width', value: val })
    },
    [onScrubEnd],
  )

  // ── Per-side toggle ───────────────────────────────────────────────

  const handlePerSideToggle = useCallback(() => {
    setPerSideOpen((v) => !v)
  }, [])

  // ── Per-side width handlers ───────────────────────────────────────

  const handleTopWidth = useCallback(
    (v: number) => onChange({ property: 'border-top-width', value: `${v}px` }),
    [onChange],
  )
  const handleRightWidth = useCallback(
    (v: number) => onChange({ property: 'border-right-width', value: `${v}px` }),
    [onChange],
  )
  const handleBottomWidth = useCallback(
    (v: number) => onChange({ property: 'border-bottom-width', value: `${v}px` }),
    [onChange],
  )
  const handleLeftWidth = useCallback(
    (v: number) => onChange({ property: 'border-left-width', value: `${v}px` }),
    [onChange],
  )

  const handleTopWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-top-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleRightWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-right-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleBottomWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-bottom-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleLeftWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-left-width', value: `${v}px` }) },
    [onScrub],
  )

  const handleTopWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-top-width', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleRightWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-right-width', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleBottomWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-bottom-width', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleLeftWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-left-width', value: `${v}px` }) },
    [onScrubEnd],
  )

  return (
    <div class="cortex-border-section" data-section-id="border">
      {/* Row 1: Color + Opacity + Eye — eye lives inside ColorInput's trailing
          slot when in raw-value mode so all four items share one flex layout
          (no overflow-then-overlap from a separately-rendered IconButton).
          For TokenChip mode, eye renders as a sibling — TokenChip has no
          internal NumericInput to overflow, so the simpler composition is fine. */}
      <div class={`cortex-border-section__color-row${isDimmed(dimmedProperties, 'border-color') ? ' cortex-control--dimmed' : ''}`}>
        {(() => {
          const eyeButton = (
            <IconButton
              icon={values.visible ? <Eye size={14} /> : <EyeClosed size={14} />}
              ariaLabel={values.visible ? 'Hide border' : 'Show border'}
              tooltip={values.visible ? 'Hide border' : 'Show border'}
              onClick={handleVisibilityToggle}
            />
          )
          const removeButton = onRemove ? (
            <IconButton
              icon={<Minus size={14} />}
              ariaLabel="Remove border"
              tooltip="Remove border"
              onClick={onRemove}
            />
          ) : null
          const tokenButton = (
            <button
              ref={tokenButtonRef}
              type="button"
              class="cortex-icon-button"
              aria-label="Link to color chip"
              data-tooltip="Link to color chip"
              onClick={handleOpenPicker}
            >
              <SwatchBook size={14} />
            </button>
          )
          const picker = pickerOpen ? (
            <ColorChipPicker
              chips={colorChips ?? []}
              currentName={borderTokenName}
              onPick={handlePickToken}
              onDismiss={handleClosePicker}
              triggerRefs={[tokenBodyRef, tokenButtonRef]}
            />
          ) : null
          // [eye][minus]: eye first (non-destructive), minus at the far end
          // (destructive, click last). Rendered as a fragment so both share
          // the single `trailing` flex slot in ColorInput — same layout
          // authority the Background section uses for its remove button.
          const trailing = (
            <>
              {eyeButton}
              {removeButton}
            </>
          )
          return borderToken !== null ? (
            <div class="cortex-border-section__token-row">
              <TokenChip
                tokenName={borderToken}
                swatch={
                  isColorLike(values.borderColor)
                    ? { kind: 'color', value: values.borderColor }
                    : { kind: 'pattern' }
                }
                onBodyClick={handleOpenPicker}
                onUnlink={handleUnlink}
                ariaLabel={`Swap color chip (currently ${borderToken})`}
                bodyRef={tokenBodyRef}
              />
              {trailing}
              {picker}
            </div>
          ) : (
            <div class="cortex-border-section__token-row cortex-border-section__token-row--raw">
              <ColorInput
                value={values.borderColor}
                onChange={handleColorChange}
                onScrub={onScrub ? handleColorScrub : undefined}
                onScrubEnd={onScrubEnd ? handleColorScrubEnd : undefined}
                alpha={values.borderOpacity}
                onAlphaChange={handleAlphaChange}
                swatches={swatches}
                mixed={mixedProperties?.has('border-color')}
                trailing={
                  <>
                    {tokenButton}
                    {trailing}
                  </>
                }
              />
              {picker}
            </div>
          )
        })()}
      </div>

      {/* Row 2: Width + Per-side toggle */}
      {/* Same pattern as AppearanceSection's uniform radius indeterminate
          state: when the 4 per-side widths disagree on a SINGLE element,
          the uniform input shows Mixed. This catches the case where
          getComputedStyle returns e.g. "5px 1px 1px 1px" and parseFloat
          silently captures only the leading number, misrepresenting state. */}
      <div class={`cortex-border-section__width-row${isDimmed(dimmedProperties, 'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width') ? ' cortex-control--dimmed' : ''}`}>
        <NumericInput
          value={values.borderWidth}
          unit="px"
          prefix={<SquareDashed size={14} />}
          tooltip="Border Width"
          min={0}
          mixed={
            mixedProperties?.has('border-width') ||
            values.borderTopWidth !== values.borderRightWidth ||
            values.borderTopWidth !== values.borderBottomWidth ||
            values.borderTopWidth !== values.borderLeftWidth
          }
          onChange={handleWidthChange}
          onScrub={handleWidthScrub}
          onScrubEnd={handleWidthScrubEnd}
        />
        <IconButton
          icon={<SquareDashed size={14} />}
          ariaLabel={perSideOpen ? 'Collapse per-side widths' : 'Expand per-side widths'}
          tooltip={perSideOpen ? 'Collapse per-side widths' : 'Expand per-side widths'}
          active={perSideOpen}
          onClick={handlePerSideToggle}
        />
      </div>

      {/* Per-side expanded: 2×2 grid. Each input's `label="T"/"R"/"B"/"L"`
          was replaced by a Lucide-style per-side icon in the `prefix` slot,
          matching the session 6 Appearance per-corner pattern. Tooltip still
          names the side for screen readers. */}
      {perSideOpen && (
        <div class="cortex-border-section__per-side">
          <NumericInput
            value={values.borderTopWidth}
            unit="px"
            prefix={<SquareSideTop size={14} />}
            tooltip="Border Top Width"
            min={0}
            mixed={mixedProperties?.has('border-top-width')}
            onChange={handleTopWidth}
            onScrub={handleTopWidthScrub}
            onScrubEnd={handleTopWidthScrubEnd}
          />
          <NumericInput
            value={values.borderRightWidth}
            unit="px"
            prefix={<SquareSideRight size={14} />}
            tooltip="Border Right Width"
            min={0}
            mixed={mixedProperties?.has('border-right-width')}
            onChange={handleRightWidth}
            onScrub={handleRightWidthScrub}
            onScrubEnd={handleRightWidthScrubEnd}
          />
          <NumericInput
            value={values.borderBottomWidth}
            unit="px"
            prefix={<SquareSideBottom size={14} />}
            tooltip="Border Bottom Width"
            min={0}
            mixed={mixedProperties?.has('border-bottom-width')}
            onChange={handleBottomWidth}
            onScrub={handleBottomWidthScrub}
            onScrubEnd={handleBottomWidthScrubEnd}
          />
          <NumericInput
            value={values.borderLeftWidth}
            unit="px"
            prefix={<SquareSideLeft size={14} />}
            tooltip="Border Left Width"
            min={0}
            mixed={mixedProperties?.has('border-left-width')}
            onChange={handleLeftWidth}
            onScrub={handleLeftWidthScrub}
            onScrubEnd={handleLeftWidthScrubEnd}
          />
        </div>
      )}
    </div>
  )
}
