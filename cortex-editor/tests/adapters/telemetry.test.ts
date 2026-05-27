import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Telemetry, UsageState } from '../../src/adapters/telemetry.js'
import { createTelemetry } from '../../src/adapters/telemetry.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fresh mock writer that captures call args. */
function mockWriter() {
  return vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined)
}

/** Build a mock fetch that resolves to a minimal Response-like. */
function mockFetch() {
  return vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>().mockResolvedValue(
    new Response('ok', { status: 200 }),
  )
}

/** Build a mock readFileSync that returns JSON of the given state (or throws ENOENT). */
function mockReadFileSync(state?: UsageState) {
  return vi.fn<[string, BufferEncoding], string>((
    _path: string,
    _enc: BufferEncoding,
  ) => {
    if (state === undefined) {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      throw err
    }
    return JSON.stringify(state)
  })
}

/** Build a mock mkdirSync that is a no-op. */
function mockMkdirSync() {
  return vi.fn()
}

const CORTEX_ROOT = '/fake/project'
const USAGE_PATH = '/fake/project/.cortex/usage.json'

// ---------------------------------------------------------------------------
// Factory builder — keeps tests DRY
// ---------------------------------------------------------------------------
function build(overrides: Partial<Parameters<typeof createTelemetry>[0]> & {
  existingState?: UsageState,
  fetchRejects?: boolean,
} = {}) {
  const { existingState, fetchRejects = false, ...rest } = overrides
  const readFileSync = mockReadFileSync(existingState)
  const writeFile = mockWriter()
  const mkdirSync = mockMkdirSync()
  const fetchImpl = fetchRejects
    ? vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>().mockRejectedValue(new Error('Network error'))
    : mockFetch()

  const telemetry = createTelemetry({
    enabled: true,
    endpoint: undefined,
    cortexRoot: CORTEX_ROOT,
    version: '0.1.0',
    readFileSync,
    writeFile,
    mkdirSync,
    fetchImpl,
    ...rest,
  })

  return { telemetry, readFileSync, writeFile, mkdirSync, fetchImpl }
}

