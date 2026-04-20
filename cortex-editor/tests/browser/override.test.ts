import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CSSOverrideManager } from '../../src/browser/override.js'

describe('CSSOverrideManager', () => {
  let manager: CSSOverrideManager
  const originalRAF = window.requestAnimationFrame
  const originalCAF = window.cancelAnimationFrame

  beforeEach(() => {
    // Make RAF synchronous so existing set() tests work unchanged
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now())
      return 0
    }) as typeof requestAnimationFrame
    // Clean up any leftover elements from previous tests — sources are shared
    // across the suite (e.g. 'a:1:1') and a leftover target would poison the
    // next test's querySelector for `[data-cortex-source=...]`.
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    document.querySelectorAll('[data-cortex-source]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
    // Belt-and-suspenders cleanup for test-created elements.
    document.querySelectorAll('[data-cortex-source]').forEach(el => el.remove())
  })

  it('creates a <style data-cortex-override> element in document.head', () => {
    const styleEl = document.head.querySelector('[data-cortex-override]')
    expect(styleEl).toBeInstanceOf(HTMLStyleElement)
  })

  it('set() generates a rule with !important', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // CSS.escape escapes dots and colons: Hero\.tsx\:5\:3
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"] { color: red !important; }',
    )
  })

  it('multiple properties for the same source combine into one rule', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'font-size', '16px')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"] { color: red !important; font-size: 16px !important; }',
    )
  })

  it('multiple sources produce separate rules', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Nav.tsx:10:1', 'margin', '0')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    const rules = styleEl.textContent!.split('\n')
    expect(rules).toHaveLength(2)
    expect(rules[0]).toContain('Hero\\.tsx\\:5\\:3')
    expect(rules[1]).toContain('Nav\\.tsx\\:10\\:1')
  })

  it('remove(source, prop) removes a single property', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'font-size', '16px')
    manager.remove('Hero.tsx:5:3', 'color')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"] { font-size: 16px !important; }',
    )
  })

  it('remove(source) removes all overrides for that source', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'font-size', '16px')
    manager.set('Nav.tsx:10:1', 'margin', '0')
    manager.remove('Hero.tsx:5:3')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Nav\\.tsx\\:10\\:1"] { margin: 0 !important; }',
    )
  })

  it('remove() single prop cleans up empty source entry', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.remove('Hero.tsx:5:3', 'color')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('clearAll() empties the stylesheet', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Nav.tsx:10:1', 'margin', '0')
    manager.clearAll()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('dispose() removes the <style> element from the DOM', () => {
    manager.dispose()
    const styleEl = document.head.querySelector('[data-cortex-override]')
    expect(styleEl).toBeNull()
  })

  it('set() overwrites existing value for same property', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Hero.tsx:5:3', 'color', 'blue')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"] { color: blue !important; }',
    )
  })

  // Fix 2: CSS injection — source escaping via CSS.escape()
  it.each([
    ['injection payload', 'file"]{}body{display:none}[x="', 'body{display:none}'],
    ['double quotes', 'Hero"evil.tsx:5:3', '[data-cortex-source="Hero"'],
    ['closing brackets', 'file]:5:3', undefined],
  ] as const)('escapes %s in source via CSS.escape()', (_label, source, forbidden) => {
    manager.set(source, 'color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red !important')
    if (forbidden) expect(styleEl.textContent).not.toContain(forbidden)
  })

  // Fix 2: CSS injection — property validation
  it('rejects invalid property names with special characters', () => {
    manager.set('Hero.tsx:5:3', 'color;} body { display', 'none')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('rejects property names with braces', () => {
    manager.set('Hero.tsx:5:3', 'color}', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('accepts valid CSS custom properties', () => {
    manager.set('Hero.tsx:5:3', '--my-color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('--my-color: red !important')
  })

  it('accepts hyphenated properties like font-size', () => {
    manager.set('Hero.tsx:5:3', 'font-size', '16px')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('font-size: 16px !important')
  })

  // Fix 7: CSS value injection
  it('rejects value containing }', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red } body { display:none')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('rejects value containing ;', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red; background: url(evil)')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('rejects value containing {', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red { font-size: 99px')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  it('rejects CSS comment injection (/* */)', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red /*')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe('')
  })

  // H4: RAF-batched rebuilds
  describe('RAF batching', () => {
    let rafCallbacks: Map<number, FrameRequestCallback>
    let nextId: number

    beforeEach(() => {
      rafCallbacks = new Map()
      nextId = 1
      // Override the synchronous RAF with a capturing version
      window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        const id = nextId++
        rafCallbacks.set(id, cb)
        return id
      }) as typeof requestAnimationFrame
      window.cancelAnimationFrame = ((id: number) => {
        rafCallbacks.delete(id)
      }) as typeof cancelAnimationFrame
    })

    // afterEach in outer describe restores the original RAF

    function flushRAF() {
      const cbs = Array.from(rafCallbacks.values())
      rafCallbacks.clear()
      cbs.forEach(cb => cb(performance.now()))
    }

    it('coalesces multiple set() calls into a single rebuild', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.set('a:1:1', 'font-size', '16px')
      manager.set('b:1:1', 'margin', '0')

      // Before RAF fires, stylesheet should be empty (no synchronous rebuild)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')

      // Flush RAF — single rebuild
      flushRAF()
      expect(styleEl.textContent).toContain('color: red !important')
      expect(styleEl.textContent).toContain('font-size: 16px !important')
      expect(styleEl.textContent).toContain('margin: 0 !important')
    })

    it('remove() rebuilds synchronously to prevent flicker', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.set('a:1:1', 'font-size', '16px')
      flushRAF()

      manager.remove('a:1:1', 'font-size')
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe(
        '[data-cortex-source="a\\:1\\:1"] { color: red !important; }',
      )
    })

    it('clearAll() rebuilds synchronously', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()

      manager.clearAll()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('flush() forces pending rebuild synchronously', () => {
      manager.set('a:1:1', 'color', 'red')

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')

      manager.flush()
      expect(styleEl.textContent).toContain('color: red !important')
      // RAF callback should have been cancelled
      expect(rafCallbacks.size).toBe(0)
    })

    it('flush() is a no-op when no rebuild is pending', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      const before = styleEl.textContent

      manager.flush()
      expect(styleEl.textContent).toBe(before)
    })

    it('remove() cancels pending RAF so stale rebuild does not fire', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()

      manager.set('a:1:1', 'font-size', '16px')
      expect(rafCallbacks.size).toBe(1)

      // remove() cancels the pending RAF and rebuilds synchronously
      manager.remove('a:1:1', 'font-size')
      expect(rafCallbacks.size).toBe(0)

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      const afterRemove = styleEl.textContent
      flushRAF()
      expect(styleEl.textContent).toBe(afterRemove)
    })

    it('clearAll() clears state overrides too', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.setStateOverrides('a:1:1', new Map([['background', 'blue']]))
      flushRAF()

      manager.clearAll()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('setStateOverrides with all-invalid entries clears previous entry for that source', () => {
      manager.setStateOverrides('a:1:1', new Map([['color', 'red']]))
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')

      // All entries invalid — should delete the previous state override
      manager.setStateOverrides('a:1:1', new Map([['invalid;prop', 'value']]))
      expect(styleEl.textContent).toBe('')
    })

    it('setStateOverrides rebuilds synchronously', () => {
      manager.setStateOverrides('a:1:1', new Map([['color', 'red']]))
      // Should be visible immediately (not deferred to RAF)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')
      // No pending RAF
      expect(rafCallbacks.size).toBe(0)
    })

    it('clearAll() cancels pending RAF so stale rebuild does not fire', () => {
      manager.set('a:1:1', 'color', 'red')
      expect(rafCallbacks.size).toBe(1)

      // clearAll() should cancel the pending RAF
      manager.clearAll()
      expect(rafCallbacks.size).toBe(0)

      // Flushing RAF should be a no-op
      flushRAF()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('dispose() cancels pending RAF', () => {
      manager.set('a:1:1', 'color', 'red')
      // RAF is pending but not fired
      manager.dispose()

      // Flush any remaining RAF callbacks — should not throw
      flushRAF()

      const styleEl = document.head.querySelector('[data-cortex-override]')
      expect(styleEl).toBeNull()
    })
  })

  it('set() accepts calc() expressions with + and *', () => {
    manager.set('a:1:1', 'width', 'calc(100% - 20px)')
    manager.set('b:1:1', 'height', 'calc(50% + 10px)')
    manager.set('c:1:1', 'font-size', 'calc(1rem * 1.5)')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('width: calc(100% - 20px) !important')
    expect(styleEl.textContent).toContain('height: calc(50% + 10px) !important')
    expect(styleEl.textContent).toContain('font-size: calc(1rem * 1.5) !important')
  })

  it('accepts normal CSS values', () => {
    manager.set('a:1:1', 'color', 'red')
    manager.set('b:1:1', 'font-size', '16px')
    manager.set('c:1:1', 'color', 'rgb(0,0,0)')
    manager.set('d:1:1', 'border', '1px solid black')
    manager.set('e:1:1', 'margin', '0')
    manager.set('f:1:1', 'padding', '10%')
    manager.set('g:1:1', 'color', '#ff0000')
    manager.flush()
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('color: red !important')
    expect(styleEl.textContent).toContain('font-size: 16px !important')
    expect(styleEl.textContent).toContain('color: rgb(0,0,0) !important')
    expect(styleEl.textContent).toContain('border: 1px solid black !important')
    expect(styleEl.textContent).toContain('margin: 0 !important')
    expect(styleEl.textContent).toContain('padding: 10% !important')
    expect(styleEl.textContent).toContain('color: #ff0000 !important')
  })

  describe('state overrides', () => {
    it('setStateOverrides generates a rule merged with user overrides', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.flush()
      manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // Both declarations in one rule — user edit 'color' + state override 'background'
      expect(styleEl.textContent).toContain('color: red !important')
      expect(styleEl.textContent).toContain('background: blue !important')
    })

    it('user edits win over state overrides for same property', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.setStateOverrides('Hero.tsx:5:3', new Map([['color', 'blue']]))
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red !important')
      expect(styleEl.textContent).not.toContain('color: blue')
    })

    it('clearStateOverrides removes state overrides but keeps user edits', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
      manager.flush()
      manager.clearStateOverrides()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red !important')
      expect(styleEl.textContent).not.toContain('background')
    })

    it('clearStateOverrides calls rebuild synchronously', () => {
      manager.setStateOverrides('Hero.tsx:5:3', new Map([['color', 'blue']]))
      manager.flush()
      // clearStateOverrides should update the style tag immediately (not via RAF)
      manager.clearStateOverrides()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('setStateOverrides validates property names and values', () => {
      manager.setStateOverrides('Hero.tsx:5:3', new Map([
        ['color', 'red'],
        ['invalid;prop', 'value'],          // invalid property
        ['background', 'url(http://evil)'],  // url() rejected
      ]))
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')
      expect(styleEl.textContent).not.toContain('invalid')
      expect(styleEl.textContent).not.toContain('url')
    })

    it('state overrides only for element (not pseudo) selectors', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.setStateOverrides('Hero.tsx:5:3', new Map([['background', 'blue']]))
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // State override only merges with element rule, not pseudo rule
      const rules = styleEl.textContent!
      expect(rules).toContain('background: blue')
      // Pseudo rule should NOT have background
      const pseudoRuleMatch = rules.match(/::before\s*\{[^}]+\}/)
      expect(pseudoRuleMatch?.[0]).not.toContain('background')
    })
  })

  describe('pseudo-element selectors', () => {
    it('set with pseudo generates a pseudo-element selector', () => {
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe(
        '[data-cortex-source="Hero\\.tsx\\:5\\:3"]::before { width: 100px !important; }',
      )
    })

    it('set with ::after generates correct selector', () => {
      manager.set('Hero.tsx:5:3', 'content', '"hello"', '::after')
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('::after')
      expect(styleEl.textContent).toContain('content: "hello" !important')
    })

    it('element and pseudo overrides for same source produce separate rules', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      const text = styleEl.textContent!
      expect(text.split('\n').length).toBe(2) // two separate rules
      expect(text).toContain('color: red')
      expect(text).toContain('::before')
    })

    it('remove with pseudo only removes the pseudo override', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.flush()
      manager.remove('Hero.tsx:5:3', 'width', '::before')
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')
      expect(styleEl.textContent).not.toContain('::before')
    })

    it('remove without property clears all overrides for source+pseudo', () => {
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.set('Hero.tsx:5:3', 'height', '50px', '::before')
      manager.flush()
      manager.remove('Hero.tsx:5:3', undefined, '::before')
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })
  })

  describe('HMR verified override clearing', () => {
    it('trackPendingEdit + handleHMRVerified(match=true) removes the override', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding', '24px')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('handleHMRVerified(match=false) keeps the override', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding', '24px')
      manager.handleHMRVerified('edit-1', false)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('padding')
    })

    it('handleHMRVerified with unknown editId is a no-op', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.handleHMRVerified('unknown-id', true)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('padding')
    })

    it('clearAll also clears pending edits', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding', '24px')
      manager.clearAll()
      manager.handleHMRVerified('edit-1', true)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('pseudo override cleared by handleHMRVerified with matching pseudo', () => {
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'width', '100px', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('pseudo verification does not remove element-level override', () => {
      manager.set('Hero.tsx:5:3', 'width', '200px')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'width', '100px', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('width: 200px')
      expect(styleEl.textContent).not.toContain('::before')
    })

    it('element verification does not remove pseudo override', () => {
      manager.set('Hero.tsx:5:3', 'width', '200px')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-2', 'Hero.tsx:5:3', 'width', '200px')
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('::before')
      expect(styleEl.textContent).toContain('width: 100px')
    })

    it('trackPendingEdit supersedes prior entry for same source+property', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color')
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      expect(styleEl.textContent).toBe('')
    })

    it('trackPendingEdit does not supersede different property', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.set('a:1:1', 'margin', '0')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'margin', '0')
      manager.handleHMRVerified('edit-1', true)
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('trackPendingEdit supersedes with matching pseudo', () => {
      manager.set('a:1:1', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'width', '100px', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('width')
    })

    it('trackPendingEdit does not supersede different pseudo', () => {
      manager.set('a:1:1', 'width', '100px')
      manager.set('a:1:1', 'width', '200px', '::before')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'width', '100px')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'width', '200px', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('dispose clears pending edits', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding', '24px')
      manager.dispose()
      // After dispose, handleHMRVerified should be a no-op (not throw)
      expect(() => manager.handleHMRVerified('edit-1', true)).not.toThrow()
    })

    it('stale pending edits are evicted after TTL', () => {
      vi.useFakeTimers()
      try {
        manager.set('a:1:1', 'color', 'red')
        manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
        vi.advanceTimersByTime(36_000)
        // Trigger eviction via a new trackPendingEdit
        manager.trackPendingEdit('edit-2', 'a:1:1', 'margin', 'test-value')
        // edit-1 should have been evicted — handleHMRVerified is a no-op
        manager.handleHMRVerified('edit-1', true)
        const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
        expect(styleEl.textContent).toContain('color')
      } finally {
        vi.useRealTimers()
      }
    })

    it('pending edits within TTL survive eviction', () => {
      vi.useFakeTimers()
      try {
        manager.set('a:1:1', 'color', 'red')
        manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
        vi.advanceTimersByTime(20_000)
        // Trigger eviction — edit-1 is within TTL, should survive
        manager.trackPendingEdit('edit-2', 'a:1:1', 'margin', 'test-value')
        manager.handleHMRVerified('edit-1', true)
        manager.onHMRApplied()
        // Drain the double-rAF verification schedule — fake timers intercept RAF.
        vi.runAllTimers()
        manager.flush()
        const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
        expect(styleEl.textContent).not.toContain('color')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('get()', () => {
    it('returns current override value', () => {
      manager.set('Hero.tsx:5:3', 'color', 'red')
      expect(manager.get('Hero.tsx:5:3', 'color')).toBe('red')
    })

    it('returns undefined for non-existent override', () => {
      expect(manager.get('Hero.tsx:5:3', 'color')).toBeUndefined()
    })

    it('returns value for pseudo-element override', () => {
      manager.set('Hero.tsx:5:3', 'content', '"hello"', '::before')
      expect(manager.get('Hero.tsx:5:3', 'content', '::before')).toBe('"hello"')
      expect(manager.get('Hero.tsx:5:3', 'content')).toBeUndefined()
    })
  })

  describe('verified override removal', () => {
    let rafCallbacks: Map<number, FrameRequestCallback>
    let nextId: number

    beforeEach(() => {
      rafCallbacks = new Map()
      nextId = 1
      // Capture RAF calls instead of executing them synchronously so each test
      // can advance the double-rAF schedule step-by-step.
      window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        const id = nextId++
        rafCallbacks.set(id, cb)
        return id
      }) as typeof requestAnimationFrame
      window.cancelAnimationFrame = ((id: number) => {
        rafCallbacks.delete(id)
      }) as typeof cancelAnimationFrame
    })

    function flushRAF() {
      const cbs = Array.from(rafCallbacks.values())
      rafCallbacks.clear()
      cbs.forEach(cb => cb(performance.now()))
    }

    it('ordering A: hmr_verified → onHMRApplied, jsx-immediate, inline matches', () => {
      // Element exists with the expected inline value — source landed correctly,
      // override should be removed after the double-rAF verification tick.
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      target.style.color = 'red'
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate') // queued

      manager.onHMRApplied() // drain → scheduleVerifyAndRemove
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red') // still present — awaiting double-rAF

      flushRAF() // first rAF
      expect(styleEl.textContent).toContain('color: red')
      flushRAF() // second rAF — verifyAndRemove runs
      expect(styleEl.textContent).toBe('')

      target.remove()
    })

    it('ordering B: onHMRApplied → hmr_verified (late arrival), schedules immediate verify', () => {
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      target.style.color = 'red'
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')

      // vite:afterUpdate beats hmr_verified — hmrAppliedInCycle flips to true.
      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')

      // Late arrival — schedule verify directly without waiting for another drain.
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      expect(styleEl.textContent).toContain('color: red') // double-rAF pending

      flushRAF()
      flushRAF()
      expect(styleEl.textContent).toBe('')

      target.remove()
    })

    it('ZF0-1235: keeps override and emits divergence when inline never matches within retry window', async () => {
      // Simulates the observed failure mode: source verified by server but the
      // element's inline style stays at the OLD value (e.g., React Fast Refresh
      // skipped this component). After the retry window elapses without a match,
      // the override is preserved and a divergence event fires — no silent revert.
      // Shrink the retry window so the test is fast + deterministic.
      const originalWindow = CSSOverrideManager.VERIFY_RETRY_WINDOW_MS
      const originalPoll = CSSOverrideManager.VERIFY_POLL_INTERVAL_MS
      CSSOverrideManager.VERIFY_RETRY_WINDOW_MS = 60
      CSSOverrideManager.VERIFY_POLL_INTERVAL_MS = 20
      try {
        const { onDivergence } = await import('../../src/browser/override-bus.js')
        const divergences: Array<{ source: string; property: string; expected: string; actual: string }> = []
        const unsub = onDivergence(d => divergences.push({ source: d.source, property: d.property, expected: d.expected, actual: d.actual }))

        const target = document.createElement('div')
        target.setAttribute('data-cortex-source', 'a:1:1')
        target.style.color = 'green'
        document.body.appendChild(target)

        manager.set('a:1:1', 'color', 'red')
        flushRAF()
        manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
        manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
        manager.onHMRApplied()

        flushRAF()
        flushRAF() // double-rAF — first verify fails, retry observer arms

        const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
        expect(styleEl.textContent).toContain('color: red')
        expect(divergences).toHaveLength(0) // not emitted yet — retry window active

        // Wait for the shrunk retry window to elapse.
        await new Promise(resolve => setTimeout(resolve, 100))

        expect(styleEl.textContent).toContain('color: red') // still preserved
        expect(divergences).toHaveLength(1)
        expect(divergences[0]).toMatchObject({ source: 'a:1:1', property: 'color', expected: 'red', actual: 'green' })

        unsub()
        target.remove()
      } finally {
        CSSOverrideManager.VERIFY_RETRY_WINDOW_MS = originalWindow
        CSSOverrideManager.VERIFY_POLL_INTERVAL_MS = originalPoll
      }
    })

    it('ZF0-1235 happy case: retry mutation observer catches slow React and cleanly removes', async () => {
      // React Fast Refresh is sometimes delayed — the retry observer re-verifies
      // when the element's style attribute finally changes. If the new inline
      // style matches expected, the override is removed cleanly (no divergence).
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      target.style.color = 'green' // old value — React hasn't caught up yet
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.onHMRApplied()

      flushRAF()
      flushRAF() // first verify fails → retry armed

      // Simulate React catching up and committing the new inline style.
      target.style.color = 'red'

      await new Promise(resolve => setTimeout(resolve, 20))

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('') // override removed cleanly

      target.remove()
    })

    it('superseded edit: newer override is preserved when older verified edit arrives', () => {
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')

      // User edits again before the first verify completes.
      manager.set('a:1:1', 'color', 'blue')
      flushRAF()
      manager.trackPendingEdit('edit-2', 'a:1:1', 'color', 'blue')

      // Older edit's verified signal — should be filtered out by the stale guard.
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.onHMRApplied()
      flushRAF()
      flushRAF()

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: blue')

      target.remove()
    })

    it('non-jsx kind reads computed style via brief detach', () => {
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')

      // Mock getComputedStyle to report 'red' once the override <style> is detached —
      // simulates Tailwind class swap producing the new value.
      const original = window.getComputedStyle
      window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        if (element === target) {
          return { getPropertyValue: (prop: string) => prop === 'color' ? 'red' : '' } as CSSStyleDeclaration
        }
        return original.call(window, element, pseudo)
      }) as typeof window.getComputedStyle

      manager.handleHMRVerified('edit-1', true, 'immediate') // classOp kind
      manager.onHMRApplied()
      flushRAF()
      flushRAF()
      window.getComputedStyle = original

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')

      target.remove()
    })

    it('non-matching verify — element gone — removes override (nothing to preview)', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.onHMRApplied()
      flushRAF()
      flushRAF() // element never existed — verify drops override

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('pendingClearAll takes precedence over pending verifications', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.queueClearAll()

      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('match with mismatched=false verified signal is a no-op', () => {
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', false, 'jsx-immediate')
      manager.onHMRApplied()
      flushRAF()
      flushRAF()

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red') // untouched — match=false means no verification

      target.remove()
    })

    it('emits divergence when server reports match=false (ZF0-1126 precursor)', async () => {
      // The server's HMR verifier sends match=false on TTL eviction — "the
      // file was written but no HMR landed within 30s." Without surfacing this
      // the user would see a stale preview with no error signal.
      const { onDivergence } = await import('../../src/browser/override-bus.js')
      const divergences: Array<{ source: string; property: string }> = []
      const unsub = onDivergence(d => divergences.push({ source: d.source, property: d.property }))

      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', false, 'jsx-immediate')

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red') // override preserved
      expect(divergences).toHaveLength(1)
      expect(divergences[0]).toMatchObject({ source: 'a:1:1', property: 'color' })

      unsub()
    })

    it('canonicalizes CSS values before declaring divergence (hex vs rgb)', () => {
      // The browser canonicalizes `#fff` to `rgb(255, 255, 255)` when it lands
      // as a computed style. Without canonical comparison, every color edit
      // would emit a bogus divergence card.
      const target = document.createElement('div')
      target.setAttribute('data-cortex-source', 'a:1:1')
      target.style.color = '#ffffff' // browser will report this via computed style as rgb(...)
      document.body.appendChild(target)

      manager.set('a:1:1', 'color', '#ffffff')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', '#ffffff')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.onHMRApplied()
      flushRAF()
      flushRAF()

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // Override should be removed — canonicalized hex and rgb are equal.
      expect(styleEl.textContent).toBe('')

      target.remove()
    })

    it('hmrAppliedInCycle resets between edit cycles', () => {
      // Both targets start with the expected post-edit inline value so each
      // verify matches on the first attempt (no retry window delays the test).
      const targetA = document.createElement('div')
      targetA.setAttribute('data-cortex-source', 'a:1:1')
      targetA.style.color = 'red'
      document.body.appendChild(targetA)
      const targetB = document.createElement('div')
      targetB.setAttribute('data-cortex-source', 'b:1:1')
      targetB.style.margin = '8px'
      document.body.appendChild(targetB)

      // Cycle 1: complete lifecycle.
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color', 'red')
      manager.handleHMRVerified('edit-1', true, 'jsx-immediate')
      manager.onHMRApplied() // hmrAppliedInCycle becomes true
      flushRAF()
      flushRAF()

      // Cycle 2: new edit. trackPendingEdit must reset hmrAppliedInCycle so
      // cycle 2's handleHMRVerified queues (not schedules immediately).
      manager.set('b:1:1', 'margin', '8px')
      flushRAF()
      manager.trackPendingEdit('edit-2', 'b:1:1', 'margin', '8px')
      manager.handleHMRVerified('edit-2', true, 'jsx-immediate')

      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('margin: 8px') // queued — awaiting drain

      manager.onHMRApplied()
      flushRAF()
      flushRAF()
      expect(styleEl.textContent).toBe('')

      targetA.remove()
      targetB.remove()
    })
  })
})
