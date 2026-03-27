import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'
import { SizingDropdown } from '../controls/SizingDropdown.js'
import type { SizingMode } from '../controls/SizingDropdown.js'

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
    flexDirection: cs.flexDirection ?? 'row',
    justifyContent: cs.justifyContent ?? 'flex-start',
    alignItems: cs.alignItems ?? 'stretch',
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

const FLEX_DIRECTION_OPTIONS = [
  { value: 'row', icon: '→', title: 'Row' },
  { value: 'row-reverse', icon: '←', title: 'Row Reverse' },
  { value: 'column', icon: '↓', title: 'Column' },
  { value: 'column-reverse', icon: '↑', title: 'Column Reverse' },
]

const JUSTIFY_OPTIONS = [
  { value: 'flex-start', icon: '⊣', title: 'Start' },
  { value: 'center', icon: '⊡', title: 'Center' },
  { value: 'flex-end', icon: '⊢', title: 'End' },
  { value: 'space-between', icon: '⊞', title: 'Space Between' },
  { value: 'space-around', icon: '⊟', title: 'Space Around' },
]

const ALIGN_OPTIONS = [
  { value: 'flex-start', icon: '⊣', title: 'Start' },
  { value: 'center', icon: '⊡', title: 'Center' },
  { value: 'flex-end', icon: '⊢', title: 'End' },
  { value: 'stretch', icon: '⊟', title: 'Stretch' },
  { value: 'baseline', icon: '⊥', title: 'Baseline' },
]

export function LayoutSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
}: LayoutSectionProps): JSX.Element {
  const isFlex = values.display === 'flex' || values.display === 'inline-flex'
  const isGrid = values.display === 'grid' || values.display === 'inline-grid'
  const isFlexOrGrid = isFlex || isGrid
  const isNone = values.display === 'none'
  const [aspectLocked, setAspectLocked] = useState(false)
  const [widthMode, setWidthMode] = useState<SizingMode>(
    values.width === 'fit-content' ? 'fit' : 'fixed'
  )
  const [heightMode, setHeightMode] = useState<SizingMode>(
    values.height === 'fit-content' ? 'fit' : 'fixed'
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
  const handleFlexDirChange = useCallback(
    (v: string) => onChange({ property: 'flex-direction', value: v }),
    [onChange],
  )
  const handleJustifyChange = useCallback(
    (v: string) => onChange({ property: 'justify-content', value: v }),
    [onChange],
  )
  const handleAlignChange = useCallback(
    (v: string) => onChange({ property: 'align-items', value: v }),
    [onChange],
  )

  const widthNum = parseFloat(values.width)
  const heightNum = parseFloat(values.height)
  const isAutoWidth = isNaN(widthNum)
  const isAutoHeight = isNaN(heightNum)

  const aspectRatio = (!isAutoWidth && !isAutoHeight && heightNum > 0)
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
          <span class="cortex-section-label">Direction</span>
          <SegmentedControl
            options={FLEX_DIRECTION_OPTIONS}
            value={values.flexDirection}
            onChange={handleFlexDirChange}
            size="sm"
          />
        </div>
      )}

      {isFlexOrGrid && (
        <>
          <div class="cortex-layout-section__group cortex-layout-section__reveal">
            <span class="cortex-section-label">Justify</span>
            <SegmentedControl
              options={JUSTIFY_OPTIONS}
              value={values.justifyContent}
              onChange={handleJustifyChange}
              size="sm"
            />
          </div>
          <div class="cortex-layout-section__group cortex-layout-section__reveal">
            <span class="cortex-section-label">Align</span>
            <SegmentedControl
              options={ALIGN_OPTIONS}
              value={values.alignItems}
              onChange={handleAlignChange}
              size="sm"
            />
          </div>
        </>
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
              <NumericInput
                value={parseFloat(values.minWidth) || 0}
                unit="px"
                label="Min"
                tooltip="Min Width"
                min={0}
                onChange={handleMinWidthChange}
              />
            )}
            {maxWidthEnabled && (
              <NumericInput
                value={values.maxWidth === 'none' ? 0 : parseFloat(values.maxWidth) || 0}
                unit="px"
                label="Max"
                tooltip="Max Width"
                min={0}
                onChange={handleMaxWidthChange}
              />
            )}
            {minHeightEnabled && (
              <NumericInput
                value={parseFloat(values.minHeight) || 0}
                unit="px"
                label="Min"
                tooltip="Min Height"
                min={0}
                onChange={handleMinHeightChange}
              />
            )}
            {maxHeightEnabled && (
              <NumericInput
                value={values.maxHeight === 'none' ? 0 : parseFloat(values.maxHeight) || 0}
                unit="px"
                label="Max"
                tooltip="Max Height"
                min={0}
                onChange={handleMaxHeightChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
