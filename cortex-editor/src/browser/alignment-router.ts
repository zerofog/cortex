export type ScreenAxis = 'x' | 'y'
export type DistributeAxis = 'main' | 'cross'

export type FlexCssProperty =
  | 'justify-content'
  | 'align-items'
  | 'align-content'

export type TypographyLayoutContext = 'block' | 'flex-row' | 'flex-column'
export type TypographyAlignmentAxis = 'horizontal' | 'vertical'
export type TypographyHorizontalAlign = 'left' | 'center' | 'right'
export type TypographyVerticalAlign = 'flex-start' | 'center' | 'flex-end'
export type TypographyAlignmentValue = TypographyHorizontalAlign | TypographyVerticalAlign

export interface TypographyAlignmentContext {
  display: string
  flexDirection: string
  height: string
  minHeight: string
  fontSize: number
  lineHeight: number
}

export interface TypographyAlignmentEdit {
  property: string
  value: string
}

export const TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP =
  'Set Height or Min H in Layout before aligning text vertically.'

export function isColumnDirection(direction: string): boolean {
  return direction === 'column' || direction === 'column-reverse'
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
  if (!flex) return 'block'
  return isColumnDirection(flexDirection) ? 'flex-column' : 'flex-row'
}

function parsePositivePx(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function lineHeightPx(context: TypographyAlignmentContext): number {
  return Math.max(1, context.fontSize * context.lineHeight)
}

export function typographyVerticalAlignEnabled(
  context: TypographyAlignmentContext,
): boolean {
  if (typographyLayoutContext(context.display, context.flexDirection) !== 'block') return true
  const contentHeight = lineHeightPx(context)
  const minHeight = parsePositivePx(context.minHeight)
  if (minHeight > contentHeight + 1) return true
  const height = parsePositivePx(context.height)
  return height > contentHeight + 1
}

function horizontalToFlex(value: TypographyAlignmentValue): TypographyVerticalAlign {
  if (value === 'right' || value === 'flex-end') return 'flex-end'
  if (value === 'center') return 'center'
  return 'flex-start'
}

export function flexToHorizontal(value: string): TypographyHorizontalAlign | '' {
  if (value === 'flex-start' || value === 'start' || value === 'left') return 'left'
  if (value === 'flex-end' || value === 'end' || value === 'right') return 'right'
  if (value === 'center') return 'center'
  return ''
}

export function flexToVertical(value: string): TypographyVerticalAlign | '' {
  if (value === 'flex-end' || value === 'end') return 'flex-end'
  if (value === 'center') return 'center'
  if (value === 'flex-start' || value === 'start') return 'flex-start'
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
    if (layout === 'block') {
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
        value: horizontalToFlex(value),
      }],
    }
  }

  const vertical = flexToVertical(value)
  if (!vertical) return { disabledReason: null, edits: [] }
  if (layout === 'block') {
    if (!typographyVerticalAlignEnabled(context)) {
      return { disabledReason: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP, edits: [] }
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
