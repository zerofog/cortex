import type { JSX } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { NumericInput } from '../controls/NumericInput.js'
import { ColorInput, parseColor, formatColor } from '../controls/ColorInput.js'
import { TokenChip } from '../controls/TokenChip.js'
import { IconButton } from '../controls/IconButton.js'
import { Eye, EyeOff, SquareDashed } from '../icons.js'

export type BorderChange = SectionChange

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
  onScrub?: (change: BorderChange) => void
  onScrubEnd?: (change: BorderChange) => void
  swatches?: string[]
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
  return {
    borderWidth: parseFloat(cs.borderWidth) || 0,
    borderTopWidth: parseFloat(cs.borderTopWidth) || 0,
    borderRightWidth: parseFloat(cs.borderRightWidth) || 0,
    borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
    borderLeftWidth: parseFloat(cs.borderLeftWidth) || 0,
    borderStyle: cs.borderStyle ?? 'none',
    borderColor: color,
    borderOpacity: alpha,
    visible: (cs.borderStyle ?? 'none') !== 'none',
  }
}

export function summarizeBorder(values: BorderValues): string {
  if (!values.visible || values.borderWidth === 0) return 'none'
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
  swatches,
  dimmedProperties,
  mixedProperties,
}: BorderSectionProps): JSX.Element {
  const [perSideOpen, setPerSideOpen] = useState(false)

  const parsed = useMemo(() => parseColor(values.borderColor), [values.borderColor])

  // ── Row 1: Color ──────────────────────────────────────────────────

  const handleColorChange = useCallback(
    (hex: string) => onChange({ property: 'border-color', value: hex }),
    [onChange],
  )

  const handleUnlink = useCallback(() => {
    onChange({ property: 'border-color', value: values.borderColor })
  }, [onChange, values.borderColor])

  const handleAlphaChange = useCallback(
    (alpha: number) => {
      onChange({ property: 'border-color', value: formatColor(parsed.hex, alpha) })
    },
    [onChange, parsed.hex],
  )

  // ── Row 1: Visibility toggle ──────────────────────────────────────

  const handleVisibilityToggle = useCallback(() => {
    if (values.visible) {
      onChange({ property: 'border-style', value: 'none' })
    } else {
      onChange({ property: 'border-style', value: 'solid' })
    }
  }, [onChange, values.visible])

  // ── Row 2: Width ──────────────────────────────────────────────────

  const handleWidthChange = useCallback(
    (v: number) => onChange({ property: 'border-width', value: `${v}px` }),
    [onChange],
  )
  const handleWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'border-width', value: `${v}px` }) },
    [onScrub],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'border-width', value: `${v}px` }) },
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
      {/* Row 1: Color + Opacity + Eye */}
      <div class={`cortex-border-section__color-row${isDimmed(dimmedProperties, 'border-color') ? ' cortex-control--dimmed' : ''}`}>
        {borderToken !== null ? (
          <TokenChip
            tokenName={borderToken}
            resolvedValue={values.borderColor}
            onUnlink={handleUnlink}
          />
        ) : (
          <ColorInput
            value={values.borderColor}
            onChange={handleColorChange}
            alpha={values.borderOpacity}
            onAlphaChange={handleAlphaChange}
            swatches={swatches}
            mixed={mixedProperties?.has('border-color')}
          />
        )}
        <IconButton
          icon={values.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          ariaLabel={values.visible ? 'Hide border' : 'Show border'}
          tooltip={values.visible ? 'Hide border' : 'Show border'}
          onClick={handleVisibilityToggle}
        />
      </div>

      {/* Row 2: Width + Per-side toggle */}
      <div class={`cortex-border-section__width-row${isDimmed(dimmedProperties, 'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width') ? ' cortex-control--dimmed' : ''}`}>
        <NumericInput
          value={values.borderWidth}
          unit="px"
          prefix={<SquareDashed size={14} />}
          tooltip="Border Width"
          min={0}
          mixed={mixedProperties?.has('border-width')}
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

      {/* Per-side expanded: 2×2 grid */}
      {perSideOpen && (
        <div class="cortex-border-section__per-side">
          <NumericInput
            value={values.borderTopWidth}
            unit="px"
            label="T"
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
            label="R"
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
            label="B"
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
            label="L"
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
