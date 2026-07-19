import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CortexDevScripts, _resetDevScriptsWarningForTesting } from '../../src/adapters/next-dev-scripts.js'

let root: string

function writeDiscovery(overrides: { port?: string; token?: string; injection?: string } = {}): void {
  const cortexDir = path.join(root, '.cortex')
  fs.mkdirSync(cortexDir, { recursive: true })
  fs.writeFileSync(path.join(cortexDir, 'port'), overrides.port ?? '4321')
  fs.writeFileSync(path.join(cortexDir, 'token'), overrides.token ?? 'test-token-value')
  fs.writeFileSync(
    path.join(cortexDir, 'injection.json'),
    overrides.injection ?? JSON.stringify({ sessionId: 'session-abc', toggleShortcut: '$mod+Shift+Period' })
  )
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

  it('renders null on a malformed port file', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ port: 'not-a-port' })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
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
})
