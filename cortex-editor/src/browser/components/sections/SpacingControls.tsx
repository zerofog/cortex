/**
 * SpacingControls — Panel v2 Task 10 (ZF0-1188)
 *
 * Simplified spacing sub-control for Padding + Margin (gap is handled
 * by FlexControls / GridControls). Uses Lucide MoveHorizontal /
 * MoveVertical icons as NumericInput prefixes instead of text labels.
 *
 * Business logic: Controls the padding and margin CSS properties of the
 * selected element. Horizontal inputs set left+right, vertical inputs
 * set top+bottom. Lock buttons link the two axes so editing one updates
 * both (same value applied to all four sides).
 */
import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { NumericInput } from '../controls/NumericInput.js'
import { MoveHorizontal, MoveVertical } from '../icons.js'

export interface SpacingChange {
  property: string
  value: string
}

export interface SpacingControlsProps {
  padding: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  mixedProperties?: Set<string>
}

/**
 * A single spacing row (e.g. Padding or Margin) with horizontal + vertical
 * NumericInputs and a lock button to link them.
 */
function SpacingRow({
  label,
  values,
  prefix,
  allowNegative,
  locked,
  onToggleLock,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: {
  label: string
  values: { top: number; right: number; bottom: number; left: number }
  prefix: 'padding' | 'margin'
  allowNegative: boolean
  locked: boolean
  onToggleLock: () => void
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  mixedProperties?: Set<string>
}): JSX.Element {
  const fireChange = useCallback(
    (cb: ((c: SpacingChange) => void) | undefined, sides: string[], value: number) => {
      if (!cb) return
      const formatted = `${value}px`
      for (const side of sides) cb({ property: `${prefix}-${side}`, value: formatted })
    },
    [prefix],
  )

  const handleHorizontalChange = useCallback(
    (v: number) => {
      fireChange(onChange, ['left', 'right'], v)
      if (locked) fireChange(onChange, ['top', 'bottom'], v)
    },
    [onChange, locked, fireChange],
  )
  const handleHorizontalScrub = useCallback(
    (v: number) => {
      fireChange(onScrub, ['left', 'right'], v)
      if (locked) fireChange(onScrub, ['top', 'bottom'], v)
    },
    [onScrub, locked, fireChange],
  )
  const handleHorizontalScrubEnd = useCallback(
    (v: number) => {
      fireChange(onScrubEnd, ['left', 'right'], v)
      if (locked) fireChange(onScrubEnd, ['top', 'bottom'], v)
    },
    [onScrubEnd, locked, fireChange],
  )

  const handleVerticalChange = useCallback(
    (v: number) => {
      fireChange(onChange, ['top', 'bottom'], v)
      if (locked) fireChange(onChange, ['left', 'right'], v)
    },
    [onChange, locked, fireChange],
  )
  const handleVerticalScrub = useCallback(
    (v: number) => {
      fireChange(onScrub, ['top', 'bottom'], v)
      if (locked) fireChange(onScrub, ['left', 'right'], v)
    },
    [onScrub, locked, fireChange],
  )
  const handleVerticalScrubEnd = useCallback(
    (v: number) => {
      fireChange(onScrubEnd, ['top', 'bottom'], v)
      if (locked) fireChange(onScrubEnd, ['left', 'right'], v)
    },
    [onScrubEnd, locked, fireChange],
  )

  const horizontal = values.left
  const vertical = values.top

  return (
    <div class="cortex-spacing-row" data-section={prefix}>
      <span class="cortex-section-label">{label}</span>
      <div class="cortex-spacing-row__inputs">
        <NumericInput
          value={horizontal}
          unit="px"
          prefix={<MoveHorizontal size={14} />}
          tooltip={`Horizontal ${label}`}
          min={allowNegative ? undefined : 0}
          mixed={mixedProperties?.has(`${prefix}-left`) || mixedProperties?.has(`${prefix}-right`)}
          onChange={handleHorizontalChange}
          onScrub={handleHorizontalScrub}
          onScrubEnd={handleHorizontalScrubEnd}
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
          value={vertical}
          unit="px"
          prefix={<MoveVertical size={14} />}
          tooltip={`Vertical ${label}`}
          min={allowNegative ? undefined : 0}
          mixed={mixedProperties?.has(`${prefix}-top`) || mixedProperties?.has(`${prefix}-bottom`)}
          onChange={handleVerticalChange}
          onScrub={handleVerticalScrub}
          onScrubEnd={handleVerticalScrubEnd}
        />
      </div>
    </div>
  )
}

export function SpacingControls({
  padding,
  margin,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: SpacingControlsProps): JSX.Element {
  const [paddingLocked, setPaddingLocked] = useState(false)
  const [marginLocked, setMarginLocked] = useState(false)
  const togglePaddingLock = useCallback(() => setPaddingLocked(p => !p), [])
  const toggleMarginLock = useCallback(() => setMarginLocked(p => !p), [])

  return (
    <div class="cortex-spacing-controls" data-testid="spacing-controls" data-section-id="spacing">
      <SpacingRow
        label="Padding"
        values={padding}
        prefix="padding"
        allowNegative={false}
        locked={paddingLocked}
        onToggleLock={togglePaddingLock}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        mixedProperties={mixedProperties}
      />
      <SpacingRow
        label="Margin"
        values={margin}
        prefix="margin"
        allowNegative={true}
        locked={marginLocked}
        onToggleLock={toggleMarginLock}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        mixedProperties={mixedProperties}
      />
    </div>
  )
}
