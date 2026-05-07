import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const COMPONENTS_DIR = join(process.cwd(), 'src/browser/components')

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('panel icon source compliance', () => {
  it('keeps panel and toolbar icons in the shared Lucide inventory', () => {
    const offenders = collectSourceFiles(COMPONENTS_DIR)
      .filter((file) => !file.endsWith('/icons.tsx'))
      .filter((file) => readFileSync(file, 'utf8').includes('<svg'))
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})
