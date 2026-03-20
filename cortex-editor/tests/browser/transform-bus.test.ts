import { describe, it, expect, vi } from 'vitest'
import { emitTransformUpdate, onTransformUpdate } from '../../src/browser/transform-bus.js'

describe('transform-bus', () => {
  it('subscriber receives emitted updates', () => {
    const cb = vi.fn()
    const unsub = onTransformUpdate(cb)
    emitTransformUpdate()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn()
    const unsub = onTransformUpdate(cb)
    emitTransformUpdate()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
    emitTransformUpdate()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('multiple subscribers all receive updates', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = onTransformUpdate(cb1)
    const unsub2 = onTransformUpdate(cb2)
    emitTransformUpdate()
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    unsub1()
    unsub2()
  })

  it('does not emit events on window', () => {
    const windowCb = vi.fn()
    window.addEventListener('update', windowCb)
    window.addEventListener('cortex-transform-update', windowCb)
    emitTransformUpdate()
    expect(windowCb).not.toHaveBeenCalled()
    window.removeEventListener('update', windowCb)
    window.removeEventListener('cortex-transform-update', windowCb)
  })
})
