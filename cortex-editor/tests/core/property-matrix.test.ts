/**
 * Property matrix test — systematic coverage guardrail.
 *
 * Parameterized test: every UTILITY_MAP + STATIC_MAP property × [valid, invalid].
 * If ANY property breaks in the resolver pipeline, this test catches it.
 *
 * This is the "whack-a-mole killer": a single test suite that covers every
 * editable property, so fixing one can't silently break another.
 */
import { describe, it, expect } from 'vitest'
import { extractThemeProperties, themePropertiesToResolved } from '../../src/core/tailwind-v4-parser.js'
import { TailwindResolver } from '../../src/core/tailwind-resolver.js'
import { oklchToHex } from '../../src/core/oklch.js'

// Full v4 theme covering all property categories
const THEME_CSS = `
@theme default {
  --spacing: 0.25rem;
  --color-red-500: oklch(63.7% 0.237 25.331);
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-black: #000000;
  --color-white: #ffffff;
  --text-xs: 0.75rem;
  --text-base: 1rem;
  --font-weight-normal: 400;
  --font-weight-bold: 700;
  --leading-normal: 1.5;
  --leading-loose: 2;
  --radius: 0.25rem;
  --radius-sm: 0.125rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-none: none;
  --blur-sm: 4px;
  --blur: 8px;
  --blur-lg: 16px;
}
`

const props = extractThemeProperties(THEME_CSS)
const theme = themePropertiesToResolved(props)
const resolver = TailwindResolver.fromTheme(theme)

