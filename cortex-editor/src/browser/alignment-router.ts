export type ScreenAxis = 'x' | 'y'
export type DistributeAxis = 'main' | 'cross'

export type FlexCssProperty =
  | 'justify-content'
  | 'align-items'
  | 'align-content'

export type TypographyLayoutContext = 'block' | 'flex-row' | 'flex-column' | 'unsupported'
export type TypographyAlignmentAxis = 'horizontal' | 'vertical'
export type TypographyHorizontalAlign = 'left' | 'center' | 'right'
export type TypographyVerticalAlign = 'flex-start' | 'center' | 'flex-end'
export type TypographyAlignmentValue = TypographyHorizontalAlign | TypographyVerticalAlign

export interface TypographyAlignmentContext {
  display: string
  flexDirection: string
  height: string
  minHeight: string
  /** Font size in CSS pixels, e.g. `16` for `16px`. */
  fontSize: number
  /** Line height as a unitless multiplier of `fontSize`, e.g. `1.5`. */
  lineHeight: number
}

export const TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP =
  'Set Height or Min H in Layout before aligning text vertically.'
export const TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP =
  'Use Layout controls for this display type, or switch Display to Block/Flex.'

/**
 * Internal API contract for layout-context-aware editing resolvers.
 *
 * `code` is a stable machine-readable token consumers can branch on
 * (e.g., Apply-review at the MCP boundary may handle 'no-height' by
 * suggesting an explicit `min-height` write before the user retries).
 * `tooltip` is the user-facing string rendered by the Panel.
 *
 * Stability: this is an INTERNAL contract within cortex-editor, not a
 * published public API. Add new codes as resolvers grow new disabled
 * conditions; do not assume external consumers depend on the union.
 */
export type DisabledCode = 'no-height' | 'unsupported-display'

export type DisabledReason = Readonly<{
  code: DisabledCode
  tooltip: string
}>

export type PropertyEdit = Readonly<{
  property: string
  value: string
}>

/**
 * Result shape returned by every layout-context-aware editing resolver.
 *
 * - `disabledReason: null` ⇒ resolver could route the intent to property
 *   edits; `edits` is the concrete property-write list to dispatch.
 * - `disabledReason: { code, tooltip }` ⇒ resolver could not route the
 *   intent in this context; `edits` is empty. The caller should render
 *   `tooltip` and skip dispatching.
 *
 * Future intent resolvers (sizing, spacing, distribution) should return
 * this same shape so consumers (Panel, Apply-review) can treat them
 * uniformly.
 */
export type LayoutResolution = {
  disabledReason: DisabledReason | null
  edits: PropertyEdit[]
}

// Frozen at runtime so accidental `result.disabledReason.tooltip = '...'`
// throws in dev (strict mode) or silently fails — never propagates a mutation
// to other resolver returns of the same singleton. Belt-and-suspenders with
// the Readonly<> type which catches mutation attempts at compile time.
const NO_HEIGHT_REASON: DisabledReason = Object.freeze({
  code: 'no-height',
  tooltip: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP,
})
const UNSUPPORTED_DISPLAY_REASON: DisabledReason = Object.freeze({
  code: 'unsupported-display',
  tooltip: TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP,
})

const ABSOLUTE_LINE_HEIGHT_WARNING_THRESHOLD = 10
let warnedAboutAbsoluteTypographyLineHeight = false

export function isColumnDirection(direction: string): boolean {
  return direction === 'column' || direction === 'column-reverse'
}

function isRowReverseDirection(direction: string): boolean {
  return direction === 'row-reverse'
}

function isColumnReverseDirection(direction: string): boolean {
  return direction === 'column-reverse'
}

function flipFlexEdge(value: TypographyVerticalAlign): TypographyVerticalAlign {
  if (value === 'flex-start') return 'flex-end'
  if (value === 'flex-end') return 'flex-start'
  return value
}

export function flexAxisToCssProperty(
  role: ScreenAxis | { distribute: DistributeAxis },
  direction: string,
): FlexCssProperty {
  const column = isColumnDirection(direction)
  if (typeof role === 'string') {
    if (role === 'x') return column ? 'align-items' : 'justify-content'
    return column ? 'justify-content' : 'align-items'
  }
  if (role.distribute === 'main') return 'justify-content'
  return 'align-content'
}

export function typographyLayoutContext(
  display: string,
  flexDirection: string,
): TypographyLayoutContext {
  const flex = display === 'flex' || display === 'inline-flex'
  if (flex) return isColumnDirection(flexDirection) ? 'flex-column' : 'flex-row'
  return display === '' || display === 'block' ? 'block' : 'unsupported'
}

