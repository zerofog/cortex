import type { JSX } from 'preact'
import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { Dropdown } from '../controls/Dropdown.js'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TextComponentPill } from '../controls/TextComponentPill.js'
import { ColorChipPill } from '../controls/ColorChipPill.js'
import { TextComponentPicker } from '../controls/TextComponentPicker.js'
import { ColorChipPicker } from '../controls/ColorChipPicker.js'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUpFromLine,
  AlignCenterVertical,
  ArrowDownToLine,
  LineHeightIcon,
  LetterSpacingIcon,
  Type,
  SwatchBook,
} from '../icons.js'
import type { TextComponent } from '../../../core/text-components.js'
import type { ColorChip } from '../../token-detector.js'
import { detectTextComponent, detectColorChip } from '../../token-detector.js'

/** A class name known to target a Tailwind v4 `text-*` utility — used for
 *  bundle classes (`text-body-md` from `@theme { --text-body-md: ... }`) and
 *  color chip classes (`text-brand-500` from `@theme { --color-brand-500 }`).
 *
 *  Enforced at compile time so the dispatcher sites cannot regress to the
 *  bare-name form (Task 17 Bug 2): passing `'body-md'` where the Tailwind
 *  utility is `.text-body-md` silently leaves the class with no CSS rule. */
type TextUtilityClass = `text-${string}`

/**
 * TypographyChange — the discriminated union the section emits to the Panel.
 *
 * - Plain {property, value} (SectionChange) for font-family, font-weight,
 *   font-size, line-height, letter-spacing, text-align, and color scrubs.
 * - link/unlink variants carry enough data for the Panel to dispatch the
 *   combination of classOp + inline-style edits in one atomic gesture. The
 *   removeClass fields are `text-${string}` so the compiler blocks a
 *   regression to bare bundle names.
 * - vertical-align is special: the Panel expands a single value into three
 *   property edits (display, flex-direction, align-items) so a single click
 *   lands as one undo entry.
 */
export type TypographyChange =
  | SectionChange
  | { kind: 'link-text-component'; component: TextComponent; removeClass?: TextUtilityClass }
  | {
      kind: 'unlink-text-component'
      removeClass: TextUtilityClass
      inline: Array<{ property: string; value: string }>
    }
  | { kind: 'link-color-chip'; chip: ColorChip; removeClass?: TextUtilityClass }
  | { kind: 'unlink-color-chip'; removeClass: TextUtilityClass; inline: Array<{ property: string; value: string }> }
  | { kind: 'vertical-align'; value: 'flex-start' | 'center' | 'flex-end' }

export interface TypographyValues {
  fontFamily: string
  fontSize: number
  fontWeight: string
  lineHeight: number
  letterSpacing: number
  textAlign: string
  /** Populated only when display is flex/grid AND flex-direction is column,
   *  reflecting the align-items value. Empty string otherwise — the
   *  vertical-align SegmentedControl renders unselected in that case. */
  verticalAlign: string
  color: string
}

export interface TypographySectionProps {
  values: TypographyValues
  availableWeights: string[]
  /** Full className attribute of the selected element, used for bundle/chip detection. */
  className: string
  onChange: (change: TypographyChange) => void
  onScrub?: (change: SectionChange) => void
  onScrubEnd?: (change: SectionChange) => void
  swatches?: string[]
  colorChips?: ColorChip[]
  textComponents?: TextComponent[]
  dimmedProperties?: Set<string>
  mixedProperties?: Set<string>
}

/** Extract typography values from a CSSStyleDeclaration (extended for verticalAlign). */
export function parseTypographyValues(cs: CSSStyleDeclaration): TypographyValues {
  const fontSize = parseFloat(cs.fontSize) || 16
  const display = cs.display ?? ''
  const flexDir = cs.flexDirection ?? ''
  const isFlexColumn =
    (display === 'flex' || display === 'grid' || display === 'inline-flex') && flexDir === 'column'
  return {
    fontFamily: cs.fontFamily ?? '',
    fontSize,
    fontWeight: cs.fontWeight ?? '400',
    lineHeight:
      cs.lineHeight === 'normal'
        ? 1.5
        : Math.round(((parseFloat(cs.lineHeight) / fontSize) || 1.5) * 100) / 100,
    letterSpacing:
      cs.letterSpacing === 'normal' ? 0 : Math.round((parseFloat(cs.letterSpacing) || 0) * 100) / 100,
    textAlign: cs.textAlign ?? 'left',
    verticalAlign: isFlexColumn ? cs.alignItems ?? '' : '',
    color: cs.color ?? 'rgb(0, 0, 0)',
  }
}

