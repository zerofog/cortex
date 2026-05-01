import { describe, it, expect } from 'vitest'
import { browserToServerSchema, serverToBrowserSchema } from '../../src/schemas/wire-format.js'
import { loadWireFormatFixture } from '../../src/schemas/load-fixture.js'

// ---------------------------------------------------------------------------
// Helper: assert round-trip parity (parse → JSON → parse → deepEqual)
// ---------------------------------------------------------------------------
function assertRoundTrip<T>(schema: { parse: (v: unknown) => T }, fixture: unknown): T {
  const parsed = schema.parse(fixture)
  const serialized = JSON.parse(JSON.stringify(parsed)) as unknown
  const reparsed = schema.parse(serialized)
  expect(reparsed).toEqual(parsed)
  return parsed
}

// ---------------------------------------------------------------------------
// Browser → Server fixtures
// ---------------------------------------------------------------------------

describe('contract: browser-to-server fixtures', () => {
  it.each([
    'browser-to-server/init.json',
    'browser-to-server/cortex-closed.json',
    'browser-to-server/edit-inline-style.json',
    'browser-to-server/edit-class-op.json',
    'browser-to-server/undo.json',
    'browser-to-server/redo.json',
    'browser-to-server/comment-plain.json',
    'browser-to-server/comment-fix-request.json',
    'browser-to-server/comment-reply.json',
    'browser-to-server/clear-server-undo.json',
    'browser-to-server/staged-edit-add.json',
    'browser-to-server/staged-edit-remove.json',
    'browser-to-server/staged-edit-clear.json',
    'browser-to-server/staged-edits-sync.json',
    'browser-to-server/staged-edits-ready.json',
  ])('%s parses and round-trips', (name) => {
    const fixture = loadWireFormatFixture(name)
    assertRoundTrip(browserToServerSchema, fixture)
  })
})

// ---------------------------------------------------------------------------
// Server → Browser fixtures
// ---------------------------------------------------------------------------

describe('contract: server-to-browser fixtures', () => {
  it.each([
    'server-to-browser/cortex.json',
    'server-to-browser/cortex-close.json',
    'server-to-browser/cortex-toggle.json',
    'server-to-browser/hello.json',
    'server-to-browser/error-auth-failed.json',
    'server-to-browser/edit-status-done.json',
    'server-to-browser/edit-status-failed.json',
    'server-to-browser/undo-sync-status.json',
    'server-to-browser/redo-sync-status.json',
    'server-to-browser/hmr-verified.json',
    'server-to-browser/hmr-applied.json',
    'server-to-browser/annotation-created.json',
    'server-to-browser/annotation-updated.json',
    'server-to-browser/agent-status.json',
    'server-to-browser/activity-entry.json',
    'server-to-browser/capabilities.json',
    'server-to-browser/staged-edits-discard.json',
    'server-to-browser/staged-edits-acked.json',
  ])('%s parses and round-trips', (name) => {
    const fixture = loadWireFormatFixture(name)
    assertRoundTrip(serverToBrowserSchema, fixture)
  })
})

// ---------------------------------------------------------------------------
// Negative fixtures — each must reject with a SPECIFIC path
// ---------------------------------------------------------------------------

describe('contract: invalid fixtures reject with specific path', () => {
  it('edit-missing-property: rejects at path "property"', () => {
    const fixture = loadWireFormatFixture('invalid/edit-missing-property.json')
    const result = browserToServerSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('property')
    }
  })

  it('edit-bad-classop-kind: rejects (invalid discriminator value)', () => {
    const fixture = loadWireFormatFixture('invalid/edit-bad-classop-kind.json')
    const result = browserToServerSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      // classOp is nested under the edit union member; path starts with classOp
      const hasClassOpPath = result.error.issues.some((i) => i.path.some((p) => p === 'classOp'))
      expect(hasClassOpPath).toBe(true)
    }
  })

  it('edit-value-too-long: rejects at path "edit.value"', () => {
    const fixture = loadWireFormatFixture('invalid/edit-value-too-long.json')
    const result = browserToServerSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p === 'edit.value')).toBe(true)
    }
  })

  it('hello-missing-session-id: rejects at path "sessionId"', () => {
    const fixture = loadWireFormatFixture('invalid/hello-missing-session-id.json')
    const result = serverToBrowserSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('sessionId')
    }
  })

  it('annotation-bad-status: rejects at path "annotation.status"', () => {
    const fixture = loadWireFormatFixture('invalid/annotation-bad-status.json')
    const result = serverToBrowserSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('annotation.status')
    }
  })

  it('staged-edit-add-missing-token: rejects at path "token"', () => {
    const fixture = loadWireFormatFixture('invalid/staged-edit-add-missing-token.json')
    const result = browserToServerSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('token')
    }
  })

  it('edit-status-bad-status: rejects at path "status"', () => {
    const fixture = loadWireFormatFixture('invalid/edit-status-bad-status.json')
    const result = serverToBrowserSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('status')
    }
  })
})

// ---------------------------------------------------------------------------
// Spot-check: specific fixture fields parse to expected values
// ---------------------------------------------------------------------------

describe('contract: fixture field values', () => {
  it('staged-edit-add: intentId and value correct', () => {
    const fixture = loadWireFormatFixture('browser-to-server/staged-edit-add.json')
    const parsed = browserToServerSchema.parse(fixture)
    expect(parsed.type).toBe('staged-edit-add')
    if (parsed.type === 'staged-edit-add') {
      expect(parsed.edit.intentId).toBe('intent-001')
      expect(parsed.edit.value).toBe('var(--color-primary)')
    }
  })

  it('hello: protocolVersion is 1', () => {
    const fixture = loadWireFormatFixture('server-to-browser/hello.json')
    const parsed = serverToBrowserSchema.parse(fixture)
    expect(parsed.type).toBe('hello')
    if (parsed.type === 'hello') {
      expect(parsed.protocolVersion).toBe(1)
      expect(parsed.colorChips).toHaveLength(2)
    }
  })

  it('annotation-created: annotation status is pending', () => {
    const fixture = loadWireFormatFixture('server-to-browser/annotation-created.json')
    const parsed = serverToBrowserSchema.parse(fixture)
    expect(parsed.type).toBe('annotation-created')
    if (parsed.type === 'annotation-created') {
      expect(parsed.annotation.status).toBe('pending')
      expect(parsed.annotation.thread).toHaveLength(0)
    }
  })
})
