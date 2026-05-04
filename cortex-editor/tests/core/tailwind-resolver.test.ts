import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TailwindResolver, flattenColors, normalizeHex, type ResolvedTheme } from '../../src/core/tailwind-resolver.js'

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

function defaultColorTheme(): ResolvedTheme {
  return {
    colors: {
      inherit: 'inherit',
      current: 'currentColor',
      transparent: 'transparent',
      black: '#000000',
      white: '#ffffff',
      red: {
        50: '#fef2f2',
        100: '#fee2e2',
        500: '#ef4444',
        900: '#7f1d1d',
      },
      blue: {
        100: '#dbeafe',
        500: '#3b82f6',
        900: '#1e3a8a',
      },
      gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        900: '#111827',
      },
      brand: '#1a73e8',
    },
  }
}

function defaultBorderTheme(): ResolvedTheme {
  return {
    borderWidth: {
      '0': '0px',
      'DEFAULT': '1px',
      '2': '2px',
      '4': '4px',
      '8': '8px',
    },
    borderRadius: {
      'none': '0px',
      'sm': '0.125rem',
      'DEFAULT': '0.25rem',
      'md': '0.375rem',
      'lg': '0.5rem',
      'xl': '0.75rem',
      '2xl': '1rem',
      'full': '9999px',
    },
  }
}

function defaultOpacityTheme(): ResolvedTheme {
  return {
    opacity: {
      '0': '0',
      '5': '0.05',
      '10': '0.1',
      '25': '0.25',
      '50': '0.5',
      '75': '0.75',
      '100': '1',
    },
  }
}

function defaultBlurTheme(): ResolvedTheme {
  return {
    blur: {
      'none': '0',
      'sm': '4px',
      'DEFAULT': '8px',
      'md': '12px',
      'lg': '16px',
      'xl': '24px',
    },
    backdropBlur: {
      'sm': '4px',
      'DEFAULT': '8px',
      'lg': '16px',
    },
  }
}

function defaultShadowTheme(): ResolvedTheme {
  return {
    boxShadow: {
      'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      'none': 'none',
    },
  }
}

