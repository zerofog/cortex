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
    // Alpha is stripped — Tailwind separates color from opacity
    const withoutAlpha = oklchToHex('oklch(63.7% 0.237 25.331)')!
    expect(withoutAlpha).toBe('#fb2c36')  // concrete assertion, not self-referential
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 0.8)')).toBe('#fb2c36')
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 80%)')).toBe('#fb2c36')
    expect(oklchToHex('oklch(63.7% 0.237 25.331 / 0)')).toBe('#fb2c36')
  })

  it('handles CSS Color L4 `none` keyword', () => {
    // none = 0 for that component. oklch(50% 0 0) is a mid-gray.
    const gray50 = oklchToHex('oklch(50% 0 0)')!
    expect(gray50).toMatch(/^#[0-9a-f]{6}$/)  // valid hex
    expect(oklchToHex('oklch(50% 0 none)')).toBe(gray50)  // hue=none same as hue=0 for achromatic
    expect(oklchToHex('oklch(50% none none)')).toBe(gray50)  // chroma+hue=none same as 0,0
    expect(oklchToHex('oklch(none 0 0)')).toBe('#000000')  // L=0 = black
  })

  it('handles negative hue values', () => {
    // -30 degrees = 330 degrees — should produce the same non-null hex
    const neg = oklchToHex('oklch(50% 0.2 -30)')
    const pos = oklchToHex('oklch(50% 0.2 330)')
    expect(neg).not.toBeNull()
    expect(pos).not.toBeNull()
    expect(neg).toBe(pos)
  })
})
