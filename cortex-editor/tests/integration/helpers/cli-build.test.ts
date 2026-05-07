import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, statSync, rmSync, utimesSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCliBuilt, _resetBuildCacheForTesting } from './cli-build.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '../../..')
const CLI_DIST = resolve(REPO_ROOT, 'dist/cli/index.js')

describe('ensureCliBuilt', () => {
  beforeEach(() => {
    _resetBuildCacheForTesting()
  })

  it('produces dist/cli/index.js on first call', async () => {
    if (existsSync(CLI_DIST)) rmSync(CLI_DIST)
    await ensureCliBuilt()
    expect(existsSync(CLI_DIST)).toBe(true)
    const stat = statSync(CLI_DIST)
    expect(stat.size).toBeGreaterThan(0)
  }, 180_000)

  it('is idempotent — second call within same fork does not rebuild', async () => {
    await ensureCliBuilt()
    const firstMtime = statSync(CLI_DIST).mtimeMs
    await new Promise(r => setTimeout(r, 50))
    await ensureCliBuilt()
    const secondMtime = statSync(CLI_DIST).mtimeMs
    expect(secondMtime).toBe(firstMtime)
  }, 180_000)

  it('rebuilds when dist is older than a source file', async () => {
    await ensureCliBuilt()
    _resetBuildCacheForTesting()
    const srcFile = resolve(REPO_ROOT, 'src/cli/mcp.ts')
    const original = statSync(srcFile)
    try {
      const future = new Date(Date.now() + 1000)
      utimesSync(srcFile, future, future)
      const beforeMtime = statSync(CLI_DIST).mtimeMs
      await ensureCliBuilt()
      const afterMtime = statSync(CLI_DIST).mtimeMs
      expect(afterMtime).toBeGreaterThan(beforeMtime)
    } finally {
      utimesSync(srcFile, original.atime, original.mtime)
    }
  }, 180_000)
})
