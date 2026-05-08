/**
 * LayoutSection — Panel v2 Task 10 (ZF0-1188)
 *
 * Thin orchestrator (~150 LOC) that routes display state to child
 * sub-controls: FlexControls (Task 8), GridControls (Task 9),
 * SizingControls and SpacingControls (this task).
 *
 * Business logic: This section controls the CSS layout model (display,
 * visibility), delegates flex/grid configuration to specialized
 * sub-controls, and hosts sizing (width/height) and spacing
 * (padding/margin) sub-controls. All CSS changes flow through the
 * single onChange callback to the Panel's override system.
 */
import type { JSX } from 'preact'
import { useCallback } from 'preact/hooks'
import { isDimmed } from './types.js'
import type { SectionChange } from './types.js'
import { SegmentedControl } from '../controls/SegmentedControl.js'
import { FlexControls } from './FlexControls.js'
import type { FlexValues, FlexChange } from './FlexControls.js'
import { GridControls } from './GridControls.js'
import type { GridValues, GridChange } from './GridControls.js'
import { SizingControls } from './SizingControls.js'
import { SpacingControls } from './SpacingControls.js'

export type LayoutChange = SectionChange

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
  overflow: string
  boxSizing: string
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
  /** Spacing data (passed from Panel.tsx, forwarded to SpacingControls). */
  spacing?: {
    padding: { top: number; right: number; bottom: number; left: number }
    margin: { top: number; right: number; bottom: number; left: number }
  }
  onSpacingChange?: (change: LayoutChange) => void
  onSpacingScrub?: (change: LayoutChange) => void
  onSpacingScrubEnd?: (change: LayoutChange) => void
  /**
   * When true, the element's source override has exceeded the TTL without hmr_verified
   * arriving. Forwarded to SizingControls and SpacingControls which thread it to their
   * NumericInput controls as the stale indicator (orange/yellow tint + recovery tooltip).
   */
  stale?: boolean
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
    overflow: cs.overflow ?? 'visible',
    boxSizing: cs.boxSizing ?? 'content-box',
  }
}

const DISPLAY_OPTIONS = [
  { value: 'block', label: 'block' },
  { value: 'flex', label: 'flex' },
  { value: 'grid', label: 'grid' },
  { value: 'inline', label: 'inline' },
  { value: 'none', label: 'none' },
]

export function LayoutSection({
  values,
  onChange,
  onScrub,
  onScrubEnd,
  dimmedProperties,
  mixedProperties,
  spacing,
  onSpacingChange,
  onSpacingScrub,
  onSpacingScrubEnd,
  stale,
}: LayoutSectionProps): JSX.Element {
  const isFlex = values.display === 'flex'
  const isGrid = values.display === 'grid'
  const isNone = values.display === 'none'

  const handleDisplayChange = useCallback(
    (v: string) => onChange({ property: 'display', value: v }),
    [onChange],
  )

  // FlexChange and GridChange are structurally identical to LayoutChange
  // (`{ property, value }`), so the parent callbacks pass through unchanged.
  const handleFlexChange: (c: FlexChange) => void = onChange
  const handleFlexScrub: ((c: FlexChange) => void) | undefined = onScrub
  const handleFlexScrubEnd: ((c: FlexChange) => void) | undefined = onScrubEnd
  const handleGridChange: (c: GridChange) => void = onChange
  const handleGridScrub: ((c: GridChange) => void) | undefined = onScrub
  const handleGridScrubEnd: ((c: GridChange) => void) | undefined = onScrubEnd

  // Build explicit subsets for sub-controls (compile-time safety).
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

  return (
    <div class="cortex-layout-section" data-section-id="layout">
      <div class={`cortex-layout-section__group${isDimmed(dimmedProperties, 'display') ? ' cortex-control--dimmed' : ''}`}>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={values.display}
          onChange={handleDisplayChange}
          mixed={mixedProperties?.has('display')}
        />
      </div>

      {isFlex && (
        <div class="cortex-layout-section__group cortex-layout-section__reveal">
          <FlexControls
            values={flexValues}
            onChange={handleFlexChange}
            onScrub={handleFlexScrub}
            onScrubEnd={handleFlexScrubEnd}
            dimmedProperties={dimmedProperties}
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
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
          />
        </div>
      )}

      {!isNone && (
        <div class="cortex-layout-section__group">
          <SizingControls
            values={{
              width: values.width,
              height: values.height,
              minWidth: values.minWidth,
              maxWidth: values.maxWidth,
              minHeight: values.minHeight,
              maxHeight: values.maxHeight,
              overflow: values.overflow,
              boxSizing: values.boxSizing,
            }}
            onChange={onChange}
            onScrub={onScrub}
            onScrubEnd={onScrubEnd}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
            stale={stale}
          />
        </div>
      )}

      {!isNone && spacing && onSpacingChange && (
        <div class="cortex-layout-section__group">
          <SpacingControls
            padding={spacing.padding}
            margin={spacing.margin}
            boxSizing={values.boxSizing}
            onChange={onSpacingChange}
            onScrub={onSpacingScrub}
            onScrubEnd={onSpacingScrubEnd}
            dimmedProperties={dimmedProperties}
            mixedProperties={mixedProperties}
            stale={stale}
          />
        </div>
      )}
    </div>
  )
}
