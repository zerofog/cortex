import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { SizingDropdown } from '../controls/SizingDropdown.js'
import type { SizingMode } from '../controls/SizingDropdown.js'
import { FlexControls } from './FlexControls.js'
import type { FlexValues, FlexChange } from './FlexControls.js'
import { GridControls } from './GridControls.js'
import type { GridValues, GridChange } from './GridControls.js'

export interface LayoutChange {
  property: string
  value: string
}

export interface LayoutValues {
  display: string
  visibility: string
  flexDirection: string
  justifyContent: string
  alignItems: string
  rowGap: number
  columnGap: number
  flexWrap: string
  gridTemplateColumns: string
  gridTemplateRows: string
  gridAutoFlow: string
  justifyItems: string
  width: string
  height: string
  minWidth: string
  maxWidth: string
  minHeight: string
  maxHeight: string
}

export interface LayoutSectionProps {
  values: LayoutValues
  onChange: (change: LayoutChange) => void
  onScrub?: (change: LayoutChange) => void
  onScrubEnd?: (change: LayoutChange) => void
  /** Set of CSS properties that changed in the forced state. When present, unchanged properties are dimmed. */
  dimmedProperties?: Set<string>
  /** Set of CSS properties whose values differ across selected elements. */
  mixedProperties?: Set<string>
}

/** Normalize computed display values to SegmentedControl options. */
function normalizeDisplay(display: string): string {
  if (display === 'inline-flex') return 'flex'
  if (display === 'inline-grid') return 'grid'
  if (display === 'inline-block') return 'block'
  return display
}

/** Extract layout-related values from a CSSStyleDeclaration. */
export function parseLayoutValues(cs: CSSStyleDeclaration): LayoutValues {
  return {
    display: normalizeDisplay(cs.display ?? 'block'),
    visibility: cs.visibility ?? 'visible',
    flexDirection: cs.flexDirection || 'row',
    justifyContent: cs.justifyContent || 'flex-start',
    alignItems: cs.alignItems || 'stretch',
    rowGap: parseFloat(cs.rowGap || '0') || 0,
    columnGap: parseFloat(cs.columnGap || '0') || 0,
    flexWrap: cs.flexWrap || 'nowrap',
    // Grid fields (Task 9 / ZF0-1187). CSSStyleDeclaration returns ''
    // for unset getters, so coerce empty values to the same defaults an
    // unstyled element would render with. `gridTemplateColumns` /
    // `gridTemplateRows` default to 'none' (the computed-value for
    // unset), which parses to the complex tier and renders as a
    // read-only "(none)" placeholder — the correct behaviour for an
    // element that doesn't declare a template at all.
    gridTemplateColumns: cs.gridTemplateColumns || 'none',
    gridTemplateRows: cs.gridTemplateRows || 'none',
    gridAutoFlow: cs.gridAutoFlow || 'row',
    justifyItems: cs.justifyItems || 'stretch',
    width: cs.width ?? 'auto',
    height: cs.height ?? 'auto',
    minWidth: cs.minWidth ?? '0px',
    maxWidth: cs.maxWidth ?? 'none',
    minHeight: cs.minHeight ?? '0px',
    maxHeight: cs.maxHeight ?? 'none',
  }
}

const DISPLAY_OPTIONS = [
  { value: 'block', icon: '□', title: 'Block' },
  { value: 'flex', icon: '⇔', title: 'Flex' },
  { value: 'grid', icon: '⊞', title: 'Grid' },
  { value: 'inline', icon: '↔', title: 'Inline' },
  { value: 'none', icon: '⊘', title: 'None' },
]

const VISIBILITY_OPTIONS = [
  { value: 'visible', label: 'visible' },
  { value: 'hidden', label: 'hidden' },
]