// ── Original tests (backward compatibility) ──────────────────────────

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

  // ── Colors (Step 4) ──────────────────────────────────────────────────

  describe('colors', () => {
    it('resolves background-color from rgb()', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('background-color', 'rgb(239, 68, 68)')).toBe('bg-red-500')
    })

    it('resolves text color from hex', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('color', '#111827')).toBe('text-gray-900')
    })

    it('resolves border-color from rgb()', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('border-color', 'rgb(59, 130, 246)')).toBe('border-blue-500')
    })

    it('resolves custom flat color', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('background-color', '#1a73e8')).toBe('bg-brand')
    })

    it('skips inherit/transparent/current', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      // These keys are skipped — no class for 'inherit' as a color value
      expect(resolver.findClass('color', 'inherit')).toBeNull()
      expect(resolver.findClass('color', 'transparent')).toBeNull()
      expect(resolver.findClass('color', 'currentColor')).toBeNull()
    })

    it('handles case-insensitive hex', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('color', '#111827')).toBe('text-gray-900')
      // Use a hex value with actual a-f letters to test case normalization
      expect(resolver.findClass('background-color', '#EF4444')).toBe('bg-red-500')
      expect(resolver.findClass('background-color', '#ef4444')).toBe('bg-red-500')
    })

    it('returns null for unknown color', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      expect(resolver.findClass('background-color', 'rgb(123, 45, 67)')).toBeNull()
    })

    it('handles rgb without commas (modern syntax)', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      // Modern CSS: rgb(239 68 68)
      expect(resolver.findClass('background-color', 'rgb(239 68 68)')).toBe('bg-red-500')
    })
  })

  // ── Border width + radius (Step 5) ──────────────────────────────────

  describe('border width', () => {
    it('resolves DEFAULT border-width to bare "border"', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-width', '1px')).toBe('border')
    })

    it('resolves border-width 2px', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-width', '2px')).toBe('border-2')
    })

    it('resolves border-width 0', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-width', '0px')).toBe('border-0')
    })
  })

  describe('border radius', () => {
    it('resolves border-radius to rounded-lg (rem → px)', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-radius', '8px')).toBe('rounded-lg')
    })

    it('resolves DEFAULT border-radius to bare "rounded"', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-radius', '4px')).toBe('rounded')
    })

    it('resolves corner-specific border-radius', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-top-left-radius', '8px')).toBe('rounded-tl-lg')
    })

    it('resolves rounded-full', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-radius', '9999px')).toBe('rounded-full')
    })

    it('resolves rounded-none', () => {
      const resolver = TailwindResolver.fromTheme(defaultBorderTheme())
      expect(resolver.findClass('border-radius', '0px')).toBe('rounded-none')
    })
  })

  // ── Opacity (Step 6) ─────────────────────────────────────────────────

  describe('opacity', () => {
    it('resolves opacity 0.5 → opacity-50', () => {
      const resolver = TailwindResolver.fromTheme(defaultOpacityTheme())
      expect(resolver.findClass('opacity', '0.5')).toBe('opacity-50')
    })

    it('resolves opacity 1 → opacity-100', () => {
      const resolver = TailwindResolver.fromTheme(defaultOpacityTheme())
      expect(resolver.findClass('opacity', '1')).toBe('opacity-100')
    })

    it('resolves opacity 0 → opacity-0', () => {
      const resolver = TailwindResolver.fromTheme(defaultOpacityTheme())
      expect(resolver.findClass('opacity', '0')).toBe('opacity-0')
    })

    it('returns null for non-theme opacity value', () => {
      const resolver = TailwindResolver.fromTheme(defaultOpacityTheme())
      expect(resolver.findClass('opacity', '0.33')).toBeNull()
    })
  })

  // ── Blur + backdrop-blur (Step 7) ────────────────────────────────────

  describe('filter (blur)', () => {
    it('resolves DEFAULT blur → bare "blur"', () => {
      const resolver = TailwindResolver.fromTheme(defaultBlurTheme())
      expect(resolver.findClass('filter', 'blur(8px)')).toBe('blur')
    })

    it('resolves blur-sm', () => {
      const resolver = TailwindResolver.fromTheme(defaultBlurTheme())
      expect(resolver.findClass('filter', 'blur(4px)')).toBe('blur-sm')
    })

    it('resolves backdrop-blur-lg', () => {
      const resolver = TailwindResolver.fromTheme(defaultBlurTheme())
      expect(resolver.findClass('backdrop-filter', 'blur(16px)')).toBe('backdrop-blur-lg')
    })

    it('returns null for "none" filter', () => {
      const resolver = TailwindResolver.fromTheme(defaultBlurTheme())
      expect(resolver.findClass('filter', 'none')).toBeNull()
    })

    it('returns null for unrecognized blur value', () => {
      const resolver = TailwindResolver.fromTheme(defaultBlurTheme())
      expect(resolver.findClass('filter', 'blur(99px)')).toBeNull()
    })
  })

  // ── Box-shadow (Step 8) ──────────────────────────────────────────────

  describe('box-shadow', () => {
    it('resolves shadow-none', () => {
      const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
      expect(resolver.findClass('box-shadow', 'none')).toBe('shadow-none')
    })

    it('resolves shadow-sm with whitespace normalization', () => {
      const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
      expect(resolver.findClass('box-shadow', '0 1px 2px 0 rgba(0, 0, 0, 0.05)')).toBe('shadow-sm')
    })

    it('returns null for non-matching shadow', () => {
      const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
      expect(resolver.findClass('box-shadow', '0 0 10px red')).toBeNull()
    })
  })

  // ── Static utilities (Step 9) ────────────────────────────────────────

  describe('static utilities', () => {
    it.each([
      ['solid', 'border-solid'],
      ['dashed', 'border-dashed'],
    ])('resolves border-style %s', (value, expected) => {
      const resolver = TailwindResolver.fromTheme({})
      expect(resolver.findClass('border-style', value)).toBe(expected)
    })

    it('resolves overflow hidden', () => {
      const resolver = TailwindResolver.fromTheme({})
      expect(resolver.findClass('overflow', 'hidden')).toBe('overflow-hidden')
    })

    it('resolves cursor pointer', () => {
      const resolver = TailwindResolver.fromTheme({})
      expect(resolver.findClass('cursor', 'pointer')).toBe('cursor-pointer')
    })

    it('returns null for cursor values not in our subset', () => {
      const resolver = TailwindResolver.fromTheme({})
      expect(resolver.findClass('cursor', 'zoom-in')).toBeNull()
    })
  })

  // ── getSnapPoints for non-numeric values (Step 10) ───────────────────

  describe('getSnapPoints with non-numeric values', () => {
    it('returns hex values for background-color without NaN sort', () => {
      const resolver = TailwindResolver.fromTheme(defaultColorTheme())
      const snaps = resolver.getSnapPoints('background-color')
      expect(snaps.length).toBeGreaterThan(0)
      // All values should be hex strings
      for (const snap of snaps) {
        expect(snap).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('returns sorted decimals for opacity', () => {
      const resolver = TailwindResolver.fromTheme(defaultOpacityTheme())
      const snaps = resolver.getSnapPoints('opacity')
      expect(snaps).toContain('0')
      expect(snaps).toContain('0.5')
      expect(snaps).toContain('1')
      // Should be sorted numerically
      const nums = snaps.map(s => parseFloat(s))
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1]!)
      }
    })

    it('returns keywords for cursor', () => {
      const resolver = TailwindResolver.fromTheme({})
      const snaps = resolver.getSnapPoints('cursor')
      expect(snaps).toContain('pointer')
      expect(snaps).toContain('default')
      // Should not contain NaN from parseFloat
      for (const snap of snaps) {
        expect(typeof snap).toBe('string')
      }
    })

    it('returns keywords for border-style', () => {
      const resolver = TailwindResolver.fromTheme({})
      const snaps = resolver.getSnapPoints('border-style')
      expect(snaps).toContain('solid')
      expect(snaps).toContain('dashed')
      expect(snaps).toContain('none')
    })
  })

  // ── Combined theme (integration) ────────────────────────────────────

  describe('combined theme', () => {
    it('resolves properties from all scales simultaneously', () => {
      const theme: ResolvedTheme = {
        ...defaultSpacingTheme(),
        ...defaultColorTheme(),
        ...defaultBorderTheme(),
        ...defaultOpacityTheme(),
        ...defaultBlurTheme(),
        ...defaultShadowTheme(),
      }
      const resolver = TailwindResolver.fromTheme(theme)

      // Spacing still works
      expect(resolver.findClass('padding-top', '16px')).toBe('pt-4')
      // Colors work
      expect(resolver.findClass('background-color', 'rgb(239, 68, 68)')).toBe('bg-red-500')
      // Border works
      expect(resolver.findClass('border-width', '1px')).toBe('border')
      // Opacity works
      expect(resolver.findClass('opacity', '0.5')).toBe('opacity-50')
      // Blur works
      expect(resolver.findClass('filter', 'blur(8px)')).toBe('blur')
      // Shadow works
      expect(resolver.findClass('box-shadow', 'none')).toBe('shadow-none')
      // Static utilities work
      expect(resolver.findClass('cursor', 'pointer')).toBe('cursor-pointer')
    })

    it('does not cross-contaminate border-width and border-color despite shared prefix', () => {
      const theme: ResolvedTheme = {
        ...defaultBorderTheme(),
        ...defaultColorTheme(),
      }
      const resolver = TailwindResolver.fromTheme(theme)

      // border-width snap points must be px values only
      const widthSnaps = resolver.getSnapPoints('border-width')
      for (const snap of widthSnaps) {
        expect(snap).toMatch(/^\d+px$/)
      }

      // border-color snap points must be hex values only
      const colorSnaps = resolver.getSnapPoints('border-color')
      for (const snap of colorSnaps) {
        expect(snap).toMatch(/^#[0-9a-f]{6}$/)
      }

      // Cross-lookup must not leak across properties
      expect(resolver.findClass('border-width', '#ef4444')).toBeNull()
      expect(resolver.findClass('border-color', '1px')).toBeNull()
    })
  })
})

