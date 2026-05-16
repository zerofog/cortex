import { describe, it, expect } from 'vitest'
import {
  evaluateSetActive,
  initialActiveState,
  clearActiveBrowser,
  type ActiveState,
} from '../../src/adapters/cortex-active-state.js'

describe('evaluateSetActive — server-side activation state machine', () => {
  describe('CLI-originated requests (no tabId)', () => {
    it('activates from inactive state and emits a broadcast', () => {
      const result = evaluateSetActive(initialActiveState, { active: true })
      expect(result.next.editorActive).toBe(true)
      expect(result.next.activeBrowserId).toBe(null)
      expect(result.broadcast).toEqual({ active: true })
      expect(result.reject).toBeUndefined()
    })

    it('is idempotent — second activation returns same state and no broadcast', () => {
      const after1 = evaluateSetActive(initialActiveState, { active: true })
      const after2 = evaluateSetActive(after1.next, { active: true })
      expect(after2.next).toBe(after1.next)
      expect(after2.broadcast).toBeUndefined()
    })

    it('deactivates from active state and emits a broadcast', () => {
      const active: ActiveState = { editorActive: true, activeBrowserId: 'tab-1' }
      const result = evaluateSetActive(active, { active: false })
      expect(result.next.editorActive).toBe(false)
      // CLI-driven deactivation clears activeBrowserId so the next browser
      // request can be adopted.
      expect(result.next.activeBrowserId).toBe(null)
      expect(result.broadcast).toEqual({ active: false })
    })

    it('does not change activeBrowserId on activation when none is set', () => {
      const result = evaluateSetActive(initialActiveState, { active: true })
      expect(result.next.activeBrowserId).toBe(null)
    })
  })

  describe('browser-originated requests (with tabId)', () => {
    it('adopts the first tab to send cortex/set-active and broadcasts to it', () => {
      const result = evaluateSetActive(initialActiveState, { active: true, tabId: 'tab-A' })
      expect(result.next.editorActive).toBe(true)
      expect(result.next.activeBrowserId).toBe('tab-A')
      expect(result.broadcast).toEqual({ active: true, targetTabId: 'tab-A' })
      expect(result.reject).toBeUndefined()
    })

    it('rejects a different tab while another is active and emits an inactive-tab message', () => {
      const adopted: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
      const result = evaluateSetActive(adopted, { active: true, tabId: 'tab-B' })
      expect(result.next).toBe(adopted)
      expect(result.broadcast).toBeUndefined()
      expect(result.reject).toEqual({ targetTabId: 'tab-B' })
    })

    it('lets the active tab toggle itself off and clears activeBrowserId', () => {
      const adopted: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
      const result = evaluateSetActive(adopted, { active: false, tabId: 'tab-A' })
      expect(result.next.editorActive).toBe(false)
      expect(result.next.activeBrowserId).toBe(null)
      expect(result.broadcast).toEqual({ active: false, targetTabId: 'tab-A' })
    })

    it('lets a non-active tab send active=false as a no-op (does not change state, no reject)', () => {
      const adopted: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
      const result = evaluateSetActive(adopted, { active: false, tabId: 'tab-B' })
      expect(result.next).toBe(adopted)
      expect(result.broadcast).toBeUndefined()
      expect(result.reject).toBeUndefined()
    })

    // CLI-first race: CLI activates (no tabId), then the first browser tab
    // comes in and claims the active slot. editorActive stays true but
    // activeBrowserId transitions null → tabId, and the broadcast must be
    // targeted to the adopting tab so its reducer fires. Downstream Vite /
    // Webpack wiring depends on the targeted broadcast to address one tab.
    it('adopts a browser tab when CLI activated first (race: editorActive already true, no tab adopted)', () => {
      const cliActivated: ActiveState = { editorActive: true, activeBrowserId: null }
      const result = evaluateSetActive(cliActivated, { active: true, tabId: 'tab-A' })
      expect(result.next.editorActive).toBe(true)
      expect(result.next.activeBrowserId).toBe('tab-A')
      expect(result.broadcast).toEqual({ active: true, targetTabId: 'tab-A' })
      expect(result.reject).toBeUndefined()
    })
  })

  describe('clearActiveBrowser — called when the active tab disconnects', () => {
    it('clears activeBrowserId and deactivates if the active tab disconnects while open', () => {
      const adopted: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
      // We model disconnect as a separate helper; tested in Task 5's vite-side
      // disconnect path, but the state shape change is exercised here too.
      const result = evaluateSetActive(adopted, { active: false, tabId: 'tab-A' })
      expect(result.next.editorActive).toBe(false)
      expect(result.next.activeBrowserId).toBe(null)
    })
  })
})

describe('clearActiveBrowser', () => {
  it('returns same state when the disconnecting tab is not the active tab', () => {
    const state: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
    const result = clearActiveBrowser(state, 'tab-B')
    expect(result.next).toBe(state)
    expect(result.broadcast).toBeUndefined()
  })

  it('clears and deactivates when the active tab disconnects while panel is open', () => {
    const state: ActiveState = { editorActive: true, activeBrowserId: 'tab-A' }
    const result = clearActiveBrowser(state, 'tab-A')
    expect(result.next.editorActive).toBe(false)
    expect(result.next.activeBrowserId).toBe(null)
    expect(result.broadcast).toEqual({ active: false })
  })

  it('clears activeBrowserId even when panel is already inactive', () => {
    const state: ActiveState = { editorActive: false, activeBrowserId: 'tab-A' }
    const result = clearActiveBrowser(state, 'tab-A')
    expect(result.next.editorActive).toBe(false)
    expect(result.next.activeBrowserId).toBe(null)
    expect(result.broadcast).toBeUndefined()
  })
})
