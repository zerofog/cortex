/**
 * V4 round-trip test suite: verifies the full pipeline contract for every
 * UTILITY_MAP property.
 *
 * Pipeline: v4 @theme CSS → extractThemeProperties → themePropertiesToResolved
 *         → TailwindResolver.fromTheme → findClass(property, browserValue)
 *
 * These tests are theme-agnostic: they use a representative v4 theme but test
 * the CONTRACT (parser → resolver round-trip works), not specific hex values.
 * If the user customizes their theme, the same pipeline must still work.
 */
import { describe, it, expect } from 'vitest'
import { extractThemeProperties, themePropertiesToResolved } from '../../src/core/tailwind-v4-parser.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { oklchToHex } from '../../src/core/oklch.js'

// Representative v4 theme with all property categories
const V4_THEME_CSS = `
@theme default {
  --spacing: 0.25rem;

  --color-red-500: oklch(63.7% 0.237 25.331);
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-green-500: oklch(72.3% 0.219 149.579);
  --color-gray-900: oklch(21% 0.006 285.885);
  --color-black: #000000;
  --color-white: #ffffff;
  --color-brand: #1a73e8;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-loose: 2;

  --radius: 0.25rem;
  --radius-sm: 0.125rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-none: none;

  --blur-sm: 4px;
  --blur: 8px;
  --blur-md: 12px;
  --blur-lg: 16px;
}
`

function buildResolver(): TailwindResolver {
  const props = extractThemeProperties(V4_THEME_CSS)
  const theme = themePropertiesToResolved(props)
  return TailwindResolver.fromTheme(theme)
}

/**
 * Simulate browser RGB by using the same oklchToHex as production.
 * This is intentionally self-referential: converter accuracy is validated
 * independently in oklch.test.ts. This helper tests pipeline wiring
 * (v4 parser → resolver → findClass), not converter correctness.
 */
