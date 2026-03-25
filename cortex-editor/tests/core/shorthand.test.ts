import { describe, it, expect } from 'vitest'
import postcss from 'postcss'
import {
  parseBoxSides,
  recomposeBoxSides,
  parseTypeClassified,
  findAndValidateShorthand,
  determineWriteStrategy,
} from '../../src/core/rewriter/shorthand.js'

function makeRule(css: string): postcss.Rule {
  const root = postcss.parse(css)
  return root.first as postcss.Rule
}

describe('parseBoxSides', () => {
  it('parses 1 value (all sides equal)', () => {
    expect(parseBoxSides('10px')).toEqual({
      top: '10px', right: '10px', bottom: '10px', left: '10px',
    })
  })

  it('parses 2 values (TB RL)', () => {
    expect(parseBoxSides('10px 20px')).toEqual({
      top: '10px', right: '20px', bottom: '10px', left: '20px',
    })
  })

  it('parses 3 values (T RL B)', () => {
    expect(parseBoxSides('10px 20px 30px')).toEqual({
      top: '10px', right: '20px', bottom: '30px', left: '20px',
    })
  })

  it('parses 4 values (T R B L)', () => {
    expect(parseBoxSides('10px 20px 30px 40px')).toEqual({
      top: '10px', right: '20px', bottom: '30px', left: '40px',
    })
  })

  it('returns null for var()', () => {
    expect(parseBoxSides('var(--spacing)')).toBeNull()
  })

  it('returns null for calc()', () => {
    expect(parseBoxSides('calc(10px + 5px)')).toBeNull()
  })

  it('handles mixed units', () => {
    expect(parseBoxSides('1rem 2em')).toEqual({
      top: '1rem', right: '2em', bottom: '1rem', left: '2em',
    })
  })

  it('returns null for 5+ values', () => {
    expect(parseBoxSides('1px 2px 3px 4px 5px')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseBoxSides('')).toBeNull()
  })
})

describe('recomposeBoxSides', () => {
  it('all four equal -> 1 value', () => {
    expect(recomposeBoxSides({ top: '10px', right: '10px', bottom: '10px', left: '10px' }))
      .toBe('10px')
  })

  it('top=bottom AND right=left -> 2 values', () => {
    expect(recomposeBoxSides({ top: '10px', right: '20px', bottom: '10px', left: '20px' }))
      .toBe('10px 20px')
  })

  it('right=left -> 3 values', () => {
    expect(recomposeBoxSides({ top: '10px', right: '20px', bottom: '30px', left: '20px' }))
      .toBe('10px 20px 30px')
  })

  it('all different -> 4 values', () => {
    expect(recomposeBoxSides({ top: '10px', right: '20px', bottom: '30px', left: '40px' }))
      .toBe('10px 20px 30px 40px')
  })
})

describe('parseTypeClassified', () => {
  it('parses width + style + color', () => {
    expect(parseTypeClassified('1px solid red')).toEqual({
      width: '1px', style: 'solid', color: 'red',
    })
  })

  it('parses style only', () => {
    expect(parseTypeClassified('dashed')).toEqual({ style: 'dashed' })
  })

  it('parses width + style', () => {
    expect(parseTypeClassified('2px dotted')).toEqual({ width: '2px', style: 'dotted' })
  })

  it('parses keyword width', () => {
    expect(parseTypeClassified('thin solid #000')).toEqual({
      width: 'thin', style: 'solid', color: '#000',
    })
  })

  it('returns null for var()', () => {
    expect(parseTypeClassified('var(--border)')).toBeNull()
  })

  it('handles rgb() color', () => {
    const result = parseTypeClassified('1px solid rgb(0, 0, 0)')
    expect(result).not.toBeNull()
    expect(result!.width).toBe('1px')
    expect(result!.style).toBe('solid')
    expect(result!.color).toBe('rgb(0, 0, 0)')
  })
})

