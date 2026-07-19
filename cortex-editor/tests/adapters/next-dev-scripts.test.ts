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

  it('renders null and warns once when discovery files are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('<CortexDevScripts/> is inactive')
  })

  it('renders null on a malformed port file', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeDiscovery({ port: 'not-a-port' })
    expect(CortexDevScripts({ projectRoot: root })).toBeNull()
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
