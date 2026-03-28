import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'

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
  value: string
}

export interface SpacingSectionProps {
  padding: SpacingValues
  margin: SpacingValues
  gap: GapValues
  isFlexOrGrid?: boolean
  overflow?: string
  boxSizing?: string
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
  locked,
  onToggleLock,
  onChange,
  onScrub,
  onScrubEnd,
}: {
  label: string
  values: SpacingValues
  prefix: 'padding' | 'margin'
  allowNegative: boolean
  locked: boolean
  onToggleLock: () => void
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
}): JSX.Element {
  const makeHandler = useCallback(
    (cb?: (change: SpacingChange) => void) =>
      (sides: string[], value: number) => {
        if (!cb) return
        const formatted = `${value}px`
        for (const side of sides) cb({ property: `${prefix}-${side}`, value: formatted })
      },
    [prefix],
  )

  const handleChange = makeHandler(onChange)
  const handleScrub = makeHandler(onScrub)
  const handleScrubEnd = makeHandler(onScrubEnd)

  const handleHorizontal = useCallback(
    (handler: (sides: string[], value: number) => void) => (v: number) => {
      handler(['left', 'right'], v)
      if (locked) handler(['top', 'bottom'], v)
    },
    [locked],
  )

  const handleVertical = useCallback(
    (handler: (sides: string[], value: number) => void) => (v: number) => {
      handler(['top', 'bottom'], v)
      if (locked) handler(['left', 'right'], v)
    },
    [locked],
  )

  const horizontal = values.left === values.right ? values.left : null
  const vertical = values.top === values.bottom ? values.top : null

  return (
    <div class="cortex-spacing-group" data-section={prefix}>
      <div class="cortex-spacing-group__header">
        <span class="cortex-section-label">{label}</span>
      </div>
      <div class="cortex-spacing-group__row">
        <NumericInput
          value={horizontal ?? values.left}
          unit="px"
          label={"\u2194"}
          tooltip={`Horizontal ${label}`}
          min={allowNegative ? undefined : 0}
          onChange={handleHorizontal(handleChange)}
          onScrub={handleHorizontal(handleScrub)}
          onScrubEnd={handleHorizontal(handleScrubEnd)}
        />
        <button
          class={`cortex-lock-btn${locked ? ' cortex-lock-btn--active' : ''}`}
          type="button"
          aria-pressed={locked ? 'true' : 'false'}
          aria-label={locked ? 'Unlock axes' : 'Lock axes'}
          data-tooltip={locked ? 'Unlock axes' : 'Lock axes'}
          onClick={onToggleLock}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
            <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
            {locked
              ? <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0 V6.5" />
              : <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0" />
            }
          </svg>
        </button>
        <NumericInput
          value={vertical ?? values.top}
          unit="px"
          label={"\u2195"}
          tooltip={`Vertical ${label}`}
          min={allowNegative ? undefined : 0}
          onChange={handleVertical(handleChange)}
          onScrub={handleVertical(handleScrub)}
          onScrubEnd={handleVertical(handleScrubEnd)}
        />
      </div>
    </div>
  )
}

const OVERFLOW_OPTIONS = [
  {
    value: 'visible',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke-dasharray="2 1" />
        <rect x="5" y="4" width="7" height="6" rx="0.5" opacity="0.4" />
      </svg>
    ),
    title: 'Show overflow',
  },
  {
    value: 'hidden',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="10" height="10" rx="1.5" />
        <rect x="4" y="4" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.15" />
      </svg>
    ),
    title: 'Clip content \u2014 hide overflow',
  },
]

const SIZING_OPTIONS = [
  {
    value: 'content-box',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke-dasharray="2 1" />
        <rect x="4" y="4" width="6" height="6" rx="0.5" />
      </svg>
    ),
    title: 'Content box \u2014 width excludes padding',
  },
  {
    value: 'border-box',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="10" height="10" rx="1.5" />
        <rect x="4" y="4" width="6" height="6" rx="0.5" stroke-dasharray="2 1" />
      </svg>
    ),
    title: 'Border box \u2014 width includes padding + border',
  },
]

