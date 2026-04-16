import { describe, it, expect } from 'vitest'
import { extractTextComponents } from '../../src/core/text-components.js'

describe('extractTextComponents', () => {
  it('returns bundle when size + line-height + letter-spacing + weight all present', () => {
    const props = new Map([
      ['--text-body-md', '14px'],
      ['--text-body-md--line-height', '21px'],
      ['--text-body-md--letter-spacing', '0px'],
      ['--text-body-md--font-weight', '400'],
    ])
    expect(extractTextComponents(props)).toEqual([
      {
        name: 'body-md',
        fontSize: '14px',
        lineHeight: '21px',
        letterSpacing: '0px',
        fontWeight: '400',
        fontFamily: undefined,
      },
    ])
  })

  it('skips partial bundles that lack any required sub-property', () => {
    const props = new Map([
      ['--text-sm', '14px'],
      ['--text-sm--line-height', '21px'],
      // missing letter-spacing and font-weight
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('includes font-family when --text-{name}--font-family is present', () => {
    const props = new Map([
      ['--text-heading-1', '32px'],
      ['--text-heading-1--line-height', '40px'],
      ['--text-heading-1--letter-spacing', '-0.5px'],
      ['--text-heading-1--font-weight', '700'],
      ['--text-heading-1--font-family', 'Inter, sans-serif'],
    ])
    const result = extractTextComponents(props)
    expect(result[0]?.fontFamily).toBe('Inter, sans-serif')
  })

  it('ignores non-text properties', () => {
    const props = new Map([
      ['--color-gray-900', '#111827'],
      ['--spacing', '0.25rem'],
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('ignores --text-shadow-* properties (they are not typography bundles)', () => {
    const props = new Map([
      ['--text-shadow-sm', '0 1px 2px rgba(0,0,0,0.05)'],
    ])
    expect(extractTextComponents(props)).toEqual([])
  })

  it('returns multiple bundles sorted by font-size ascending', () => {
    const props = new Map([
      ['--text-lg', '18px'],
      ['--text-lg--line-height', '28px'],
      ['--text-lg--letter-spacing', '0px'],
      ['--text-lg--font-weight', '400'],
      ['--text-sm', '14px'],
      ['--text-sm--line-height', '20px'],
      ['--text-sm--letter-spacing', '0px'],
      ['--text-sm--font-weight', '400'],
    ])
    const names = extractTextComponents(props).map(b => b.name)
    expect(names).toEqual(['sm', 'lg'])
  })
})
