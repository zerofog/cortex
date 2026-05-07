import { afterEach, it, expect } from 'vitest'
import { detectSharedSource } from '../../src/browser/shared-source-detector.js'

afterEach(() => {
  // Remove all test elements
  for (const child of Array.from(document.body.children)) {
    child.remove()
  }
})

function el(source?: string): HTMLElement {
  const div = document.createElement('div')
  if (source) div.setAttribute('data-cortex-source', source)
  document.body.appendChild(div)
  return div
}

it('returns null when element has no data-cortex-source', () => {
  const target = el()
  expect(detectSharedSource(target)).toBeNull()
})

it('returns null when only 1 element has the source', () => {
  const target = el('src/Card.tsx:42')
  expect(detectSharedSource(target)).toBeNull()
})

it('returns SharedSourceInfo with correct count and elements when 2 elements share a source', () => {
  const a = el('src/Card.tsx:42')
  const b = el('src/Card.tsx:42')
  const result = detectSharedSource(a)
  expect(result).not.toBeNull()
  expect(result!.source).toBe('src/Card.tsx:42')
  expect(result!.count).toBe(2)
  expect(result!.elements).toContain(a)
  expect(result!.elements).toContain(b)
  expect(result!.elements).toHaveLength(2)
})

it('returns count: 3 when 3 elements share a source', () => {
  const a = el('src/Card.tsx:42')
  const b = el('src/Card.tsx:42')
  const c = el('src/Card.tsx:42')
  const result = detectSharedSource(a)
  expect(result).not.toBeNull()
  expect(result!.count).toBe(3)
  expect(result!.elements).toEqual(expect.arrayContaining([a, b, c]))
  expect(result!.elements).toHaveLength(3)
})

it('does not return matches for a different source value', () => {
  // Two different source values — must not cross-contaminate.
  const target = el('src/Card.tsx:42')
  el('src/Hero.tsx:10')
  el('src/Hero.tsx:10')
  // Card.tsx:42 appears only once — should return null
  expect(detectSharedSource(target)).toBeNull()
})

it.skip('handles shadow-hosted siblings (real CSSOM)', () => {
  // TODO: happy-dom does not expose open shadow roots in querySelectorAll
  // in the same way a real browser does. The deepQuerySelectorAll fallback
  // path (when getRootNode() instanceof ShadowRoot) cannot be verified here
  // without real CSSOM. Per cortex CLAUDE.md test anti-pattern 3, this is
  // left as it.skip rather than writing a test that always passes regardless
  // of implementation.
})