export function LayoutSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  mixedProperties,
}: LayoutSectionProps): JSX.Element {
  const isFlex = values.display === 'flex' || values.display === 'inline-flex'
  const isGrid = values.display === 'grid' || values.display === 'inline-grid'
  const isNone = values.display === 'none'
  const [aspectLocked, setAspectLocked] = useState(false)
  const [widthMode, setWidthMode] = useState<SizingMode>(
    values.width === 'fit-content' ? 'fit'
    : values.width === '100%' ? 'fill'
    : 'fixed'
  )
  const [heightMode, setHeightMode] = useState<SizingMode>(
    values.height === 'fit-content' ? 'fit'
    : values.height === '100%' ? 'fill'
    : 'fixed'
  )
  const [minWidthEnabled, setMinWidthEnabled] = useState(false)
  const [maxWidthEnabled, setMaxWidthEnabled] = useState(false)
  const [minHeightEnabled, setMinHeightEnabled] = useState(false)
  const [maxHeightEnabled, setMaxHeightEnabled] = useState(false)

  const handleDisplayChange = useCallback(
    (v: string) => onChange({ property: 'display', value: v }),
    [onChange],
  )
  const handleVisibilityChange = useCallback(
    (v: string) => onChange({ property: 'visibility', value: v }),
    [onChange],
  )
  // Flex/Grid callbacks are owned by FlexControls / GridControls — the
  // direction-swap logic (flex) and the grid-specific property routing
  // need single sources of truth, and inlining either in LayoutSection
  // would duplicate the mapping. Both FlexChange and GridChange are
  // structurally identical to LayoutChange (`{ property, value }`), so
  // the parent callbacks pass through unchanged — no wrapper, no shape
  // translation.
  const handleFlexChange: (c: FlexChange) => void = onChange
  const handleFlexScrub: ((c: FlexChange) => void) | undefined = onScrub
  const handleFlexScrubEnd: ((c: FlexChange) => void) | undefined = onScrubEnd
  const handleGridChange: (c: GridChange) => void = onChange
  const handleGridScrub: ((c: GridChange) => void) | undefined = onScrub
  const handleGridScrubEnd: ((c: GridChange) => void) | undefined = onScrubEnd

  // FlexValues / GridValues are structurally subsets of LayoutValues.
  // Building the explicit subset (instead of spreading) keeps the call
  // site honest about which fields each sub-control consumes — adding a
  // new field surfaces here as a missing-property compile error.
  const flexValues: FlexValues = {
    flexDirection: values.flexDirection,
    justifyContent: values.justifyContent,
    alignItems: values.alignItems,
    rowGap: values.rowGap,
    columnGap: values.columnGap,
    flexWrap: values.flexWrap,
  }
  const gridValues: GridValues = {
    gridTemplateColumns: values.gridTemplateColumns,
    gridTemplateRows: values.gridTemplateRows,
    gridAutoFlow: values.gridAutoFlow,
    justifyItems: values.justifyItems,
    alignItems: values.alignItems,
    rowGap: values.rowGap,
    columnGap: values.columnGap,
  }

  const widthNum = parseFloat(values.width)
  const heightNum = parseFloat(values.height)
  const isAutoWidth = isNaN(widthNum)
  const isAutoHeight = isNaN(heightNum)

  const canLockAspect = widthMode === 'fixed' && heightMode === 'fixed'
  const aspectRatio = (canLockAspect && !isAutoWidth && !isAutoHeight && heightNum > 0)
    ? widthNum / heightNum
    : 1

  const handleWidthChange = useCallback(
    (v: number) => {
      onChange({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0) {
        onChange({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onChange, aspectLocked, aspectRatio],
  )
  const handleWidthScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrub) {
        onScrub({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onScrub, aspectLocked, aspectRatio],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'width', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrubEnd) {
        onScrubEnd({ property: 'height', value: `${Math.round(v / aspectRatio)}px` })
      }
    },
    [onScrubEnd, aspectLocked, aspectRatio],
  )
  const handleHeightChange = useCallback(
    (v: number) => {
      onChange({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0) {
        onChange({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onChange, aspectLocked, aspectRatio],
  )
  const handleHeightScrub = useCallback(
    (v: number) => {
      if (onScrub) onScrub({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrub) {
        onScrub({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onScrub, aspectLocked, aspectRatio],
  )
  const handleHeightScrubEnd = useCallback(
    (v: number) => {
      if (onScrubEnd) onScrubEnd({ property: 'height', value: `${v}px` })
      if (aspectLocked && aspectRatio > 0 && onScrubEnd) {
        onScrubEnd({ property: 'width', value: `${Math.round(v * aspectRatio)}px` })
      }
    },
    [onScrubEnd, aspectLocked, aspectRatio],
  )

  const handleToggleLock = useCallback(() => setAspectLocked((v) => !v), [])

  const handleWidthModeChange = useCallback((mode: SizingMode) => {
    setWidthMode(mode)
    if (mode === 'fit') onChange({ property: 'width', value: 'fit-content' })
    else if (mode === 'fill') onChange({ property: 'width', value: '100%' })
    else onChange({ property: 'width', value: `${isAutoWidth ? 0 : widthNum}px` })
  }, [onChange, isAutoWidth, widthNum])

  const handleHeightModeChange = useCallback((mode: SizingMode) => {
    setHeightMode(mode)
    if (mode === 'fit') onChange({ property: 'height', value: 'fit-content' })
    else if (mode === 'fill') onChange({ property: 'height', value: '100%' })
    else onChange({ property: 'height', value: `${isAutoHeight ? 0 : heightNum}px` })
  }, [onChange, isAutoHeight, heightNum])

  const handleMinWidthChange = useCallback(
    (v: number) => onChange({ property: 'min-width', value: `${v}px` }),
    [onChange],
  )
  const handleMaxWidthChange = useCallback(
    (v: number) => onChange({ property: 'max-width', value: `${v}px` }),
    [onChange],
  )
  const handleMinHeightChange = useCallback(
    (v: number) => onChange({ property: 'min-height', value: `${v}px` }),
    [onChange],
  )
  const handleMaxHeightChange = useCallback(
    (v: number) => onChange({ property: 'max-height', value: `${v}px` }),
    [onChange],
  )

  const handleToggleMinWidth = useCallback(() => {
    setMinWidthEnabled(v => {
      if (v) onChange({ property: 'min-width', value: '0px' })
      return !v
    })
  }, [onChange])
  const handleToggleMaxWidth = useCallback(() => {
    setMaxWidthEnabled(v => {
      if (v) onChange({ property: 'max-width', value: 'none' })
      return !v
    })
  }, [onChange])
  const handleToggleMinHeight = useCallback(() => {
    setMinHeightEnabled(v => {
      if (v) onChange({ property: 'min-height', value: '0px' })
      return !v
    })
  }, [onChange])
  const handleToggleMaxHeight = useCallback(() => {
    setMaxHeightEnabled(v => {
      if (v) onChange({ property: 'max-height', value: 'none' })
      return !v
    })
  }, [onChange])

  return (
    <div class="cortex-layout-section" data-section-id="layout">
      <div class="cortex-layout-section__group">
        <span class="cortex-section-label">Display</span>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={values.display}
          onChange={handleDisplayChange}
          size="sm"
        />
      </div>

      {/* Review finding 1a: reveal wrapper for conditional rows */}
      {!isNone && (
        <div class="cortex-layout-section__group cortex-layout-section__reveal" data-group="visibility">
          <span class="cortex-section-label">Visibility</span>
          <SegmentedControl
            options={VISIBILITY_OPTIONS}
            value={values.visibility}
            onChange={handleVisibilityChange}
          />
        </div>
      )}

      {isNone && <div data-group="visibility" data-hidden="true" />}

      {isFlex && (
        <div class="cortex-layout-section__group cortex-layout-section__reveal">
          <FlexControls
            values={flexValues}
            onChange={handleFlexChange}
            onScrub={handleFlexScrub}
            onScrubEnd={handleFlexScrubEnd}
            mixedProperties={mixedProperties}
          />
        </div>
      )}

      {isGrid && (
        <div class="cortex-layout-section__group cortex-layout-section__reveal">
          <GridControls
            values={gridValues}
            onChange={handleGridChange}
            onScrub={handleGridScrub}
            onScrubEnd={handleGridScrubEnd}
            mixedProperties={mixedProperties}
          />
        </div>
      )}

      <div class="cortex-layout-section__group">
        <span class="cortex-section-label">Sizing</span>
        <div class="cortex-layout-section__sizing">
          <div class="cortex-layout-section__sizing-field">
            <NumericInput
              value={isAutoWidth ? 0 : widthNum}
              label="W"
              tooltip="Width"
              min={0}
              mixed={mixedProperties?.has('width')}
              onChange={handleWidthChange}
              onScrub={handleWidthScrub}
              onScrubEnd={handleWidthScrubEnd}
            />
            <SizingDropdown
              mode={widthMode}
              minEnabled={minWidthEnabled}
              maxEnabled={maxWidthEnabled}
              onModeChange={handleWidthModeChange}
              onToggleMin={handleToggleMinWidth}
              onToggleMax={handleToggleMaxWidth}
              dimension="Width"
            />
          </div>
          <div class="cortex-layout-section__sizing-field">
            <NumericInput
              value={isAutoHeight ? 0 : heightNum}
              label="H"
              tooltip="Height"
              min={0}
              mixed={mixedProperties?.has('height')}
              onChange={handleHeightChange}
              onScrub={handleHeightScrub}
              onScrubEnd={handleHeightScrubEnd}
            />
            <SizingDropdown
              mode={heightMode}
              minEnabled={minHeightEnabled}
              maxEnabled={maxHeightEnabled}
              onModeChange={handleHeightModeChange}
              onToggleMin={handleToggleMinHeight}
              onToggleMax={handleToggleMaxHeight}
              dimension="Height"
            />
          </div>
          <button
            class={`cortex-lock-btn${aspectLocked ? ' cortex-lock-btn--active' : ''}`}
            data-tooltip={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            onClick={handleToggleLock}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              {aspectLocked ? (
                <>
                  <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
                  <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0 V6.5" />
                </>
              ) : (
                <>
                  <rect x="3" y="6.5" width="8" height="5.5" rx="1" />
                  <path d="M4.5,6.5 V4.5 a2.5,2.5 0 0 1 5,0" />
                </>
              )}
            </svg>
          </button>
        </div>
        {(minWidthEnabled || maxWidthEnabled || minHeightEnabled || maxHeightEnabled) && (
          <div class="cortex-layout-section__minmax">
            {minWidthEnabled && (
              <div class="cortex-layout-section__minmax-field">
                <NumericInput
                  value={parseFloat(values.minWidth) || 0}
                  unit="px"
                  label="Min"
                  tooltip="Min Width"
                  min={0}
                  mixed={mixedProperties?.has('min-width')}
                  onChange={handleMinWidthChange}
                />
                <button
                  class="cortex-layout-section__minmax-dismiss"
                  type="button"
                  data-tooltip="Remove Min Width"
                  aria-label="Remove Min Width"
                  onClick={handleToggleMinWidth}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                </button>
              </div>
            )}
            {maxWidthEnabled && (
              <div class="cortex-layout-section__minmax-field">
                <NumericInput
                  value={values.maxWidth === 'none' ? 0 : parseFloat(values.maxWidth) || 0}
                  unit="px"
                  label="Max"
                  tooltip="Max Width"
                  min={0}
                  mixed={mixedProperties?.has('max-width')}
                  onChange={handleMaxWidthChange}
                />
                <button
                  class="cortex-layout-section__minmax-dismiss"
                  type="button"
                  data-tooltip="Remove Max Width"
                  aria-label="Remove Max Width"
                  onClick={handleToggleMaxWidth}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                </button>
              </div>
            )}
            {minHeightEnabled && (
              <div class="cortex-layout-section__minmax-field">
                <NumericInput
                  value={parseFloat(values.minHeight) || 0}
                  unit="px"
                  label="Min"
                  tooltip="Min Height"
                  min={0}
                  mixed={mixedProperties?.has('min-height')}
                  onChange={handleMinHeightChange}
                />
                <button
                  class="cortex-layout-section__minmax-dismiss"
                  type="button"
                  data-tooltip="Remove Min Height"
                  aria-label="Remove Min Height"
                  onClick={handleToggleMinHeight}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                </button>
              </div>
            )}
            {maxHeightEnabled && (
              <div class="cortex-layout-section__minmax-field">
                <NumericInput
                  value={values.maxHeight === 'none' ? 0 : parseFloat(values.maxHeight) || 0}
                  unit="px"
                  label="Max"
                  tooltip="Max Height"
                  min={0}
                  mixed={mixedProperties?.has('max-height')}
                  onChange={handleMaxHeightChange}
                />
                <button
                  class="cortex-layout-section__minmax-dismiss"
                  type="button"
                  data-tooltip="Remove Max Height"
                  aria-label="Remove Max Height"
                  onClick={handleToggleMaxHeight}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
