import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  registerPopoverDismiss,
  dismissTopmostPopover,
  hasOpenPopover,
  _resetPopoverStackForTesting,
} from '../../src/browser/popover-stack.js'

describe('popover-stack', () => {
  afterEach(() => {
    _resetPopoverStackForTesting()
  })

  it('starts empty', () => {
    expect(hasOpenPopover()).toBe(false)
    expect(dismissTopmostPopover()).toBe(false)
  })

  it('dismisses the topmost popover (LIFO)', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerPopoverDismiss(first)
    registerPopoverDismiss(second)

    expect(dismissTopmostPopover()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    expect(dismissTopmostPopover()).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)

    expect(dismissTopmostPopover()).toBe(false)
  })

  it('unregister removes the specific entry, not necessarily the top', () => {
    // Out-of-order unmount (React unmounting a parent that contains the
    // popover). The stack must splice by identity, not pop.
    const first = vi.fn()
    const second = vi.fn()
    const unregFirst = registerPopoverDismiss(first)
    registerPopoverDismiss(second)
    unregFirst() // Remove the OLDER entry while second is still open.

    expect(hasOpenPopover()).toBe(true)
    expect(dismissTopmostPopover()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('unregister is idempotent and safe to call after dismissal', () => {
    // dismissTopmostPopover pops the entry before invoking the callback.
    // If the callback unmounts the popover synchronously, its cleanup fn
    // calls the unregister for an entry that's no longer in the stack.
    // That must be a no-op, not throw or remove the wrong entry.
    const first = vi.fn()
    const second = vi.fn()
    const unregFirst = registerPopoverDismiss(first)
    registerPopoverDismiss(second)

    expect(dismissTopmostPopover()).toBe(true) // removes `second`
    unregFirst()                                // removes `first`
    unregFirst()                                // idempotent no-op
    expect(hasOpenPopover()).toBe(false)
  })
})
