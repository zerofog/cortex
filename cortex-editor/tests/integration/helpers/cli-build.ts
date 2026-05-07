import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../..')
const CLI_DIST = resolve(REPO_ROOT, 'dist/cli/index.js')
const SRC_DIRS = ['src/cli', 'src/core', 'src/schemas'].map(d => resolve(REPO_ROOT, d))

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
