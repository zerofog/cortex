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
    // lockNonce matches the default lock's nonce below, so the default fixture
    // exercises the owner-binding MATCH path on every injecting test.
    overrides.injection ?? JSON.stringify({ sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period', lockNonce: 'test-nonce' })
  )
  // The component only injects when a LIVE bridge owns the discovery files —
  // the bridge's `.cortex/.lock` is that ownership record. Default fixture:
  // a live lock owned by the test process itself. `lock: false` omits it.
  if (overrides.lock !== false) {
    fs.writeFileSync(
      path.join(cortexDir, '.lock'),
      overrides.lock ?? JSON.stringify({ pid: process.pid, nonce: 'test-nonce', startedAt: Date.now() }),
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
  const props = element!.props as { dangerouslySetInnerHTML: { __html: string } }
  return props.dangerouslySetInnerHTML.__html
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

  it('renders null and warns once when discovery files are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('<CortexDevScripts/> is inactive')
  })

  it('warns once per distinct reason so a later diagnostic is not masked (3C)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Reason 1: discovery files missing entirely (transient first-render state).
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)

    // Reason 2: files now present but malformed — a genuinely different cause. A
    // single-boolean latch would suppress this, hiding the real diagnostic.
    writeDiscovery({ port: 'not-a-port' })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]![0]).toContain('malformed')
  })

  it.each([['not-a-port'], ['0'], ['99999']])(
    'renders null on a malformed port file (%s)',
    (badPort) => {
      // Same validation branch, boundary variants: non-numeric, non-positive,
      // and above the TCP range (cubic P3 — an over-range corrupt value must
      // not render a bootstrap pointing at an endpoint that cannot exist).
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      writeDiscovery({ port: badPort })
      expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    },
  )

  it('gives invalid injection.json its OWN reason so a prior "could not read" does not mask it (silent-failure review)', () => {
    // The common startup state (bridge not up → files missing) latches the
    // "could not read" reason first. A later malformed-JSON write was READ fine
    // but failed to PARSE; if it shared the "could not read" bucket it would be
    // silently suppressed. It must warn with a distinct parse reason.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(CortexDevScripts({ projectRoot: root })).toBeNull() // reason 1: could not read
    expect(warn).toHaveBeenCalledTimes(1)

    writeDiscovery({ injection: '{ not valid json' })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull() // reason 2: parse error — must NOT be masked
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[1]![0]).toContain('not valid JSON')
  })

  it('appends the withCortex setup hint ONLY for the could-not-read reason (silent-failure review)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // could-not-read → bridge might be misconfigured → hint is appropriate.
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn.mock.calls[0]![0]).toContain('withCortex()')

    // malformed (bridge IS running, just wrote a bad file) → hint would misdirect.
    writeDiscovery({ port: 'not-a-port' })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn.mock.calls[1]![0]).not.toContain('withCortex()')
  })

  it('warns once for port-disagreement across DIFFERENT port pairs (stable dedup key, review [1]/[6])', () => {
    // The message embeds variable ports; if the warn dedup keyed on the message,
    // repeated restarts onto different ports would grow warnedReasons unbounded.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ port: '4321', injection: JSON.stringify({ port: 4322, sessionId: 's', toggleShortcut: '$mod+Shift+Period' }) })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    writeDiscovery({ port: '5555', injection: JSON.stringify({ port: 6666, sessionId: 's', toggleShortcut: '$mod+Shift+Period' }) })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    // Two distinct port pairs, but one stable dedup key → warned exactly once.
    expect(warn).toHaveBeenCalledOnce()
  })

  it('renders null on a torn discovery read: port file and injection.json disagree on port (3C)', () => {
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
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('renders null on a same-port torn read: injection.json changes between the two reads (3J)', () => {
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

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('changed mid-read')
  })

  it('renders normally when the port file and injection.json ports agree (3C)', () => {
    writeDiscovery({
      port: '4321',
      injection: JSON.stringify({ port: 4321, sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period' }),
    })
    const element = CortexDevScripts({ projectRoot: root })
    expect(element).not.toBeNull()
    expect(scriptBody(element)).toContain('window.__cortex_ws_port__=4321')
  })

  it('renders null when injection.json lacks a session id', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ injection: JSON.stringify({ toggleShortcut: '$mod+Shift+Period' }) })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
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

    expect(CortexDevScripts({ projectRoot: root })).not.toBeNull()

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

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('no live bridge')
  })

  it('refuses to inject when the lock is MISSING — exit-handler released it but files remain', () => {
    // An uncaught-exception exit runs the lock's process-exit release (unlink)
    // but never CortexSession.dispose(), so discovery files survive without an
    // owner. Presence of the files alone must not be trusted.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ lock: false })

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn.mock.calls[0]![0]).toContain('lock missing')
  })

  it('refuses to inject on a CORRUPT lock file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ lock: '{ not json' })

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn.mock.calls[0]![0]).toContain('lock corrupt')
  })

  it('refuses to inject when injection.json was written by a DIFFERENT owner than the live lock (cubic P2)', () => {
    // Handoff window: a successor acquires the lock BEFORE publishing its
    // files, so the on-disk values are the predecessor's while the lock is
    // live. The stamped lockNonce exposes the generation mismatch — the
    // freshness re-read alone cannot (the stale file is not changing).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({
      injection: JSON.stringify({ port: 4321, sessionId: 'old-session', toggleShortcut: '$mod+Shift+Period', lockNonce: 'previous-owner' }),
      lock: JSON.stringify({ pid: process.pid, nonce: 'new-owner', startedAt: Date.now() }),
    })

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(warn.mock.calls[0]![0]).toContain('different bridge generation')
  })
})
