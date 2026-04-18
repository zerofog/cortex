import { describe, it, expect } from 'vitest'
import { detectTextComponent, detectColorChip } from '../../src/browser/token-detector.js'

const BUNDLES = [
  { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
  { name: 'heading-1', fontSize: '32px', lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '700' },
]

const CHIPS = [
  { name: 'gray-900', hex: '#111827' },
  { name: 'brand-500', hex: '#3b82f6' },
]

describe('detectTextComponent', () => {
  it('returns the bundle whose text-{name} form is a class in className', () => {
    const got = detectTextComponent('flex text-body-md px-4', BUNDLES)
    expect(got?.name).toBe('body-md')
  })

  it('returns null when no bundle class is present', () => {
    expect(detectTextComponent('text-sm font-bold', BUNDLES)).toBeNull()
  })

  it('returns null when bundles list is empty', () => {
    expect(detectTextComponent('text-body-md', [])).toBeNull()
  })

  it('does not match partial tokens like text-sm', () => {
    expect(detectTextComponent('text-sm', BUNDLES)).toBeNull()
  })

  it('does not match the bare bundle name without the text- prefix', () => {
    // Tailwind v4 emits `.text-body-md` from `@theme { --text-body-md: ... }`,
    // never `.body-md`. Matching the bare form would detect classes that have
    // no corresponding CSS rule, causing silent classOp failures.
    expect(detectTextComponent('flex body-md px-4', BUNDLES)).toBeNull()
  })

  it('handles multiple spaces and tabs between classes', () => {
    const got = detectTextComponent('flex    \t text-body-md   px-4', BUNDLES)
    expect(got?.name).toBe('body-md')
  })

  it('returns the first match when multiple bundle classes are present', () => {
    // Not a supported usage (duplicate bundles on one element is meaningless)
    // but the detector must be deterministic — first bundle encountered in
    // className order wins.
    const got = detectTextComponent('text-body-md text-heading-1', BUNDLES)
    expect(got?.name).toBe('body-md')
  })
})

describe('detectColorChip', () => {
  it('returns chip when text-{chip-name} class is present', () => {
    expect(detectColorChip('text-gray-900 flex', CHIPS)?.name).toBe('gray-900')
  })

  it('returns null when only a raw text- class is present (partial token)', () => {
    expect(detectColorChip('text-sm', CHIPS)).toBeNull()
  })

  it('returns null for classes that look like colors but are not in the registry', () => {
    expect(detectColorChip('text-red-999', CHIPS)).toBeNull()
  })

  it('returns null when chips list is empty', () => {
    expect(detectColorChip('text-gray-900', [])).toBeNull()
  })

  it('returns null when className is empty', () => {
    expect(detectColorChip('', CHIPS)).toBeNull()
  })

  it('ignores bg-, border-, ring- prefixes (only text- colors are matched)', () => {
    expect(detectColorChip('bg-gray-900 border-brand-500', CHIPS)).toBeNull()
  })
})
