import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CortexDevScripts, _resetDevScriptsWarningForTesting } from '../../src/adapters/next-dev-scripts.js'

/** Spawn a trivial node process, wait for it to exit, and return its now-dead
 *  pid — a deterministic stand-in for a crashed bridge, with no assumption
 *  about the platform's pid range (same pattern as cortex-lock.test.ts). */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await once(child, 'exit')
  if (child.pid === undefined) throw new Error('spawned child had no pid')
  return child.pid
}

let root: string

function writeDiscovery(
  overrides: { port?: string; token?: string; injection?: string; lock?: string | false } = {},
): void {
  const cortexDir = path.join(root, '.cortex')
  fs.mkdirSync(cortexDir, { recursive: true })
  fs.writeFileSync(path.join(cortexDir, 'port'), overrides.port ?? '4321')
  fs.writeFileSync(path.join(cortexDir, 'token'), overrides.token ?? 'test-token-value')
  fs.writeFileSync(
    path.join(cortexDir, 'injection.json'),
    // lockGeneration matches the default lock's generation below, so the
    // default fixture exercises the owner-binding MATCH path on every
    // injecting test.
    overrides.injection ?? JSON.stringify({ sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period', lockGeneration: 'test-gen' })
  )
  // The component only injects when a LIVE bridge owns the discovery files —
  // the bridge's `.cortex/.lock` is that ownership record. Default fixture:
  // a live lock owned by the test process itself. `lock: false` omits it.
  if (overrides.lock !== false) {
    fs.writeFileSync(
      path.join(cortexDir, '.lock'),
      overrides.lock ?? JSON.stringify({ pid: process.pid, nonce: 'test-nonce', generation: 'test-gen', startedAt: Date.now() }),
    )
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-devscripts-'))
  _resetDevScriptsWarningForTesting()
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function scriptBody(element: ReturnType<typeof CortexDevScripts>): string {
  expect(element).not.toBeNull()
  const props = element!.props as {
    dangerouslySetInnerHTML?: { __html: string }
    'data-cortex-inactive'?: string
  }
  // An injecting render must be the bootstrap script, never the inert
  // refusal marker — without this, a refusal would satisfy `not.toBeNull()`.
  expect(props['data-cortex-inactive']).toBeUndefined()
  expect(props.dangerouslySetInnerHTML).toBeDefined()
  return props.dangerouslySetInnerHTML!.__html
}

/** Assert a REFUSAL render: the inert diagnostic marker (0.3.1 — refusals
 *  surface in served HTML because RSC-worker console output can be swallowed).
 *  Optionally pin the reason text so each refusal test stays falsifiable
 *  against the specific gate it exercises. */
function expectInactive(element: ReturnType<typeof CortexDevScripts>, reasonSubstring?: string): void {
  expect(element).not.toBeNull()
  expect(element!.type).toBe('script')
  const props = element!.props as {
    dangerouslySetInnerHTML?: unknown
    'data-cortex-inactive'?: string
    'data-cortex-reason'?: string
  }
  expect(props['data-cortex-inactive']).toBeDefined()
  // Inert by construction: a marker must never carry an executable body.
  expect(props.dangerouslySetInnerHTML).toBeUndefined()
  if (reasonSubstring !== undefined) {
    expect(props['data-cortex-reason']).toContain(reasonSubstring)
  }
}

describe('CortexDevScripts', () => {
  it('renders an inline script with values from the discovery files', () => {
    writeDiscovery()
    const element = CortexDevScripts({ projectRoot: root })

    expect(element!.type).toBe('script')
    const body = scriptBody(element)
    expect(body).toContain('window.__cortex_ws_port__=4321')
    expect(body).toContain('test-token-value')
    expect(body).toContain('session-abc')
    expect(body).toContain('http://localhost:4321/@cortex/browser.js')
  })

  it('does NOT self-remove its own <script> node (would break React hydration)', () => {
    // Self-removal was tried to shrink the token-in-markup exposure window, but
    // <CortexDevScripts/> renders this script through a React server component:
    // removing the SSR'd node during parse makes the hydrated DOM disagree with
    // the server HTML, React regenerates the tree, and the browser bundle never
    // boots. The token-in-markup limitation is documented instead (see
    // injection-snippet.ts). Guards against a well-meaning re-introduction.
    writeDiscovery()
    const body = scriptBody(CortexDevScripts({ projectRoot: root }))
    expect(body).not.toContain('currentScript.remove')
  })

  it('refuses (marker + one warn) when discovery files are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expectInactive(CortexDevScripts({ projectRoot: root }))

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('<CortexDevScripts/> is inactive')
  })

  it('refusal marker carries the reason + projectRoot provenance in the served HTML, on EVERY render (0.3.1 silent-boot fix)', () => {
    // The zerofog-web round-2 retest hit a boot where injection silently never
    // happened and NO console output surfaced (RSC-worker console can be
    // swallowed by the host). The refusal must therefore be discoverable from
    // the page itself: an inert marker whose reason includes WHICH fallback
    // resolved the project root — "cwd" appearing when withCortex ran means
    // the __CORTEX_PROJECT_ROOT env channel didn't reach the worker.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = CortexDevScripts({ projectRoot: root })
    expectInactive(first, 'could not read discovery files')
    expectInactive(first, 'projectRoot prop')  // provenance: explicit prop

    // Marker returns on EVERY render — only the console warn is deduped. A
    // null second render would reintroduce the exact silent-boot the marker
    // exists to prevent.
    const second = CortexDevScripts({ projectRoot: root })
    expectInactive(second, 'could not read discovery files')
    expect(warn).toHaveBeenCalledOnce()

    // Env-resolved root reports its own provenance.
    vi.stubEnv('__CORTEX_PROJECT_ROOT', path.join(root, 'does-not-exist'))
    expectInactive(CortexDevScripts({}), '__CORTEX_PROJECT_ROOT env')
  })

  it('warns once per distinct reason so a later diagnostic is not masked (3C)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Reason 1: discovery files missing entirely (transient first-render state).
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn).toHaveBeenCalledTimes(1)

    // Reason 2: files now present but malformed — a genuinely different cause. A
    // single-boolean latch would suppress this, hiding the real diagnostic.
    writeDiscovery({ port: 'not-a-port' })
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]![0]).toContain('malformed')
  })

  it.each([['not-a-port'], ['0'], ['99999']])(
    'refuses on a malformed port file (%s)',
    (badPort) => {
      // Same validation branch, boundary variants: non-numeric, non-positive,
      // and above the TCP range (cubic P3 — an over-range corrupt value must
      // not render a bootstrap pointing at an endpoint that cannot exist).
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      writeDiscovery({ port: badPort })
      expectInactive(CortexDevScripts({ projectRoot: root }))
    },
  )

  it('gives invalid injection.json its OWN reason so a prior "could not read" does not mask it (silent-failure review)', () => {
    // The common startup state (bridge not up → files missing) latches the
    // "could not read" reason first. A later malformed-JSON write was READ fine
    // but failed to PARSE; if it shared the "could not read" bucket it would be
    // silently suppressed. It must warn with a distinct parse reason.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expectInactive(CortexDevScripts({ projectRoot: root })) // reason 1: could not read
    expect(warn).toHaveBeenCalledTimes(1)

    writeDiscovery({ injection: '{ not valid json' })
    expectInactive(CortexDevScripts({ projectRoot: root })) // reason 2: parse error — must NOT be masked
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]![0]).toContain('not valid JSON')
  })

  it('appends the withCortex setup hint ONLY for the could-not-read reason (silent-failure review)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // could-not-read → bridge might be misconfigured → hint is appropriate.
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn.mock.calls[0]![0]).toContain('withCortex()')

    // malformed (bridge IS running, just wrote a bad file) → hint would misdirect.
    writeDiscovery({ port: 'not-a-port' })
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn.mock.calls[1]![0]).not.toContain('withCortex()')
  })

  it('warns once for port-disagreement across DIFFERENT port pairs (stable dedup key, review [1]/[6])', () => {
    // The message embeds variable ports; if the warn dedup keyed on the message,
    // repeated restarts onto different ports would grow warnedReasons unbounded.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ port: '4321', injection: JSON.stringify({ port: 4322, sessionId: 's', toggleShortcut: '$mod+Shift+Period' }) })
    expectInactive(CortexDevScripts({ projectRoot: root }))
    writeDiscovery({ port: '5555', injection: JSON.stringify({ port: 6666, sessionId: 's', toggleShortcut: '$mod+Shift+Period' }) })
    expectInactive(CortexDevScripts({ projectRoot: root }))
    // Two distinct port pairs, but one stable dedup key → warned exactly once.
    expect(warn).toHaveBeenCalledOnce()
  })

  it('refuses on a torn discovery read: port file and injection.json disagree on port (3C)', () => {
    // A bridge restart mid-render can pair an old token with a new port/session
    // (three separate reads). injection.json carries the port the token/session
    // belong to; when it disagrees with the standalone port file the set is
    // torn, so every WS message would fail the token check. Degrade to null so
    // the next render gets a consistent generation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({
      port: '4321',
      injection: JSON.stringify({ port: 4322, sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period' }),
    })
    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn).toHaveBeenCalledOnce()
  })

  it('refuses on a same-port torn read: injection.json changes between the two reads (3J)', () => {
    // A bridge restart onto the SAME port rewrites token + injection.json (new
    // sessionId) while a render straddles the write. The port cross-check can't
    // see it (port is unchanged), but re-reading injection.json before and after
    // the token read does: the two snapshots disagree → bail.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({
      port: '4321',
      injection: JSON.stringify({ port: 4321, sessionId: 'session-A', toggleShortcut: '$mod+Shift+Period' }),
    })
    const genB = JSON.stringify({ port: 4321, sessionId: 'session-B', toggleShortcut: '$mod+Shift+Period' })
    const realRead = fs.readFileSync
    let injectionReads = 0
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: unknown, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith('injection.json')) {
        injectionReads += 1
        if (injectionReads >= 2) return genB
      }
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof fs.readFileSync)

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('changed mid-read')
  })

  it('renders normally when the port file and injection.json ports agree (3C)', () => {
    writeDiscovery({
      port: '4321',
      injection: JSON.stringify({ port: 4321, sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period' }),
    })
    const element = CortexDevScripts({ projectRoot: root })
    expect(scriptBody(element)).toContain('window.__cortex_ws_port__=4321')
  })

  it('refuses when injection.json lacks a session id', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ injection: JSON.stringify({ toggleShortcut: '$mod+Shift+Period' }) })
    expectInactive(CortexDevScripts({ projectRoot: root }))
  })

  it('renders null in production without touching the filesystem', () => {
    vi.stubEnv('NODE_ENV', 'production')
    writeDiscovery()
    const read = vi.spyOn(fs, 'readFileSync')
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('takes its final injection.json freshness snapshot AFTER the lock-liveness check (codex P2 TOCTOU)', () => {
    // Liveness only proves SOME process owns the lock at check time — a bridge
    // swap between reading the values and checking the lock would pair the OLD
    // port/token with the NEW owner's live lock. The final injection.json
    // re-read must therefore be the LAST gate. Pin the ORDER: without it this
    // test's swap simulation could still pass by accident of scheduling.
    writeDiscovery()
    const reads: string[] = []
    const realRead = fs.readFileSync
    const realAccess = fs.accessSync
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: unknown, ...rest: unknown[]) => {
      reads.push(String(p))
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof fs.readFileSync)
    vi.spyOn(fs, 'accessSync').mockImplementation(((p: unknown, ...rest: unknown[]) => {
      reads.push(String(p))
      return (realAccess as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof fs.accessSync)

    scriptBody(CortexDevScripts({ projectRoot: root }))  // asserts injecting, not the refusal marker

    const lastInjectionRead = reads.map((p, i) => (p.endsWith('injection.json') ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
    const lockTouch = reads.findIndex((p) => p.endsWith('.lock'))
    expect(lockTouch).toBeGreaterThan(-1)
    expect(lastInjectionRead).toBeGreaterThan(lockTouch)
  })

  it('refuses to inject when the bridge lock is STALE (holder pid dead) — crashed-server leftovers', async () => {
    // A SIGKILLed dev server leaves port/token/injection.json AND a lock whose
    // pid is dead. Injecting would hand the browser a dead (or since-reassigned)
    // port plus a stale token. The liveness gate must fail closed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ lock: JSON.stringify({ pid: await deadPid(), nonce: 'dead', startedAt: 0 }) })

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('no live bridge')
  })

  it('refuses to inject when the lock is MISSING — exit-handler released it but files remain', () => {
    // An uncaught-exception exit runs the lock's process-exit release (unlink)
    // but never CortexSession.dispose(), so discovery files survive without an
    // owner. Presence of the files alone must not be trusted.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ lock: false })

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn.mock.calls[0]![0]).toContain('lock missing')
  })

  it('refuses to inject on a CORRUPT lock file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ lock: '{ not json' })

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn.mock.calls[0]![0]).toContain('lock corrupt')
  })

  it('refuses to inject when injection.json was written by a DIFFERENT generation than the live lock (cubic P2)', () => {
    // Handoff window: a successor acquires the lock BEFORE publishing its
    // files, so the on-disk values are the predecessor's while the lock is
    // live. The stamped lockGeneration exposes the mismatch — the freshness
    // re-read alone cannot (the stale file is not changing).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({
      injection: JSON.stringify({ port: 4321, sessionId: 'old-session', toggleShortcut: '$mod+Shift+Period', lockGeneration: 'previous-gen' }),
      lock: JSON.stringify({ pid: process.pid, nonce: 'new-owner', generation: 'successor-gen', startedAt: Date.now() }),
    })

    expectInactive(CortexDevScripts({ projectRoot: root }))
    expect(warn.mock.calls[0]![0]).toContain('different bridge generation')
  })

  it('INJECTS for a same-family successor whose generation matches, even when the family nonce is shared (cubic P1)', () => {
    // The critical case the generation split fixes: a same-family successor
    // shares the family NONCE with the crashed predecessor, so a nonce-based
    // check would false-match the predecessor's stale files. Generation is
    // per-acquire and unique, so the successor's own files (matching
    // generation) still inject while the predecessor's would not.
    writeDiscovery({
      injection: JSON.stringify({ port: 4321, sessionId: 's', toggleShortcut: '$mod+Shift+Period', lockGeneration: 'gen-successor' }),
      lock: JSON.stringify({ pid: process.pid, nonce: 'shared-family-nonce', generation: 'gen-successor', startedAt: Date.now() }),
    })

    scriptBody(CortexDevScripts({ projectRoot: root }))  // asserts injecting, not the refusal marker
  })

  it('reads discovery files from __CORTEX_PROJECT_ROOT when no projectRoot prop is given (cubic P2)', () => {
    // The bridge advertises its resolved root via env so RSC workers (which
    // default to cwd) read `.cortex/` from where the bridge WROTE it.
    writeDiscovery()
    vi.stubEnv('__CORTEX_PROJECT_ROOT', root)
    scriptBody(CortexDevScripts({}))  // asserts injecting, not the refusal marker
  })
})
