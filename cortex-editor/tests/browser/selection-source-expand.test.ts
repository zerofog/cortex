import { describe, it, expect, beforeEach } from 'vitest'
import { expandSharedSource } from '../../src/browser/selection-source-expand.js'

describe('expandSharedSource (ZF0-1195 Follow-up A)', () => {
  beforeEach(() => {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
  })

  it('expands one element to include all DOM nodes with same data-cortex-source', () => {
    const a = document.createElement('div')
    a.setAttribute('data-cortex-source', 'src/App.tsx:15:li')
    const b = document.createElement('div')
    b.setAttribute('data-cortex-source', 'src/App.tsx:15:li')
    const c = document.createElement('div')
    c.setAttribute('data-cortex-source', 'src/App.tsx:15:li')
    document.body.append(a, b, c)
    const result = expandSharedSource([a])
    expect(new Set(result)).toEqual(new Set([a, b, c]))
  })

  it('does NOT expand elements with distinct sources', () => {
    const a = document.createElement('div')
    a.setAttribute('data-cortex-source', 'src/A.tsx:10:button')
    const b = document.createElement('div')
    b.setAttribute('data-cortex-source', 'src/B.tsx:20:button')
    document.body.append(a, b)
    const result = expandSharedSource([a])
    expect(result).toEqual([a])
  })

  it('passes through elements without data-cortex-source unchanged', () => {
    const a = document.createElement('div')
    document.body.append(a)
    const result = expandSharedSource([a])
    expect(result).toEqual([a])
  })

  it('returns empty for empty input', () => {
    expect(expandSharedSource([])).toEqual([])
  })

  it('dedupes when input contains multiple shared-source elements', () => {
    const a = document.createElement('div')
    a.setAttribute('data-cortex-source', 'src/App.tsx:15:li')
    const b = document.createElement('div')
    b.setAttribute('data-cortex-source', 'src/App.tsx:15:li')
    document.body.append(a, b)
    const result = expandSharedSource([a, b])
    expect(new Set(result)).toEqual(new Set([a, b]))
    expect(result.length).toBe(2)
  })

  // TODO: requires real CSSOM — happy-dom doesn't fully implement CSS.escape
  // for quote chars in attribute selectors. Real cortex-editor sources are
  // file paths without quotes; the impl includes the fallback for safety.
  it.skip('handles sources with quote characters via CSS.escape', () => {})

  it('mixes shared-source expansion with distinct-source elements', () => {
    const a1 = document.createElement('div')
    a1.setAttribute('data-cortex-source', 'src/A.tsx:10:row')
    const a2 = document.createElement('div')
    a2.setAttribute('data-cortex-source', 'src/A.tsx:10:row')
    const b = document.createElement('div')
    b.setAttribute('data-cortex-source', 'src/B.tsx:20:button')
    document.body.append(a1, a2, b)
    const result = expandSharedSource([a1, b])
    expect(new Set(result)).toEqual(new Set([a1, a2, b]))
  })
})