describe('getSnapPoints caching', () => {
  it('returns frozen array', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '1': '0.25rem', '2': '0.5rem', '4': '1rem' },
    })
    // Use 'padding-top' (in UTILITY_MAP), not 'padding' which hits EMPTY_FROZEN early-return
    const points = resolver.getSnapPoints('padding-top')
    expect(Object.isFrozen(points)).toBe(true)
    expect(points.length).toBeGreaterThan(0)
  })

  it('returns same reference on second call', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '1': '0.25rem', '2': '0.5rem' },
    })
    const first = resolver.getSnapPoints('padding-top')
    const second = resolver.getSnapPoints('padding-top')
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(0)
  })

  it('returns frozen empty array for unknown properties', () => {
    const resolver = TailwindResolver.fromTheme({})
    const points = resolver.getSnapPoints('unknown')
    expect(Object.isFrozen(points)).toBe(true)
    expect(points).toHaveLength(0)
  })

  it('returns same reference on second call for unknown property', () => {
    const resolver = TailwindResolver.fromTheme({})
    const first = resolver.getSnapPoints('unknown')
    const second = resolver.getSnapPoints('unknown')
    expect(first).toBe(second)
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

  it('normalizes 3-digit hex to 6-digit', () => {
    const colors = { brand: '#f00', accent: '#0af' }
    expect(flattenColors(colors)).toEqual(['#ff0000', '#00aaff'])
  })

  it('normalizes uppercase hex to lowercase', () => {
    const colors = { brand: '#FF0000' }
    expect(flattenColors(colors)).toEqual(['#ff0000'])
  })

  it('strips alpha from 8-digit hex', () => {
    const colors = { brand: '#ff000080' }
    expect(flattenColors(colors)).toEqual(['#ff0000'])
  })

  it('de-duplicates identical colors after normalization', () => {
    const colors = { brand: '#ff0000', primary: '#FF0000', accent: '#f00' }
    expect(flattenColors(colors)).toEqual(['#ff0000'])
  })
})

