import { describe, it, expect } from 'vitest'
import { sanitizeErrorForClient } from '../../src/core/edit-pipeline.js'

/**
 * H-R2-2 (Round 2) + M-R2-3 (Round 2) regression guard.
 *
 * H-R2-2: sanitizeErrorForClient only truncated at 200 chars, so short
 * fs errors (ENOENT ~65 chars) passed through with the absolute path
 * INTACT. In --host mode the browser would see the user's filesystem.
 *
 * M-R2-3: sanitizeErrorForClient had no direct tests. The helper was
 * indirectly exercised via pipeline-level tests that checked truncation
 * behavior but not path-stripping.
 *
 * The function's security contract:
 *   1. Non-Error input returns 'Unknown error' (no type introspection leak)
 *   2. POSIX and Windows absolute paths are replaced with '<path>'
 *   3. After path-stripping, any remaining text exceeding 200 chars is
 *      truncated with '…'
 *   4. Relative paths are preserved (they have no deployment-specific data)
 */

describe('sanitizeErrorForClient', () => {
  it('returns "Unknown error" for non-Error input (null)', () => {
    expect(sanitizeErrorForClient(null)).toBe('Unknown error')
  })

  it('returns "Unknown error" for non-Error input (string)', () => {
    expect(sanitizeErrorForClient('just a string')).toBe('Unknown error')
  })

  it('returns "Unknown error" for non-Error input (number)', () => {
    expect(sanitizeErrorForClient(42)).toBe('Unknown error')
  })

  it('returns "Unknown error" for non-Error input (plain object)', () => {
    expect(sanitizeErrorForClient({ message: 'pretend-error' })).toBe('Unknown error')
  })

  it('returns "Unknown error" for non-Error input (undefined)', () => {
    expect(sanitizeErrorForClient(undefined)).toBe('Unknown error')
  })

  it('passes short non-path errors through unchanged', () => {
    const err = new Error('Write was reverted by an external process')
    expect(sanitizeErrorForClient(err)).toBe('Write was reverted by an external process')
  })

  it('strips POSIX absolute path from short fs error (H-R2-2 primary case)', () => {
    // ~65 chars — well under the 200-char truncation ceiling. Pre-fix,
    // this passed through INTACT including the absolute path, leaking
    // filesystem structure to the browser in --host mode.
    const err = new Error("ENOENT: no such file or directory, open '/Users/alice/project/src/Hero.tsx'")
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('/Users/alice')
    expect(result).not.toContain('Hero.tsx')
    expect(result).toContain('<path>')
    expect(result).toContain('ENOENT')
  })

  it('strips POSIX path in /home/ directory', () => {
    const err = new Error("EACCES: permission denied, open '/home/developer/sensitive/config.json'")
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('/home/developer')
    expect(result).toContain('<path>')
    expect(result).toContain('EACCES')
  })

  it('strips POSIX path in /var/ directory', () => {
    const err = new Error("read failed at /var/log/app/error.log position 0")
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('/var/log')
    expect(result).toContain('<path>')
  })

  it('strips Windows absolute path with drive letter', () => {
    const err = new Error("ENOENT: no such file or directory, open 'C:\\Users\\alice\\project\\Hero.tsx'")
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('C:\\Users')
    expect(result).not.toContain('Hero.tsx')
    expect(result).toContain('<path>')
    expect(result).toContain('ENOENT')
  })

  it('strips Windows path with forward-slash mixed (Node.js normalized form)', () => {
    const err = new Error("open failed at D:/projects/app/src/index.ts")
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('D:/projects')
    expect(result).toContain('<path>')
  })

  it('preserves relative paths (no deployment-specific data)', () => {
    // Relative paths like ./foo, ../bar, src/x.tsx are safe to surface —
    // they describe repo structure, not absolute filesystem layout.
    const err = new Error("Failed to parse src/components/Hero.tsx at line 5")
    const result = sanitizeErrorForClient(err)
    expect(result).toContain('src/components/Hero.tsx')
    expect(result).not.toContain('<path>')
  })

  it('truncates at 200 chars after path-stripping', () => {
    // A long error message that, even AFTER path stripping, still
    // exceeds the 200-char ceiling. The path segment is replaced, then
    // the remaining text is truncated — truncation applies on top of
    // stripping, not instead of it.
    const err = new Error(
      "ts-morph parse error at /Users/alice/project/cortex-editor/src/components/Hero.tsx: " +
      "Expected '<', '/', or '>' but got 'X'. ".repeat(6)
    )
    const result = sanitizeErrorForClient(err)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(201)  // 200 + '…'
    expect(result).toContain('<path>')
    expect(result).not.toContain('/Users/alice')
  })

  it('handles multiple paths in one error message', () => {
    // When an error references both source and destination paths, BOTH
    // must be stripped. Common in rename / copy failures.
    const err = new Error(
      "cross-device link: cannot rename '/Users/alice/src/old.tsx' -> '/tmp/backup/old.tsx'"
    )
    const result = sanitizeErrorForClient(err)
    expect(result).not.toContain('/Users/alice')
    expect(result).not.toContain('/tmp/backup')
    // Two paths stripped → two <path> placeholders.
    const occurrences = (result.match(/<path>/g) ?? []).length
    expect(occurrences).toBe(2)
  })

  it('preserves non-path punctuation around stripped paths', () => {
    // The regex must not swallow quotes, commas, or colons that border
    // paths — those are part of the surrounding error prose.
    const err = new Error("ENOENT: open '/Users/alice/foo.tsx', errno -2")
    const result = sanitizeErrorForClient(err)
    expect(result).toContain("'<path>',")
    expect(result).toContain('ENOENT:')
    expect(result).toContain('errno -2')
  })

  it('leaves single-segment POSIX paths alone (would over-match)', () => {
    // `/tmp` alone is one segment — the `{2,}` quantifier requires
    // at least two, so single-segment literals pass through.
    const err = new Error("wrote temp file to /tmp")
    const result = sanitizeErrorForClient(err)
    expect(result).toBe("wrote temp file to /tmp")
  })
})
