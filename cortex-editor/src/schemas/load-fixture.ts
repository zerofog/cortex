import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// loadWireFormatFixture — loads a JSON fixture from
// cortex-editor/tests/fixtures/wire-format/<name>
//
// `name` is a relative path such as 'browser-to-server/staged-edit-add.json'
// or 'invalid/edit-missing-property.json'.
//
// Runs only in Node (tests + CLI). Not imported by the browser bundle.
// ---------------------------------------------------------------------------

const FIXTURES_ROOT = join(
  fileURLToPath(import.meta.url),
  '../../../tests/fixtures/wire-format',
)

/**
 * Load a golden wire-format fixture by relative path.
 *
 * @param name  Relative path from `tests/fixtures/wire-format/` (e.g. `'browser-to-server/init.json'`)
 * @returns The parsed JSON object
 * @throws If the file does not exist or is not valid JSON
 */
export function loadWireFormatFixture(name: string): unknown {
  const filePath = join(FIXTURES_ROOT, name)
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as unknown
}
