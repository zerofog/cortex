/**
 * Source-level invariant (3F): the Next entry module must NOT statically pull in
 * the bridge module graph.
 *
 * `import { CortexDevScripts } from 'cortex-editor/next'` (in a user's root
 * layout) loads src/adapters/next.ts in EVERY RSC worker that renders the
 * layout. If next.ts statically imports './webpack.js', that evaluates ws, zod,
 * CortexSession, and the edit pipeline in each of those workers — pure dead
 * weight for a component that only emits a <script>. The bridge must be loaded
 * lazily, only under the dev-server gate when it is actually constructed.
 *
 * This is a source-level check (rename-resistant, no build cost); deep
 * bundle-level assertions are intentionally out of scope here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const NEXT_SOURCE = resolve(here, '../../src/adapters/next.ts')

describe('next.ts RSC import weight (3F)', () => {
  const source = readFileSync(NEXT_SOURCE, 'utf8')
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[\s]*\/\/.*$/gm, '')
  const code = stripComments(source)

  it('does NOT statically import or re-export from ./webpack.js', () => {
    // A static `import ... from './webpack.js'` or `export ... from './webpack.js'`
    // evaluates the heavy bridge graph on module load — in every RSC worker.
    expect(code).not.toMatch(/import\s[^\n]*from\s+['"]\.\/webpack\.js['"]/)
    expect(code).not.toMatch(/export\s[^\n]*from\s+['"]\.\/webpack\.js['"]/)
  })

  it('loads the bridge lazily via a dynamic import of ./webpack.js', () => {
    expect(code).toMatch(/import\(\s*['"]\.\/webpack\.js['"]\s*\)/)
  })
})