/** Get browser-format RGB from OKLCH. */
function oklchRgb(oklch: string): string {
  const hex = oklchToHex(oklch)!
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

// ── UTILITY_MAP property matrix ─────────────────────────────────────

interface PropertyTest {
  property: string
  validValue: string
  expectedClass: string
  invalidValue: string
}

const UTILITY_MATRIX: PropertyTest[] = [
  // Spacing — all 16 properties
  { property: 'padding-top', validValue: '16px', expectedClass: 'pt-4', invalidValue: '7px' },
  { property: 'padding-right', validValue: '16px', expectedClass: 'pr-4', invalidValue: '7px' },
  { property: 'padding-bottom', validValue: '16px', expectedClass: 'pb-4', invalidValue: '7px' },
  { property: 'padding-left', validValue: '16px', expectedClass: 'pl-4', invalidValue: '7px' },
  { property: 'margin-top', validValue: '8px', expectedClass: 'mt-2', invalidValue: '7px' },
  { property: 'margin-right', validValue: '8px', expectedClass: 'mr-2', invalidValue: '7px' },
  { property: 'margin-bottom', validValue: '8px', expectedClass: 'mb-2', invalidValue: '7px' },
  { property: 'margin-left', validValue: '8px', expectedClass: 'ml-2', invalidValue: '7px' },
  { property: 'gap', validValue: '16px', expectedClass: 'gap-4', invalidValue: '7px' },
  { property: 'row-gap', validValue: '16px', expectedClass: 'gap-y-4', invalidValue: '7px' },
  { property: 'column-gap', validValue: '16px', expectedClass: 'gap-x-4', invalidValue: '7px' },
  { property: 'width', validValue: '32px', expectedClass: 'w-8', invalidValue: '7px' },
  { property: 'height', validValue: '32px', expectedClass: 'h-8', invalidValue: '7px' },
  { property: 'min-width', validValue: '16px', expectedClass: 'min-w-4', invalidValue: '7px' },
  { property: 'min-height', validValue: '16px', expectedClass: 'min-h-4', invalidValue: '7px' },
  { property: 'max-width', validValue: '16px', expectedClass: 'max-w-4', invalidValue: '7px' },
  { property: 'max-height', validValue: '16px', expectedClass: 'max-h-4', invalidValue: '7px' },

  // Typography
  { property: 'font-size', validValue: '16px', expectedClass: 'text-base', invalidValue: '17px' },
  { property: 'font-weight', validValue: '700', expectedClass: 'font-bold', invalidValue: '450' },
  { property: 'line-height', validValue: '1.5', expectedClass: 'leading-normal', invalidValue: '1.8' },

  // Colors — browser sends rgb() from getComputedStyle
  { property: 'background-color', validValue: '#000000', expectedClass: 'bg-black', invalidValue: 'rgb(123, 45, 67)' },
  { property: 'border-color', validValue: '#000000', expectedClass: 'border-black', invalidValue: 'rgb(123, 45, 67)' },
  { property: 'color', validValue: '#000000', expectedClass: 'text-black', invalidValue: 'rgb(123, 45, 67)' },

  // Colors — OKLCH-derived (invalid must be >10 channels from any theme color)
  { property: 'background-color', validValue: oklchRgb('oklch(63.7% 0.237 25.331)'), expectedClass: 'bg-red-500', invalidValue: 'rgb(80, 80, 80)' },
  { property: 'color', validValue: oklchRgb('oklch(62.3% 0.214 259.815)'), expectedClass: 'text-blue-500', invalidValue: 'rgb(80, 80, 80)' },

  // Border
  { property: 'border-width', validValue: '1px', expectedClass: 'border', invalidValue: '3px' },
  { property: 'border-radius', validValue: '4px', expectedClass: 'rounded', invalidValue: '5px' },
  { property: 'border-top-left-radius', validValue: '8px', expectedClass: 'rounded-tl-lg', invalidValue: '5px' },
  { property: 'border-top-right-radius', validValue: '8px', expectedClass: 'rounded-tr-lg', invalidValue: '5px' },
  { property: 'border-bottom-right-radius', validValue: '8px', expectedClass: 'rounded-br-lg', invalidValue: '5px' },
  { property: 'border-bottom-left-radius', validValue: '8px', expectedClass: 'rounded-bl-lg', invalidValue: '5px' },

  // Effects
  { property: 'opacity', validValue: '0.5', expectedClass: 'opacity-50', invalidValue: '0.33' },
  { property: 'filter', validValue: 'blur(8px)', expectedClass: 'blur', invalidValue: 'blur(99px)' },
  { property: 'backdrop-filter', validValue: 'blur(8px)', expectedClass: 'backdrop-blur', invalidValue: 'blur(99px)' },
  { property: 'box-shadow', validValue: 'none', expectedClass: 'shadow-none', invalidValue: '0 0 10px red' },
]

// ── STATIC_MAP property matrix ──────────────────────────────────────

interface StaticTest {
  property: string
  validValue: string
  expectedClass: string
  invalidValue: string
}

const STATIC_MATRIX: StaticTest[] = [
  { property: 'display', validValue: 'flex', expectedClass: 'flex', invalidValue: 'table-cell' },
  { property: 'display', validValue: 'none', expectedClass: 'hidden', invalidValue: 'table-cell' },
  { property: 'visibility', validValue: 'hidden', expectedClass: 'invisible', invalidValue: 'collapse' },
  { property: 'flex-direction', validValue: 'column', expectedClass: 'flex-col', invalidValue: 'diagonal' },
  { property: 'justify-content', validValue: 'center', expectedClass: 'justify-center', invalidValue: 'left' },
  { property: 'align-items', validValue: 'center', expectedClass: 'items-center', invalidValue: 'normal' },
  { property: 'text-align', validValue: 'center', expectedClass: 'text-center', invalidValue: 'start' },
  { property: 'border-style', validValue: 'solid', expectedClass: 'border-solid', invalidValue: 'ridge' },
  { property: 'overflow', validValue: 'hidden', expectedClass: 'overflow-hidden', invalidValue: 'clip' },
  { property: 'cursor', validValue: 'pointer', expectedClass: 'cursor-pointer', invalidValue: 'zoom-in' },
]

// ── Test execution ──────────────────────────────────────────────────

describe('property matrix: UTILITY_MAP', () => {
  it.each(UTILITY_MATRIX)(
    '$property: "$validValue" → $expectedClass',
    ({ property, validValue, expectedClass }) => {
      const result = resolver.findClass(property, validValue)
      expect(result, `findClass('${property}', '${validValue}') should be '${expectedClass}'`).toBe(expectedClass)
    },
  )

  it.each(UTILITY_MATRIX)(
    '$property: "$invalidValue" → null',
    ({ property, invalidValue }) => {
      expect(resolver.findClass(property, invalidValue)).toBeNull()
    },
  )
})

describe('property matrix: STATIC_MAP', () => {
  it.each(STATIC_MATRIX)(
    '$property: "$validValue" → $expectedClass',
    ({ property, validValue, expectedClass }) => {
      expect(resolver.findClass(property, validValue)).toBe(expectedClass)
    },
  )

  it.each(STATIC_MATRIX)(
    '$property: "$invalidValue" → null',
    ({ property, invalidValue }) => {
      expect(resolver.findClass(property, invalidValue)).toBeNull()
    },
  )
})

describe('property matrix: snap points', () => {
  const SNAP_PROPERTIES = [
    'padding-top', 'margin-top', 'gap', 'width', 'height',
    'font-size', 'font-weight', 'line-height',
    'background-color', 'border-color', 'color',
    'border-width', 'border-radius', 'opacity',
    'display', 'cursor', 'border-style',
  ] as const

  it.each(SNAP_PROPERTIES)('%s has non-empty snap points', (property) => {
    const snaps = resolver.getSnapPoints(property)
    expect(snaps.length, `${property} should have snap points`).toBeGreaterThan(0)
  })
})

describe('property matrix: unknown properties return null', () => {
  const UNKNOWN = ['z-index', 'position', 'transition', 'animation', 'transform'] as const

  it.each(UNKNOWN)('%s is not in UTILITY_MAP or STATIC_MAP', (property) => {
    expect(resolver.findClass(property, 'any')).toBeNull()
  })
})
