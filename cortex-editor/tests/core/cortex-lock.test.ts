import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { CortexLock, LockHeldError, checkCortexLockLiveness } from '../../src/core/cortex-lock.js'

/** Spawn a trivial node process, wait for it to exit, and return its now-dead
 *  pid — a deterministic stand-in for "a cortex instance that crashed without
 *  releasing its lock." */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await once(child, 'exit')
  if (child.pid === undefined) throw new Error('spawned child had no pid')
  return child.pid
}

describe('CortexLock', () => {
  let tmpDir: string
  let cortexDir: string
  let lockPath: string
  let held: CortexLock | null

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-lock-'))
    cortexDir = path.join(tmpDir, '.cortex')
    lockPath = path.join(cortexDir, '.lock')
    held = null
  })

  afterEach(() => {
    held?.release()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('happy path: acquire creates the lock file (owned by this pid + a nonce), release removes it', () => {
    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    expect(fs.existsSync(lockPath)).toBe(true)
    const contents = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number; nonce: string }
    expect(contents.pid).toBe(process.pid)
    expect(typeof contents.nonce).toBe('string')
    expect(contents.nonce.length).toBeGreaterThan(0)

    held!.release()
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('mints a FRESH generation per acquire even with a fixed ownerNonce (family-shared nonce)', () => {
    // Same-family bridges pass the SAME ownerNonce (adopted family nonce), so
    // the nonce cannot distinguish acquisitions. generation must be unique per
    // acquire so the discovery-ownership check and release() can tell a
    // successor's lock from a crashed predecessor's (cubic P1).
    const first = CortexLock.acquire(cortexDir, 'shared-family-nonce')!
    const firstGen = first.generation
    const firstOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string; generation: string }
    expect(firstOnDisk.nonce).toBe('shared-family-nonce')
    expect(firstOnDisk.generation).toBe(firstGen)
    first.release()

    const second = CortexLock.acquire(cortexDir, 'shared-family-nonce')!
    held = second
    expect(second.generation).not.toBe(firstGen) // fresh generation despite same nonce
    const secondOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string; generation: string }
    expect(secondOnDisk.nonce).toBe('shared-family-nonce')
    expect(secondOnDisk.generation).toBe(second.generation)
  })

  it('release() only unlinks a lock whose GENERATION matches — a stale predecessor cannot remove a successor', () => {
    const predecessor = CortexLock.acquire(cortexDir, 'shared-family-nonce')!
    // Simulate a successor replacing the lock file with a fresh generation but
    // the SAME family nonce (what a same-family reclaim produces).
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, nonce: 'shared-family-nonce', generation: 'successor-gen', startedAt: Date.now() }))
    predecessor.release() // its generation no longer matches on disk
    // The successor's lock file must survive the predecessor's delayed release.
    expect(fs.existsSync(lockPath)).toBe(true)
    expect((JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { generation: string }).generation).toBe('successor-gen')
    fs.unlinkSync(lockPath)
  })

  it('Vite in-process restart handoff: release-then-reacquire succeeds; old release no-ops', () => {
    // Vite's configureServer re-entry: the adapter calls releaseLockForHandoff
    // on the old session BEFORE constructing the new one. The new acquire then
    // sees an empty registry slot + an empty lockPath and succeeds cleanly.
    const oldLock = CortexLock.acquire(cortexDir)!
    const oldNonce = (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce
    oldLock.release() // the synchronous handoff step

    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    const newNonce = (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce
    expect(newNonce).not.toBe(oldNonce)

    // Old session's full async dispose may run later; calling release() again
    // is idempotent + must NOT touch the new owner's file.
    oldLock.release()
    expect(fs.existsSync(lockPath)).toBe(true)
    expect((JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce).toBe(newNonce)
  })

  it('same-process concurrent acquire: refuses without the explicit handoff (webpack MultiCompiler)', () => {
    // webpack MultiCompiler or double plugin-registration spins up two
    // CortexSession instances on the same cortexDir in ONE Node process. Both
    // carry process.pid; only the in-memory active-locks registry can
    // distinguish them. Without a releaseLockForHandoff() call between them,
    // the second acquire must throw rather than reclaim the first's still-live lock.
    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()

    let thrown: unknown
    try {
      CortexLock.acquire(cortexDir)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(LockHeldError)
    expect((thrown as LockHeldError).holderPid).toBe(process.pid)
    // inProcess flag distinguishes this from a cross-process conflict — the
    // error message guides users to dispose/handoff, not to delete the lock file.
    expect((thrown as LockHeldError).inProcess).toBe(true)
    expect((thrown as LockHeldError).message).toMatch(/dispose the prior session|releaseLockForHandoff/i)
    expect((thrown as LockHeldError).message).not.toMatch(/delete the stale lock/i)
    // The first owner's lock file is untouched.
    expect(fs.existsSync(lockPath)).toBe(true)
  })

  it('conflict: refuses with LockHeldError when a LIVE process already holds the lock', () => {
    // process.ppid (the test runner's parent) is a real, alive, OTHER pid —
    // a deterministic stand-in for a second cortex instance.
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.ppid, nonce: 'live-holder-nonce', startedAt: Date.now() }),
    )

    let thrown: unknown
    try {
      held = CortexLock.acquire(cortexDir)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(LockHeldError)
    expect((thrown as LockHeldError).holderPid).toBe(process.ppid)
    expect((thrown as LockHeldError).message).toContain(lockPath)
    // Cross-process conflict: inProcess=false, message guides user to delete
    // the stale lock file (correct manual recovery once the OTHER process exits).
    expect((thrown as LockHeldError).inProcess).toBe(false)
    expect((thrown as LockHeldError).message).toMatch(/delete the stale lock/i)
    // The live holder's lock file must be left untouched.
    expect(fs.existsSync(lockPath)).toBe(true)
  })

  it('stale recovery: reclaims a lock whose holder process is dead', async () => {
    const stalePid = await deadPid()
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: stalePid, nonce: 'dead-holder-nonce', startedAt: Date.now() }),
    )

    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    // The stale lock was reclaimed — the file now belongs to us.
    const contents = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number }
    expect(contents.pid).toBe(process.pid)
  })

  it('stale recovery: reclaims a corrupt lock file (unreadable owner = unowned)', () => {
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(lockPath, 'not json at all {{{')

    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    const contents = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number }
    expect(contents.pid).toBe(process.pid)
  })

  it('release is idempotent — a second call does not throw', () => {
    held = CortexLock.acquire(cortexDir)
    held!.release()
    expect(() => held!.release()).not.toThrow()
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('release only unlinks a lock file whose nonce still matches this instance', () => {
    held = CortexLock.acquire(cortexDir)
    // Simulate a reclaimer having handed the lock to a different instance —
    // same pid is possible (Vite restart), so the nonce is what differs.
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, nonce: 'some-other-instance-nonce', startedAt: Date.now() }),
    )

    held!.release()
    // Our release must NOT delete a lock file now owned by a different instance.
    expect(fs.existsSync(lockPath)).toBe(true)
    expect((JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce).toBe(
      'some-other-instance-nonce',
    )
  })

  it('degrades to null (no throw) when the .cortex/ directory cannot be created', () => {
    // Point cortexDir under a regular FILE — mkdir then fails with ENOTDIR.
    const filePath = path.join(tmpDir, 'a-file')
    fs.writeFileSync(filePath, 'x')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = CortexLock.acquire(path.join(filePath, 'nested', '.cortex'))

    // Lock-HELD always throws; this is the ONE non-throwing degrade (read-only
    // root) — locking is impossible, but so is every other .cortex/ write.
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/without the single-writer lock/i)
  })

  it('degrades to null when .cortex/ exists but is read-only (EACCES on write)', () => {
    // mkdirSync({recursive:true}) is idempotent on an existing dir — succeeds
    // even when the dir isn't writable. Then writeFileSync(tmpPath) fails
    // EACCES. The adapter only catches LockHeldError; without this degrade,
    // dev-server startup would CRASH instead of running lock-less.
    fs.mkdirSync(cortexDir, { recursive: true, mode: 0o500 }) // r-x — no write
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = CortexLock.acquire(cortexDir)
      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/without the single-writer lock/i)
    } finally {
      // Restore writable mode so afterEach's rmSync can clean up.
      fs.chmodSync(cortexDir, 0o700)
    }
  })

  it('treats a lock file with pid <= 0 as corrupt (process.kill semantics)', () => {
    // process.kill(0, sig) targets the current process group; process.kill(-N, sig)
    // targets process group N. A lock claiming such a pid would produce wrong
    // "alive" verdicts. readLockFile must reject these as corrupt so the file
    // gets reclaimed instead of treated as a legitimate holder.
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 0, nonce: 'group-pid-nonce', startedAt: Date.now() }),
    )

    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    // Reclaimed — the file now belongs to us with a positive pid.
    const contents = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number }
    expect(contents.pid).toBe(process.pid)
  })

  it('canonicalizes the registry key via realpath — symlink alias resolves to the same lock', () => {
    // Without canonicalization, path.resolve(symlinkPath) and path.resolve(realPath)
    // are different strings → activeLocks.has() misses the conflict → second
    // acquire reclaims as "our-own-pid stale" → two live sessions. Real symlink
    // proves the canonicalization actually traverses, not just normalizes.
    const realDir = path.join(tmpDir, 'real-cortex')
    fs.mkdirSync(realDir)
    const linkDir = path.join(tmpDir, 'link-cortex')
    fs.symlinkSync(realDir, linkDir)

    held = CortexLock.acquire(realDir)
    expect(held).not.toBeNull()

    // Acquire via the symlink — same underlying inode, must be detected as
    // a same-process conflict.
    let thrown: unknown
    try {
      CortexLock.acquire(linkDir)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(LockHeldError)
    expect((thrown as LockHeldError).inProcess).toBe(true)
  })

  it('falls back to MARKER MODE on non-ENOENT rename errors during stale reclaim', () => {
    // EPERM on renameSync (e.g., Windows when the file is still open by
    // another process) must not throw and crash adapter startup. Since the
    // holder here is stale/corrupt, a plain overwrite IS the reclaim: acquire
    // returns a marker-mode lock (advisory, non-atomic) so the ownership
    // record survives for <CortexDevScripts/>'s liveness gate — degrading to
    // lock-LESS would make the gate permanently refuse a live bridge.
    fs.mkdirSync(cortexDir, { recursive: true })
    // A CORRUPT file (no valid pid/nonce) takes the stale path without a kill check.
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 'corrupt' }))
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error('EPERM: operation not permitted')
      err.code = 'EPERM'
      throw err
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    // The marker overwrote the corrupt file with this process's ownership record.
    const onDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number }
    expect(onDisk.pid).toBe(process.pid)
    expect(warnSpy.mock.calls.some(c => /marker mode/i.test(String(c[0])))).toBe(true)
  })

})

