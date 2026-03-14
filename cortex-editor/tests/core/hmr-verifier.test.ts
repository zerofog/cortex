import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HMRVerifier } from '../../src/core/hmr-verifier.js'
import { mockChannel } from '../helpers/mock-channel.js'

describe('HMRVerifier', () => {
  let channel: ReturnType<typeof mockChannel>
  let verifier: HMRVerifier

  beforeEach(() => {
    channel = mockChannel()
    verifier = new HMRVerifier(channel)
  })

  afterEach(() => {
    verifier.dispose()
  })

  it('sends hmr_verified when HMR fires for pending edit', () => {
    verifier.trackEdit({
      editId: 'src/App.tsx:2:10:padding-top',
      filePath: 'src/App.tsx',
      expectedValue: '16px',
      property: 'padding-top',
    })

    verifier.onHMRUpdate(['src/App.tsx'])

    expect(channel.sent).toHaveLength(1)
    expect(channel.sent[0]).toEqual({
      type: 'hmr_verified',
      editId: 'src/App.tsx:2:10:padding-top',
      match: true,
      expected: '16px',
    })
  })

  it('does not send for unrelated HMR update', () => {
    verifier.trackEdit({
      editId: 'src/App.tsx:2:10:padding-top',
      filePath: 'src/App.tsx',
      expectedValue: '16px',
      property: 'padding-top',
    })

    verifier.onHMRUpdate(['src/Other.tsx'])

    expect(channel.sent).toHaveLength(0)
  })

  it('clears pending edit after HMR match', () => {
    verifier.trackEdit({
      editId: 'edit-1',
      filePath: 'src/App.tsx',
      expectedValue: '16px',
      property: 'padding-top',
    })

    verifier.onHMRUpdate(['src/App.tsx'])
    verifier.onHMRUpdate(['src/App.tsx'])

    expect(channel.sent).toHaveLength(1)
  })

  it('handles multiple pending edits for different files', () => {
    verifier.trackEdit({
      editId: 'edit-1',
      filePath: 'src/App.tsx',
      expectedValue: '16px',
      property: 'padding-top',
    })
    verifier.trackEdit({
      editId: 'edit-2',
      filePath: 'src/Header.tsx',
      expectedValue: '24px',
      property: 'margin-top',
    })

    verifier.onHMRUpdate(['src/App.tsx'])

    expect(channel.sent).toHaveLength(1)
    expect((channel.sent[0] as { editId: string }).editId).toBe('edit-1')
  })

  it('cancels pending edit when same file gets new edit', () => {
    verifier.trackEdit({
      editId: 'edit-1',
      filePath: 'src/App.tsx',
      expectedValue: '16px',
      property: 'padding-top',
    })
    verifier.trackEdit({
      editId: 'edit-2',
      filePath: 'src/App.tsx',
      expectedValue: '24px',
      property: 'padding-top',
    })

    verifier.onHMRUpdate(['src/App.tsx'])

    expect(channel.sent).toHaveLength(1)
    expect((channel.sent[0] as { editId: string }).editId).toBe('edit-2')
  })

  describe('TTL eviction', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('evicts stale pending edits after 30s', () => {
      const ch = mockChannel()
      const v = new HMRVerifier(ch)

      v.trackEdit({
        editId: 'edit-old',
        filePath: 'src/App.tsx',
        expectedValue: '16px',
        property: 'padding-top',
      })

      // Advance past TTL
      vi.advanceTimersByTime(31_000)

      // New trackEdit triggers eviction of stale entries
      v.trackEdit({
        editId: 'edit-new',
        filePath: 'src/Page.tsx',
        expectedValue: '8px',
        property: 'margin-top',
      })

      // HMR for stale file — should NOT match (was evicted)
      v.onHMRUpdate(['src/App.tsx'])
      expect(ch.sent).toHaveLength(0)

      // HMR for fresh file — should match
      v.onHMRUpdate(['src/Page.tsx'])
      expect(ch.sent).toHaveLength(1)
      expect((ch.sent[0] as { editId: string }).editId).toBe('edit-new')

      v.dispose()
    })
  })
})
