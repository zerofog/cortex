/**
 * Tests for the browser-side Tailwind class extractor.
 * Verifies that className strings are correctly parsed into CSS property → class maps.
 */
import { describe, it, expect } from 'vitest'
import { extractUtilities } from '../../src/browser/class-extractor.js'

describe('extractUtilities', () => {
  // ── Spacing ────────────────────────────────────────────────────────

  it('extracts individual padding classes', () => {
    const result = extractUtilities('pt-4 pr-2 pb-8 pl-1')
    expect(result.get('padding-top')).toBe('pt-4')
    expect(result.get('padding-right')).toBe('pr-2')
    expect(result.get('padding-bottom')).toBe('pb-8')
    expect(result.get('padding-left')).toBe('pl-1')
  })

  it('extracts margin classes', () => {
    const result = extractUtilities('mt-2 mb-4')
    expect(result.get('margin-top')).toBe('mt-2')
    expect(result.get('margin-bottom')).toBe('mb-4')
  })

  it('extracts gap classes', () => {
    const result = extractUtilities('gap-4 gap-x-2 gap-y-8')
    expect(result.get('gap')).toBe('gap-4')
    expect(result.get('column-gap')).toBe('gap-x-2')
    expect(result.get('row-gap')).toBe('gap-y-8')
  })

  it('extracts width/height classes', () => {
    const result = extractUtilities('w-full h-screen min-w-0 max-h-96')
    expect(result.get('width')).toBe('w-full')
    expect(result.get('height')).toBe('h-screen')
    expect(result.get('min-width')).toBe('min-w-0')
    expect(result.get('max-height')).toBe('max-h-96')
  })

  // ── Colors ─────────────────────────────────────────────────────────

  it('extracts background-color class', () => {
    const result = extractUtilities('bg-red-500')
    expect(result.get('background-color')).toBe('bg-red-500')
  })

  it('extracts text color (not font-size)', () => {
    const result = extractUtilities('text-blue-500')
    expect(result.get('color')).toBe('text-blue-500')
  })

  it('extracts border-color (not border-width)', () => {
    const result = extractUtilities('border-green-300')
    expect(result.get('border-color')).toBe('border-green-300')
  })

  // ── Typography ─────────────────────────────────────────────────────

  it('extracts font-size from text-{size}', () => {
    const result = extractUtilities('text-lg')
    expect(result.get('font-size')).toBe('text-lg')
  })

  it('extracts font-weight', () => {
    const result = extractUtilities('font-bold')
    expect(result.get('font-weight')).toBe('font-bold')
  })

  it('extracts line-height', () => {
    const result = extractUtilities('leading-tight')
    expect(result.get('line-height')).toBe('leading-tight')
  })

  // ── Ambiguous prefix disambiguation ────────────────────────────────

  it('disambiguates text- prefix: size vs color', () => {
    const result = extractUtilities('text-lg text-red-500')
    expect(result.get('font-size')).toBe('text-lg')
    expect(result.get('color')).toBe('text-red-500')
  })

  it('disambiguates border- prefix: width vs color', () => {
    const result = extractUtilities('border-2 border-red-500')
    expect(result.get('border-width')).toBe('border-2')
    expect(result.get('border-color')).toBe('border-red-500')
  })

  it('handles bare "border" class (defaultBare → border-width)', () => {
    const result = extractUtilities('border border-gray-300')
    expect(result.get('border-width')).toBe('border')
    expect(result.get('border-color')).toBe('border-gray-300')
  })

  it('handles bare "rounded" class', () => {
    const result = extractUtilities('rounded')
    expect(result.get('border-radius')).toBe('rounded')
  })

  // ── Border radius ──────────────────────────────────────────────────

  it('extracts border-radius classes', () => {
    const result = extractUtilities('rounded-lg')
    expect(result.get('border-radius')).toBe('rounded-lg')
  })

  it('extracts corner-specific border-radius', () => {
    const result = extractUtilities('rounded-tl-lg rounded-br-sm')
    expect(result.get('border-top-left-radius')).toBe('rounded-tl-lg')
    expect(result.get('border-bottom-right-radius')).toBe('rounded-br-sm')
  })

  // ── Static utilities (same code path — use it.each) ─────────────────

  it.each([
    ['flex', 'display', 'flex'],
    ['hidden', 'display', 'hidden'],
    ['flex-col', 'flex-direction', 'flex-col'],
    ['justify-between', 'justify-content', 'justify-between'],
    ['items-center', 'align-items', 'items-center'],
    ['cursor-pointer', 'cursor', 'cursor-pointer'],
  ] as const)('extracts static utility %s → %s', (cls, property, expected) => {
    expect(extractUtilities(cls).get(property)).toBe(expected)
  })

  // ── Effects ────────────────────────────────────────────────────────

  it('extracts opacity', () => {
    const result = extractUtilities('opacity-50')
    expect(result.get('opacity')).toBe('opacity-50')
  })

  it('extracts blur', () => {
    expect(extractUtilities('blur').get('filter')).toBe('blur')
    expect(extractUtilities('blur-lg').get('filter')).toBe('blur-lg')
  })

  it('extracts shadow', () => {
    expect(extractUtilities('shadow').get('box-shadow')).toBe('shadow')
    expect(extractUtilities('shadow-lg').get('box-shadow')).toBe('shadow-lg')
  })

  // ── Complex real-world className strings ───────────────────────────

  it('handles a real-world component className', () => {
    const result = extractUtilities('flex items-center gap-4 bg-red-500 text-white pt-4 rounded-lg shadow-md')
    expect(result.get('display')).toBe('flex')
    expect(result.get('align-items')).toBe('items-center')
    expect(result.get('gap')).toBe('gap-4')
    expect(result.get('background-color')).toBe('bg-red-500')
    expect(result.get('color')).toBe('text-white')
    expect(result.get('padding-top')).toBe('pt-4')
    expect(result.get('border-radius')).toBe('rounded-lg')
    expect(result.get('box-shadow')).toBe('shadow-md')
  })

  // ── Variant filtering ──────────────────────────────────────────────

  it('ignores responsive variants (md:, lg:)', () => {
    const result = extractUtilities('pt-4 md:pt-8 lg:pt-12')
    expect(result.get('padding-top')).toBe('pt-4')
    expect(result.size).toBe(1)  // only base utility
  })

  it('ignores state variants (hover:, focus:)', () => {
    const result = extractUtilities('bg-red-500 hover:bg-blue-500')
    expect(result.get('background-color')).toBe('bg-red-500')
    expect(result.size).toBe(1)
  })

  // ── Edge cases ─────────────────────────────────────────────────────

  it('returns empty map for empty string', () => {
    expect(extractUtilities('').size).toBe(0)
  })

  it('handles extra whitespace', () => {
    const result = extractUtilities('  pt-4   bg-red-500  ')
    expect(result.get('padding-top')).toBe('pt-4')
    expect(result.get('background-color')).toBe('bg-red-500')
  })

  it('first class wins for same property', () => {
    const result = extractUtilities('pt-4 pt-8')
    expect(result.get('padding-top')).toBe('pt-4')
  })

  // ── Adversarial edge cases (from code review) ─────────────────────

  it('does NOT extract shorthand p-/px-/py-/m- (prevents silent side-dropping)', () => {
    const result = extractUtilities('p-4 px-2 py-8 m-4 mx-2 my-8')
    // Shorthands excluded — editing one side would silently drop the others
    expect(result.has('padding-top')).toBe(false)
    expect(result.has('padding-left')).toBe(false)
    expect(result.has('margin-top')).toBe(false)
    expect(result.has('margin-left')).toBe(false)
  })

  it('does NOT misclassify font-sans/font-mono as font-weight', () => {
    const result = extractUtilities('font-sans font-bold')
    expect(result.get('font-weight')).toBe('font-bold')
    // font-sans should NOT appear as any property
    expect([...result.values()]).not.toContain('font-sans')
  })

  it('does NOT misclassify bg-clip-text as background-color', () => {
    const result = extractUtilities('bg-clip-text bg-red-500')
    expect(result.get('background-color')).toBe('bg-red-500')
  })

  it('does NOT misclassify bg-gradient-to-r as background-color', () => {
    const result = extractUtilities('bg-gradient-to-r bg-blue-500')
    expect(result.get('background-color')).toBe('bg-blue-500')
  })

  it('does NOT misclassify border-collapse as border-color', () => {
    const result = extractUtilities('border-collapse border-red-500')
    expect(result.get('border-color')).toBe('border-red-500')
  })

  it('does NOT drop border-yellow-500 (border-y prefix must not match border-yellow)', () => {
    const result = extractUtilities('border-yellow-500')
    expect(result.get('border-color')).toBe('border-yellow-500')
  })

  it('does NOT extract rounded-l-/rounded-r- (multi-corner shorthands)', () => {
    const result = extractUtilities('rounded-l-lg')
    expect(result.has('border-radius')).toBe(false)
  })
})