describe('normalizeHex (exported)', () => {
  it('passes through 6-digit hex lowercase', () => {
    expect(normalizeHex('#abcdef')).toBe('#abcdef')
  })

  it('lowercases 6-digit hex', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef')
  })

  it('expands 3-digit hex', () => {
    expect(normalizeHex('#f00')).toBe('#ff0000')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
  })

  it('strips alpha from 8-digit hex', () => {
    expect(normalizeHex('#ff000080')).toBe('#ff0000')
  })

  it('strips alpha from 4-digit hex', () => {
    expect(normalizeHex('#f00a')).toBe('#ff0000')
  })

  it('returns null for invalid input', () => {
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('rgb(0,0,0)')).toBeNull()
    expect(normalizeHex('#gg0000')).toBeNull()
  })
})

// ── H1: normalizeHex short/alpha hex ──────────────────────────────────

describe('H1: normalizeHex — short and alpha hex', () => {
  it('matches short hex theme color via rgb from browser', () => {
    // Theme stores #abc (short hex), browser sends rgb(170, 187, 204)
    const theme: ResolvedTheme = {
      colors: { muted: '#abc' },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    expect(resolver.findClass('background-color', 'rgb(170, 187, 204)')).toBe('bg-muted')
  })

  it('matches 8-digit hex (with alpha) by stripping alpha', () => {
    // Theme stores #ef444480, should store as #ef4444 and match opaque red
    const theme: ResolvedTheme = {
      colors: { faded: '#ef444480' },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    expect(resolver.findClass('background-color', 'rgb(239, 68, 68)')).toBe('bg-faded')
  })

  it('matches 4-digit short hex with alpha', () => {
    // #abcd → expands to #aabbcc (strips alpha digit)
    const theme: ResolvedTheme = {
      colors: { semi: '#abcd' },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    expect(resolver.findClass('background-color', 'rgb(170, 187, 204)')).toBe('bg-semi')
  })

  it('rejects 5-digit invalid hex', () => {
    const theme: ResolvedTheme = {
      colors: { bad: '#abcde' },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    // 5-digit hex is invalid — should not appear in lookup
    expect(resolver.findClass('background-color', 'rgb(0, 0, 0)')).toBeNull()
  })
})

// ── H2: rgbToHex alpha handling ──────────────────────────────────────

describe('H2: rgbToHex — alpha rejection', () => {
  it('matches rgba with alpha = 1 (opaque)', () => {
    const resolver = TailwindResolver.fromTheme(defaultColorTheme())
    expect(resolver.findClass('background-color', 'rgba(239, 68, 68, 1)')).toBe('bg-red-500')
  })

  it('rejects rgba with alpha < 1 (routes to AI)', () => {
    const resolver = TailwindResolver.fromTheme(defaultColorTheme())
    expect(resolver.findClass('background-color', 'rgba(239, 68, 68, 0.5)')).toBeNull()
  })

  it('rejects rgba with alpha 0', () => {
    const resolver = TailwindResolver.fromTheme(defaultColorTheme())
    expect(resolver.findClass('background-color', 'rgba(239, 68, 68, 0)')).toBeNull()
  })
})

// ── H6: rgbToHex decimal channels ────────────────────────────────────

describe('H6: rgbToHex — decimal channels', () => {
  it('rounds decimal channels from oklch conversion', () => {
    const resolver = TailwindResolver.fromTheme(defaultColorTheme())
    // Modern browsers may report decimal channels for oklch-defined colors
    expect(resolver.findClass('background-color', 'rgb(238.935, 68.085, 68.085)')).toBe('bg-red-500')
  })

  it('rejects out-of-range channels', () => {
    const resolver = TailwindResolver.fromTheme(defaultColorTheme())
    expect(resolver.findClass('background-color', 'rgb(300, 0, 0)')).toBeNull()
  })
})

// ── M8: nested DEFAULT colors ────────────────────────────────────────

describe('M8: nested DEFAULT colors', () => {
  it('resolves DEFAULT shade to bare prefix (bg-brand not bg-brand-DEFAULT)', () => {
    const theme: ResolvedTheme = {
      colors: {
        brand: { DEFAULT: '#1a73e8', dark: '#0d47a1' },
      },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    expect(resolver.findClass('background-color', '#1a73e8')).toBe('bg-brand')
  })

  it('resolves non-DEFAULT shade alongside DEFAULT', () => {
    const theme: ResolvedTheme = {
      colors: {
        brand: { DEFAULT: '#1a73e8', dark: '#0d47a1' },
      },
    }
    const resolver = TailwindResolver.fromTheme(theme)
    expect(resolver.findClass('background-color', '#0d47a1')).toBe('bg-brand-dark')
  })
})

// ── H3: missing CSS property mappings ────────────────────────────────

describe('H3: new static CSS property mappings', () => {
  it('resolves display: flex → flex', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('display', 'flex')).toBe('flex')
  })

  it('resolves display: none → hidden', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('display', 'none')).toBe('hidden')
  })

  it('resolves visibility: hidden → invisible', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('visibility', 'hidden')).toBe('invisible')
  })

  it('resolves flex-direction: column → flex-col', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('flex-direction', 'column')).toBe('flex-col')
  })

  it('resolves justify-content: space-between → justify-between', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('justify-content', 'space-between')).toBe('justify-between')
  })

  it('resolves align-items: center → items-center', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('align-items', 'center')).toBe('items-center')
  })

  it('resolves text-align: right → text-right', () => {
    const resolver = TailwindResolver.fromTheme({})
    expect(resolver.findClass('text-align', 'right')).toBe('text-right')
  })

  it('getSnapPoints for display returns keywords without NaN sort', () => {
    const resolver = TailwindResolver.fromTheme({})
    const snaps = resolver.getSnapPoints('display')
    expect(snaps).toContain('flex')
    expect(snaps).toContain('none')
    for (const snap of snaps) {
      expect(typeof snap).toBe('string')
    }
  })
})

