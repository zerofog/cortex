import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// Resolve BROWSER_SRC relative to this test file so it works regardless of cwd.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BROWSER_SRC = resolve(__dirname, '../../src/browser')

function walkFiles(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walkFiles(full, ext, out)
    else if (ext.test(name)) out.push(full)
  }
  return out
}

describe('--cx-* token namespace migration (ZF0-1179)', () => {
  const BARE_TOKEN_PATTERNS = [
    /var\(--ink\b/,
    /var\(--ink-[a-z]+\)/,
    /var\(--paper\b/,
    /var\(--vellum\b/,
    /var\(--well\b/,
    /var\(--well-[a-z]+\)/,
    /var\(--rule\b/,
    /var\(--rule-[a-z]+\)/,
    /var\(--select\b/,
    /var\(--select-[a-z]+\)/,
    /var\(--on-select\b/,
    /var\(--success\b/,
    /var\(--destructive\b/,
    /var\(--destructive-[a-z]+\)/,
    /var\(--warning\b/,
    /var\(--warning-[a-z]+\)/,
    /var\(--scrollbar\b/,
    /var\(--tooltip-bg\b/,
    /var\(--sp-\d+\)/,
    /var\(--radius-[a-z-]+\)/,
    /var\(--text-[a-z]+\)/,
    /var\(--weight-[a-z]+\)/,
    /var\(--mono\b/,
  ]

  it('styles.css has zero bare var(--*) token references', () => {
    const css = readFileSync(join(BROWSER_SRC, 'styles.css'), 'utf8')
    const hits: string[] = []
    const lines = css.split('\n')
    lines.forEach((line, i) => {
      for (const pat of BARE_TOKEN_PATTERNS) {
        if (pat.test(line)) {
          hits.push(`L${i + 1}: ${line.trim()}`)
          break
        }
      }
    })
    expect(hits, `bare token references found:\n${hits.join('\n')}`).toEqual([])
  })

  it('all .tsx inline style strings use --cx-* tokens only', () => {
    const files = walkFiles(BROWSER_SRC, /\.tsx?$/)
    const hits: Array<{ file: string; line: number; match: string }> = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        for (const pat of BARE_TOKEN_PATTERNS) {
          if (pat.test(line)) {
            hits.push({ file, line: i + 1, match: line.trim() })
            break
          }
        }
      })
    }
    expect(hits, `bare tokens in .tsx inline styles:\n${JSON.stringify(hits, null, 2)}`).toEqual([])
  })

  it(':host rule starts with all: initial and re-asserts required properties', () => {
    const css = readFileSync(join(BROWSER_SRC, 'styles.css'), 'utf8')
    const hostMatch = css.match(/:host\s*\{([^}]*)\}/s)
    expect(hostMatch).toBeTruthy()
    const hostBody = hostMatch![1]
    // `all: initial` must be declared in :host (order matters for cascade correctness)
    expect(hostBody).toMatch(/all:\s*initial/)
    // box-sizing must be re-asserted after all: initial
    expect(hostBody).toMatch(/box-sizing:\s*border-box/)
    // font-family must be re-asserted (all: initial resets it)
    expect(hostBody).toMatch(/font-family:/)
    // display: block must be explicit — without it, :host falls back to inline
    // after all: initial and relies on implicit blockification of position:fixed
    expect(hostBody).toMatch(/display:\s*block/)
    // color seed for descendants that don't set color explicitly — without
    // this, `all: initial` causes descendants to inherit CanvasText (black),
    // visually broken in blueprint dark mode where --cx-ink is #e2e8f0
    expect(hostBody).toMatch(/color:\s*var\(--cx-ink\)/)
    // font-size seed so descendants without an explicit font-size don't
    // fall back to UA initial `medium` (~16px); the panel uses 10–13px
    expect(hostBody).toMatch(/font-size:\s*var\(--cx-text-lg\)/)
    // line-height seed so text layout doesn't inherit UA initial `normal`
    expect(hostBody).toMatch(/line-height:\s*1\.4/)
  })

  it('new required tokens are defined', () => {
    const css = readFileSync(join(BROWSER_SRC, 'styles.css'), 'utf8')
    expect(css).toContain('--cx-text-xs: 9px')
    expect(css).toContain('--cx-text-xl: 14px')
    expect(css).toContain('--cx-weight-heading: 600')
    expect(css).toContain('--cx-sp-8: 32px')
  })

  it('blueprint dark-mode block uses --cx-* namespace', () => {
    const css = readFileSync(join(BROWSER_SRC, 'styles.css'), 'utf8')
    const blueprintMatch = css.match(/:host\(\[data-theme="blueprint"\]\)\s*\{([^}]*)\}/s)
    expect(blueprintMatch).toBeTruthy()
    const body = blueprintMatch![1]
    // Must define tokens with --cx- prefix
    expect(body).toMatch(/--cx-ink:/)
    expect(body).toMatch(/--cx-paper:/)
  })
})