function parsePositivePx(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function lineHeightPx(context: TypographyAlignmentContext): number {
  if (context.lineHeight > ABSOLUTE_LINE_HEIGHT_WARNING_THRESHOLD) {
    if (!warnedAboutAbsoluteTypographyLineHeight) {
      console.warn(
        `[cortex] TypographyAlignmentContext.lineHeight should be a unitless multiplier; received ${context.lineHeight}. Treating it as CSS pixels for vertical alignment.`,
      )
      warnedAboutAbsoluteTypographyLineHeight = true
    }
    return Math.max(1, context.lineHeight)
  }
  return Math.max(1, context.fontSize * context.lineHeight)
}

export function typographyVerticalAlignEnabled(
  context: TypographyAlignmentContext,
): boolean {
  return typographyVerticalAlignDisabledReason(context) === null
}

export function typographyVerticalAlignDisabledReason(
  context: TypographyAlignmentContext,
): DisabledReason | null {
  const layout = typographyLayoutContext(context.display, context.flexDirection)
  if (layout === 'unsupported') return UNSUPPORTED_DISPLAY_REASON
  if (layout !== 'block') return null
  const contentHeight = lineHeightPx(context)
  const minHeight = parsePositivePx(context.minHeight)
  if (minHeight > contentHeight + 1) return null
  const height = parsePositivePx(context.height)
  return height > contentHeight + 1 ? null : NO_HEIGHT_REASON
}

function horizontalToFlex(
  value: TypographyAlignmentValue,
  flexDirection: string,
): TypographyVerticalAlign {
  const aligned =
    value === 'right' || value === 'flex-end'
      ? 'flex-end'
      : value === 'center'
        ? 'center'
        : 'flex-start'
  return isRowReverseDirection(flexDirection) ? flipFlexEdge(aligned) : aligned
}

function verticalToFlex(
  value: TypographyAlignmentValue,
  flexDirection: string,
): TypographyVerticalAlign | '' {
  // Inline value-mapping mirrors `horizontalToFlex` style. Previously this
  // delegated to `flexToVertical(value, '')` to leverage its value-mapping
  // while suppressing the reverse-direction flip; that empty-string sentinel
  // pattern is gone now that `flexToVertical` requires an explicit direction.
  const aligned: TypographyVerticalAlign | '' =
    value === 'flex-end'
      ? 'flex-end'
      : value === 'flex-start'
        ? 'flex-start'
        : value === 'center'
          ? 'center'
          : ''
  if (!aligned) return ''
  return isColumnReverseDirection(flexDirection) ? flipFlexEdge(aligned) : aligned
}

export function flexToHorizontal(value: string, flexDirection: string): TypographyHorizontalAlign | '' {
  if (value === 'flex-start') return isRowReverseDirection(flexDirection) ? 'right' : 'left'
  if (value === 'flex-end') return isRowReverseDirection(flexDirection) ? 'left' : 'right'
  if (value === 'start' || value === 'left') return 'left'
  if (value === 'end' || value === 'right') return 'right'
  if (value === 'center') return 'center'
  return ''
}

export function flexToVertical(value: string, flexDirection: string): TypographyVerticalAlign | '' {
  if (value === 'flex-end') return isColumnReverseDirection(flexDirection) ? 'flex-start' : 'flex-end'
  if (value === 'flex-start') return isColumnReverseDirection(flexDirection) ? 'flex-end' : 'flex-start'
  if (value === 'end') return 'flex-end'
  if (value === 'center') return 'center'
  if (value === 'start') return 'flex-start'
  return ''
}

export function resolveTypographyAlignmentEdits({
  context,
  axis,
  value,
}: {
  context: TypographyAlignmentContext
  axis: TypographyAlignmentAxis
  value: TypographyAlignmentValue
}): LayoutResolution {
  const layout = typographyLayoutContext(context.display, context.flexDirection)

  if (axis === 'horizontal') {
    if (layout === 'block' || layout === 'unsupported') {
      const textAlign: TypographyHorizontalAlign =
        value === 'right' || value === 'flex-end'
          ? 'right'
          : value === 'center'
            ? 'center'
            : 'left'
      return { disabledReason: null, edits: [{ property: 'text-align', value: textAlign }] }
    }
    return {
      disabledReason: null,
      edits: [{
        property: layout === 'flex-column' ? 'align-items' : 'justify-content',
        value: horizontalToFlex(value, context.flexDirection),
      }],
    }
  }

  const vertical = verticalToFlex(value, context.flexDirection)
  if (!vertical) return { disabledReason: null, edits: [] }
  if (layout === 'unsupported') {
    return { disabledReason: UNSUPPORTED_DISPLAY_REASON, edits: [] }
  }
  if (layout === 'block') {
    const disabledReason = typographyVerticalAlignDisabledReason(context)
    if (disabledReason) {
      return { disabledReason, edits: [] }
    }
    return {
      disabledReason: null,
      edits: [
        { property: 'display', value: 'flex' },
        { property: 'flex-direction', value: 'column' },
        { property: 'justify-content', value: vertical },
      ],
    }
  }

  return {
    disabledReason: null,
    edits: [{
      property: layout === 'flex-column' ? 'justify-content' : 'align-items',
      value: vertical,
    }],
  }
}
