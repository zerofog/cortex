import { describe, it, expect, afterEach } from 'vitest'
import { isNonEditable } from '../../src/browser/classify-non-editable.js'
import { createEditableDiv } from './helpers.js'

describe('isNonEditable', () => {
  afterEach(() => {
    // Remove all body children appended during tests to avoid DOM pollution
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild)
    }
  })

  it.each([
    ['script'],
    ['style'],
    ['meta'],
    ['head'],
    ['title'],
    ['link'],
    ['noscript'],
  ])('returns true for non-visual tag: %s', (tag) => {
    const el = document.createElement(tag)
    expect(isNonEditable(el)).toBe(true)
  })

  it('returns false for visual elements without data-cortex-source', () => {
    const parent = document.createElement('div')
    const child = document.createElement('div')
    parent.appendChild(child)
    document.body.appendChild(parent)
    expect(isNonEditable(child)).toBe(false)
  })

  it('returns false when element itself has data-cortex-source', () => {
    const el = createEditableDiv('/src/App.tsx:10:5')
    expect(isNonEditable(el)).toBe(false)
  })

  it('returns false when an ancestor has data-cortex-source', () => {
    const parent = createEditableDiv('/src/App.tsx:5:1')
    const child = document.createElement('span')
    parent.appendChild(child)
    expect(isNonEditable(child)).toBe(false)
  })

  it('returns false for an editable div with annotation', () => {
    const el = createEditableDiv('/src/components/Hero.tsx:20:3')
    expect(isNonEditable(el)).toBe(false)
  })
})
