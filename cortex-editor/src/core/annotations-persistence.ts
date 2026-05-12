import fs from 'fs'
import { z } from 'zod'
import type { Annotation } from '../adapters/types.js'

// ---------------------------------------------------------------------------
// Schema version — bump when envelope shape changes
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1 as const

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ElementContextSchema = z.object({
  tagName: z.string(),
  componentName: z.string().nullable(),
  domSelector: z.string(),
  textPreview: z.string(),
})

const FixMetaSchema = z.object({
  property: z.string(),
  value: z.string(),
  reason: z.string(),
})

const ThreadMessageSchema = z.object({
  id: z.string(),
  from: z.union([z.literal('user'), z.literal('agent')]),
  text: z.string(),
  timestamp: z.number(),
})

const AnnotationStatusSchema = z.union([
  z.literal('pending'),
  z.literal('acknowledged'),
  z.literal('resolved'),
  z.literal('dismissed'),
])

const AnnotationKindSchema = z.union([
  z.literal('comment'),
  z.literal('fix-request'),
])

const AnnotationSchema = z.object({
  id: z.string(),
  status: AnnotationStatusSchema,
  elementSource: z.string(),
  text: z.string(),
  elementContext: ElementContextSchema.optional(),
  currentStyles: z.record(z.string(), z.string()).optional(),
  pinPosition: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  resolution: z.object({ summary: z.string() }).optional(),
  dismissReason: z.string().optional(),
  thread: z.array(ThreadMessageSchema),
  kind: AnnotationKindSchema.optional(),
  fixMeta: FixMetaSchema.optional(),
})

const EnvelopeSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  annotations: z.array(AnnotationSchema),
})

// Compile-time guard: if `Annotation` in types.ts gains a required field,
// this assignment fails type-checking until AnnotationSchema is updated.
// Catches schema/type drift before it becomes a silent runtime data loss.
const _annotationSchemaMatchesType: z.ZodType<Annotation> = AnnotationSchema
void _annotationSchemaMatchesType

// ---------------------------------------------------------------------------
// Internal type guards
// ---------------------------------------------------------------------------

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads annotations from a JSON file. Returns [] on any error.
 * Does NOT throw under any circumstances.
 */
export function loadAnnotations(filePath: string): Annotation[] {
  try {
    let contents: string
    try {
      contents = fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      if (isNodeErrnoException(err) && err.code === 'ENOENT') {
        // Normal first-run case — no warn
        return []
      }
      console.warn('[cortex] annotations.json read failed:', errMessage(err))
      return []
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch (err) {
      console.warn('[cortex] annotations.json invalid JSON:', errMessage(err))
      return []
    }

    const result = EnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      console.warn(
        '[cortex] annotations.json schema mismatch:',
        result.error.message,
      )
      return []
    }

    return result.data.annotations
  } catch (err) {
    console.warn(
      '[cortex] annotations.json unexpected error:',
      errMessage(err),
    )
    return []
  }
}

/**
 * Saves annotations to a JSON file using atomic write (write .tmp, then rename).
 * Does NOT throw under any circumstances.
 */
export function saveAnnotations(
  filePath: string,
  annotations: readonly Annotation[],
): void {
  try {
    const envelope = {
      version: SCHEMA_VERSION,
      annotations,
    }
    const serialized = JSON.stringify(envelope, null, 2)
    const tmpPath = filePath + '.tmp'

    try {
      fs.writeFileSync(tmpPath, serialized, 'utf8')
    } catch (err) {
      console.warn('[cortex] annotations.json write failed:', errMessage(err))
      // Live file at filePath is untouched — atomicity preserved
      return
    }

    try {
      fs.renameSync(tmpPath, filePath)
    } catch (err) {
      console.warn('[cortex] annotations.json rename failed:', errMessage(err))
      // Orphan .tmp left — cleanup is out of scope
    }
  } catch (err) {
    console.warn(
      '[cortex] annotations.json unexpected error:',
      errMessage(err),
    )
  }
}