export function SpacingSection({
  padding,
  margin,
  gap,
  isFlexOrGrid = true,
  overflow,
  boxSizing,
  onChange,
  onScrub,
  onScrubEnd,
}: SpacingSectionProps): JSX.Element {
  const [paddingLocked, setPaddingLocked] = useState(true)
  const [marginLocked, setMarginLocked] = useState(true)
  const [gapLocked, setGapLocked] = useState(true)

  return (
    <div class="cortex-spacing-section" data-section-id="spacing">
      <SpacingGroup label="Padding" values={padding} prefix="padding" allowNegative={false}
        locked={paddingLocked} onToggleLock={() => setPaddingLocked(p => !p)}
        onChange={onChange} onScrub={onScrub} onScrubEnd={onScrubEnd} />
      {(overflow !== undefined || boxSizing !== undefined) && (
        <div class="cortex-spacing-section__toggles">
          {overflow !== undefined && (
            <div class="cortex-spacing-section__toggle-group" data-section="overflow">
              <span class="cortex-section-label">Overflow</span>
              <SegmentedControl
                options={OVERFLOW_OPTIONS}
                value={overflow === 'hidden' ? 'hidden' : 'visible'}
                onChange={(v) => onChange({ property: 'overflow', value: v })}
                size="sm"
              />
            </div>
          )}
          {boxSizing !== undefined && (
            <div class="cortex-spacing-section__toggle-group" data-section="sizing">
              <span class="cortex-section-label">Sizing</span>
              <SegmentedControl
                options={SIZING_OPTIONS}
                value={boxSizing === 'border-box' ? 'border-box' : 'content-box'}
                onChange={(v) => onChange({ property: 'box-sizing', value: v })}
                size="sm"
              />
            </div>
          )}
        </div>
      )}
      <SpacingGroup label="Margin" values={margin} prefix="margin" allowNegative={true}
        locked={marginLocked} onToggleLock={() => setMarginLocked(p => !p)}
        onChange={onChange} onScrub={onScrub} onScrubEnd={onScrubEnd} />
      {isFlexOrGrid && (
        <div class="cortex-spacing-group" data-section="gap">
          <div class="cortex-spacing-group__header">
            <span class="cortex-section-label">Gap</span>
          </div>
          <div class="cortex-spacing-group__row">
            <NumericInput value={gap.column} unit="px" label={"\u2194"} tooltip="Column Gap" min={0}
              onChange={(v) => {
                onChange({ property: 'column-gap', value: `${v}px` })
                if (gapLocked) onChange({ property: 'row-gap', value: `${v}px` })
              }}
              onScrub={(v) => {
                onScrub?.({ property: 'column-gap', value: `${v}px` })
                if (gapLocked) onScrub?.({ property: 'row-gap', value: `${v}px` })
              }}
              onScrubEnd={(v) => {
                onScrubEnd?.({ property: 'column-gap', value: `${v}px` })
                if (gapLocked) onScrubEnd?.({ property: 'row-gap', value: `${v}px` })
              }} />
            <button
              class={`cortex-lock-btn${gapLocked ? ' cortex-lock-btn--active' : ''}`}
              type="button"
              aria-pressed={gapLocked ? 'true' : 'false'}
              aria-label={gapLocked ? 'Unlock axes' : 'Lock axes'}
              data-tooltip={gapLocked ? 'Unlock axes' : 'Lock axes'}
              onClick={() => setGapLocked(g => !g)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
                <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
                {gapLocked
                  ? <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0 V6.5" />
                  : <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0" />
                }
              </svg>
            </button>
            <NumericInput value={gap.row} unit="px" label={"\u2195"} tooltip="Row Gap" min={0}
              onChange={(v) => {
                onChange({ property: 'row-gap', value: `${v}px` })
                if (gapLocked) onChange({ property: 'column-gap', value: `${v}px` })
              }}
              onScrub={(v) => {
                onScrub?.({ property: 'row-gap', value: `${v}px` })
                if (gapLocked) onScrub?.({ property: 'column-gap', value: `${v}px` })
              }}
              onScrubEnd={(v) => {
                onScrubEnd?.({ property: 'row-gap', value: `${v}px` })
                if (gapLocked) onScrubEnd?.({ property: 'column-gap', value: `${v}px` })
              }} />
          </div>
        </div>
      )}
    </div>
  )
}
