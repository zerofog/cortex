import { describe, it, expect, afterEach } from 'vitest'
import { hmrFilesAffectElement } from '../../src/browser/selection-metadata.js'

describe('hmrFilesAffectElement', () => {
  const orphans: HTMLElement[] = []

  afterEach(() => {
    for (const el of orphans) el.remove()
    orphans.length = 0
  })

  function build(ancestrySources: (string | null)[]): HTMLElement {
    // Build a nested ancestor chain from outer→inner, attach sources at each
    // level per the input array (null = no source attribute at that level).
    // Returns the innermost element.
    let parent: HTMLElement | null = null
    let innermost: HTMLElement | null = null
    for (const src of ancestrySources) {
      const el = document.createElement('div')
      if (src) el.setAttribute('data-cortex-source', src)
      if (parent) {
        parent.appendChild(el)
      } else {
        document.body.appendChild(el)
        orphans.push(el)
      }
      parent = el
      innermost = el
    }
    return innermost!
  }

  it('returns false for an empty files list on an element with no ancestors', () => {
    const el = build(['src/leaf.tsx:5:3'])
    expect(hmrFilesAffectElement([], el)).toBe(false)
  })

  it('returns true when any CSS file is in the list (cascade may affect anything)', () => {
    const el = build(['src/leaf.tsx:5:3'])
    expect(hmrFilesAffectElement(['src/app.css'], el)).toBe(true)
    expect(hmrFilesAffectElement(['styles/theme.scss'], el)).toBe(true)
    expect(hmrFilesAffectElement(['styles/reset.less'], el)).toBe(true)
    expect(hmrFilesAffectElement(['src/foo.module.css'], el)).toBe(true)
  })

  it('returns true when the element\'s own source file is in the list', () => {
    const el = build(['src/leaf.tsx:5:3'])
    expect(hmrFilesAffectElement(['src/leaf.tsx'], el)).toBe(true)
  })

  it('returns true when an ancestor\'s source file is in the list (within default depth)', () => {
    // 3-deep chain: outer (parent.tsx) → middle (middle.tsx) → inner (leaf.tsx)
    const inner = build(['src/parent.tsx:1:1', 'src/middle.tsx:2:2', 'src/leaf.tsx:3:3'])
    expect(hmrFilesAffectElement(['src/parent.tsx'], inner)).toBe(true)
    expect(hmrFilesAffectElement(['src/middle.tsx'], inner)).toBe(true)
  })

  it('returns false when only a sibling file is in the list (not ancestor)', () => {
    const el = build(['src/leaf.tsx:5:3'])
    expect(hmrFilesAffectElement(['src/other.tsx', 'src/unrelated.tsx'], el)).toBe(false)
  })

  it('caps ancestor walk at the provided maxDepth', () => {
    // Build a 25-deep chain. The outermost has a source, the innermost is
    // the target. Walk depth of 20 misses the outermost (index 0 in ancestry,
    // depth 24 from the target).
    const sources: string[] = []
    for (let i = 0; i < 25; i++) sources.push(`src/level-${i}.tsx:1:1`)
    const inner = build(sources)
    // With depth 20, the outermost source (level-0) is unreachable (at depth 24)
    expect(hmrFilesAffectElement(['src/level-0.tsx'], inner, 20)).toBe(false)
    // A source within depth 20 is found (level-5 is depth 19 from inner)
    expect(hmrFilesAffectElement(['src/level-5.tsx'], inner, 20)).toBe(true)
    // With unlimited depth, the outermost is found
    expect(hmrFilesAffectElement(['src/level-0.tsx'], inner, 100)).toBe(true)
  })

  it('returns true on any-match when multiple files are in the list', () => {
    const el = build(['src/leaf.tsx:5:3'])
    // One match among many unrelated entries still returns true
    expect(hmrFilesAffectElement(
      ['src/a.tsx', 'src/b.tsx', 'src/leaf.tsx', 'src/c.tsx'],
      el,
    )).toBe(true)
  })

  it('skips ancestors with no data-cortex-source attribute', () => {
    // middle has no source, leaf does. Walking up should skip middle and
    // examine grandparent which also has a source.
    const inner = build(['src/root.tsx:1:1', null, 'src/leaf.tsx:3:3'])
    expect(hmrFilesAffectElement(['src/root.tsx'], inner)).toBe(true)
  })

  it('returns false when the element has no source and no ancestor source matches', () => {
    const el = build([null, null, null])
    expect(hmrFilesAffectElement(['src/unrelated.tsx'], el)).toBe(false)
  })
})