describe('findAndValidateShorthand', () => {
  it('finds padding for padding-top', () => {
    const rule = makeRule('.a { padding: 10px 20px; }')
    const result = findAndValidateShorthand('padding-top', rule)
    expect(result).not.toBeNull()
    expect(result!.suffix).toBe('top')
    expect(result!.parsed).toHaveProperty('top')
  })

  it('rejects padding for padding-inline-start (logical property)', () => {
    const rule = makeRule('.a { padding: 10px; }')
    const result = findAndValidateShorthand('padding-inline-start', rule)
    expect(result).toBeNull()
  })

  it('rejects border-top for border-top-left-radius (cross-family)', () => {
    const rule = makeRule('.a { border-top: 1px solid red; }')
    const result = findAndValidateShorthand('border-top-left-radius', rule)
    expect(result).toBeNull()
  })

  it('rejects border for border-collapse (unrelated)', () => {
    const rule = makeRule('.a { border: 1px solid red; }')
    const result = findAndValidateShorthand('border-collapse', rule)
    expect(result).toBeNull()
  })

  it('finds border for border-color', () => {
    const rule = makeRule('.a { border: 1px solid red; }')
    const result = findAndValidateShorthand('border-color', rule)
    expect(result).not.toBeNull()
    expect(result!.suffix).toBe('color')
    expect(result!.parsed).toHaveProperty('color')
  })

  it('finds border for border-width', () => {
    const rule = makeRule('.a { border: 2px dashed blue; }')
    const result = findAndValidateShorthand('border-width', rule)
    expect(result).not.toBeNull()
    expect(result!.suffix).toBe('width')
  })

  it('finds margin for margin-left', () => {
    const rule = makeRule('.a { margin: 5px 10px 15px 20px; }')
    const result = findAndValidateShorthand('margin-left', rule)
    expect(result).not.toBeNull()
    expect(result!.suffix).toBe('left')
    expect(result!.parsed.left).toBe('20px')
  })

  it('returns null when no shorthand exists in rule', () => {
    const rule = makeRule('.a { color: red; }')
    const result = findAndValidateShorthand('padding-top', rule)
    expect(result).toBeNull()
  })
})

describe('determineWriteStrategy', () => {
  it('exact longhand found -> update-longhand', () => {
    const rule = makeRule('.a { padding-top: 10px; }')
    const result = determineWriteStrategy(rule, 'padding-top', '20px')
    expect(result.type).toBe('update-longhand')
    if (result.type === 'update-longhand') {
      expect(result.decl.prop).toBe('padding-top')
      expect(result.value).toBe('20px')
    }
  })

  it('shorthand found + validated -> update-shorthand', () => {
    const rule = makeRule('.a { padding: 10px 20px; }')
    const result = determineWriteStrategy(rule, 'padding-top', '30px')
    expect(result.type).toBe('update-shorthand')
    if (result.type === 'update-shorthand') {
      expect(result.newValues.top).toBe('30px')
      expect(result.newValues.right).toBe('20px')
    }
  })

  it('shorthand with var() -> add-longhand-override', () => {
    const rule = makeRule('.a { padding: var(--spacing); }')
    const result = determineWriteStrategy(rule, 'padding-top', '10px')
    expect(result.type).toBe('add-longhand-override')
    if (result.type === 'add-longhand-override') {
      expect(result.prop).toBe('padding-top')
      expect(result.value).toBe('10px')
      expect(result.reason).toBeTruthy()
    }
  })

  it('nothing found -> add-longhand', () => {
    const rule = makeRule('.a { color: red; }')
    const result = determineWriteStrategy(rule, 'padding-top', '10px')
    expect(result.type).toBe('add-longhand')
    if (result.type === 'add-longhand') {
      expect(result.prop).toBe('padding-top')
      expect(result.value).toBe('10px')
    }
  })

  it('shorthand with !important -> preserves !important', () => {
    const rule = makeRule('.a { padding: 10px 20px !important; }')
    const result = determineWriteStrategy(rule, 'padding-top', '30px')
    expect(result.type).toBe('update-shorthand')
    if (result.type === 'update-shorthand') {
      expect(result.shorthandDecl.important).toBe(true)
    }
  })

  it('border shorthand -> update-shorthand for border-color', () => {
    const rule = makeRule('.a { border: 1px solid red; }')
    const result = determineWriteStrategy(rule, 'border-color', 'blue')
    expect(result.type).toBe('update-shorthand')
    if (result.type === 'update-shorthand') {
      expect(result.newValues.color).toBe('blue')
      expect(result.newValues.width).toBe('1px')
      expect(result.newValues.style).toBe('solid')
    }
  })
})