function oklchToBrowserRgb(oklch: string): string {
  const hex = oklchToHex(oklch)!
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

describe('v4 round-trip: spacing properties', () => {
  const resolver = buildResolver()

  const SPACING_PROPERTIES = [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'gap', 'row-gap', 'column-gap',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  ] as const

  // Standard Tailwind scale values (from 0.25rem base × multipliers)
  const SCALE_VALUES = [
    { px: '0px', scale: '0' },
    { px: '1px', scale: 'px' },
    { px: '4px', scale: '1' },
    { px: '8px', scale: '2' },
    { px: '12px', scale: '3' },
    { px: '16px', scale: '4' },
    { px: '20px', scale: '5' },
    { px: '24px', scale: '6' },
    { px: '32px', scale: '8' },
    { px: '64px', scale: '16' },
  ] as const

  it.each(SPACING_PROPERTIES)('%s resolves standard scale values', (property) => {
    for (const { px } of SCALE_VALUES) {
      const result = resolver.findClass(property, px)
      expect(result, `${property}: ${px} should resolve`).not.toBeNull()
    }
  })

  // Snap-points and null-rejection tests are in property-matrix.test.ts
})

describe('v4 round-trip: color properties', () => {
  const resolver = buildResolver()

  const COLOR_PROPERTIES = ['background-color', 'border-color', 'color'] as const
  const OKLCH_COLORS = [
    'oklch(63.7% 0.237 25.331)',  // red-500
    'oklch(62.3% 0.214 259.815)', // blue-500
    'oklch(72.3% 0.219 149.579)', // green-500
    'oklch(21% 0.006 285.885)',   // gray-900
  ] as const

  it.each(COLOR_PROPERTIES)('%s resolves OKLCH-derived RGB values', (property) => {
    for (const oklch of OKLCH_COLORS) {
      const browserRgb = oklchToBrowserRgb(oklch)
      const result = resolver.findClass(property, browserRgb)
      expect(result, `${property}: ${browserRgb} should resolve`).not.toBeNull()
    }
  })

  it.each(COLOR_PROPERTIES)('%s resolves hex colors', (property) => {
    // Flat hex colors should work directly
    expect(resolver.findClass(property, '#000000')).not.toBeNull()
    expect(resolver.findClass(property, '#ffffff')).not.toBeNull()
    expect(resolver.findClass(property, '#1a73e8')).not.toBeNull()
  })

  // Null-rejection and snap-points tests are in property-matrix.test.ts
})

describe('v4 round-trip: typography properties', () => {
  const resolver = buildResolver()

  it('font-size resolves rem values converted to px', () => {
    // 0.75rem = 12px, 0.875rem = 14px, 1rem = 16px, 1.125rem = 18px, 1.25rem = 20px
    expect(resolver.findClass('font-size', '12px')).toBe('text-xs')
    expect(resolver.findClass('font-size', '14px')).toBe('text-sm')
    expect(resolver.findClass('font-size', '16px')).toBe('text-base')
    expect(resolver.findClass('font-size', '18px')).toBe('text-lg')
    expect(resolver.findClass('font-size', '20px')).toBe('text-xl')
  })

  it('font-weight resolves numeric values', () => {
    expect(resolver.findClass('font-weight', '400')).toBe('font-normal')
    expect(resolver.findClass('font-weight', '500')).toBe('font-medium')
    expect(resolver.findClass('font-weight', '700')).toBe('font-bold')
  })

  it('line-height resolves unitless values', () => {
    expect(resolver.findClass('line-height', '1.25')).toBe('leading-tight')
    expect(resolver.findClass('line-height', '1.5')).toBe('leading-normal')
    expect(resolver.findClass('line-height', '2')).toBe('leading-loose')
  })

  it('font-size has snap points', () => {
    expect(resolver.getSnapPoints('font-size').length).toBeGreaterThan(0)
  })
})

describe('v4 round-trip: border properties', () => {
  const resolver = buildResolver()

  it('border-width resolves standard values', () => {
    expect(resolver.findClass('border-width', '0px')).toBe('border-0')
    expect(resolver.findClass('border-width', '1px')).toBe('border')
    expect(resolver.findClass('border-width', '2px')).toBe('border-2')
    expect(resolver.findClass('border-width', '4px')).toBe('border-4')
  })

  it('border-radius resolves v4 scale', () => {
    // v4 radius defaults: DEFAULT=0.25rem(4px), sm=0.125rem(2px), md=0.375rem(6px), lg=0.5rem(8px)
    expect(resolver.findClass('border-radius', '2px')).toBe('rounded-sm')
    expect(resolver.findClass('border-radius', '4px')).toBe('rounded')
    expect(resolver.findClass('border-radius', '6px')).toBe('rounded-md')
    expect(resolver.findClass('border-radius', '8px')).toBe('rounded-lg')
    expect(resolver.findClass('border-radius', '12px')).toBe('rounded-xl')
    expect(resolver.findClass('border-radius', '9999px')).toBe('rounded-full')
  })

  const CORNER_RADII = [
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
  ] as const

  it.each(CORNER_RADII)('%s resolves corner-specific radius', (property) => {
    expect(resolver.findClass(property, '8px')).not.toBeNull()
    expect(resolver.findClass(property, '4px')).not.toBeNull()
  })
})

describe('v4 round-trip: effects properties', () => {
  const resolver = buildResolver()

  it('opacity resolves standard scale', () => {
    // v4 parser generates opacity 0-100 in steps of 5
    expect(resolver.findClass('opacity', '0')).toBe('opacity-0')
    expect(resolver.findClass('opacity', '0.5')).toBe('opacity-50')
    expect(resolver.findClass('opacity', '1')).toBe('opacity-100')
  })

  it('filter (blur) resolves with blur() wrapper', () => {
    expect(resolver.findClass('filter', 'blur(4px)')).toBe('blur-sm')
    expect(resolver.findClass('filter', 'blur(8px)')).toBe('blur')
    expect(resolver.findClass('filter', 'blur(12px)')).toBe('blur-md')
    expect(resolver.findClass('filter', 'blur(16px)')).toBe('blur-lg')
  })

  it('backdrop-filter resolves blur values', () => {
    expect(resolver.findClass('backdrop-filter', 'blur(8px)')).toBe('backdrop-blur')
    expect(resolver.findClass('backdrop-filter', 'blur(16px)')).toBe('backdrop-blur-lg')
  })

  it('box-shadow resolves shadow values', () => {
    expect(resolver.findClass('box-shadow', 'none')).toBe('shadow-none')
    expect(resolver.findClass('box-shadow', '0 1px 2px 0 rgba(0, 0, 0, 0.05)')).toBe('shadow-sm')
  })
})

// Static utility tests removed — fully subsumed by property-matrix.test.ts STATIC_MATRIX
