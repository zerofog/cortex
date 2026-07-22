// Post-build d.ts leak check (referenced by src/adapters/next.ts).
//
// The internal `NextTurbopack` alias derives from
// `import('next').NextConfig['turbopack']` — an indexed access that is INVALID
// against next <15.3 type defs (turbopack lived under `experimental.turbo`).
// That's harmless only while the alias stays out of the emitted public d.ts:
// if it ever leaks (someone exports a type that references it), every consumer
// on an older next gets a broken d.ts. This guard fails the publish before
// that ships. Runs from prepublishOnly, after the clean build.
import { readFileSync } from 'node:fs'

const FILES = ['dist/next/next.d.ts', 'dist/next/next.d.cts']
const LEAK_PATTERNS = ['NextTurbopack', "['turbopack']"]

let failed = false
for (const file of FILES) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`[cortex] check-dts: ${file} missing — run the build first`)
    failed = true
    continue
  }
  for (const pattern of LEAK_PATTERNS) {
    if (text.includes(pattern)) {
      console.error(
        `[cortex] check-dts: ${file} leaks the internal turbopack derivation (found ${JSON.stringify(pattern)}). ` +
        'Keep NextTurbopack internal, or switch to a conditional-infer derivation (see src/adapters/next.ts).',
      )
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log('[cortex] check-dts OK: no NextTurbopack leak in public d.ts')
