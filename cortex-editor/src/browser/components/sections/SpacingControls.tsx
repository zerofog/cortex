/**
 * SpacingControls — Panel v2 Task 10 (ZF0-1188)
 *
 * Simplified spacing sub-control for Padding + Margin (gap is handled
 * by FlexControls / GridControls). Uses compact text + Lucide axis icon
 * prefixes in the NumericInput fields.
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
import { ArrowLeftRight, ArrowUpDown, Lock, LockOpen } from '../icons.js'

export type SpacingChange = SectionChange

type BoxModelSide = 'top' | 'right' | 'bottom' | 'left'
type EditableBoxModelLayer = 'padding' | 'margin'

export interface SpacingControlsProps {
  padding: { top: number; right: number; bottom: number; left: number }
  margin: { top: number; right: number; bottom: number; left: number }
  /** Current box-sizing value, shown as context inside the visual box model. */
  boxSizing?: string
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

const BOX_MODEL_SIDES: BoxModelSide[] = ['top', 'right', 'bottom', 'left']

const BOX_MODEL_LAYER_LABEL: Record<EditableBoxModelLayer, string> = {
  padding: 'Padding',
  margin: 'Margin',
}

const BOX_MODEL_LAYER_PREFIX: Record<EditableBoxModelLayer, string> = {
  padding: 'P',
  margin: 'M',
}

const BOX_MODEL_SIDE_LABEL: Record<BoxModelSide, string> = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
}

const BOX_MODEL_SIDE_PREFIX: Record<BoxModelSide, string> = {
  top: 'T',
  right: 'R',
  bottom: 'B',
  left: 'L',
}

/**
 * Business logic: keeps side values legible in the compact 320px panel while
 * preserving the actual numeric value edited by the side editor below.
 */
function formatBoxModelValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Math.round(value * 10) / 10)
}

/**
 * Business logic: maps the diagram's spatial side selection to the exact CSS
 * property that should be staged on the selected element.
 */
function toSpacingProperty(layer: EditableBoxModelLayer, side: BoxModelSide): string {
  return `${layer}-${side}`
}

/**
 * Business logic: reads the selected side's computed spacing value so direct
 * side editing starts from the same CSS snapshot as the axis inputs.
 */
function getSideValue(
  layer: EditableBoxModelLayer,
  side: BoxModelSide,
  padding: SpacingControlsProps['padding'],
  margin: SpacingControlsProps['margin'],
): number {
  return layer === 'padding' ? padding[side] : margin[side]
}

interface SpacingBoxModelDiagramProps {
  padding: SpacingControlsProps['padding']
  margin: SpacingControlsProps['margin']
  boxSizing?: string
  onChange: (change: SpacingChange) => void
  onScrub?: (change: SpacingChange) => void
  onScrubEnd?: (change: SpacingChange) => void
  mixedProperties?: Set<string>
  stale?: boolean
}

/**
 * SpacingBoxModelDiagram shows the spatial CSS box model for the selected
 * element.
 *
 * Business logic: margin and padding side buttons select one exact CSS side
 * for editing, while the existing H/V rows continue to handle common axis
 * edits. Border/content are visual context only here; border lifecycle remains
 * owned by BorderSection.
 */
