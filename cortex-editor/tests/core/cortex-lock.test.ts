import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { CortexLock, LockHeldError } from '../../src/core/cortex-lock.js'

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

  it('Vite in-process restart: a same-pid re-acquire reclaims, and the OLD lock’s release no-ops', () => {
    // Vite restarts configureServer in-process: the old session is disposed
    // (async, not awaited) and a new session is constructed immediately. Both
    // share process.pid. The new acquire must reclaim the old, still-present
    // lock file — and the old session's later release() must NOT unlink the
    // new owner's file. The per-instance nonce is what makes that correct.
    const oldLock = CortexLock.acquire(cortexDir)!
    const oldNonce = (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce

    // New session acquires without the old one having released yet.
    held = CortexLock.acquire(cortexDir)
    expect(held).not.toBeNull()
    const newNonce = (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce
    expect(newNonce).not.toBe(oldNonce)

    // Old session's delayed release must be a no-op — the file is the new owner's now.
    oldLock.release()
    expect(fs.existsSync(lockPath)).toBe(true)
    expect((JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { nonce: string }).nonce).toBe(newNonce)
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
})
