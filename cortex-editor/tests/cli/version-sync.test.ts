import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { version } from '../../src/version.js'

// Regression guard (ZF0-1050 / Codex review): src/version.ts is a hand-maintained
// duplicate of package.json "version". It feeds `cortex --version`, the MCP server
// metadata, and the telemetry `cortexVersion` payload — so if a release bumps
// package.json but not this constant, the published package reports a stale
// version everywhere at runtime. This test fails CI on any such drift.
describe('version constant stays in sync with package.json', () => {
  it('src/version.ts === package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { version: string }
    expect(version).toBe(pkg.version)
  })
})
