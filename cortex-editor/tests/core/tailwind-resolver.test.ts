import { describe, it, expect } from 'vitest'
import { TailwindResolver, flattenColors } from '../../src/core/tailwind-resolver.js'

function defaultSpacingTheme() {
  return {
    spacing: {
      '0': '0px',
      'px': '1px',
      '0.5': '0.125rem',
      '1': '0.25rem',
      '2': '0.5rem',
      '3': '0.75rem',
      '4': '1rem',
      '5': '1.25rem',
      '6': '1.5rem',
      '8': '2rem',
      '10': '2.5rem',
      '12': '3rem',
      '16': '4rem',
    },
  }
}

describe('TailwindResolver', () => {
  describe('findClass', () => {
    it('finds pt-4 for padding-top 16px', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('padding-top', '16px')).toBe('pt-4')
    })

    it('finds mb-2 for margin-bottom 8px', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('margin-bottom', '8px')).toBe('mb-2')
    })

    it('finds gap-4 for gap 16px', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('gap', '16px')).toBe('gap-4')
    })

    it('returns null for unknown value', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('padding-top', '7px')).toBeNull()
    })

    it('returns null for unknown property', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('z-index', '10')).toBeNull()
    })
  })

  describe('custom theme.extend values', () => {
    it('resolves custom spacing values', () => {
      const theme = {
        spacing: {
          ...defaultSpacingTheme().spacing,
          '18': '4.5rem',
          'hero': '600px',
        },
      }
      const resolver = TailwindResolver.fromTheme(theme)
      expect(resolver.findClass('padding-top', '72px')).toBe('pt-18')
      expect(resolver.findClass('padding-top', '600px')).toBe('pt-hero')
    })
  })

  describe('getSnapPoints', () => {
    it('returns sorted px values for spacing', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      const snaps = resolver.getSnapPoints('padding-top')
      expect(snaps).toContain('0px')
      expect(snaps).toContain('4px')
      expect(snaps).toContain('8px')
      expect(snaps).toContain('16px')
      const nums = snaps.map(s => parseFloat(s))
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]!)
      }
    })

    it('returns empty array for unknown property', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.getSnapPoints('z-index')).toEqual([])
    })
  })

  describe('fontSize', () => {
    it('resolves font-size from tuple format', () => {
      const theme = {
        spacing: {},
        fontSize: {
          'xs': ['0.75rem', { lineHeight: '1rem' }],
          'sm': ['0.875rem', { lineHeight: '1.25rem' }],
          'base': ['1rem', { lineHeight: '1.5rem' }],
          'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        } as Record<string, string | [string, Record<string, string>]>,
      }
      const resolver = TailwindResolver.fromTheme(theme)
      expect(resolver.findClass('font-size', '12px')).toBe('text-xs')
      expect(resolver.findClass('font-size', '16px')).toBe('text-base')
    })
  })

  describe('edge cases', () => {
    it('handles 0 value', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('padding-top', '0px')).toBe('pt-0')
    })

    it('handles px value (1px)', () => {
      const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
      expect(resolver.findClass('padding-top', '1px')).toBe('pt-px')
    })
  })
})

describe('flattenColors', () => {
  it('extracts shade-500 from color families', () => {
    const colors = {
      red: { 100: '#fee2e2', 500: '#ef4444', 900: '#7f1d1d' },
      blue: { 100: '#dbeafe', 500: '#3b82f6', 900: '#1e3a8a' },
    }
    expect(flattenColors(colors)).toEqual(['#ef4444', '#3b82f6'])
  })

  it('extracts flat custom colors', () => {
    const colors = {
      brand: '#1a73e8',
      accent: '#34a853',
    }
    expect(flattenColors(colors)).toEqual(['#1a73e8', '#34a853'])
  })

  it('skips inherit, current, transparent', () => {
    const colors = {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      red: { 500: '#ef4444' },
    }
    expect(flattenColors(colors)).toEqual(['#ef4444'])
  })

  it('falls back to DEFAULT shade when 500 missing', () => {
    const colors = {
      primary: { DEFAULT: '#1a73e8', light: '#4a9af5' },
    }
    expect(flattenColors(colors)).toEqual(['#1a73e8'])
  })

  it('falls back to first hex shade when 500 and DEFAULT missing', () => {
    const colors = {
      custom: { 50: '#fafafa', 100: '#f5f5f5' },
    }
    expect(flattenColors(colors)).toEqual(['#fafafa'])
  })

  it('handles mixed flat and family colors', () => {
    const colors = {
      brand: '#1a73e8',
      red: { 500: '#ef4444' },
      transparent: 'transparent',
    }
    expect(flattenColors(colors)).toEqual(['#1a73e8', '#ef4444'])
  })
})
