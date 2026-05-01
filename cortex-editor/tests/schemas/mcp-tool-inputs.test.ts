import { describe, it, expect } from 'vitest'
import {
  cortexGetDetailsInputSchema,
  cortexAcknowledgeInputSchema,
  cortexResolveInputSchema,
  cortexDismissInputSchema,
  cortexRespondInputSchema,
  cortexApplyEditsInputSchema,
  cortexDiscardEditsInputSchema,
  cortexGetIntentContextInputSchema,
} from '../../src/schemas/mcp-tool-inputs.js'

// --- Tools with no inputs (cortex_activate, cortex_deactivate, cortex_status,
//     cortex_get_pending, cortex_get_pending_edits, cortex_channel_test) ---
// They have empty inputSchema (z.object({})), not exported individually since
// there's nothing interesting to test beyond parsing — covered by contract tests.

describe('cortexGetDetailsInputSchema', () => {
  it('accepts valid annotationId', () => {
    expect(() => cortexGetDetailsInputSchema.parse({ annotationId: 'ann-1' })).not.toThrow()
  })
  it('rejects missing annotationId', () => {
    const r = cortexGetDetailsInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
  it('rejects non-string annotationId', () => {
    const r = cortexGetDetailsInputSchema.safeParse({ annotationId: 42 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
})

describe('cortexAcknowledgeInputSchema', () => {
  it('accepts valid annotationId', () => {
    expect(() => cortexAcknowledgeInputSchema.parse({ annotationId: 'ann-1' })).not.toThrow()
  })
  it('rejects missing annotationId', () => {
    const r = cortexAcknowledgeInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
})

describe('cortexResolveInputSchema', () => {
  it('accepts annotationId and summary', () => {
    expect(() => cortexResolveInputSchema.parse({ annotationId: 'ann-1', summary: 'applied fix' })).not.toThrow()
  })
  it('rejects missing summary', () => {
    const r = cortexResolveInputSchema.safeParse({ annotationId: 'ann-1' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('summary')
    }
  })
  it('rejects missing annotationId', () => {
    const r = cortexResolveInputSchema.safeParse({ summary: 'done' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
})

describe('cortexDismissInputSchema', () => {
  it('accepts annotationId without reason', () => {
    expect(() => cortexDismissInputSchema.parse({ annotationId: 'ann-1' })).not.toThrow()
  })
  it('accepts annotationId with reason', () => {
    expect(() => cortexDismissInputSchema.parse({ annotationId: 'ann-1', reason: 'not relevant' })).not.toThrow()
  })
  it('rejects missing annotationId', () => {
    const r = cortexDismissInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
  it('rejects non-string reason', () => {
    const r = cortexDismissInputSchema.safeParse({ annotationId: 'ann-1', reason: 42 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('reason')
    }
  })
})

describe('cortexRespondInputSchema', () => {
  it('accepts annotationId and text', () => {
    expect(() => cortexRespondInputSchema.parse({ annotationId: 'ann-1', text: 'clarification' })).not.toThrow()
  })
  it('rejects missing text', () => {
    const r = cortexRespondInputSchema.safeParse({ annotationId: 'ann-1' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('text')
    }
  })
  it('rejects missing annotationId', () => {
    const r = cortexRespondInputSchema.safeParse({ text: 'hi' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('annotationId')
    }
  })
})

describe('cortexApplyEditsInputSchema', () => {
  it('accepts array of intent IDs', () => {
    expect(() => cortexApplyEditsInputSchema.parse({ intentIds: ['i-1', 'i-2'] })).not.toThrow()
  })
  it('accepts empty array', () => {
    expect(() => cortexApplyEditsInputSchema.parse({ intentIds: [] })).not.toThrow()
  })
  it('rejects missing intentIds', () => {
    const r = cortexApplyEditsInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('intentIds')
    }
  })
  it('rejects non-array intentIds', () => {
    const r = cortexApplyEditsInputSchema.safeParse({ intentIds: 'i-1' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('intentIds')
    }
  })
  it('rejects intentIds with non-string element', () => {
    const r = cortexApplyEditsInputSchema.safeParse({ intentIds: [42] })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.startsWith('intentIds'))).toBe(true)
    }
  })
})

describe('cortexDiscardEditsInputSchema', () => {
  it('accepts array of intent IDs', () => {
    expect(() => cortexDiscardEditsInputSchema.parse({ intentIds: ['i-1'] })).not.toThrow()
  })
  it('rejects missing intentIds', () => {
    const r = cortexDiscardEditsInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('intentIds')
    }
  })
  it('rejects non-array intentIds', () => {
    const r = cortexDiscardEditsInputSchema.safeParse({ intentIds: 'all' })
    expect(r.success).toBe(false)
  })
})

describe('cortexGetIntentContextInputSchema', () => {
  it('accepts valid intentId', () => {
    expect(() => cortexGetIntentContextInputSchema.parse({ intentId: 'i-1' })).not.toThrow()
  })
  it('rejects missing intentId', () => {
    const r = cortexGetIntentContextInputSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('intentId')
    }
  })
  it('rejects non-string intentId', () => {
    const r = cortexGetIntentContextInputSchema.safeParse({ intentId: null })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('intentId')
    }
  })
})