function SpacingBoxModelDiagram({
  padding,
  margin,
  boxSizing,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
  stale,
}: SpacingBoxModelDiagramProps): JSX.Element {
  const [selected, setSelected] = useState<{ layer: EditableBoxModelLayer; side: BoxModelSide }>({
    layer: 'padding',
    side: 'top',
  })
  const normalizedBoxSizing = boxSizing === 'border-box' ? 'border-box' : 'content-box'
  const selectedProperty = toSpacingProperty(selected.layer, selected.side)
  const selectedValue = getSideValue(selected.layer, selected.side, padding, margin)

  const emitSideValue = useCallback(
    (cb: ((change: SpacingChange) => void) | undefined, value: number) => {
      if (!cb) return
      cb({ property: selectedProperty, value: `${value}px` })
    },
    [selectedProperty],
  )

  const handleChange = useCallback((value: number) => emitSideValue(onChange, value), [emitSideValue, onChange])
  const handleScrub = useCallback((value: number) => emitSideValue(onScrub, value), [emitSideValue, onScrub])
  const handleScrubEnd = useCallback((value: number) => emitSideValue(onScrubEnd, value), [emitSideValue, onScrubEnd])

  // Business logic: each side button changes the editor target without
  // staging a CSS edit until the user commits a value in the NumericInput.
  const renderSideButton = (layer: EditableBoxModelLayer, side: BoxModelSide, value: number) => {
    const isSelected = selected.layer === layer && selected.side === side
    const property = toSpacingProperty(layer, side)
    const isMixed = mixedProperties?.has(property) === true
    const label = `${BOX_MODEL_LAYER_LABEL[layer]} ${BOX_MODEL_SIDE_LABEL[side]}`
    const mixedSuffix = isMixed ? ', mixed value' : ''
    return (
      <button
        key={`${layer}-${side}`}
        class={`cortex-box-model__side cortex-box-model__side--${side}${isSelected ? ' cortex-box-model__side--selected' : ''}${isMixed ? ' cortex-box-model__side--mixed' : ''}`}
        type="button"
        data-layer={layer}
        data-side={side}
        aria-pressed={isSelected ? 'true' : 'false'}
        aria-label={`Edit ${label}${mixedSuffix}`}
        data-tooltip={`Edit ${label}${mixedSuffix}`}
        onClick={() => setSelected({ layer, side })}
      >
        {isMixed ? '--' : formatBoxModelValue(value)}
      </button>
    )
  }

  return (
    <div
      class="cortex-box-model"
      data-testid="spacing-box-model-diagram"
      data-box-sizing={normalizedBoxSizing}
      role="group"
      aria-label="Box model diagram"
    >
      <div class="cortex-box-model__diagram">
        <div class="cortex-box-model__layer cortex-box-model__layer--margin" aria-label="Margin">
          <span class="cortex-box-model__layer-label">margin</span>
          {BOX_MODEL_SIDES.map(side => renderSideButton('margin', side, margin[side]))}
          <div class="cortex-box-model__layer cortex-box-model__layer--border" aria-label="Border">
            <span class="cortex-box-model__layer-label">border</span>
            <div class="cortex-box-model__layer cortex-box-model__layer--padding" aria-label="Padding">
              <span class="cortex-box-model__layer-label">padding</span>
              {BOX_MODEL_SIDES.map(side => renderSideButton('padding', side, padding[side]))}
              <div class="cortex-box-model__content" aria-label={`Content, ${normalizedBoxSizing}`}>
                <span class="cortex-box-model__content-label">content</span>
                <span class="cortex-box-model__sizing-label">{normalizedBoxSizing}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        class="cortex-box-model__side-editor"
        data-testid="spacing-box-model-side-editor"
        data-layer={selected.layer}
        data-side={selected.side}
      >
        <span class="cortex-box-model__side-editor-label">
          {BOX_MODEL_LAYER_LABEL[selected.layer]} {BOX_MODEL_SIDE_LABEL[selected.side]}
        </span>
        <NumericInput
          value={selectedValue}
          unit="px"
          prefix={<span>{BOX_MODEL_LAYER_PREFIX[selected.layer]}{BOX_MODEL_SIDE_PREFIX[selected.side]}</span>}
          tooltip={`${BOX_MODEL_LAYER_LABEL[selected.layer]} ${BOX_MODEL_SIDE_LABEL[selected.side]}`}
          min={selected.layer === 'padding' ? 0 : undefined}
          mixed={mixedProperties?.has(selectedProperty)}
          stale={stale}
          tokenFamily="spacing"
          onChange={handleChange}
          onScrub={handleScrub}
          onScrubEnd={handleScrubEnd}
        />
      </div>
    </div>
  )
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
          prefix={<><span>{short}</span><ArrowLeftRight size={12} /></>}
          tooltip={`Horizontal ${prefix}`}
          min={allowNegative ? undefined : 0}
          mixed={horizontalDiverges || mixedProperties?.has(`${prefix}-left`) || mixedProperties?.has(`${prefix}-right`)}
          stale={stale}
          tokenFamily="spacing"
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
          {locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <NumericInput
          value={vertical}
          unit="px"
          prefix={<><span>{short}</span><ArrowUpDown size={12} /></>}
          tooltip={`Vertical ${prefix}`}
          min={allowNegative ? undefined : 0}
          mixed={verticalDiverges || mixedProperties?.has(`${prefix}-top`) || mixedProperties?.has(`${prefix}-bottom`)}
          stale={stale}
          tokenFamily="spacing"
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
  boxSizing,
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
      <SpacingBoxModelDiagram
        padding={padding}
        margin={margin}
        boxSizing={boxSizing}
        onChange={onChange}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        mixedProperties={mixedProperties}
        stale={stale}
      />
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