/** Enumerate weights available for a font-family via document.fonts. */
export function getWeightsForFamily(family: string): string[] {
  if (!document.fonts?.[Symbol.iterator]) return ['400']
  const weights = new Set<string>()
  for (const face of document.fonts) {
    const f = face as FontFace
    const faceName = stripCSSQuotes(f.family)
    if (faceName === family) {
      const w = f.weight
      if (w.includes(' ')) {
        const parts = w.split(' ').map(Number)
        const min = parts[0] ?? 400
        const max = parts[1] ?? 400
        for (const std of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
          if (std >= min && std <= max) weights.add(String(std))
        }
      } else {
        weights.add(w)
      }
    }
  }
  return weights.size > 0
    ? [...weights].sort((a, b) => Number(a) - Number(b))
    : ['100', '200', '300', '400', '500', '600', '700', '800', '900']
}

const WEIGHT_LABELS: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semibold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
}

/** Horizontal alignment: left/center/right only — no justify (per design decisions). */
const HORIZONTAL_ALIGN_OPTIONS = [
  { value: 'left', icon: <AlignLeft size={14} />, title: 'Left' },
  { value: 'center', icon: <AlignCenter size={14} />, title: 'Center' },
  { value: 'right', icon: <AlignRight size={14} />, title: 'Right' },
]

/** Vertical alignment: maps to align-items when element becomes a flex column. */
const VERTICAL_ALIGN_OPTIONS = [
  { value: 'flex-start', icon: <ArrowUpFromLine size={14} />, title: 'Top' },
  { value: 'center', icon: <AlignCenterVertical size={14} />, title: 'Middle' },
  { value: 'flex-end', icon: <ArrowDownToLine size={14} />, title: 'Bottom' },
]

/** Strip surrounding quotes from CSS values like font-family. */
export function stripCSSQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

/** Wrap a font-family name in double quotes if it contains whitespace. */
function quoteFontFamily(family: string): string {
  const stripped = stripCSSQuotes(family)
  return /\s/.test(stripped) ? `"${stripped}"` : stripped
}

/** CSS properties that a linked text component owns. Single source of
 *  truth: `buildUnlinkTypography` iterates this list to produce the inline
 *  preservation edits on unlink, and Panel's `link-text-component` handler
 *  iterates it to clear any stale !important browser overrides so the
 *  newly-linked class's cascade can take effect (H7 part A).
 *
 *  Marked `as const` so each element is a string literal — the Record
 *  type in buildUnlinkTypography requires every property here to have a
 *  value-derivation case, giving a compile-time consistency guarantee. */
export const TYPOGRAPHY_LINKED_PROPERTIES = [
  'font-family',
  'font-weight',
  'font-size',
  'line-height',
  'letter-spacing',
] as const

/** CSS properties a linked color chip owns. Same single-source-of-truth
 *  role as TYPOGRAPHY_LINKED_PROPERTIES. */
export const COLOR_LINKED_PROPERTIES = ['color'] as const

/** Build the inline property edits that preserve the rendered look when
 *  unlinking typography. Iterates TYPOGRAPHY_LINKED_PROPERTIES and
 *  derives each property's preserved value from computed styles. */
function buildUnlinkTypography(
  values: TypographyValues,
): Array<{ property: string; value: string }> {
  const valueFor: Record<typeof TYPOGRAPHY_LINKED_PROPERTIES[number], string> = {
    'font-family': quoteFontFamily(values.fontFamily.split(',')[0]?.trim() ?? values.fontFamily),
    'font-weight': values.fontWeight,
    'font-size': `${values.fontSize}px`,
    'line-height': String(values.lineHeight),
    'letter-spacing': `${values.letterSpacing}px`,
  }
  return TYPOGRAPHY_LINKED_PROPERTIES.map((property) => ({ property, value: valueFor[property] }))
}

/** Build the inline edits that preserve color when unlinking a color chip. */
function buildUnlinkColor(values: TypographyValues): Array<{ property: string; value: string }> {
  const valueFor: Record<typeof COLOR_LINKED_PROPERTIES[number], string> = {
    color: values.color,
  }
  return COLOR_LINKED_PROPERTIES.map((property) => ({ property, value: valueFor[property] }))
}

