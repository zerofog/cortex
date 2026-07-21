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

  it('applies options.mode to the final file, including when OVERWRITING a looser-mode file', async () => {
    // Discovery files (token, injection.json) carry secrets and are written
    // 0600 via the temp file's creation mode — rename preserves the temp
    // inode's metadata, so this must hold on both the create path and the
    // overwrite path (where the PREVIOUS file's mode must not survive).
    const target = join(dir, 'secret.txt')
    await atomicWrite(target, 'fresh', { mode: 0o600 })
    expect(((await fs.stat(target)).mode & 0o777)).toBe(0o600)

    const loose = join(dir, 'was-world-readable.txt')
    await fs.writeFile(loose, 'old', { mode: 0o644 })
    await atomicWrite(loose, 'now-secret', { mode: 0o600 })
    expect(((await fs.stat(loose)).mode & 0o777)).toBe(0o600)
    expect(await fs.readFile(loose, 'utf-8')).toBe('now-secret')
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

describe('ExternalRevertError (H5 path redaction)', () => {
  it('does NOT include the file path in .message (browser-safe)', () => {
    // H5: the edit-pipeline propagates err.message verbatim to the
    // browser over the WebSocket. Shipping absolute filesystem paths
    // leaks user-specific information — a concern in --host mode
    // where team members share a dev server, and a general hygiene
    // win for cross-tab sessions. Verify the message text does NOT
    // contain the path. The test is falsifiable: a regression that
    // re-introduces `${filePath}` into the message will fail this
    // specific string check.
    const path = '/Users/dev/secret-project/src/components/Hero.tsx'
    const err = new ExternalRevertError(path)
    expect(err.message).not.toContain(path)
    expect(err.message).not.toContain('secret-project')
    expect(err.message).not.toContain('/Users/')
    // Message is still informative — must describe WHAT happened
    // without disclosing WHERE.
    expect(err.message).toMatch(/reverted/i)
  })

  it('preserves filePath as a readonly field for server-side classification', () => {
    // filePath is inside the trust boundary (server-side logging,
    // undo-stack classification, error categorization). It must
    // remain accessible to handlers that need to know which file
    // the revert targeted — just NOT surfaced over the wire.
    const path = '/Users/alice/project/src/Button.tsx'
    const err = new ExternalRevertError(path)
    expect(err.filePath).toBe(path)
  })

  it('keeps instanceof and .name for classifyWriteError routing', () => {
    // The edit-pipeline's classifyWriteError uses `err instanceof
    // ExternalRevertError` to emit the 'external_revert' reason_code.
    // A constructor refactor that breaks the prototype chain would
    // silently fall through to 'write_failed' and the browser would
    // show a confusing error instead of the editor-conflict hint.
    const err = new ExternalRevertError('/x/y/z')
    expect(err).toBeInstanceOf(ExternalRevertError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ExternalRevertError')
  })
})
