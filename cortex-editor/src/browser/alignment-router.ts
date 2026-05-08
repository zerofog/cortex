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

export interface TypographyAlignmentEdit {
  property: string
  value: string
}

export const TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP =
  'Set Height or Min H in Layout before aligning text vertically.'
export const TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP =
  'Use Layout controls for this display type, or switch Display to Block/Flex.'

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
): string | null {
  const layout = typographyLayoutContext(context.display, context.flexDirection)
  if (layout === 'unsupported') return TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP
  if (layout !== 'block') return null
  const contentHeight = lineHeightPx(context)
  const minHeight = parsePositivePx(context.minHeight)
  if (minHeight > contentHeight + 1) return null
  const height = parsePositivePx(context.height)
  return height > contentHeight + 1 ? null : TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP
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
  const aligned = flexToVertical(value)
  if (!aligned) return ''
  return isColumnReverseDirection(flexDirection) ? flipFlexEdge(aligned) : aligned
}

export function flexToHorizontal(value: string, flexDirection = ''): TypographyHorizontalAlign | '' {
  if (value === 'flex-start') return isRowReverseDirection(flexDirection) ? 'right' : 'left'
  if (value === 'flex-end') return isRowReverseDirection(flexDirection) ? 'left' : 'right'
  if (value === 'start' || value === 'left') return 'left'
  if (value === 'end' || value === 'right') return 'right'
  if (value === 'center') return 'center'
  return ''
}

export function flexToVertical(value: string, flexDirection = ''): TypographyVerticalAlign | '' {
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
}): { disabledReason: string | null; edits: TypographyAlignmentEdit[] } {
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
    return { disabledReason: TYPOGRAPHY_VERTICAL_UNSUPPORTED_DISPLAY_TOOLTIP, edits: [] }
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
