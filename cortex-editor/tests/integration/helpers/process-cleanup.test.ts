import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { killChildGracefully } from './process-cleanup.js'

describe('killChildGracefully', () => {
  it('terminates a SIGTERM-respecting child via SIGTERM', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    await new Promise(r => setTimeout(r, 50))
    const start = Date.now()
    await killChildGracefully(child, 2000)
    expect(child.signalCode).toBe('SIGTERM')
    expect(child.exitCode).toBe(null)
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('escalates to SIGKILL when child ignores SIGTERM', async () => {
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"])
    await new Promise(r => setTimeout(r, 50))
    const start = Date.now()
    await killChildGracefully(child, 200)
    expect(child.killed).toBe(true)
    expect(child.signalCode).toBe('SIGKILL')
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(200)
    expect(elapsed).toBeLessThan(1000)
  })

  it('is a no-op for an already-exited child', async () => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'])
    await new Promise(r => child.on('exit', () => r(undefined)))
    expect(child.exitCode).toBe(0)
    await killChildGracefully(child, 2000)
    expect(child.exitCode).toBe(0)
  })

  it('resolves when child dies between guard and listener attach', async () => {
    // Spawn a child that exits immediately
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'])
    // Wait for it to be fully exited
    await new Promise<void>((r) => child.once('exit', () => r()))
    expect(child.exitCode).toBe(0)
    // Now call killChildGracefully — must not hang
    const start = Date.now()
    await killChildGracefully(child, 2000)
    expect(Date.now() - start).toBeLessThan(100)
  })
})
