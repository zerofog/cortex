import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { killChildGracefully } from './process-cleanup.js'

describe('killChildGracefully', () => {
  it('terminates a SIGTERM-respecting child via SIGTERM', async () => {
    const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'])
    await new Promise(r => setTimeout(r, 50))
    const start = Date.now()
    await killChildGracefully(child, 2000)
    expect(child.killed).toBe(true)
    expect(child.exitCode === 0 || child.signalCode === 'SIGTERM').toBe(true)
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('escalates to SIGKILL when child ignores SIGTERM', async () => {
    const child = spawn('node', ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"])
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
    const child = spawn('node', ['-e', 'process.exit(0)'])
    await new Promise(r => child.on('exit', () => r(undefined)))
    expect(child.exitCode).toBe(0)
    await killChildGracefully(child, 2000)
    expect(child.exitCode).toBe(0)
  })
})