// ---------------------------------------------------------------------------
// Disabled by default
// ---------------------------------------------------------------------------
describe('Telemetry disabled (enabled: false)', () => {
  it('recordInit makes no file write and no fetch', async () => {
    const writeFile = mockWriter()
    const fetchImpl = mockFetch()
    const t = createTelemetry({
      enabled: false,
      endpoint: 'https://example.com',
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      writeFile,
      fetchImpl,
    })

    await t.recordInit()
    expect(writeFile).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recordActivation makes no file write and no fetch', async () => {
    const writeFile = mockWriter()
    const fetchImpl = mockFetch()
    const t = createTelemetry({
      enabled: false,
      endpoint: 'https://example.com',
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      writeFile,
      fetchImpl,
    })

    await t.recordActivation()
    expect(writeFile).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recordFirstEdit makes no file write and no fetch', async () => {
    const writeFile = mockWriter()
    const fetchImpl = mockFetch()
    const t = createTelemetry({
      enabled: false,
      endpoint: 'https://example.com',
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      writeFile,
      fetchImpl,
    })

    await t.recordFirstEdit()
    expect(writeFile).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Opt-in: local file writes
// ---------------------------------------------------------------------------
describe('Telemetry enabled (enabled: true) — local file writes', () => {
  it('recordInit writes usage.json to .cortex/usage.json path', async () => {
    const { telemetry, writeFile } = build()
    await telemetry.recordInit()
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(writeFile.mock.calls[0][0]).toBe(USAGE_PATH)
    const written = JSON.parse(writeFile.mock.calls[0][1]) as UsageState
    expect(written.version).toBe(1)
  })

  it('recordInit calls mkdirSync with .cortex dir + mode 0o700', async () => {
    const { telemetry, mkdirSync } = build()
    await telemetry.recordInit()
    expect(mkdirSync).toHaveBeenCalledWith(
      '/fake/project/.cortex',
      { recursive: true, mode: 0o700 },
    )
  })

  it('recordActivation sets lastActivationDate to today', async () => {
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T12:00:00Z`))
    const { telemetry, writeFile } = build({ now })

    await telemetry.recordActivation()

    const written = JSON.parse(writeFile.mock.calls[0][1]) as UsageState
    expect(written.lastActivationDate).toBe(today)
  })

  it('recordActivation sets firstActivationDate on first call', async () => {
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T12:00:00Z`))
    const { telemetry, writeFile } = build({ now })

    await telemetry.recordActivation()

    const written = JSON.parse(writeFile.mock.calls[0][1]) as UsageState
    expect(written.firstActivationDate).toBe(today)
  })

  it('recordActivation preserves existing firstActivationDate on subsequent calls', async () => {
    const originalDate = '2026-01-15'
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T08:00:00Z`))
    const { telemetry, writeFile } = build({
      now,
      existingState: { version: 1, firstActivationDate: originalDate, lastActivationDate: originalDate },
    })

    await telemetry.recordActivation()

    const written = JSON.parse(writeFile.mock.calls[0][1]) as UsageState
    expect(written.firstActivationDate).toBe(originalDate)
    expect(written.lastActivationDate).toBe(today)
  })

  it('recordFirstEdit sets firstEditRecorded = true', async () => {
    const { telemetry, writeFile } = build()
    await telemetry.recordFirstEdit()
    const written = JSON.parse(writeFile.mock.calls[0][1]) as UsageState
    expect(written.firstEditRecorded).toBe(true)
  })

  it('recordFirstEdit is no-op when firstEditRecorded is already true', async () => {
    const { telemetry, writeFile } = build({
      existingState: { version: 1, firstEditRecorded: true },
    })
    await telemetry.recordFirstEdit()
    expect(writeFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Event 4: return_session (multi-day detection)
// ---------------------------------------------------------------------------
describe('return_session detection', () => {
  it('emits return_session when lastActivationDate differs from today', async () => {
    const yesterday = '2026-05-26'
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T09:00:00Z`))
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      now,
      fetchImpl,
      readFileSync: mockReadFileSync({ version: 1, lastActivationDate: yesterday }),
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordActivation()

    // Should have fired TWO events: editor_activated + return_session
    const calledEvents = fetchImpl.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).event,
    )
    expect(calledEvents).toContain('editor_activated')
    expect(calledEvents).toContain('return_session')
  })

  it('does NOT emit return_session when lastActivationDate equals today', async () => {
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T18:00:00Z`))
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      now,
      fetchImpl,
      readFileSync: mockReadFileSync({ version: 1, lastActivationDate: today }),
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordActivation()

    const calledEvents = fetchImpl.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).event,
    )
    expect(calledEvents).toContain('editor_activated')
    expect(calledEvents).not.toContain('return_session')
  })

  it('does NOT emit return_session when no lastActivationDate exists (first time)', async () => {
    const today = '2026-05-27'
    const now = vi.fn(() => new Date(`${today}T08:00:00Z`))
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      now,
      fetchImpl,
      readFileSync: mockReadFileSync(undefined), // file does not exist
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordActivation()

    const calledEvents = fetchImpl.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).event,
    )
    expect(calledEvents).not.toContain('return_session')
  })
})

// ---------------------------------------------------------------------------
// Remote sink: endpoint POST shape
// ---------------------------------------------------------------------------
describe('Remote POST when endpoint is set', () => {
  it('POSTs with correct shape: event, ts, cortexVersion', async () => {
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()
    const now = vi.fn(() => new Date('2026-05-27T10:00:00.000Z'))

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      now,
      fetchImpl,
      readFileSync: mockReadFileSync(undefined),
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordInit()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(endpoint)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' })
    const body = JSON.parse(init?.body as string)
    expect(body.event).toBe('cortex_init')
    expect(body.ts).toBe('2026-05-27T10:00:00.000Z')
    expect(body.cortexVersion).toBe('0.1.0')
  })

  it('does NOT POST when endpoint is not set', async () => {
    const fetchImpl = mockFetch()
    const { telemetry } = build({ endpoint: undefined, fetchImpl })

    await telemetry.recordInit()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Network failure is swallowed (telemetry never throws into caller)
// ---------------------------------------------------------------------------
describe('Network failure is silent', () => {
  it('recordActivation resolves without throwing when fetch rejects', async () => {
    const { telemetry } = build({
      endpoint: 'https://telemetry.example.com',
      fetchRejects: true,
    })
    await expect(telemetry.recordActivation()).resolves.toBeUndefined()
  })

  it('recordInit resolves without throwing when fetch rejects', async () => {
    const { telemetry } = build({
      endpoint: 'https://telemetry.example.com',
      fetchRejects: true,
    })
    await expect(telemetry.recordInit()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Local I/O failure is swallowed
// ---------------------------------------------------------------------------
describe('Local I/O failure is silent', () => {
  it('resolves without throwing when writeFile rejects (e.g. ExternalRevertError)', async () => {
    const { ExternalRevertError } = await import('../../src/adapters/atomic-write.js')
    const writeFile = vi.fn<[string, string], Promise<void>>().mockRejectedValue(
      new ExternalRevertError('/fake/project/.cortex/usage.json'),
    )
    const t = createTelemetry({
      enabled: true,
      endpoint: undefined,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      writeFile,
      mkdirSync: mockMkdirSync(),
      readFileSync: mockReadFileSync(undefined),
    })
    await expect(t.recordInit()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// No PII in the POST body
// ---------------------------------------------------------------------------
describe('No PII in POST body', () => {
  it('POST body does not contain cortexRoot path or process.cwd()', async () => {
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()
    const cwd = process.cwd()

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      fetchImpl,
      readFileSync: mockReadFileSync(undefined),
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordInit()

    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    const bodyStr = JSON.stringify(body)

    // Must not contain absolute paths
    expect(bodyStr).not.toContain(CORTEX_ROOT)
    expect(bodyStr).not.toContain(cwd)

    // Must only contain allowed keys
    const allowedKeys = new Set(['event', 'ts', 'cortexVersion'])
    const unexpectedKeys = Object.keys(body).filter((k) => !allowedKeys.has(k))
    expect(unexpectedKeys).toHaveLength(0)
  })

  it('POST body for recordActivation does not contain absolute paths', async () => {
    const endpoint = 'https://telemetry.example.com/events'
    const fetchImpl = mockFetch()

    const t = createTelemetry({
      enabled: true,
      endpoint,
      cortexRoot: CORTEX_ROOT,
      version: '0.1.0',
      fetchImpl,
      readFileSync: mockReadFileSync(undefined),
      writeFile: mockWriter(),
      mkdirSync: mockMkdirSync(),
    })

    await t.recordActivation()

    for (const call of fetchImpl.mock.calls) {
      const body = JSON.parse(call[1]?.body as string)
      const bodyStr = JSON.stringify(body)
      expect(bodyStr).not.toContain(CORTEX_ROOT)
      expect(bodyStr).not.toContain(process.cwd())
    }
  })
})

// ---------------------------------------------------------------------------
// Usage.json schema — STATE, not log
// ---------------------------------------------------------------------------
describe('usage.json is a state document, not a log', () => {
  it('repeated recordInit calls produce one write per call but no events array', async () => {
    const { telemetry, writeFile } = build()

    await telemetry.recordInit()
    await telemetry.recordInit()

    expect(writeFile).toHaveBeenCalledTimes(2)
    for (const call of writeFile.mock.calls) {
      const state = JSON.parse(call[1]) as Record<string, unknown>
      expect(Array.isArray(state['events'])).toBe(false)
      expect('events' in state).toBe(false)
    }
  })
})
