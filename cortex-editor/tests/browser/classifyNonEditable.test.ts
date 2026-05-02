import { describe, it, expect } from 'vitest'
import { isNonEditable } from '../../src/browser/classifyNonEditable.js'

describe('isNonEditable', () => {
  it.each([
    ['script'],
    ['style'],
    ['meta'],
    ['head'],
    ['title'],
    ['link'],
    ['noscript'],
  ])('returns true for non-visual tag: %s', (tag) => {
    const el = document.createElement(tag) as HTMLElement
    expect(isNonEditable(el)).toBe(true)
  })

  it('returns true when neither element nor any ancestor has data-cortex-source', () => {
    const parent = document.createElement('div')
    const child = document.createElement('div')
    parent.appendChild(child)
    expect(isNonEditable(child)).toBe(true)
  })

  it('returns false when element itself has data-cortex-source', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/src/App.tsx:10:5')
    expect(isNonEditable(el)).toBe(false)
  })

  it('returns false when an ancestor has data-cortex-source', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', '/src/App.tsx:5:1')
    const child = document.createElement('span')
    parent.appendChild(child)
    expect(isNonEditable(child)).toBe(false)
  })

  it('returns false for an editable div with annotation', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/src/components/Hero.tsx:20:3')
    expect(isNonEditable(el)).toBe(false)
  })
})
