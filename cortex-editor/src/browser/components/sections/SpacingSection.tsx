import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'

export interface SpacingValues {
  top: number
  right: number
  bottom: number
  left: number
}

export interface GapValues {
  row: number
  column: number
}

export interface SpacingChange {
  property: string
  value: number
}

export interface SpacingSectionProps {
  padding: SpacingValues
  margin: SpacingValues
  gap: GapValues
  isFlexOrGrid?: boolean
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
}

function SpacingGroup({
  label,
  values,
  prefix,
  allowNegative,
  expanded,
  onToggle,
  onChange,
  onScrub,
  onScrubEnd,
}: {
  label: string
  values: SpacingValues
  prefix: 'padding' | 'margin'
  allowNegative: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
}): JSX.Element {
  const makeHandler = useCallback(
    (cb?: (change: SpacingChange) => void) =>
      (sides: string[], value: number) => {
        if (!cb) return
        for (const side of sides) cb({ property: `${prefix}-${side}`, value })
      },
    [prefix],
  )

  const handleChange = makeHandler(onChange)
  const handleScrub = makeHandler(onScrub)
  const handleScrubEnd = makeHandler(onScrubEnd)

  const horizontal = values.left === values.right ? values.left : null
  const vertical = values.top === values.bottom ? values.top : null

  if (expanded) {
    return (
      <div class="cortex-spacing-group" data-section={prefix}>
        <div class="cortex-spacing-group__header">
          <span class="cortex-section-label">{label}</span>
          <button
            class="cortex-spacing-group__toggle"
            data-action={`toggle-${prefix}`}
            data-tooltip="Switch to 2-axis mode"
            aria-label="Switch to 2-axis mode"
            onClick={onToggle}
          >
            &#8862;
          </button>
        </div>
        <div class="cortex-spacing-group__grid">
          <NumericInput value={values.top} unit="px" label="T" tooltip="Top" min={allowNegative ? undefined : 0}
            onChange={(v) => handleChange(['top'], v)} onScrub={(v) => handleScrub(['top'], v)} onScrubEnd={(v) => handleScrubEnd(['top'], v)} />
          <NumericInput value={values.right} unit="px" label="R" tooltip="Right" min={allowNegative ? undefined : 0}
            onChange={(v) => handleChange(['right'], v)} onScrub={(v) => handleScrub(['right'], v)} onScrubEnd={(v) => handleScrubEnd(['right'], v)} />
          <NumericInput value={values.bottom} unit="px" label="B" tooltip="Bottom" min={allowNegative ? undefined : 0}
            onChange={(v) => handleChange(['bottom'], v)} onScrub={(v) => handleScrub(['bottom'], v)} onScrubEnd={(v) => handleScrubEnd(['bottom'], v)} />
          <NumericInput value={values.left} unit="px" label="L" tooltip="Left" min={allowNegative ? undefined : 0}
            onChange={(v) => handleChange(['left'], v)} onScrub={(v) => handleScrub(['left'], v)} onScrubEnd={(v) => handleScrubEnd(['left'], v)} />
        </div>
      </div>
    )
  }

  return (
    <div class="cortex-spacing-group" data-section={prefix}>
      <div class="cortex-spacing-group__header">
        <span class="cortex-section-label">{label}</span>
        <button
          class="cortex-spacing-group__toggle"
          data-action={`toggle-${prefix}`}
          data-tooltip="Switch to 4-sided mode"
          aria-label="Switch to 4-sided mode"
          onClick={onToggle}
        >
          &#8862;
        </button>
      </div>
      <div class="cortex-spacing-group__row">
        <NumericInput value={horizontal ?? values.left} unit="px" label={"\u2194"} tooltip={`Horizontal ${label}`} min={allowNegative ? undefined : 0}
          onChange={(v) => handleChange(['left', 'right'], v)} onScrub={(v) => handleScrub(['left', 'right'], v)} onScrubEnd={(v) => handleScrubEnd(['left', 'right'], v)} />
        <NumericInput value={vertical ?? values.top} unit="px" label={"\u2195"} tooltip={`Vertical ${label}`} min={allowNegative ? undefined : 0}
          onChange={(v) => handleChange(['top', 'bottom'], v)} onScrub={(v) => handleScrub(['top', 'bottom'], v)} onScrubEnd={(v) => handleScrubEnd(['top', 'bottom'], v)} />
      </div>
    </div>
  )
}

export function SpacingSection({
  padding,
  margin,
  gap,
  isFlexOrGrid = true,
  onChange,
  onScrub,
  onScrubEnd,
}: SpacingSectionProps): JSX.Element {
  const [paddingExpanded, setPaddingExpanded] = useState(false)
  const [marginExpanded, setMarginExpanded] = useState(false)

  return (
    <div class="cortex-spacing-section" data-section-id="spacing">
      <SpacingGroup label="Padding" values={padding} prefix="padding" allowNegative={false}
        expanded={paddingExpanded} onToggle={() => setPaddingExpanded(p => !p)}
        onChange={onChange} onScrub={onScrub} onScrubEnd={onScrubEnd} />
      <SpacingGroup label="Margin" values={margin} prefix="margin" allowNegative={true}
        expanded={marginExpanded} onToggle={() => setMarginExpanded(p => !p)}
        onChange={onChange} onScrub={onScrub} onScrubEnd={onScrubEnd} />
      {isFlexOrGrid && (
        <div class="cortex-spacing-group" data-section="gap">
          <div class="cortex-spacing-group__header">
            <span class="cortex-section-label">Gap</span>
          </div>
          <div class="cortex-spacing-group__row">
            <NumericInput value={gap.column} unit="px" label={"\u2194"} tooltip="Column Gap" min={0}
              onChange={(v) => onChange({ property: 'column-gap', value: v })}
              onScrub={(v) => onScrub?.({ property: 'column-gap', value: v })}
              onScrubEnd={(v) => onScrubEnd?.({ property: 'column-gap', value: v })} />
            <NumericInput value={gap.row} unit="px" label={"\u2195"} tooltip="Row Gap" min={0}
              onChange={(v) => onChange({ property: 'row-gap', value: v })}
              onScrub={(v) => onScrub?.({ property: 'row-gap', value: v })}
              onScrubEnd={(v) => onScrubEnd?.({ property: 'row-gap', value: v })} />
          </div>
        </div>
      )}
    </div>
  )
}
