import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const REPO_ROOT = resolve(__dirname, '../../..')
const CLI_DIST = resolve(REPO_ROOT, 'dist/cli/index.js')

// Source directories whose contents are bundled into dist/cli/index.js.
// Recursive walk: any file mtime newer than CLI_DIST triggers a rebuild.
const SRC_DIRS = ['src/cli', 'src/core', 'src/schemas'].map(d => resolve(REPO_ROOT, d))

// Individual files that affect the build but live outside SRC_DIRS:
//  - src/version.ts  — imported by src/cli/{mcp,index}.ts; bumping the version
//    must invalidate the cache (otherwise Layer 5 tests run against stale dist)
//  - package.json    — `bin` and `main` fields drive what dist actually exposes
//  - tsup.config.ts  — bundler config changes (entries, target, format)
//  - tsconfig.json   — TS compiler options affect emitted JS
const BUILD_INPUT_FILES = [
  'src/version.ts',
  'package.json',
  'tsup.config.ts',
  'tsconfig.json',
].map(f => resolve(REPO_ROOT, f))

let built = false

function newestMtime(dir: string): number {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
    } else if (entry.isFile()) {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

export async function ensureCliBuilt(): Promise<void> {
  if (built) return

  let needsBuild = !existsSync(CLI_DIST)
  if (!needsBuild) {
    const distMtime = statSync(CLI_DIST).mtimeMs
    for (const dir of SRC_DIRS) {
      if (newestMtime(dir) > distMtime) {
        needsBuild = true
        break
      }
    }
  }
  if (!needsBuild) {
    const distMtime = statSync(CLI_DIST).mtimeMs
    for (const file of BUILD_INPUT_FILES) {
      // Files in BUILD_INPUT_FILES are expected to exist; if one is missing,
      // skip it (a missing tsconfig.json or similar indicates a misconfigured
      // worktree, not a stale build) — defer to the build step to fail loudly.
      if (existsSync(file) && statSync(file).mtimeMs > distMtime) {
        needsBuild = true
        break
      }
    }
  }

  if (needsBuild) {
    execFileSync('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CORTEX_TEST_BUILD: 'false' },
    })
    if (!existsSync(CLI_DIST)) {
      throw new Error(`ensureCliBuilt: build completed but ${CLI_DIST} does not exist`)
    }
  }

  built = true
}

export function _resetBuildCacheForTesting(): void {
  built = false
}
