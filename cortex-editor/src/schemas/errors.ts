import type { ZodIssue } from 'zod'

// ---------------------------------------------------------------------------
// Structured error format for schema violations.
// ---------------------------------------------------------------------------

export type SchemaViolation = {
  ok: false
  code: 'SCHEMA_VIOLATION'
  context: string
  path: string[]
  message: string
}

export class SchemaViolationError extends Error {
  readonly issues: ZodIssue[]
  readonly context: string
  constructor(message: string, issues: ZodIssue[], context: string) {
    super(message)
    this.name = 'SchemaViolationError'
    this.issues = issues
    this.context = context
  }
}

export function formatIssues(issues: ZodIssue[]): string {
  return issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')
}

export function toSchemaViolation(context: string, issues: ZodIssue[]): SchemaViolation[] {
  return issues.map((i) => ({
    ok: false as const,
    code: 'SCHEMA_VIOLATION' as const,
    context,
    path: i.path.map(String),
    message: i.message,
  }))
}
