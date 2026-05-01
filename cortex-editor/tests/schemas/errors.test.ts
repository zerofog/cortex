import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  SchemaViolationError,
  formatIssues,
  toSchemaViolation,
} from '../../src/schemas/errors.js'

describe('SchemaViolationError', () => {
  it('is an Error with correct name, issues, and context', () => {
    const issues = [
      { path: ['foo', 'bar'], message: 'Required', code: 'invalid_type' as const, expected: 'string' as const, received: 'undefined' as const },
    ]
    const err = new SchemaViolationError('ctx: foo.bar: Required', issues as never, 'ctx')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SchemaViolationError)
    expect(err.name).toBe('SchemaViolationError')
    expect(err.message).toBe('ctx: foo.bar: Required')
    expect(err.issues).toBe(issues)
    expect(err.context).toBe('ctx')
  })
})

describe('formatIssues', () => {
  it('formats a single issue with path', () => {
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const formatted = formatIssues(result.error.issues)
      expect(formatted).toContain('name')
    }
  })

  it('formats multiple issues with semicolon separator', () => {
    const schema = z.object({ a: z.string(), b: z.number() })
    const result = schema.safeParse({ a: 1, b: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const formatted = formatIssues(result.error.issues)
      expect(formatted).toContain(';')
    }
  })

  it('uses <root> for issues with empty path', () => {
    const schema = z.string()
    const result = schema.safeParse(42)
    expect(result.success).toBe(false)
    if (!result.success) {
      const formatted = formatIssues(result.error.issues)
      expect(formatted).toContain('<root>')
    }
  })
})

describe('toSchemaViolation', () => {
  it('maps each issue to a SchemaViolation', () => {
    const schema = z.object({ x: z.string(), y: z.number() })
    const result = schema.safeParse({ x: 1, y: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const violations = toSchemaViolation('test.ctx', result.error.issues)
      expect(violations.length).toBeGreaterThanOrEqual(1)
      for (const v of violations) {
        expect(v.ok).toBe(false)
        expect(v.code).toBe('SCHEMA_VIOLATION')
        expect(v.context).toBe('test.ctx')
        expect(Array.isArray(v.path)).toBe(true)
        expect(typeof v.message).toBe('string')
      }
    }
  })
})
