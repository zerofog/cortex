import { describe, it, expect, afterEach, vi } from 'vitest'
import { z } from 'zod'

// We test gating behavior by controlling VITEST env var.
// The module caches nothing per-call, so env changes between tests work.

describe('parseOrFail (server/test mode via NODE_ENV=test)', () => {
  // In vitest, process.env.VITEST is set to 'true' automatically.
  // So test mode is always active here — parseOrFail should throw.

  it('returns parsed data for valid input', async () => {
    const { parseOrFail } = await import('../../src/schemas/gating.js')
    const schema = z.object({ x: z.number() })
    const result = parseOrFail(schema, { x: 42 }, 'test.ctx')
    expect(result).toEqual({ x: 42 })
  })

  it('throws SchemaViolationError for invalid input in test mode (VITEST=true)', async () => {
    const { parseOrFail } = await import('../../src/schemas/gating.js')
    const { SchemaViolationError } = await import('../../src/schemas/errors.js')
    const schema = z.object({ x: z.number() })
    expect(() => parseOrFail(schema, { x: 'oops' }, 'test.ctx')).toThrow(SchemaViolationError)
  })

  it('SchemaViolationError message includes context and path', async () => {
    const { parseOrFail } = await import('../../src/schemas/gating.js')
    const { SchemaViolationError } = await import('../../src/schemas/errors.js')
    const schema = z.object({ name: z.string() })
    let caught: SchemaViolationError | null = null
    try {
      parseOrFail(schema, { name: 99 }, 'my.context')
    } catch (e) {
      if (e instanceof SchemaViolationError) caught = e
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toContain('my.context')
    expect(caught!.message).toContain('name')
    expect(caught!.context).toBe('my.context')
  })

  it('returns null and warns in prod mode (NODE_ENV!=test)', async () => {
    // Temporarily override env vars to simulate non-test mode.
    // We need to import a fresh instance that sees the overridden env.
    // Since modules are cached, we use vi.stubEnv + dynamic import with cache-bust.
    const originalVitest = process.env.VITEST
    const originalNodeEnv = process.env.NODE_ENV
    const originalCortexTest = process.env.CORTEX_TEST_BUILD

    process.env.VITEST = undefined as unknown as string
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'
    process.env.CORTEX_TEST_BUILD = 'false'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      // Re-import fresh copy by side-loading through a wrapper that re-evaluates isTestMode.
      // Since vitest caches ESM modules, we call the function directly and check behavior
      // based on the logic: the isTestMode check reads process.env at call time.
      // We need to reload the module to avoid the cache.
      // Use vi.resetModules() pattern.
      vi.resetModules()
      const { parseOrFail: freshParseOrFail } = await import('../../src/schemas/gating.js')
      const schema = z.object({ x: z.number() })
      const result = freshParseOrFail(schema, { x: 'bad' }, 'prod.ctx')
      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[cortex] schema violation at prod.ctx:'),
        expect.any(String),
      )
    } finally {
      process.env.VITEST = originalVitest
      process.env.NODE_ENV = originalNodeEnv
      if (originalCortexTest !== undefined) {
        process.env.CORTEX_TEST_BUILD = originalCortexTest
      } else {
        delete process.env.CORTEX_TEST_BUILD
      }
      warnSpy.mockRestore()
      vi.resetModules()
    }
  })
})

// ---------------------------------------------------------------------------
// Browser-mode test-build branch — exercises the
// `typeof __CORTEX_TEST_BUILD__ !== 'undefined'` short-circuit that fires
// inside browser bundles (esbuild defines the identifier as a literal).
//
// We simulate the browser bundle by stubbing the global identifier via
// vi.stubGlobal — `typeof` consults the global namespace, so the check
// returns `'boolean'` instead of `'undefined'` and short-circuits before
// the env-var fallback. We also wipe the env vars so that if the
// short-circuit DIDN'T fire, the fallback would clearly disagree (test
// mode → throw vs. warn) and the test would fail noisily.
// ---------------------------------------------------------------------------

describe('parseOrFail (browser test-build mode via __CORTEX_TEST_BUILD__)', () => {
  let originalVitest: string | undefined
  let originalNodeEnv: string | undefined
  let originalCortexTest: string | undefined

  function clearEnvFlags(): void {
    originalVitest = process.env['VITEST']
    originalNodeEnv = process.env['NODE_ENV']
    originalCortexTest = process.env['CORTEX_TEST_BUILD']
    delete process.env['VITEST']
    delete process.env['CORTEX_TEST_BUILD']
    process.env['NODE_ENV'] = 'production'
  }

  function restoreEnvFlags(): void {
    if (originalVitest !== undefined) process.env['VITEST'] = originalVitest
    if (originalCortexTest !== undefined) process.env['CORTEX_TEST_BUILD'] = originalCortexTest
    else delete process.env['CORTEX_TEST_BUILD']
    if (originalNodeEnv !== undefined) process.env['NODE_ENV'] = originalNodeEnv
    else delete process.env['NODE_ENV']
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    restoreEnvFlags()
  })

  it('with __CORTEX_TEST_BUILD__=true: throws on invalid input (env vars cleared so fallback would warn)', async () => {
    clearEnvFlags()
    vi.stubGlobal('__CORTEX_TEST_BUILD__', true)
    vi.resetModules()

    const { parseOrFail } = await import('../../src/schemas/gating.js')
    const { SchemaViolationError } = await import('../../src/schemas/errors.js')
    const schema = z.object({ x: z.number() })

    expect(() => parseOrFail(schema, { x: 'bad' }, 'browser.ctx')).toThrow(SchemaViolationError)
  })

  it('with __CORTEX_TEST_BUILD__=false: returns null and warns (browser-prod bundle)', async () => {
    clearEnvFlags()
    vi.stubGlobal('__CORTEX_TEST_BUILD__', false)
    vi.resetModules()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { parseOrFail } = await import('../../src/schemas/gating.js')
      const schema = z.object({ x: z.number() })
      const result = parseOrFail(schema, { x: 'bad' }, 'browser.prod')
      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[cortex] schema violation at browser.prod:'),
        expect.any(String),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('with __CORTEX_TEST_BUILD__=true: still parses valid input cleanly', async () => {
    clearEnvFlags()
    vi.stubGlobal('__CORTEX_TEST_BUILD__', true)
    vi.resetModules()

    const { parseOrFail } = await import('../../src/schemas/gating.js')
    const schema = z.object({ x: z.number() })
    const result = parseOrFail(schema, { x: 7 }, 'browser.ctx')
    expect(result).toEqual({ x: 7 })
  })
})