export function TypographySection({
  values,
  availableWeights,
  className,
  onChange,
  onScrub,
  onScrubEnd,
  swatches,
  colorChips,
  textComponents,
  dimmedProperties,
  mixedProperties,
}: TypographySectionProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState<null | 'text' | 'color'>(null)

  // Per-group linked detection — runs every render since className changes with selection.
  const bundle = useMemo(
    () => detectTextComponent(className, textComponents ?? []),
    [className, textComponents],
  )
  const chip = useMemo(() => detectColorChip(className, colorChips ?? []), [className, colorChips])
  const typographyLinked = bundle !== null
  const colorLinked = chip !== null

  // Derived dropdown options.
  const weightOptions = useMemo(() => {
    const opts = availableWeights.map((w) => ({
      value: w,
      label: WEIGHT_LABELS[w] ? `${w} - ${WEIGHT_LABELS[w]}` : w,
    }))
    if (!availableWeights.includes(values.fontWeight)) {
      opts.push({
        value: values.fontWeight,
        label: WEIGHT_LABELS[values.fontWeight]
          ? `${values.fontWeight} - ${WEIGHT_LABELS[values.fontWeight]}`
          : values.fontWeight,
      })
    }
    return opts
  }, [availableWeights, values.fontWeight])

  const fontFamilyOptions = useMemo(() => {
    const family = stripCSSQuotes(values.fontFamily.split(',')[0]?.trim() ?? '')
    return [{ value: family, label: family }]
  }, [values.fontFamily])

  const colorParsed = parseColor(values.color)

  // ── Property-keyed handlers (generator-produced) ──────────────────
  // Q1 from eng review: most property-keyed handlers share the shape
  // `(v) => onChange({property, value: format(v)})`. The generator collapses
  // them so adding a new property-keyed control is a one-line memo.
  const makePropHandler = useCallback(
    <V extends string | number>(property: string, format: (v: V) => string = (v) => String(v)) =>
      (v: V) =>
        onChange({ property, value: format(v) }),
    [onChange],
  )

  const makeScrubHandler = useCallback(
    <V extends string | number>(
      callback: ((c: SectionChange) => void) | undefined,
      property: string,
      format: (v: V) => string = (v) => String(v),
    ) =>
      (v: V) => {
        if (callback) callback({ property, value: format(v) })
      },
    [],
  )

  const handleFamilyChange = useMemo(() => makePropHandler<string>('font-family'), [makePropHandler])
  const handleWeightChange = useMemo(() => makePropHandler<string>('font-weight'), [makePropHandler])
  const handleFontSizeChange = useMemo(
    () => makePropHandler<number>('font-size', (v) => `${v}px`),
    [makePropHandler],
  )
  const handleFontSizeScrub = useMemo(
    () => makeScrubHandler<number>(onScrub, 'font-size', (v) => `${v}px`),
    [makeScrubHandler, onScrub],
  )
  const handleFontSizeScrubEnd = useMemo(
    () => makeScrubHandler<number>(onScrubEnd, 'font-size', (v) => `${v}px`),
    [makeScrubHandler, onScrubEnd],
  )
  const handleLineHeightChange = useMemo(
    () => makePropHandler<number>('line-height'),
    [makePropHandler],
  )
  const handleLineHeightScrub = useMemo(
    () => makeScrubHandler<number>(onScrub, 'line-height'),
    [makeScrubHandler, onScrub],
  )
  const handleLineHeightScrubEnd = useMemo(
    () => makeScrubHandler<number>(onScrubEnd, 'line-height'),
    [makeScrubHandler, onScrubEnd],
  )
  const handleLetterSpacingChange = useMemo(
    () => makePropHandler<number>('letter-spacing', (v) => `${v}px`),
    [makePropHandler],
  )
  const handleLetterSpacingScrub = useMemo(
    () => makeScrubHandler<number>(onScrub, 'letter-spacing', (v) => `${v}px`),
    [makeScrubHandler, onScrub],
  )
  const handleLetterSpacingScrubEnd = useMemo(
    () => makeScrubHandler<number>(onScrubEnd, 'letter-spacing', (v) => `${v}px`),
    [makeScrubHandler, onScrubEnd],
  )
  const handleHorizontalAlignChange = useMemo(
    () => makePropHandler<string>('text-align'),
    [makePropHandler],
  )
  const handleColorChange = useMemo(() => makePropHandler<string>('color'), [makePropHandler])

  // ── Bespoke handlers (don't fit the generator shape) ─────────────
  const handleColorAlphaChange = useCallback(
    (alpha: number) => onChange({ property: 'color', value: formatColor(colorParsed.hex, alpha) }),
    [onChange, colorParsed.hex],
  )

  const handleVerticalAlignChange = useCallback(
    (v: string) => {
      if (v !== 'flex-start' && v !== 'center' && v !== 'flex-end') return
      onChange({ kind: 'vertical-align', value: v })
    },
    [onChange],
  )

  // Refs for picker trigger elements — passed to the pickers so
  // useOutsideDismiss treats them as part of the popover boundary. Without
  // this, mousedown on the trigger dismisses the picker just before click
  // re-opens it, and the picker appears stuck open.
  const typographyTriggerPillRef = useRef<HTMLButtonElement>(null)
  const typographyTriggerTButtonRef = useRef<HTMLButtonElement>(null)
  const colorTriggerPillRef = useRef<HTMLButtonElement>(null)
  const colorTriggerSwatchButtonRef = useRef<HTMLButtonElement>(null)
  // Memoized trigger arrays. Both pill + button refs are passed; only the
  // active one will have a live `.current` at event time because the
  // linked/unlinked states are mutually exclusive — the hook reads
  // `.current` at dismissal-check time and skips nulls.
  const typographyTriggerRefs = useMemo(
    () => [typographyTriggerPillRef, typographyTriggerTButtonRef],
    [],
  )
  const colorTriggerRefs = useMemo(
    () => [colorTriggerPillRef, colorTriggerSwatchButtonRef],
    [],
  )

  // Typography group link/unlink.
  // Toggle semantics: if the picker is already open for this group, close
  // it. Otherwise open it. The useOutsideDismiss trigger-ref bypass blocks
  // the mousedown-dismiss before this click fires, so the toggle here is
  // the single source of truth for open/close state.
  const handleTypographyOpenPicker = useCallback(
    () => setPickerOpen(prev => (prev === 'text' ? null : 'text')),
    [],
  )
  const handleTypographyClosePicker = useCallback(() => setPickerOpen(null), [])
  const handleTypographyUnlink = useCallback(() => {
    if (!bundle) return
    onChange({
      kind: 'unlink-text-component',
      removeClass: `text-${bundle.name}`,
      inline: buildUnlinkTypography(values),
    })
  }, [bundle, onChange, values])
  const handleTypographyPick = useCallback(
    (picked: TextComponent) => {
      onChange({
        kind: 'link-text-component',
        component: picked,
        removeClass: bundle ? `text-${bundle.name}` : undefined,
      })
      setPickerOpen(null)
    },
    [bundle, onChange],
  )

  // Color group link/unlink.
  const handleColorOpenPicker = useCallback(
    () => setPickerOpen(prev => (prev === 'color' ? null : 'color')),
    [],
  )
  const handleColorClosePicker = useCallback(() => setPickerOpen(null), [])
  const handleColorUnlink = useCallback(() => {
    if (!chip) return
    onChange({
      kind: 'unlink-color-chip',
      removeClass: `text-${chip.name}`,
      inline: buildUnlinkColor(values),
    })
  }, [chip, onChange, values])
  const handleColorPick = useCallback(
    (picked: ColorChip) => {
      onChange({
        kind: 'link-color-chip',
        chip: picked,
        removeClass: chip ? `text-${chip.name}` : undefined,
      })
      setPickerOpen(null)
    },
    [chip, onChange],
  )

  return (
    <div class="cortex-typography-section" data-section-id="type">
      {/* ═══ Typography group ═══ */}
      {typographyLinked ? (
        <div class="cortex-typography-section__row">
          <TextComponentPill
            tokenName={bundle.name}
            onSwap={handleTypographyOpenPicker}
            onUnlink={handleTypographyUnlink}
            bodyRef={typographyTriggerPillRef}
          />
          {pickerOpen === 'text' && (
            <TextComponentPicker
              components={textComponents ?? []}
              currentName={bundle.name}
              onPick={handleTypographyPick}
              onDismiss={handleTypographyClosePicker}
              triggerRefs={typographyTriggerRefs}
            />
          )}
        </div>
      ) : (
        <>
          <div
            class={`cortex-typography-section__row cortex-typography-section__row--with-t${isDimmed(dimmedProperties, 'font-family') ? ' cortex-control--dimmed' : ''}`}
          >
            <Dropdown
              options={fontFamilyOptions}
              value={fontFamilyOptions[0]?.value ?? ''}
              onChange={handleFamilyChange}
            />
            <button
              ref={typographyTriggerTButtonRef}
              type="button"
              class="cortex-typography-section__t-button"
              onClick={handleTypographyOpenPicker}
              aria-label="Link to text component"
            >
              <Type size={16} />
            </button>
            {pickerOpen === 'text' && (
              <TextComponentPicker
                components={textComponents ?? []}
                currentName={null}
                onPick={handleTypographyPick}
                onDismiss={handleTypographyClosePicker}
                triggerRefs={typographyTriggerRefs}
              />
            )}
          </div>
          <div
            class={`cortex-typography-section__row${isDimmed(dimmedProperties, 'font-weight', 'font-size') ? ' cortex-control--dimmed' : ''}`}
          >
            <div class="cortex-typography-section__field">
              <Dropdown
                options={weightOptions}
                value={values.fontWeight}
                onChange={handleWeightChange}
              />
            </div>
            <div class="cortex-typography-section__field">
              <NumericInput
                value={values.fontSize}
                unit="px"
                tooltip="Font Size"
                min={1}
                mixed={mixedProperties?.has('font-size')}
                onChange={handleFontSizeChange}
                onScrub={handleFontSizeScrub}
                onScrubEnd={handleFontSizeScrubEnd}
              />
            </div>
          </div>
          <div
            class={`cortex-typography-section__row${isDimmed(dimmedProperties, 'line-height', 'letter-spacing') ? ' cortex-control--dimmed' : ''}`}
          >
            <div class="cortex-typography-section__field">
              <NumericInput
                value={values.lineHeight}
                prefix={<LineHeightIcon size={12} />}
                tooltip="Line Height"
                mixed={mixedProperties?.has('line-height')}
                onChange={handleLineHeightChange}
                onScrub={handleLineHeightScrub}
                onScrubEnd={handleLineHeightScrubEnd}
              />
            </div>
            <div class="cortex-typography-section__field">
              <NumericInput
                value={values.letterSpacing}
                unit="px"
                prefix={<LetterSpacingIcon size={12} />}
                tooltip="Letter Spacing"
                mixed={mixedProperties?.has('letter-spacing')}
                onChange={handleLetterSpacingChange}
                onScrub={handleLetterSpacingScrub}
                onScrubEnd={handleLetterSpacingScrubEnd}
              />
            </div>
          </div>
        </>
      )}

      {/* ═══ Color group ═══ */}
      {colorLinked ? (
        <div class="cortex-typography-section__row">
          <ColorChipPill
            tokenName={`text-${chip.name}`}
            hex={chip.hex}
            onSwap={handleColorOpenPicker}
            onUnlink={handleColorUnlink}
            bodyRef={colorTriggerPillRef}
          />
          {pickerOpen === 'color' && (
            <ColorChipPicker
              chips={colorChips ?? []}
              currentName={chip.name}
              onPick={handleColorPick}
              onDismiss={handleColorClosePicker}
              triggerRefs={colorTriggerRefs}
            />
          )}
        </div>
      ) : (
        <div
          class={`cortex-typography-section__row cortex-typography-section__row--with-swatch${isDimmed(dimmedProperties, 'color') ? ' cortex-control--dimmed' : ''}`}
        >
          <ColorInput
            value={values.color}
            onChange={handleColorChange}
            alpha={colorParsed.alpha}
            onAlphaChange={handleColorAlphaChange}
            swatches={swatches}
            mixed={mixedProperties?.has('color')}
          />
          <button
            ref={colorTriggerSwatchButtonRef}
            type="button"
            class="cortex-typography-section__swatchbook-button"
            onClick={handleColorOpenPicker}
            aria-label="Link to color chip"
          >
            <SwatchBook size={16} />
          </button>
          {pickerOpen === 'color' && (
            <ColorChipPicker
              chips={colorChips ?? []}
              currentName={null}
              onPick={handleColorPick}
              onDismiss={handleColorClosePicker}
              triggerRefs={colorTriggerRefs}
            />
          )}
        </div>
      )}

      {/* ═══ Alignment row (always shown) ═══ */}
      {/* Vertical SegmentedControl deferred — align-items/justify-content
       * semantics needs a design pass and a defined-height story before it
       * can ship. Horizontal stays. */}
      <div class="cortex-typography-section__align-row">
        <SegmentedControl
          options={HORIZONTAL_ALIGN_OPTIONS}
          value={values.textAlign}
          onChange={handleHorizontalAlignChange}
          size="sm"
        />
      </div>
    </div>
  )
}
