import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeferredWriter } from '../../src/core/deferred-writer.js'

describe('DeferredWriter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces multiple properties into a single flush', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-left', value: '8px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(1)
    expect(writeFn).toHaveBeenCalledWith(expect.objectContaining({
      filePath: '/app/App.tsx',
      line: 14,
      changes: expect.arrayContaining([
        { property: 'padding-top', value: '16px' },
        { property: 'padding-left', value: '8px' },
      ]),
    }))
  })

  it('cancels superseded value for same element+property', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(1)
    const changes = writeFn.mock.calls[0][0].changes
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ property: 'padding-top', value: '24px' })
  })

  it('aborts in-flight AI call when new edit arrives for same element', async () => {
    let callCount = 0
    const writeFn = vi.fn().mockImplementation(async (req) => {
      callCount++
      if (callCount === 1) {
        // Simulate slow AI call — check if aborted
        await new Promise(r => setTimeout(r, 2000))
        if (req.signal?.aborted) return { success: false, reason: 'aborted' }
      }
      return { success: true, newContent: 'updated' }
    })
    const writer = new DeferredWriter({ coalescingMs: 100, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // first batch fires

    // New edit while first is in-flight — should abort first
    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // second batch fires

    await vi.advanceTimersByTimeAsync(5000) // let everything settle
    expect(callCount).toBe(2)
  })

  it('keeps separate batches for different files', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ filePath: '/app/Hero.tsx', line: 5, col: 3, property: 'color', value: 'red', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(2)
  })

  it('dispose clears all timers and aborts in-flight', async () => {
    const writeFn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5000))
      return { success: true, newContent: 'updated' }
    })
    const writer = new DeferredWriter({ coalescingMs: 100, writeFn })

    writer.enqueue({ filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.dispose()

    await vi.advanceTimersByTimeAsync(500)
    expect(writeFn).not.toHaveBeenCalled()
  })
})
