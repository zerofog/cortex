import { describe, it, expect } from 'vitest'
import {
  cliRpcRequestSchema,
  cliRpcResultSchema,
  cliRpcErrorSchema,
  cliStatusSchema,
} from '../../src/schemas/wire-format.js'

// ---------------------------------------------------------------------------
// CLI WebSocket envelope schemas
//
// These wire shapes flow between the Vite dev server and the cortex MCP CLI
// (NOT browser↔server). They are inline JSON today; T2 will replace inline
// validation with these schemas.
// ---------------------------------------------------------------------------

const validToken = 'tok-cli-abc'

// ----------------------------- cliRpcRequestSchema -----------------------------

describe('cliRpcRequestSchema', () => {
  it('accepts a well-formed RPC request with empty params', () => {
    expect(() =>
      cliRpcRequestSchema.parse({
        type: 'cortex-rpc',
        requestId: 'req-1',
        method: 'getPending',
        params: {},
        token: validToken,
      }),
    ).not.toThrow()
  })

  it('accepts a request with non-empty params object', () => {
    expect(() =>
      cliRpcRequestSchema.parse({
        type: 'cortex-rpc',
        requestId: 'req-2',
        method: 'applyEdits',
        params: { intentIds: ['i-1', 'i-2'] },
        token: validToken,
      }),
    ).not.toThrow()
  })

  it('rejects missing method', () => {
    const r = cliRpcRequestSchema.safeParse({
      type: 'cortex-rpc',
      requestId: 'req-1',
      params: {},
      token: validToken,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('method')
    }
  })

  it('rejects missing token', () => {
    const r = cliRpcRequestSchema.safeParse({
      type: 'cortex-rpc',
      requestId: 'req-1',
      method: 'getPending',
      params: {},
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('token')
    }
  })

  it('rejects wrong literal type', () => {
    const r = cliRpcRequestSchema.safeParse({
      type: 'rpc',
      requestId: 'req-1',
      method: 'getPending',
      params: {},
      token: validToken,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('type')
    }
  })

  it('rejects non-object params', () => {
    const r = cliRpcRequestSchema.safeParse({
      type: 'cortex-rpc',
      requestId: 'req-1',
      method: 'getPending',
      params: 'not-an-object',
      token: validToken,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('params')
    }
  })
})

// ----------------------------- cliRpcResultSchema -----------------------------

describe('cliRpcResultSchema', () => {
  it('accepts a result with object payload', () => {
    expect(() =>
      cliRpcResultSchema.parse({
        type: 'cortex-rpc-result',
        requestId: 'req-1',
        result: { ok: true, data: [1, 2, 3] },
      }),
    ).not.toThrow()
  })

  it('accepts a result with null payload (allowed by z.unknown)', () => {
    expect(() =>
      cliRpcResultSchema.parse({
        type: 'cortex-rpc-result',
        requestId: 'req-1',
        result: null,
      }),
    ).not.toThrow()
  })

  it('rejects missing requestId', () => {
    const r = cliRpcResultSchema.safeParse({
      type: 'cortex-rpc-result',
      result: {},
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('requestId')
    }
  })

  it('rejects wrong literal type', () => {
    const r = cliRpcResultSchema.safeParse({
      type: 'cortex-rpc',
      requestId: 'req-1',
      result: {},
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('type')
    }
  })

  it('rejects non-string requestId', () => {
    const r = cliRpcResultSchema.safeParse({
      type: 'cortex-rpc-result',
      requestId: 42,
      result: {},
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('requestId')
    }
  })
})

// ----------------------------- cliRpcErrorSchema -----------------------------

describe('cliRpcErrorSchema', () => {
  it('accepts a well-formed error envelope', () => {
    expect(() =>
      cliRpcErrorSchema.parse({
        type: 'cortex-rpc-error',
        requestId: 'req-1',
        error: 'Unknown RPC method: foo',
      }),
    ).not.toThrow()
  })

  it('rejects missing error string', () => {
    const r = cliRpcErrorSchema.safeParse({
      type: 'cortex-rpc-error',
      requestId: 'req-1',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('error')
    }
  })

  it('rejects non-string error', () => {
    const r = cliRpcErrorSchema.safeParse({
      type: 'cortex-rpc-error',
      requestId: 'req-1',
      error: { code: 500 },
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('error')
    }
  })

  it('rejects wrong literal type', () => {
    const r = cliRpcErrorSchema.safeParse({
      type: 'cortex-rpc',
      requestId: 'req-1',
      error: 'oops',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('type')
    }
  })
})

// ----------------------------- cliStatusSchema -----------------------------

describe('cliStatusSchema', () => {
  it('accepts a fully-populated status', () => {
    expect(() =>
      cliStatusSchema.parse({
        type: 'cortex-status',
        editorActive: true,
        browserConnected: false,
      }),
    ).not.toThrow()
  })

  it('rejects missing editorActive', () => {
    const r = cliStatusSchema.safeParse({
      type: 'cortex-status',
      browserConnected: true,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('editorActive')
    }
  })

  it('rejects non-boolean browserConnected', () => {
    const r = cliStatusSchema.safeParse({
      type: 'cortex-status',
      editorActive: true,
      browserConnected: 'yes',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('browserConnected')
    }
  })

  it('rejects wrong literal type', () => {
    const r = cliStatusSchema.safeParse({
      type: 'status',
      editorActive: true,
      browserConnected: true,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('type')
    }
  })
})
