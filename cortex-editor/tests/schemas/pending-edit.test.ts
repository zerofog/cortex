import { describe, it, expect } from 'vitest'
import { pendingEditSchema } from '../../src/schemas/pending-edit.js'

// Valid baseline fixture
const validEdit = {
  intentId: 'intent-abc',
  source: 'src/Hero.tsx:14:5',
  property: 'color',
  value: 'red',
  previousValue: '',
  timestamp: 1714500000000,
}

describe('pendingEditSchema — valid inputs', () => {
  it('accepts a minimal valid edit', () => {
    expect(() => pendingEditSchema.parse(validEdit)).not.toThrow()
  })

  it('accepts optional pseudo field ::before', () => {
    expect(() => pendingEditSchema.parse({ ...validEdit, pseudo: '::before' })).not.toThrow()
  })

  it('accepts optional pseudo field ::after', () => {
    expect(() => pendingEditSchema.parse({ ...validEdit, pseudo: '::after' })).not.toThrow()
  })

  it('accepts optional scope: instance', () => {
    expect(() => pendingEditSchema.parse({ ...validEdit, scope: 'instance' })).not.toThrow()
  })

  it('accepts optional scope: all', () => {
    expect(() => pendingEditSchema.parse({ ...validEdit, scope: 'all' })).not.toThrow()
  })

  it('accepts instanceSources array up to 100 entries', () => {
    const sources = Array.from({ length: 100 }, (_, i) => `src/Comp.tsx:${i}:5`)
    expect(() => pendingEditSchema.parse({ ...validEdit, instanceSources: sources })).not.toThrow()
  })

  it('returns data with correct shape', () => {
    const parsed = pendingEditSchema.parse(validEdit)
    expect(parsed.intentId).toBe('intent-abc')
    expect(parsed.source).toBe('src/Hero.tsx:14:5')
    expect(parsed.timestamp).toBe(1714500000000)
  })
})

describe('pendingEditSchema — invalid inputs', () => {
  it('rejects missing intentId', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, intentId: undefined })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('intentId')
    }
  })

  it('rejects intentId that is empty string', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, intentId: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('intentId')
    }
  })

  it('rejects intentId exceeding MAX_INTENT_ID_BYTES (256)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, intentId: 'x'.repeat(257) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('intentId')
    }
  })

  it('rejects source exceeding MAX_INTENT_SOURCE_BYTES (1024)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, source: 'x'.repeat(1025) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('source')
    }
  })

  it('rejects empty source', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, source: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('source')
    }
  })

  it('rejects property exceeding MAX_INTENT_PROPERTY_BYTES (256)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, property: 'x'.repeat(257) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('property')
    }
  })

  it('rejects empty property', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, property: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('property')
    }
  })

  it('rejects value exceeding MAX_INTENT_VALUE_BYTES (4096)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, value: 'x'.repeat(4097) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('value')
    }
  })

  it('rejects previousValue exceeding MAX_INTENT_VALUE_BYTES (4096)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, previousValue: 'x'.repeat(4097) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('previousValue')
    }
  })

  it('rejects pseudo with invalid value (null)', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, pseudo: null })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('pseudo')
    }
  })

  it('rejects pseudo with arbitrary string', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, pseudo: ':focus' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('pseudo')
    }
  })

  it('rejects instanceSources exceeding 100 entries', () => {
    const sources = Array.from({ length: 101 }, (_, i) => `src/Comp.tsx:${i}:5`)
    const result = pendingEditSchema.safeParse({ ...validEdit, instanceSources: sources })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.startsWith('instanceSources'))).toBe(true)
    }
  })

  it('rejects instanceSources entry exceeding MAX_INTENT_SOURCE_BYTES', () => {
    const sources = ['x'.repeat(1025)]
    const result = pendingEditSchema.safeParse({ ...validEdit, instanceSources: sources })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.startsWith('instanceSources'))).toBe(true)
    }
  })

  it('rejects non-finite timestamp', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, timestamp: NaN })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('timestamp')
    }
  })

  it('rejects non-number timestamp', () => {
    const result = pendingEditSchema.safeParse({ ...validEdit, timestamp: 'now' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('timestamp')
    }
  })

  it('rejects completely missing required fields', () => {
    const result = pendingEditSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })
})
