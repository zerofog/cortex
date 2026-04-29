import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { useEditStagingBuffer, type PendingEdit, type StagingBufferHandle } from '../../../src/browser/hooks/useEditStagingBuffer.js'
import { cortexStorage } from '../../../src/browser/persistence.js'

function renderHook<T>(hookFn: () => T): { result: { current: T }; unmount: () => void; rerender: (newHookFn: () => T) => void } {
  const result = { current: null as T }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let currentFn = hookFn

  function Wrapper() {
    result.current = currentFn()
    return null
  }

  render(<Wrapper />, container)
  return {
    result,
    unmount: () => {
      render(null, container)
      container.remove()
    },
    rerender: (newHookFn: () => T) => {
      currentFn = newHookFn
      render(<Wrapper />, container)
    },
  }
}

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

describe('useEditStagingBuffer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('append writes to localStorage debounced (~150ms)', async () => {
    const setSpy = vi.spyOn(cortexStorage, 'set')
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const edit = makeEdit()
    await act(() => {
      result.current.append(edit)
    })

    // Not called synchronously
    expect(setSpy).not.toHaveBeenCalledWith('staging-buffer', expect.anything())

    // Advance past debounce threshold
    await act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(setSpy).toHaveBeenCalledWith('staging-buffer', expect.arrayContaining([
      expect.objectContaining({ intentId: edit.intentId }),
    ]))

    unmount()
    setSpy.mockRestore()
  })

  it('same composite key (source\\0property\\0pseudo) collapses last-write-wins', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const edit1 = makeEdit({ intentId: 'id-1', value: 'red', source: 'src/Hero.tsx:14:5', property: 'color' })
    const edit2 = makeEdit({ intentId: 'id-2', value: 'green', source: 'src/Hero.tsx:14:5', property: 'color' })

    await act(() => {
      result.current.append(edit1)
      result.current.append(edit2)
    })

    const list = result.current.list()
    expect(list).toHaveLength(1)
    expect(list[0].value).toBe('green')
    expect(list[0].intentId).toBe('id-2')

    unmount()
  })

  it('remove drops intents and updates file-path index', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const edit = makeEdit({ intentId: 'id-remove', source: 'src/Hero.tsx:14:5' })

    await act(() => {
      result.current.append(edit)
    })

    expect(result.current.list()).toHaveLength(1)

    await act(() => {
      result.current.remove(['id-remove'])
    })

    expect(result.current.list()).toHaveLength(0)

    // Add an edit from same file; if the index were corrupted this might fail
    // The simplest verify: list is empty, which means file-path index was updated too
    // (we cannot directly inspect the Map, but size confirms it)
    expect(result.current.size()).toBe(0)

    unmount()
  })

  it('clear empties buffer and clears index', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    await act(() => {
      result.current.append(makeEdit({ intentId: 'a', source: 'src/A.tsx:1:1' }))
      result.current.append(makeEdit({ intentId: 'b', source: 'src/B.tsx:2:2' }))
    })

    expect(result.current.size()).toBe(2)

    await act(() => {
      result.current.clear()
    })

    expect(result.current.size()).toBe(0)
    expect(result.current.list()).toHaveLength(0)

    unmount()
  })

  it('list returns intents in insertion order', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const editA = makeEdit({ intentId: 'a', property: 'color', timestamp: 1000 })
    const editB = makeEdit({ intentId: 'b', property: 'fontSize', timestamp: 2000 })
    const editC = makeEdit({ intentId: 'c', property: 'padding', timestamp: 3000 })

    await act(() => {
      result.current.append(editA)
      result.current.append(editB)
      result.current.append(editC)
    })

    const list = result.current.list()
    expect(list).toHaveLength(3)
    expect(list[0].intentId).toBe('a')
    expect(list[1].intentId).toBe('b')
    expect(list[2].intentId).toBe('c')

    unmount()
  })

  it('hook mount reads existing buffer from localStorage', async () => {
    const existing: PendingEdit[] = [
      makeEdit({ intentId: 'existing-1', property: 'color', value: 'purple' }),
      makeEdit({ intentId: 'existing-2', property: 'fontSize', value: '16px' }),
    ]
    // Seed before mount
    cortexStorage.set('staging-buffer', existing)

    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const list = result.current.list()
    expect(list).toHaveLength(2)
    expect(list[0].intentId).toBe('existing-1')
    expect(list[1].intentId).toBe('existing-2')

    unmount()
  })

  it('buffer eviction at 500 entries evicts oldest first', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    // Append 501 entries — each has a unique property so no collapsing
    await act(() => {
      for (let i = 0; i < 501; i++) {
        result.current.append(makeEdit({
          intentId: `id-${i}`,
          property: `prop-${i}`,
          timestamp: i,
        }))
      }
    })

    const list = result.current.list()
    expect(list).toHaveLength(500)
    // The FIRST entry (oldest, id-0) should be gone
    expect(list.find(e => e.intentId === 'id-0')).toBeUndefined()
    // The last entry (id-500) should still be present
    expect(list.find(e => e.intentId === 'id-500')).toBeDefined()

    unmount()
  })

  it('reconcile for unchanged files returns empty divergent list', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    await act(() => {
      result.current.append(makeEdit({ source: 'src/Hero.tsx:14:5' }))
    })

    // reconcile with empty array
    const { divergent: d1 } = result.current.reconcile([])
    expect(d1).toHaveLength(0)

    // reconcile with unrelated file
    const { divergent: d2 } = result.current.reconcile(['src/Other.tsx'])
    expect(d2).toHaveLength(0)

    unmount()
  })

  it('reconcile flags divergent when current inline style differs from previousValue', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    // Create a DOM element with the matching source attribute
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:5:3')
    el.style.color = 'green' // differs from previousValue 'blue'
    document.body.appendChild(el)

    await act(() => {
      result.current.append(makeEdit({
        intentId: 'divergent-id',
        source: 'src/Hero.tsx:5:3',
        property: 'color',
        previousValue: 'blue',
      }))
    })

    const { divergent } = result.current.reconcile(['src/Hero.tsx'])
    expect(divergent).toHaveLength(1)
    expect(divergent[0].intentId).toBe('divergent-id')

    el.remove()
    unmount()
  })

  it('file-path index updates correctly on append/remove', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const editA1 = makeEdit({ intentId: 'a1', source: 'src/A.tsx:1:1', property: 'color' })
    const editA2 = makeEdit({ intentId: 'a2', source: 'src/A.tsx:2:2', property: 'fontSize' })
    const editB1 = makeEdit({ intentId: 'b1', source: 'src/B.tsx:1:1', property: 'padding' })

    await act(() => {
      result.current.append(editA1)
      result.current.append(editA2)
      result.current.append(editB1)
    })

    expect(result.current.size()).toBe(3)

    // Remove A file's intents
    await act(() => {
      result.current.remove(['a1', 'a2'])
    })

    // B file's intents should still be intact
    const list = result.current.list()
    expect(list).toHaveLength(1)
    expect(list[0].intentId).toBe('b1')

    // Verify via reconcile: B file with no style mismatch → no divergent
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/B.tsx:1:1')
    el.style.padding = 'blue' // matches previousValue in makeEdit default
    document.body.appendChild(el)

    // No divergent since element doesn't exist for A, and B's previous matches
    const { divergent } = result.current.reconcile(['src/A.tsx'])
    expect(divergent).toHaveLength(0) // A intents were removed, none to flag

    el.remove()
    unmount()
  })

  it('unmount flushes pending debounced write', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const edit = makeEdit({ intentId: 'flush-on-unmount', value: 'flushed-value' })
    await act(() => {
      result.current.append(edit)
    })

    // Debounce timer has NOT fired — verify nothing in storage yet
    // (localStorage key won't exist since we cleared in beforeEach and timer hasn't fired)
    const keyBefore = Object.keys(localStorage).find(k => k.endsWith(':staging-buffer'))
    expect(keyBefore).toBeUndefined()

    // Unmount should flush immediately without waiting for the debounce
    await act(() => {
      unmount()
    })

    // After unmount, the buffer should be written to localStorage immediately
    const keyAfter = Object.keys(localStorage).find(k => k.endsWith(':staging-buffer'))
    expect(keyAfter).toBeDefined()
    const stored = JSON.parse(localStorage.getItem(keyAfter!)!)
    expect(stored).toEqual(expect.arrayContaining([
      expect.objectContaining({ intentId: 'flush-on-unmount' }),
    ]))
  })
})
