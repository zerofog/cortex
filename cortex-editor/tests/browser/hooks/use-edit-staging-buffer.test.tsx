import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { useEditStagingBuffer, type PendingEdit } from '../../../src/browser/hooks/useEditStagingBuffer.js'
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

  it('remove drops intents from the buffer', async () => {
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
    expect(result.current.size()).toBe(0)

    unmount()
  })

  it('clear empties the buffer', async () => {
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

  it('cross-file isolation — B intents reconcile after A is cleared', async () => {
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const editA1 = makeEdit({
      intentId: 'a1',
      source: 'src/A.tsx:1:1',
      property: 'color',
      previousValue: 'red',
    })
    const editA2 = makeEdit({
      intentId: 'a2',
      source: 'src/A.tsx:2:2',
      property: 'font-size',
      previousValue: '12px',
    })
    const editB1 = makeEdit({
      intentId: 'b1',
      source: 'src/B.tsx:1:1',
      property: 'color',
      previousValue: 'green',
    })

    await act(() => {
      result.current.append(editA1)
      result.current.append(editA2)
      result.current.append(editB1)
    })

    expect(result.current.size()).toBe(3)

    // Remove A file's intents only.
    await act(() => {
      result.current.remove(['a1', 'a2'])
    })

    // B's intent must survive.
    const remaining = result.current.list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].intentId).toBe('b1')

    // (1) Reconcile against B with a divergent inline style — must flag b1.
    // Proves B's bookkeeping survived A's removal: if B had been incorrectly
    // dropped along with A, reconcile would return divergent: [].
    const elB = document.createElement('div')
    elB.setAttribute('data-cortex-source', 'src/B.tsx:1:1')
    elB.style.setProperty('color', 'blue') // differs from previousValue 'green'
    document.body.appendChild(elB)

    const { divergent: divergentB } = result.current.reconcile(['src/B.tsx'])
    expect(divergentB).toHaveLength(1)
    expect(divergentB[0].intentId).toBe('b1')

    // (2) Reconcile against A — must return empty. Both A intents are gone,
    // so reconcile has nothing to evaluate even though A elements aren't in DOM.
    // (If stale IDs lingered, reconcile would still iterate them and either
    // crash on the missing element or push them as divergent.)
    const { divergent: divergentA } = result.current.reconcile(['src/A.tsx'])
    expect(divergentA).toHaveLength(0)

    elB.remove()
    unmount()
  })

  it('reconcile uses readSourceValue callback when provided (bypasses override layer)', async () => {
    // Production HMR wiring passes a reader that detaches the cortex override
    // <style> tag before reading getComputedStyle, so the buffer sees the
    // SOURCE value rather than cortex's own !important override. This test
    // proves the callback path: a custom reader returns 'red' regardless of
    // the actual DOM state, and reconcile must compare against THAT — not
    // against any inline/computed value.
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:5:3')
    // Inline style says 'green' — the default reader would see this. The
    // injected reader IGNORES it and returns 'red' instead, which matches
    // previousValue, so reconcile must NOT flag this entry as divergent.
    el.style.color = 'green'
    document.body.appendChild(el)

    await act(() => {
      result.current.append(makeEdit({
        intentId: 'reader-id',
        source: 'src/Hero.tsx:5:3',
        property: 'color',
        previousValue: 'red',
      }))
    })

    const customReader = vi.fn((_el: Element, _prop: string, _pseudo: string | null) => 'red')
    const { divergent } = result.current.reconcile(['src/Hero.tsx'], customReader)
    expect(divergent).toHaveLength(0)
    expect(customReader).toHaveBeenCalledTimes(1)
    expect(customReader).toHaveBeenCalledWith(el, 'color', null)

    // Sanity: with a reader that returns a divergent value, the entry IS flagged.
    const divergingReader = vi.fn(() => 'purple')
    const { divergent: d2 } = result.current.reconcile(['src/Hero.tsx'], divergingReader)
    expect(d2).toHaveLength(1)
    expect(d2[0].intentId).toBe('reader-id')

    el.remove()
    unmount()
  })

  it('reconcile passes pseudo to readSourceValue and skips inline-style for pseudo edits', async () => {
    // Pseudo-elements have no inline style, so the default reader must skip
    // the el.style check and go straight to getComputedStyle(el, pseudo).
    // We assert via the readSourceValue callback signature: the pseudo arg
    // must propagate to the reader.
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:9:9')
    document.body.appendChild(el)

    await act(() => {
      result.current.append(makeEdit({
        intentId: 'pseudo-id',
        source: 'src/Hero.tsx:9:9',
        property: 'content',
        previousValue: '"x"',
        pseudo: '::before',
      }))
    })

    const reader = vi.fn((_el: Element, _prop: string, _pseudo: string | null) => '"x"')
    const { divergent } = result.current.reconcile(['src/Hero.tsx'], reader)
    expect(divergent).toHaveLength(0)
    expect(reader).toHaveBeenCalledWith(el, 'content', '::before')

    el.remove()
    unmount()
  })

  it('reconcile escapes data-cortex-source to support Next.js dynamic routes', async () => {
    // src/app/[id]/page.tsx is a valid Next.js path — the `[` and `]` are
    // attribute-selector metacharacters that throw SyntaxError without
    // CSS.escape. This test would crash without the escape.
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    const dynamicSource = 'src/app/[id]/page.tsx:14:5'
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', dynamicSource)
    el.style.color = 'orange' // differs from previousValue
    document.body.appendChild(el)

    await act(() => {
      result.current.append(makeEdit({
        intentId: 'dynamic-route-id',
        source: dynamicSource,
        property: 'color',
        previousValue: 'blue',
      }))
    })

    // Must not throw.
    const { divergent } = result.current.reconcile(['src/app/[id]/page.tsx'])
    expect(divergent).toHaveLength(1)
    expect(divergent[0].intentId).toBe('dynamic-route-id')

    el.remove()
    unmount()
  })

  it('mount drops malformed source entries (file:line:col regex)', () => {
    // Seed localStorage with a mix of valid and malformed entries. The
    // validator is array-level: a single bad entry forces the whole array to
    // fall back to []. This test proves the file:line:col guard is wired in.
    const goodEdit = makeEdit({ intentId: 'good', source: 'src/Hero.tsx:14:5' })
    const malformed = { ...makeEdit(), source: 'no-line-no-col' }
    cortexStorage.set('staging-buffer', [goodEdit, malformed])

    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    // Validator rejected the array; buffer initialises empty.
    expect(result.current.list()).toHaveLength(0)

    unmount()
  })

  it('mount drops entries whose source contains a quote (selector-injection guard)', () => {
    // Defense-in-depth alongside CSS.escape: even if escape were ever
    // bypassed, a `"` in source would still be rejected at validator level.
    const goodEdit = makeEdit({ intentId: 'good' })
    const injected = { ...makeEdit(), source: 'src/x".tsx:1:1' }
    cortexStorage.set('staging-buffer', [goodEdit, injected])

    const { result, unmount } = renderHook(() => useEditStagingBuffer())
    expect(result.current.list()).toHaveLength(0)
    unmount()
  })

  it('eviction at 500 entries logs a console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useEditStagingBuffer())

    await act(() => {
      for (let i = 0; i < 501; i++) {
        result.current.append(makeEdit({
          intentId: `evict-id-${i}`,
          property: `prop-${i}`,
          source: `src/Evict.tsx:${i}:${i}`,
        }))
      }
    })

    // Exactly one eviction (501st append).
    const evictionWarns = warnSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('Staging buffer evicted'),
    )
    expect(evictionWarns).toHaveLength(1)
    // Evicted entry's source/property surfaced for downstream UI surfacing.
    expect(evictionWarns[0]).toEqual([
      expect.stringContaining('Staging buffer evicted'),
      'src/Evict.tsx:0:0',
      'prop-0',
    ])

    warnSpy.mockRestore()
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
