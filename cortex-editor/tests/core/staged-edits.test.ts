import { describe, it, expect, vi } from 'vitest'
import { StagedEditsCache } from '../../src/core/staged-edits.js'
import type { PendingEdit } from '../../src/adapters/types.js'
import { makeEdit } from './helpers.js'

describe('StagedEditsCache', () => {
  it('append → list returns the appended entry', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'a' })
    cache.append(edit)
    const list = cache.list()
    expect(list).toHaveLength(1)
    expect(list[0].intentId).toBe('a')
  })

  it('append same composite key twice → last-write-wins (one entry, second value)', () => {
    const cache = new StagedEditsCache()
    const edit1 = makeEdit({ intentId: 'id-1', value: 'red', source: 'src/Hero.tsx:14:5', property: 'color' })
    const edit2 = makeEdit({ intentId: 'id-2', value: 'green', source: 'src/Hero.tsx:14:5', property: 'color' })
    cache.append(edit1)
    cache.append(edit2)
    const list = cache.list()
    expect(list).toHaveLength(1)
    expect(list[0].value).toBe('green')
    expect(list[0].intentId).toBe('id-2')
  })

  it('append same composite key with pseudo included → last-write-wins by pseudo key', () => {
    const cache = new StagedEditsCache()
    const edit1 = makeEdit({ intentId: 'p-1', value: '"a"', property: 'content', pseudo: '::before' })
    const edit2 = makeEdit({ intentId: 'p-2', value: '"b"', property: 'content', pseudo: '::before' })
    const edit3 = makeEdit({ intentId: 'p-3', value: '"c"', property: 'content', pseudo: '::after' })
    cache.append(edit1)
    cache.append(edit2)
    cache.append(edit3)
    const list = cache.list()
    // edit1 and edit2 share ::before key → collapsed; edit3 is ::after → separate
    expect(list).toHaveLength(2)
    expect(list.find(e => e.pseudo === '::before')?.intentId).toBe('p-2')
    expect(list.find(e => e.pseudo === '::after')?.intentId).toBe('p-3')
  })

  it('remove by intentId removes the right entry', () => {
    const cache = new StagedEditsCache()
    const e1 = makeEdit({ intentId: 'keep', property: 'color' })
    const e2 = makeEdit({ intentId: 'drop', property: 'fontSize' })
    cache.append(e1)
    cache.append(e2)
    cache.remove(['drop'])
    const list = cache.list()
    expect(list).toHaveLength(1)
    expect(list[0].intentId).toBe('keep')
  })

  it('remove is idempotent — re-removing the same id is a no-op', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'x' })
    cache.append(edit)
    cache.remove(['x'])
    cache.remove(['x']) // second call — must not throw or misbehave
    expect(cache.list()).toHaveLength(0)
    expect(cache.size()).toBe(0)
  })

  it('remove with empty array is a no-op', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'stays' })
    cache.append(edit)
    cache.remove([])
    expect(cache.list()).toHaveLength(1)
  })

  it('mergeFullSync with empty input is a no-op when cache has entries (multi-tab safety)', () => {
    // Critical multi-tab regression guard: an empty-localStorage tab mounting
    // must NOT wipe the server cache populated by another tab. The previous
    // replaceAll semantics violated this; mergeFullSync makes it explicit.
    const cache = new StagedEditsCache()
    const a = makeEdit({ intentId: 'survive-a' })
    cache.append(a)
    cache.mergeFullSync([])
    expect(cache.size()).toBe(1)
    expect(cache.list()[0].intentId).toBe('survive-a')
  })

  it('mergeFullSync — newer timestamp wins on composite-key conflict', () => {
    // Tab A writes value=red at t=2000; Tab B's stale localStorage has
    // value=blue at t=1000 for the SAME source/property/pseudo. When Tab B
    // mounts and fires syncFullState, the merge must keep red.
    const cache = new StagedEditsCache()
    const original = makeEdit({ intentId: 'a', property: 'color', value: 'red', timestamp: 2000 })
    cache.append(original)
    const stale = makeEdit({ intentId: 'a', property: 'color', value: 'blue', timestamp: 1000 })
    cache.mergeFullSync([stale])
    expect(cache.size()).toBe(1)
    expect(cache.getById('a')?.value).toBe('red')
  })

  it('mergeFullSync — newer timestamp incoming overwrites older existing on conflict', () => {
    // Mirror image of the test above: incoming entry is newer, must win.
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'a', property: 'color', value: 'old', timestamp: 1000 }))
    const newer = makeEdit({ intentId: 'a', property: 'color', value: 'new', timestamp: 2000 })
    cache.mergeFullSync([newer])
    expect(cache.size()).toBe(1)
    expect(cache.getById('a')?.value).toBe('new')
  })

  it('mergeFullSync — distinct composite keys merge additively', () => {
    // No conflict: incoming entries with new keys are simply added; existing
    // entries are preserved. This is the "Tab A and Tab B have disjoint
    // edits" case — both should survive.
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'tab-a', property: 'color' }))
    cache.mergeFullSync([makeEdit({ intentId: 'tab-b', property: 'fontSize' })])
    expect(cache.size()).toBe(2)
    const ids = cache.list().map(e => e.intentId).sort()
    expect(ids).toEqual(['tab-a', 'tab-b'])
  })

  it('mergeFullSync — equal timestamps prefer the incoming entry', () => {
    // Tie-break documented in the docstring: equal timestamps go to the
    // incoming entry (matches the browser hook's "re-insert at end" semantic
    // for sub-millisecond edit replays where a tie is plausible).
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'a', property: 'color', value: 'first', timestamp: 1000 }))
    cache.mergeFullSync([
      makeEdit({ intentId: 'a', property: 'color', value: 'second', timestamp: 1000 }),
    ])
    expect(cache.getById('a')?.value).toBe('second')
  })

  it('clear empties the cache', () => {
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'a' }))
    cache.append(makeEdit({ intentId: 'b', property: 'fontSize' }))
    expect(cache.size()).toBe(2)
    cache.clear()
    expect(cache.list()).toHaveLength(0)
    expect(cache.size()).toBe(0)
  })

  it('getById returns the matching entry', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'find-me' })
    cache.append(edit)
    const found = cache.getById('find-me')
    expect(found).not.toBeNull()
    expect(found!.intentId).toBe('find-me')
  })

  it('getById returns null for unknown id', () => {
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'exists' }))
    expect(cache.getById('not-here')).toBeNull()
  })

  it('size() tracks count correctly through operations', () => {
    const cache = new StagedEditsCache()
    expect(cache.size()).toBe(0)
    cache.append(makeEdit({ intentId: 'a', property: 'color' }))
    expect(cache.size()).toBe(1)
    cache.append(makeEdit({ intentId: 'b', property: 'fontSize' }))
    expect(cache.size()).toBe(2)
    cache.remove(['a'])
    expect(cache.size()).toBe(1)
    cache.clear()
    expect(cache.size()).toBe(0)
  })

  it('snapshot semantics — mutating a returned PendingEdit does not affect cache state', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'snapshot-test', value: 'original' })
    cache.append(edit)

    const list = cache.list()
    // Mutate the returned object
    list[0].value = 'mutated'

    // Cache must be unaffected
    const listAgain = cache.list()
    expect(listAgain[0].value).toBe('original')
  })

  it('snapshot semantics for getById — mutating returned object does not affect cache', () => {
    const cache = new StagedEditsCache()
    const edit = makeEdit({ intentId: 'snap-get', value: 'orig' })
    cache.append(edit)

    const found = cache.getById('snap-get')!
    found.value = 'clobbered'

    const again = cache.getById('snap-get')!
    expect(again.value).toBe('orig')
  })

  it('last-write-wins preserves insertion order (new key appended, existing key updated in-place)', () => {
    const cache = new StagedEditsCache()
    // Insert A, B, then update A — A should move to end (re-inserted) or stay
    // The spec says "insertion order" which for Map with delete+re-insert means A moves to end.
    cache.append(makeEdit({ intentId: 'a', property: 'color' }))
    cache.append(makeEdit({ intentId: 'b', property: 'fontSize' }))
    cache.append(makeEdit({ intentId: 'a2', property: 'color' })) // same key as 'a'

    const list = cache.list()
    // Map: delete(key) + set(key) → key moves to end
    expect(list).toHaveLength(2)
    expect(list[0].intentId).toBe('b')
    expect(list[1].intentId).toBe('a2')
  })

  it('mergeFullSync rejects oversize input and leaves cache state unchanged; boundary at cap allowed', () => {
    // Defensive cap at 2× browser MAX_ENTRIES (1000): a misbehaving panel-mount
    // loop or compromised browser script can't block the Node event loop with
    // a 100MB sync message. Token-gated upstream, so this is defense-in-depth.
    const cache = new StagedEditsCache()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Seed with 3 entries via append — these must survive a rejected mergeFullSync.
    cache.append(makeEdit({ intentId: 'orig-1', property: 'color' }))
    cache.append(makeEdit({ intentId: 'orig-2', property: 'fontSize' }))
    cache.append(makeEdit({ intentId: 'orig-3', property: 'padding' }))
    expect(cache.size()).toBe(3)

    // 1001 entries (just over the cap) — must be rejected.
    const oversize: PendingEdit[] = []
    for (let i = 0; i < 1001; i++) {
      oversize.push(makeEdit({ intentId: `over-${i}`, property: `prop-${i}` }))
    }
    cache.mergeFullSync(oversize)

    expect(cache.size()).toBe(3)
    const survivors = cache.list().map(e => e.intentId)
    expect(survivors).toEqual(['orig-1', 'orig-2', 'orig-3'])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('mergeFullSync rejected')

    // Boundary case: exactly at the cap (1000) IS allowed. Clear first so we
    // measure the merge against an empty cache (otherwise the 3 originals,
    // which use distinct composite keys from the cap entries, would be
    // additively preserved under the new merge semantics — masking the cap
    // assertion).
    cache.clear()
    const atCap: PendingEdit[] = []
    for (let i = 0; i < 1000; i++) {
      atCap.push(makeEdit({ intentId: `cap-${i}`, property: `cap-prop-${i}` }))
    }
    cache.mergeFullSync(atCap)
    expect(cache.size()).toBe(1000)

    warnSpy.mockRestore()
  })
})
