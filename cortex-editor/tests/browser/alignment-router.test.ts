import { describe, expect, it } from 'vitest'
import {
  TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP,
  flexAxisToCssProperty,
  flexToHorizontal,
  resolveTypographyAlignmentEdits,
  typographyVerticalAlignEnabled,
} from '../../src/browser/alignment-router.js'

const BASE = {
  display: 'block',
  flexDirection: 'row',
  height: '24px',
  minHeight: '0px',
  fontSize: 16,
  lineHeight: 1.5,
}

describe('alignment-router', () => {
  it.each([
    ['row', 'x', 'justify-content'],
    ['row', 'y', 'align-items'],
    ['column', 'x', 'align-items'],
    ['column', 'y', 'justify-content'],
  ] as const)('routes flex %s %s axis to %s', (direction, axis, property) => {
    expect(flexAxisToCssProperty(axis, direction)).toBe(property)
  })

  it.each([
    [
      'block horizontal',
      { ...BASE, display: 'block' },
      'horizontal',
      'center',
      [{ property: 'text-align', value: 'center' }],
    ],
    [
      'block vertical with height',
      { ...BASE, display: 'block', height: '80px' },
      'vertical',
      'center',
      [
        { property: 'display', value: 'flex' },
        { property: 'flex-direction', value: 'column' },
        { property: 'justify-content', value: 'center' },
      ],
    ],
    [
      'flex-row horizontal',
      { ...BASE, display: 'flex', flexDirection: 'row' },
      'horizontal',
      'right',
      [{ property: 'justify-content', value: 'flex-end' }],
    ],
    [
      'flex-row vertical',
      { ...BASE, display: 'flex', flexDirection: 'row' },
      'vertical',
      'flex-end',
      [{ property: 'align-items', value: 'flex-end' }],
    ],
    [
      'flex-column horizontal',
      { ...BASE, display: 'flex', flexDirection: 'column' },
      'horizontal',
      'right',
      [{ property: 'align-items', value: 'flex-end' }],
    ],
    [
      'flex-column vertical',
      { ...BASE, display: 'flex', flexDirection: 'column' },
      'vertical',
      'center',
      [{ property: 'justify-content', value: 'center' }],
    ],
  ] as const)('resolves typography %s edit', (_label, context, axis, value, expected) => {
    expect(resolveTypographyAlignmentEdits({ context, axis, value })).toEqual({
      disabledReason: null,
      edits: expected,
    })
  })

  it('disables block vertical alignment when the block has no extra vertical space', () => {
    expect(typographyVerticalAlignEnabled(BASE)).toBe(false)
    expect(typographyVerticalAlignEnabled({ ...BASE, minHeight: '12px' })).toBe(false)
    expect(resolveTypographyAlignmentEdits({
      context: BASE,
      axis: 'vertical',
      value: 'center',
    })).toEqual({
      disabledReason: TYPOGRAPHY_VERTICAL_DISABLED_TOOLTIP,
      edits: [],
    })
  })

  it.each([
    ['height', { ...BASE, height: '80px' }],
    ['min-height', { ...BASE, minHeight: '80px' }],
  ])('enables block vertical alignment when %s creates space', (_label, context) => {
    expect(typographyVerticalAlignEnabled(context)).toBe(true)
  })

  it.each(['stretch', 'space-between', 'space-around'] as const)(
    'leaves unsupported horizontal flex value %s unselected',
    (value) => {
      expect(flexToHorizontal(value)).toBe('')
    },
  )
})
