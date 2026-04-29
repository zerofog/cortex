import { describe, it, expect } from 'vitest'
import { StagedEditsCache } from '../../src/core/staged-edits.js'
import type { PendingEdit } from '../../src/adapters/types.js'

function makeEdit(overrides: Partial<PendingEdit> = {}): PendingEdit {
  return {
    intentId: crypto.randomUUID(),
    source: 'src/Hero.tsx:14:5',
    property: 'color',
    value: 'red',
    previousValue: 'blue',
    timestamp: Date.now(),
    ...overrides,
  }
}

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

  it('replaceAll wipes prior state and installs the new entries in iteration order', () => {
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'old-1' }))
    cache.append(makeEdit({ intentId: 'old-2', property: 'fontSize' }))

    const newEdits = [
      makeEdit({ intentId: 'new-a', property: 'padding' }),
      makeEdit({ intentId: 'new-b', property: 'margin' }),
      makeEdit({ intentId: 'new-c', property: 'color' }),
    ]
    cache.replaceAll(newEdits)

    const list = cache.list()
    expect(list).toHaveLength(3)
    expect(list[0].intentId).toBe('new-a')
    expect(list[1].intentId).toBe('new-b')
    expect(list[2].intentId).toBe('new-c')
  })

  it('replaceAll with empty array clears the cache', () => {
    const cache = new StagedEditsCache()
    cache.append(makeEdit({ intentId: 'gone' }))
    cache.replaceAll([])
    expect(cache.list()).toHaveLength(0)
    expect(cache.size()).toBe(0)
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
})