describe('H3: new theme-mapped properties (font-weight, line-height)', () => {
  function fontWeightTheme(): ResolvedTheme {
    return {
      fontWeight: {
        thin: '100',
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
        black: '900',
      },
    }
  }

  function lineHeightTheme(): ResolvedTheme {
    return {
      lineHeight: {
        none: '1',
        tight: '1.25',
        snug: '1.375',
        normal: '1.5',
        relaxed: '1.625',
        loose: '2',
      },
    }
  }

  it('resolves font-weight 700 → font-bold', () => {
    const resolver = TailwindResolver.fromTheme(fontWeightTheme())
    expect(resolver.findClass('font-weight', '700')).toBe('font-bold')
  })

  it('resolves font-weight 400 → font-normal', () => {
    const resolver = TailwindResolver.fromTheme(fontWeightTheme())
    expect(resolver.findClass('font-weight', '400')).toBe('font-normal')
  })

  it('resolves line-height 1.5 → leading-normal', () => {
    const resolver = TailwindResolver.fromTheme(lineHeightTheme())
    expect(resolver.findClass('line-height', '1.5')).toBe('leading-normal')
  })

  it('resolves line-height 2 → leading-loose', () => {
    const resolver = TailwindResolver.fromTheme(lineHeightTheme())
    expect(resolver.findClass('line-height', '2')).toBe('leading-loose')
  })

  it('returns null for non-theme font-weight', () => {
    const resolver = TailwindResolver.fromTheme(fontWeightTheme())
    expect(resolver.findClass('font-weight', '450')).toBeNull()
  })
})

