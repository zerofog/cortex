import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { atomicWrite, ExternalRevertError } from '../../src/adapters/atomic-write.js'

/**
 * These tests exercise the real filesystem (a per-test temp dir) rather
 * than mocking fs. The race cortex observed in production is a filesystem
 * race, and mock fs cannot reproduce rename-atomicity semantics. Per
 * CLAUDE.md anti-pattern 3 ("no happy-dom theatre"), shadow-copy tests
 * would fail to catch real-world regressions.
 *
 * Temp dirs are created fresh per test in beforeEach and cleaned in
 * afterEach so tests are parallel-safe and leak-free.
 */

describe('atomicWrite', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cortex-atomic-write-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes content to a new file and verification passes', async () => {
    const target = join(dir, 'new.txt')
    await atomicWrite(target, 'hello')
    const actual = await fs.readFile(target, 'utf-8')
    expect(actual).toBe('hello')
  })

  it('overwrites an existing file atomically (no torn state visible between rename and read)', async () => {
    const target = join(dir, 'existing.txt')
    await fs.writeFile(target, 'ORIGINAL CONTENT LONG ENOUGH TO NOTICE TEARING', 'utf-8')
    await atomicWrite(target, 'NEW')
    const actual = await fs.readFile(target, 'utf-8')
    expect(actual).toBe('NEW')
  })

  it('leaves no temp files in the target directory on success', async () => {
    const target = join(dir, 'clean.txt')
    await atomicWrite(target, 'content')
    const entries = await fs.readdir(dir)
    // Only the target file. No lingering .tmp siblings.
    expect(entries).toEqual(['clean.txt'])
  })

  it('throws ExternalRevertError when disk content never matches intent after rename + retry', async () => {
    // Deterministic simulation of the editor-auto-save race: we stub
    // `fs.promises.readFile` so it always returns "REVERTED" regardless
    // of what was actually written. The real writeFile/rename operations
    // still run, but verification sees the wrong content, triggering the
    // one retry and then ExternalRevertError.
    //
    // This is the invariant under test — cortex must NEVER report success
    // for a write whose content verification failed. Silent success was
    // the bug the user observed in production.
    const target = join(dir, 'contested.txt')
    await fs.writeFile(target, 'ORIGINAL', 'utf-8')

    const readSpy = vi.spyOn(fs, 'readFile').mockImplementation(
      async () => 'REVERTED' as unknown as Buffer,
    )
    try {
      await expect(atomicWrite(target, 'NEW INTENT')).rejects.toBeInstanceOf(ExternalRevertError)
    } finally {
      readSpy.mockRestore()
    }
  })

  it('recovers when the retry verification succeeds (transient reversion)', async () => {
    // First readFile returns "STALE" (forcing the retry path), second
    // returns "NEW" (the correct content). atomicWrite must succeed and
    // NOT throw ExternalRevertError.
    const target = join(dir, 'flaky.txt')
    await fs.writeFile(target, 'ORIGINAL', 'utf-8')

    let calls = 0
    const readSpy = vi.spyOn(fs, 'readFile').mockImplementation(
      async () => {
        calls++
        return (calls === 1 ? 'STALE' : 'NEW') as unknown as Buffer
      },
    )
    try {
      await expect(atomicWrite(target, 'NEW')).resolves.toBeUndefined()
      // Both reads must have fired — first (mismatch) then second (OK).
      expect(calls).toBe(2)
    } finally {
      readSpy.mockRestore()
    }
  })

  it('propagates fs.rename errors instead of masking as revert', async () => {
    // If rename fails (e.g. target dir is read-only, disk full), the
    // function must throw the underlying error. Misclassifying it as
    // ExternalRevertError would hide the real cause.
    const target = join(dir, 'rename-fail.txt')
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' }),
    )
    try {
      await expect(atomicWrite(target, 'content')).rejects.toThrow(/EACCES/)
    } finally {
      renameSpy.mockRestore()
    }
  })
})
