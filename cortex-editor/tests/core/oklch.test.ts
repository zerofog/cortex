import { describe, it, expect } from 'vitest'
import { oklchToHex } from '../../src/core/oklch.js'

describe('oklchToHex', () => {
  it('converts Tailwind red-50 oklch to hex', () => {
    const hex = oklchToHex('oklch(97.1% 0.013 17.38)')
    expect(hex).toBe('#fef2f2')
  })

  it('converts black', () => {
    expect(oklchToHex('oklch(0% 0 0)')).toBe('#000000')
  })

  it('converts white', () => {
    expect(oklchToHex('oklch(100% 0 0)')).toBe('#ffffff')
  })

  it('handles decimal L without percent', () => {
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000')
  })

  it('converts Tailwind blue-600 oklch to hex', () => {
    const hex = oklchToHex('oklch(54.615% 0.21521 262.881)')
    expect(hex).toBe('#2563eb')
  })

  it('returns null for invalid input', () => {
    expect(oklchToHex('not-oklch')).toBeNull()
    expect(oklchToHex('rgb(255, 0, 0)')).toBeNull()
    expect(oklchToHex('')).toBeNull()
  })

  it('handles extra whitespace', () => {
    expect(oklchToHex('oklch(  0%   0   0  )')).toBe('#000000')
  })

  it('handles oklch with slash alpha (alpha is discarded — hex has no alpha)', () => {
    // Same hex with or without alpha
    const withoutAlpha = oklchToHex('oklch(63.7% 0.237 25.331)')!
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 0.8)')).toBe(withoutAlpha)
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 80%)')).toBe(withoutAlpha)
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 0)')).toBe(withoutAlpha)
  })

  it('handles CSS Color L4 `none` keyword', () => {
    // none = 0 for that component (achromatic colors)
    expect(oklchToHex('oklch(50% 0 none)')).not.toBeNull()  // achromatic gray, hue=none
    expect(oklchToHex('oklch(50% none none)')).not.toBeNull()  // achromatic, chroma+hue=none
    expect(oklchToHex('oklch(none 0 0)')).toBe('#000000')  // L=0 = black
    // Achromatic color: same as oklch(50% 0 0)
    expect(oklchToHex('oklch(50% 0 none)')).toBe(oklchToHex('oklch(50% 0 0)'))
  })

  it('handles negative hue values', () => {
    // Negative hue is valid CSS — Math.cos/sin handle it correctly
    const hex = oklchToHex('oklch(50% 0.2 -30)')
    expect(hex).not.toBeNull()
  })
})
