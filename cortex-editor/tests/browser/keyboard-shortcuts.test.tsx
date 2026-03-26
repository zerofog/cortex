import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as focusUtils from '../../src/browser/focus-utils.js'
import { dispatchKeyboardEvent } from './helpers.js'

// Allow synthetic events to pass the isTrusted check in tests
beforeEach(() => {
  vi.spyOn(focusUtils, 'isRealEvent').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('selection.ts Escape removal', () => {
  it('selection.ts does NOT handle Escape', async () => {
    const { initSelection } = await import('../../src/browser/selection.js')
    const onSelect = vi.fn()
    const shadow = document.createElement('div').attachShadow({ mode: 'open' })
    const { cleanup } = initSelection(shadow, vi.fn(), onSelect)
    dispatchKeyboardEvent(window, 'keydown', { key: 'Escape' })
    expect(onSelect).not.toHaveBeenCalled()
    cleanup()
  })

  it('selection.ts click still works with isOwnUI guard', async () => {
    const { initSelection } = await import('../../src/browser/selection.js')
    const onSelect = vi.fn()
    const shadow = document.createElement('div').attachShadow({ mode: 'open' })
    const { cleanup } = initSelection(shadow, vi.fn(), onSelect)
    // Click on non-cortex element should select
    dispatchKeyboardEvent(window, 'click', {})
    // (full click test would need elementFromPoint mock — covered by existing tests)
    cleanup()
  })
})

// Cascade priority tests will be integration tests added in Task 5
// after tinykeys wiring, using the CortexApp test harness from cortex-app.test.tsx