// ── H4: structured box-shadow comparison ─────────────────────────────

describe('H4: box-shadow structural normalization', () => {
  it('matches theme bare-0 shadow against browser px-0 shadow (color last)', () => {
    // Theme: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" (bare 0)
    // Browser: "0px 1px 2px 0px rgba(0, 0, 0, 0.05)" (px-suffixed, color last)
    const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
    expect(resolver.findClass('box-shadow', '0px 1px 2px 0px rgba(0, 0, 0, 0.05)')).toBe('shadow-sm')
  })

  it('matches browser computed shadow with color FIRST', () => {
    // Browsers return getComputedStyle().boxShadow with color first
    const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
    expect(resolver.findClass('box-shadow', 'rgba(0, 0, 0, 0.05) 0px 1px 2px 0px')).toBe('shadow-sm')
  })

  it('matches multi-shadow with different whitespace', () => {
    const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
    // Browser version of DEFAULT shadow with extra whitespace
    const browserValue = '0px 1px 3px 0px rgba(0, 0, 0, 0.1),  0px 1px 2px -1px rgba(0, 0, 0, 0.1)'
    expect(resolver.findClass('box-shadow', browserValue)).toBe('shadow')
  })

  it('resolves shadow-none via structural normalization', () => {
    const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
    expect(resolver.findClass('box-shadow', 'none')).toBe('shadow-none')
  })

  it('returns null for completely different shadow', () => {
    const resolver = TailwindResolver.fromTheme(defaultShadowTheme())
    expect(resolver.findClass('box-shadow', '5px 5px 20px 0px rgba(255, 0, 0, 1)')).toBeNull()
  })
})

// ── H5: configurable REM_PX ──────────────────────────────────────────

describe('H5: configurable remPx', () => {
  it('default (16px) — existing behavior unchanged', () => {
    const resolver = TailwindResolver.fromTheme(defaultSpacingTheme())
    expect(resolver.findClass('padding-top', '16px')).toBe('pt-4') // 1rem × 16 = 16px
  })

  it('custom remPx: 10px base (62.5% pattern)', () => {
    const resolver = TailwindResolver.fromTheme(defaultSpacingTheme(), { remPx: 10 })
    // spacing '4': '1rem' → 1 × 10 = 10px
    expect(resolver.findClass('padding-top', '10px')).toBe('pt-4')
  })

  it('custom remPx affects fontSize resolution', () => {
    const theme: ResolvedTheme = {
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
      } as Record<string, string | [string, Record<string, string>]>,
    }
    const resolver = TailwindResolver.fromTheme(theme, { remPx: 10 })
    // 0.75rem × 10 = 7.5px
    expect(resolver.findClass('font-size', '7.5px')).toBe('text-xs')
    // 1rem × 10 = 10px
    expect(resolver.findClass('font-size', '10px')).toBe('text-base')
  })

  it('custom remPx affects borderRadius resolution', () => {
    const resolver = TailwindResolver.fromTheme(defaultBorderTheme(), { remPx: 10 })
    // 'sm': '0.125rem' → 0.125 × 10 = 1.25px
    expect(resolver.findClass('border-radius', '1.25px')).toBe('rounded-sm')
  })
})

// ── Tolerance matching boundary tests ────────────────────────────────

