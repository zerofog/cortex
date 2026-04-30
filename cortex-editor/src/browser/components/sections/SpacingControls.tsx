/**
 * SpacingControls — Panel v2 Task 10 (ZF0-1188)
 *
 * Simplified spacing sub-control for Padding + Margin (gap is handled
 * by FlexControls / GridControls). Uses compact text prefixes in the
 * NumericInput fields (e.g., "P ↔" / "P ↕") instead of icon prefixes.
 *
 * Business logic: Controls the padding and margin CSS properties of the
 * selected element. Horizontal inputs set left+right, vertical inputs
 * set top+bottom. Lock buttons link the two axes so editing one updates
 * both (same value applied to all four sides).
 */
import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { NumericInput } from '../controls/NumericInput.js'

export type SpacingChange = SectionChange

export interface SpacingControlsProps {
  padding: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  mixedProperties?: Set<string>
  /**
   * When true, the element's source override has exceeded the TTL without hmr_verified
   * arriving. Forwarded to NumericInput controls as the stale indicator (orange/yellow
   * tint + recovery tooltip). Mirrors the pattern used by SizingControls.
   * (ZF0-1470 T4 fix-up, IMPORTANT 3)
   */
  stale?: boolean
}

/**
 * A single spacing row (e.g. Padding or Margin) with horizontal + vertical
 * NumericInputs and a lock button to link them.
 */
function SpacingRow({
  short,
  values,
  prefix,
  allowNegative,
  locked,
  onToggleLock,
  onChange,
  onScrub,
  onScrubEnd,
  dimmed,
  mixedProperties,
  stale,
}: {
  /** Short prefix shown in the input (e.g. "P" for padding, "M" for margin) */
  short: string
  values: { top: number; right: number; bottom: number; left: number }
  prefix: 'padding' | 'margin'
  allowNegative: boolean
  locked: boolean
  onToggleLock: () => void
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  dimmed?: boolean
  mixedProperties?: Set<string>
  /** Forward the element-level stale indicator to NumericInput controls. */
  stale?: boolean
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
  // When left≠right (or top≠bottom), the axis summary is ambiguous — show
  // indeterminate ('--') so the user knows the sides differ before editing.
  // Same pattern as BorderSection's uniform-width indeterminate check.
  const horizontalDiverges = values.left !== values.right
  const verticalDiverges = values.top !== values.bottom

  return (
    <div class={`cortex-spacing-row${dimmed ? ' cortex-control--dimmed' : ''}`} data-section={prefix}>
      <div class="cortex-spacing-row__inputs">
        <NumericInput
          value={horizontal}
          unit="px"
          prefix={`${short} \u2194`}
          tooltip={`Horizontal ${prefix}`}
          min={allowNegative ? undefined : 0}
          mixed={horizontalDiverges || mixedProperties?.has(`${prefix}-left`) || mixedProperties?.has(`${prefix}-right`)}
          stale={stale}
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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
          prefix={`${short} \u2195`}
          tooltip={`Vertical ${prefix}`}
          min={allowNegative ? undefined : 0}
          mixed={verticalDiverges || mixedProperties?.has(`${prefix}-top`) || mixedProperties?.has(`${prefix}-bottom`)}
          stale={stale}
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
  dimmedProperties,
  mixedProperties,
  stale,
}: SpacingControlsProps): JSX.Element {
  const [paddingLocked, setPaddingLocked] = useState(false)
  const [marginLocked, setMarginLocked] = useState(false)
  const togglePaddingLock = useCallback(() => setPaddingLocked(p => !p), [])
  const toggleMarginLock = useCallback(() => setMarginLocked(p => !p), [])

  return (
    <div class="cortex-spacing-controls" data-testid="spacing-controls" data-section-id="spacing">
      <span class="cortex-subsection-label">Spacing</span>
      <SpacingRow
        short="P"
        values={padding}
        prefix="padding"
        allowNegative={false}
        locked={paddingLocked}
        onToggleLock={togglePaddingLock}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        dimmed={isDimmed(dimmedProperties, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left')}
        mixedProperties={mixedProperties}
        stale={stale}
      />
      <SpacingRow
        short="M"
        values={margin}
        prefix="margin"
        allowNegative={true}
        locked={marginLocked}
        onToggleLock={toggleMarginLock}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        dimmed={isDimmed(dimmedProperties, 'margin-top', 'margin-right', 'margin-bottom', 'margin-left')}
        mixedProperties={mixedProperties}
        stale={stale}
      />
    </div>
  )
}
