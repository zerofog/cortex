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
})