describe('findNearestColor tolerance (±10 for gamut mapping gaps)', () => {
  it('matches color within ±1 channel distance', () => {
    const resolver = TailwindResolver.fromTheme({
      colors: { red: { 500: '#ef4444' } },
    })
    expect(resolver.findClass('background-color', '#ee4444')).toBe('bg-red-500')
    expect(resolver.findClass('background-color', '#f04444')).toBe('bg-red-500')
    expect(resolver.findClass('background-color', '#ef4345')).toBe('bg-red-500')
  })

  it('matches color within ±10 channel distance (gamut mapping gap)', () => {
    const resolver = TailwindResolver.fromTheme({
      colors: { blue: { 500: '#3b82f6' } },
    })
    // ±9 in red channel — within tolerance for out-of-gamut OKLCH colors
    expect(resolver.findClass('color', '#3282f6')).toBe('text-blue-500')  // r-9
    expect(resolver.findClass('color', '#4482f6')).toBe('text-blue-500')  // r+9
    // ±10 exactly — boundary
    expect(resolver.findClass('color', '#3182f6')).toBe('text-blue-500')  // r-10
  })

  it('rejects color at distance 11 (beyond ±10 tolerance)', () => {
    const resolver = TailwindResolver.fromTheme({
      colors: { red: { 500: '#ef4444' } },
    })
    expect(resolver.findClass('background-color', '#e44444')).toBeNull()  // r-11
    expect(resolver.findClass('background-color', '#fa4444')).toBeNull()  // r+11
  })

  it('picks closest when two theme colors are within tolerance', () => {
    const resolver = TailwindResolver.fromTheme({
      colors: {
        // Two colors 20 apart in red — both within ±10 of #e84444
        a: '#de4444',  // distance 10 from #e8
        b: '#f24444',  // distance 10 from #e8
      },
    })
    // Equidistant — matches one
    const result = resolver.findClass('background-color', '#e84444')
    expect(result).not.toBeNull()
    // Closer to 'a' — must pick 'a'
    expect(resolver.findClass('background-color', '#e04444')).toBe('bg-a')
    // Closer to 'b' — must pick 'b'
    expect(resolver.findClass('background-color', '#f04444')).toBe('bg-b')
  })

  it('does not apply tolerance to non-color properties', () => {
    const resolver = TailwindResolver.fromTheme({
      spacing: { '4': '1rem' },
    })
    expect(resolver.findClass('padding-top', '16px')).toBe('pt-4')
    expect(resolver.findClass('padding-top', '17px')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// TailwindResolver.resolveSpacingTokens
// ---------------------------------------------------------------------------

// The v3 path imports `tailwindcss/resolveConfig`. tailwindcss isn't installed
// in cortex-editor, so we mock it as a virtual module. The mock echoes the
// supplied config back through unchanged — which means whatever `theme.spacing`
// shape the test fixture provides is exactly what the v3 branch consumes.
// Real Tailwind would generate the default scale from a bare config, but our
// behavioral tests pass an explicit theme.spacing map so the assertions remain
// deterministic and don't depend on Tailwind being a transitive dep.
vi.mock('tailwindcss/resolveConfig', () => ({
  default: (config: unknown) => {
    if (config && typeof config === 'object' && 'theme' in config) {
      return config
    }
    return { theme: {} }
  },
}), { virtual: true })

describe('TailwindResolver.resolveSpacingTokens', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('node:os') as typeof import('node:os')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pathMod = require('node:path') as typeof import('node:path')

  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'cortex-spacing-tokens-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  /** Write a file under tmpDir, creating any intermediate directories. */
  function writeFixture(relativePath: string, content: string): void {
    const full = pathMod.join(tmpDir, relativePath)
    fs.mkdirSync(pathMod.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }

  it('returns null when no Tailwind config and no spacing CSS variables exist', async () => {
    // Empty temp dir — no tailwind.config.*, no @import "tailwindcss" CSS, no
    // spacing-namespaced CSS variables. All three sources should yield nothing.
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).toBeNull()
  })

  it('v3 path: surfaces explicit theme.spacing entries with px conversion', async () => {
    // Write a tailwind.config.cjs with explicit theme.spacing — the virtual
    // mock echoes this through resolveConfig, so the v3 branch sees it intact.
    writeFixture('tailwind.config.cjs', `
      module.exports = {
        theme: {
          spacing: {
            '0': '0px',
            '1': '0.25rem',
            '4': '1rem',
            '8': '2rem',
            '80': '20rem',
            'gutter': '12px',
          },
        },
      }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const byName = new Map(result!.map(t => [t.name, t]))
    expect(byName.get('--spacing-0')).toEqual({ name: '--spacing-0', valuePx: 0, source: 'tailwind-v3' })
    expect(byName.get('--spacing-1')).toEqual({ name: '--spacing-1', valuePx: 4, source: 'tailwind-v3' })
    expect(byName.get('--spacing-4')).toEqual({ name: '--spacing-4', valuePx: 16, source: 'tailwind-v3' })
    expect(byName.get('--spacing-8')).toEqual({ name: '--spacing-8', valuePx: 32, source: 'tailwind-v3' })
    expect(byName.get('--spacing-80')).toEqual({ name: '--spacing-80', valuePx: 320, source: 'tailwind-v3' })
    expect(byName.get('--spacing-gutter')).toEqual({ name: '--spacing-gutter', valuePx: 12, source: 'tailwind-v3' })
  })

  it('v4 path: canonical singular `--spacing: <base>` generates the multiplier scale', async () => {
    // Tailwind v4's canonical convention: a singular `--spacing: <base>` in
    // @theme drives generateSpacingScale. Reusing parseV4Theme captures this
    // automatically (Finding 1 fix — previously we only walked namespaced
    // `--spacing-*` and produced zero tokens for canonical v4 projects).
    writeFixture('src/app.css', `
      @import "tailwindcss";
      @theme { --spacing: 0.25rem; }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const byName = new Map(result!.map(t => [t.name, t]))
    // generateSpacingScale produces fixed entries plus multipliers
    expect(byName.get('--spacing-0')).toEqual({ name: '--spacing-0', valuePx: 0, source: 'tailwind-v4' })
    expect(byName.get('--spacing-px')).toEqual({ name: '--spacing-px', valuePx: 1, source: 'tailwind-v4' })
    // multiplier 4 × 0.25rem = 1rem = 16px
    expect(byName.get('--spacing-4')).toEqual({ name: '--spacing-4', valuePx: 16, source: 'tailwind-v4' })
    // multiplier 16 × 0.25rem = 4rem = 64px
    expect(byName.get('--spacing-16')).toEqual({ name: '--spacing-16', valuePx: 64, source: 'tailwind-v4' })
    // multiplier 96 × 0.25rem = 24rem = 384px
    expect(byName.get('--spacing-96')).toEqual({ name: '--spacing-96', valuePx: 384, source: 'tailwind-v4' })
  })

  it('css-variable path: matches --spacing-/--space-/--sp-/--gap- prefixes', async () => {
    // No Tailwind config. PostCSS scans :root for namespaced custom properties.
    writeFixture('styles/tokens.css', `
      :root {
        --spacing-foo: 4px;
        --sp-bar: 8px;
        --gap-baz: 16px;
        --space-qux: 32px;
      }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const byName = new Map(result!.map(t => [t.name, t]))
    expect(byName.get('--spacing-foo')).toEqual({ name: '--spacing-foo', valuePx: 4, source: 'css-variable' })
    expect(byName.get('--sp-bar')).toEqual({ name: '--sp-bar', valuePx: 8, source: 'css-variable' })
    expect(byName.get('--gap-baz')).toEqual({ name: '--gap-baz', valuePx: 16, source: 'css-variable' })
    expect(byName.get('--space-qux')).toEqual({ name: '--space-qux', valuePx: 32, source: 'css-variable' })
  })

  it('css-variable path: rejects non-spacing namespaces', async () => {
    // Properties whose namespace isn't in the spacing allowlist must be ignored.
    writeFixture('styles/mixed.css', `
      :root {
        --color-primary: red;
        --width-md: 200px;
        --foo: 1;
        --spacing-keep: 10px;
      }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const names = result!.map(t => t.name)
    expect(names).toContain('--spacing-keep')
    expect(names).not.toContain('--color-primary')
    expect(names).not.toContain('--width-md')
    expect(names).not.toContain('--foo')
  })

  it('--cx-* exclusion: cortex-internal names are filtered out, namespace-twins remain', async () => {
    // The filter is meant to discriminate, not to globally drop output. Include
    // a non-cx token so the assertion proves filtering rather than emptiness.
    writeFixture('styles/cx-mix.css', `
      :root {
        --cx-sp-1: 2px;
        --cx-spacing-md: 16px;
        --spacing-md: 16px;
      }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const names = result!.map(t => t.name)
    expect(names).toContain('--spacing-md')
    expect(names).not.toContain('--cx-sp-1')
    expect(names).not.toContain('--cx-spacing-md')
  })

  it('node_modules exclusion: CSS files inside node_modules are not scanned', async () => {
    // A token defined inside node_modules must not surface — third-party CSS
    // is not the user's design system.
    writeFixture('node_modules/some-pkg/style.css', `
      :root { --spacing-junk: 99px; }
    `)
    writeFixture('styles/own.css', `
      :root { --spacing-keep: 4px; }
    `)
    const result = await TailwindResolver.resolveSpacingTokens(tmpDir)
    expect(result).not.toBeNull()
    const names = result!.map(t => t.name)
    expect(names).toContain('--spacing-keep')
    expect(names).not.toContain('--spacing-junk')
  })
})