describe('CortexLock boot-family classification', () => {
  let tmpDir: string
  let cortexDir: string
  let lockPath: string
  let held: CortexLock | null
  let familyBackup: string | undefined

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-lock-family-'))
    cortexDir = path.join(tmpDir, '.cortex')
    lockPath = path.join(cortexDir, '.lock')
    held = null
    familyBackup = process.env.__CORTEX_LOCK_FAMILY
  })

  afterEach(() => {
    held?.release()
    if (familyBackup === undefined) delete process.env.__CORTEX_LOCK_FAMILY
    else process.env.__CORTEX_LOCK_FAMILY = familyBackup
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('classifies a live conflict as sameFamily when the holder nonce was inherited via env', () => {
    // Simulates the normal `next dev` double evaluation: the CLI process
    // acquired the lock and exported its nonce; the dev-server child inherited
    // the env and must lose the race SILENTLY (callers key the warning on
    // sameFamily). process.ppid stands in for the live owning process.
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, nonce: 'fam-1', startedAt: Date.now() }))
    process.env.__CORTEX_LOCK_FAMILY = 'unrelated-nonce,fam-1'

    let caught: unknown
    try { CortexLock.acquire(cortexDir) } catch (err) { caught = err }

    expect(caught).toBeInstanceOf(LockHeldError)
    expect((caught as LockHeldError).sameFamily).toBe(true)
  })

  it('classifies a live conflict as NOT sameFamily for a foreign nonce (second dev server)', () => {
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, nonce: 'foreign-owner', startedAt: Date.now() }))
    process.env.__CORTEX_LOCK_FAMILY = 'our-own-nonce'

    let caught: unknown
    try { CortexLock.acquire(cortexDir) } catch (err) { caught = err }

    expect(caught).toBeInstanceOf(LockHeldError)
    expect((caught as LockHeldError).sameFamily).toBe(false)
  })

  it('acquire advertises its nonce in __CORTEX_LOCK_FAMILY and release withdraws it', () => {
    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    const nonce = (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce

    expect((process.env.__CORTEX_LOCK_FAMILY ?? '').split(',')).toContain(nonce)

    held!.release()
    held = null
    expect((process.env.__CORTEX_LOCK_FAMILY ?? '').split(',')).not.toContain(nonce)
  })

  it('warns when reclaiming a CORRUPT (present but unparseable) lock file', () => {
    // A recurring corruption source (crashing writer, disk issue) must stay
    // visible instead of being silently absorbed on every boot.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(lockPath, '{ not json')

    held = CortexLock.acquire(cortexDir)

    expect(held).not.toBeNull()
    expect(warn.mock.calls.some(c => /corrupt/i.test(String(c[0])))).toBe(true)
  })
})

describe('checkCortexLockLiveness', () => {
  let tmpDir: string
  let cortexDir: string
  let lockPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-lock-liveness-'))
    cortexDir = path.join(tmpDir, '.cortex')
    lockPath = path.join(cortexDir, '.lock')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('classifies missing → corrupt → stale → live as the lock state evolves', async () => {
    expect(checkCortexLockLiveness(cortexDir)).toBe('missing')

    fs.mkdirSync(cortexDir, { recursive: true })
    fs.writeFileSync(lockPath, '{ definitely not json')
    expect(checkCortexLockLiveness(cortexDir)).toBe('corrupt')

    fs.writeFileSync(lockPath, JSON.stringify({ pid: await deadPid(), nonce: 'n', startedAt: 0 }))
    expect(checkCortexLockLiveness(cortexDir)).toBe('stale')

    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, nonce: 'n', startedAt: 0 }))
    expect(checkCortexLockLiveness(cortexDir)).toBe('live')
  })
})
