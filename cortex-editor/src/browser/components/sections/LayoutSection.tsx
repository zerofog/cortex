import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { NumericInput } from '../controls/NumericInput.js'

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
}

export interface LayoutSectionProps {
  values: LayoutValues
  onChange: (change: LayoutChange) => void
  onScrub?: (change: LayoutChange) => void
  onScrubEnd?: (change: LayoutChange) => void
}

/** Extract layout-related values from a CSSStyleDeclaration. */
export function parseLayoutValues(cs: CSSStyleDeclaration): LayoutValues {
  return {
    display: cs.display ?? 'block',
    visibility: cs.visibility ?? 'visible',
    flexDirection: cs.flexDirection ?? 'row',
    justifyContent: cs.justifyContent ?? 'flex-start',
    alignItems: cs.alignItems ?? 'stretch',
    width: cs.width ?? 'auto',
    height: cs.height ?? 'auto',
  }
}

const DISPLAY_OPTIONS = [
  { value: 'block', label: 'block', icon: '□', title: 'Block' },
  { value: 'flex', label: 'flex', icon: '⇔', title: 'Flex' },
  { value: 'grid', label: 'grid', icon: '⊞', title: 'Grid' },
  { value: 'inline', label: 'inline', icon: '↔', title: 'Inline' },
  { value: 'none', label: 'none', icon: '⊘', title: 'None' },
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

  // Review finding 2b: plain functions instead of misleading useCallback factory
  const handleWidthChange = useCallback(
    (v: number) => onChange({ property: 'width', value: `${v}px` }),
    [onChange],
  )
  const handleWidthScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'width', value: `${v}px` }) },
    [onScrub],
  )
  const handleWidthScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'width', value: `${v}px` }) },
    [onScrubEnd],
  )
  const handleHeightChange = useCallback(
    (v: number) => onChange({ property: 'height', value: `${v}px` }),
    [onChange],
  )
  const handleHeightScrub = useCallback(
    (v: number) => { if (onScrub) onScrub({ property: 'height', value: `${v}px` }) },
    [onScrub],
  )
  const handleHeightScrubEnd = useCallback(
    (v: number) => { if (onScrubEnd) onScrubEnd({ property: 'height', value: `${v}px` }) },
    [onScrubEnd],
  )

  return (
    <div class="cortex-layout-section" data-section-id="layout">
      <div class="cortex-layout-section__group">
        <span class="cortex-section-label">Display</span>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={values.display}
          onChange={handleDisplayChange}
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
          <NumericInput
            value={isAutoWidth ? 0 : widthNum}
            unit={isAutoWidth ? 'auto' : 'px'}
            label="W"
            min={0}
            onChange={handleWidthChange}
            onScrub={handleWidthScrub}
            onScrubEnd={handleWidthScrubEnd}
          />
          <NumericInput
            value={isAutoHeight ? 0 : heightNum}
            unit={isAutoHeight ? 'auto' : 'px'}
            label="H"
            min={0}
            onChange={handleHeightChange}
            onScrub={handleHeightScrub}
            onScrubEnd={handleHeightScrubEnd}
          />
        </div>
      </div>
    </div>
  )
}
