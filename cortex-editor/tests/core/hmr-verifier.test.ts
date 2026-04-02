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

  describe('kind propagation', () => {
    it('includes kind: immediate in hmr_verified when trackEdit has kind: immediate', () => {
      verifier.trackEdit({
        editId: 'edit-imm',
        filePath: 'src/App.tsx',
        expectedValue: '16px',
        property: 'padding-top',
        kind: 'immediate',
      })

      verifier.onHMRUpdate(['src/App.tsx'])

      expect(channel.sent).toHaveLength(1)
      expect(channel.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-imm',
        match: true,
        expected: '16px',
        kind: 'immediate',
      })
    })

    it('includes kind: jsx-immediate in hmr_verified when trackEdit has kind: jsx-immediate', () => {
      verifier.trackEdit({
        editId: 'edit-jsx',
        filePath: 'src/App.tsx',
        expectedValue: '24px',
        property: 'margin-top',
        kind: 'jsx-immediate',
      })

      verifier.onHMRUpdate(['src/App.tsx'])

      expect(channel.sent).toHaveLength(1)
      expect(channel.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-jsx',
        match: true,
        expected: '24px',
        kind: 'jsx-immediate',
      })
    })

    it('includes kind: deferred in hmr_verified when trackEdit has kind: deferred', () => {
      verifier.trackEdit({
        editId: 'edit-def',
        filePath: 'src/App.tsx',
        expectedValue: '8px',
        property: 'gap',
        kind: 'deferred',
      })

      verifier.onHMRUpdate(['src/App.tsx'])

      expect(channel.sent).toHaveLength(1)
      expect(channel.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-def',
        match: true,
        expected: '8px',
        kind: 'deferred',
      })
    })

    it('sends kind: undefined in hmr_verified when trackEdit omits kind (backward compat)', () => {
      verifier.trackEdit({
        editId: 'edit-legacy',
        filePath: 'src/App.tsx',
        expectedValue: '16px',
        property: 'padding-top',
      })

      verifier.onHMRUpdate(['src/App.tsx'])

      expect(channel.sent).toHaveLength(1)
      expect(channel.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-legacy',
        match: true,
        expected: '16px',
        kind: undefined,
      })
    })
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

      // New trackEdit triggers eviction of stale entries (sends match: false)
      v.trackEdit({
        editId: 'edit-new',
        filePath: 'src/Page.tsx',
        expectedValue: '8px',
        property: 'margin-top',
      })

      // Eviction should have sent match: false for the stale entry
      expect(ch.sent).toHaveLength(1)
      expect(ch.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-old',
        match: false,
        expected: '16px',
        kind: undefined,
      })

      // HMR for stale file — should NOT match (was evicted)
      v.onHMRUpdate(['src/App.tsx'])
      expect(ch.sent).toHaveLength(1) // no new message

      // HMR for fresh file — should match
      v.onHMRUpdate(['src/Page.tsx'])
      expect(ch.sent).toHaveLength(2)
      expect((ch.sent[1] as { editId: string }).editId).toBe('edit-new')

      v.dispose()
    })

    it('includes kind in stale eviction message', () => {
      const ch = mockChannel()
      const v = new HMRVerifier(ch)

      v.trackEdit({
        editId: 'edit-stale',
        filePath: 'src/App.tsx',
        expectedValue: '16px',
        property: 'padding-top',
        kind: 'jsx-immediate',
      })

      vi.advanceTimersByTime(31_000)

      // Trigger eviction
      v.trackEdit({
        editId: 'edit-fresh',
        filePath: 'src/Other.tsx',
        expectedValue: '8px',
        property: 'gap',
      })

      expect(ch.sent).toHaveLength(1)
      expect(ch.sent[0]).toEqual({
        type: 'hmr_verified',
        editId: 'edit-stale',
        match: false,
        expected: '16px',
        kind: 'jsx-immediate',
      })

      v.dispose()
    })
  })
})
