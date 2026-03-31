import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeferredWriter } from '../../src/core/deferred-writer.js'

describe('DeferredWriter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces multiple properties into a single flush', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-left', value: '8px', failureReason: 'no class' })

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

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })

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

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // first batch fires

    // New edit while first is in-flight — should abort first
    writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })
    await vi.advanceTimersByTimeAsync(100) // second batch fires

    await vi.advanceTimersByTimeAsync(5000) // let everything settle
    expect(callCount).toBe(2)
  })

  it('keeps separate batches for different files', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true, newContent: 'updated' })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ editId: 'e2', filePath: '/app/Hero.tsx', line: 5, col: 3, property: 'color', value: 'red', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(2)
  })

  it('dispose clears all timers and aborts in-flight', async () => {
    const writeFn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5000))
      return { success: true, newContent: 'updated' }
    })
    const writer = new DeferredWriter({ coalescingMs: 100, writeFn })

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.dispose()

    await vi.advanceTimersByTimeAsync(500)
    expect(writeFn).not.toHaveBeenCalled()
  })

  it('tracks editIds through coalescing', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-left', value: '8px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn).toHaveBeenCalledTimes(1)
    expect(writeFn.mock.calls[0][0].editIds).toEqual(['e1', 'e2'])
  })

  it('tracks editIds when same property is superseded', async () => {
    const writeFn = vi.fn().mockResolvedValue({ success: true })
    const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

    writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
    writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '24px', failureReason: 'no class' })

    await vi.advanceTimersByTimeAsync(250)

    expect(writeFn.mock.calls[0][0].editIds).toEqual(['e1', 'e2'])
  })

  describe('cancelForFile', () => {
    it('cancels pending entries for the specified file', async () => {
      const writeFn = vi.fn().mockResolvedValue({ success: true })
      const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

      writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
      writer.enqueue({ editId: 'e2', filePath: '/app/Hero.tsx', line: 5, col: 3, property: 'color', value: 'red', failureReason: 'no class' })

      writer.cancelForFile('/app/App.tsx')

      await vi.advanceTimersByTimeAsync(250)

      // Only Hero.tsx should flush
      expect(writeFn).toHaveBeenCalledTimes(1)
      expect(writeFn.mock.calls[0][0].filePath).toBe('/app/Hero.tsx')
    })

    it('aborts in-flight requests for the specified file', async () => {
      let abortedSignal: AbortSignal | undefined
      const writeFn = vi.fn().mockImplementation(async (req) => {
        abortedSignal = req.signal
        await new Promise(r => setTimeout(r, 5000))
        return { success: true }
      })
      const writer = new DeferredWriter({ coalescingMs: 100, writeFn })

      writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
      await vi.advanceTimersByTimeAsync(100) // flush fires, now in-flight

      writer.cancelForFile('/app/App.tsx')

      expect(abortedSignal?.aborted).toBe(true)
    })

    it('does not affect entries for other files', async () => {
      const writeFn = vi.fn().mockResolvedValue({ success: true })
      const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

      writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
      writer.enqueue({ editId: 'e2', filePath: '/app/Hero.tsx', line: 5, col: 3, property: 'color', value: 'red', failureReason: 'no class' })
      writer.enqueue({ editId: 'e3', filePath: '/app/Footer.tsx', line: 10, col: 1, property: 'margin', value: '4px', failureReason: 'no class' })

      writer.cancelForFile('/app/App.tsx')

      await vi.advanceTimersByTimeAsync(250)

      expect(writeFn).toHaveBeenCalledTimes(2)
      const flushedFiles = writeFn.mock.calls.map((c: any) => c[0].filePath)
      expect(flushedFiles).toContain('/app/Hero.tsx')
      expect(flushedFiles).toContain('/app/Footer.tsx')
      expect(flushedFiles).not.toContain('/app/App.tsx')
    })

    it('cancels multiple pending entries for the same file (different elements)', async () => {
      const writeFn = vi.fn().mockResolvedValue({ success: true })
      const writer = new DeferredWriter({ coalescingMs: 250, writeFn })

      // Two different elements in the same file
      writer.enqueue({ editId: 'e1', filePath: '/app/App.tsx', line: 14, col: 7, property: 'padding-top', value: '16px', failureReason: 'no class' })
      writer.enqueue({ editId: 'e2', filePath: '/app/App.tsx', line: 30, col: 5, property: 'color', value: 'red', failureReason: 'no class' })

      writer.cancelForFile('/app/App.tsx')

      await vi.advanceTimersByTimeAsync(250)

      expect(writeFn).not.toHaveBeenCalled()
    })
  })
})
