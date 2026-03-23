import { describe, it, expect, vi } from 'vitest'
import { ActivityLog } from '../../../src/core/session/activity-log.js'

describe('ActivityLog', () => {
  it('adds entries with auto-generated id and timestamp', () => {
    const log = new ActivityLog()
    const entry = log.add({ type: 'edit', description: 'Changed color', elementSource: 'App.tsx:10:5' })
    expect(entry.id).toBeTruthy()
    expect(entry.timestamp).toBeGreaterThan(0)
    expect(entry.type).toBe('edit')
  })

  it('getAll returns all entries', () => {
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'one' })
    log.add({ type: 'comment', description: 'two' })
    expect(log.getAll()).toHaveLength(2)
  })

  it('getRecent returns last N entries', () => {
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'one' })
    log.add({ type: 'edit', description: 'two' })
    log.add({ type: 'edit', description: 'three' })
    const recent = log.getRecent(2)
    expect(recent).toHaveLength(2)
    expect(recent[0].description).toBe('two')
    expect(recent[1].description).toBe('three')
  })

  it('getSince returns entries after timestamp', () => {
    vi.useFakeTimers()
    const log = new ActivityLog()
    log.add({ type: 'edit', description: 'old' })
    const cutoff = Date.now()
    vi.advanceTimersByTime(1)
    log.add({ type: 'edit', description: 'new' })
    const since = log.getSince(cutoff)
    expect(since).toHaveLength(1)
    expect(since[0].description).toBe('new')
    vi.useRealTimers()
  })

  it('count returns total entries', () => {
    const log = new ActivityLog()
    expect(log.count).toBe(0)
    log.add({ type: 'edit', description: 'one' })
    expect(log.count).toBe(1)
  })

  it('evicts oldest entries when maxEntries exceeded', () => {
    const log = new ActivityLog(5) // small cap for testing
    for (let i = 0; i < 7; i++) {
      log.add({ type: 'edit', description: `entry-${i}` })
    }
    expect(log.count).toBe(5)
    expect(log.getAll()[0].description).toBe('entry-2')
  })
})
