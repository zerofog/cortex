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
    // Clean up any leftover style elements
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
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

  // Fix 2: CSS injection — source escaping
  it('escapes special characters in source via CSS.escape()', () => {
    manager.set('file"]{}body{display:none}[x="', 'color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // CSS.escape should prevent selector breakout
    expect(styleEl.textContent).not.toContain('body{display:none}')
    expect(styleEl.textContent).toContain('color: red !important')
  })

  it('escapes double quotes in source', () => {
    manager.set('Hero"evil.tsx:5:3', 'color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    // The escaped output should not break the attribute selector
    expect(styleEl.textContent).toContain('!important')
    expect(styleEl.textContent).not.toContain('[data-cortex-source="Hero"')
  })

  it('escapes closing brackets in source', () => {
    manager.set('file]:5:3', 'color', 'red')
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toContain('!important')
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
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('handleHMRVerified(match=false) keeps the override', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding')
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
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding')
      manager.clearAll()
      manager.handleHMRVerified('edit-1', true)
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('pseudo override cleared by handleHMRVerified with matching pseudo', () => {
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'width', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('pseudo verification does not remove element-level override', () => {
      manager.set('Hero.tsx:5:3', 'width', '200px')
      manager.set('Hero.tsx:5:3', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'width', '::before')
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
      manager.trackPendingEdit('edit-2', 'Hero.tsx:5:3', 'width')
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('::before')
      expect(styleEl.textContent).toContain('width: 100px')
    })

    it('trackPendingEdit supersedes prior entry for same source+property', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'color')
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
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'margin')
      manager.handleHMRVerified('edit-1', true)
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('trackPendingEdit supersedes with matching pseudo', () => {
      manager.set('a:1:1', 'width', '100px', '::before')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'width', '::before')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'width', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('width')
    })

    it('trackPendingEdit does not supersede different pseudo', () => {
      manager.set('a:1:1', 'width', '100px')
      manager.set('a:1:1', 'width', '200px', '::before')
      manager.trackPendingEdit('edit-1', 'a:1:1', 'width')
      manager.trackPendingEdit('edit-2', 'a:1:1', 'width', '::before')
      manager.handleHMRVerified('edit-1', true)
      manager.handleHMRVerified('edit-2', true)
      manager.onHMRApplied()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('dispose clears pending edits', () => {
      manager.set('Hero.tsx:5:3', 'padding', '24px')
      manager.trackPendingEdit('edit-1', 'Hero.tsx:5:3', 'padding')
      manager.dispose()
      // After dispose, handleHMRVerified should be a no-op (not throw)
      expect(() => manager.handleHMRVerified('edit-1', true)).not.toThrow()
    })

    it('stale pending edits are evicted after TTL', () => {
      vi.useFakeTimers()
      try {
        manager.set('a:1:1', 'color', 'red')
        manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
        vi.advanceTimersByTime(36_000)
        // Trigger eviction via a new trackPendingEdit
        manager.trackPendingEdit('edit-2', 'a:1:1', 'margin')
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
        manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
        vi.advanceTimersByTime(20_000)
        // Trigger eviction — edit-1 is within TTL, should survive
        manager.trackPendingEdit('edit-2', 'a:1:1', 'margin')
        manager.handleHMRVerified('edit-1', true)
        manager.onHMRApplied()
        manager.flush()
        const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
        expect(styleEl.textContent).not.toContain('color')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('override undo/redo stack', () => {
    it('beginEdit + commitEdit creates one undo entry', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit()
      manager.undoOverride()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('undoOverride restores previous state', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit()
      manager.beginEdit()
      manager.set('a:1:1', 'font-size', '16px')
      manager.commitEdit()
      manager.undoOverride()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color')
      expect(styleEl.textContent).not.toContain('font-size')
    })

    it('redoOverride re-applies after undo', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit()
      manager.undoOverride()
      manager.redoOverride()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')
    })

    it('multiple undo levels (3 edits, 3 undos)', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit()
      manager.beginEdit()
      manager.set('b:1:1', 'margin', '0')
      manager.commitEdit()
      manager.beginEdit()
      manager.set('c:1:1', 'padding', '8px')
      manager.commitEdit()

      manager.undoOverride()
      manager.flush()
      let styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).not.toContain('padding')
      expect(styleEl.textContent).toContain('margin')

      manager.undoOverride()
      manager.flush()
      styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).not.toContain('margin')
      expect(styleEl.textContent).toContain('color')

      manager.undoOverride()
      manager.flush()
      styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toBe('')
    })

    it('new edit clears redo stack', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit()
      manager.undoOverride()

      // New edit should clear redo
      manager.beginEdit()
      manager.set('b:1:1', 'margin', '0')
      manager.commitEdit()

      // Redo should be empty
      manager.redoOverride()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('margin')
      expect(styleEl.textContent).not.toContain('color')
    })

    it('undo stack caps at MAX_UNDO_DEPTH (50)', () => {
      for (let i = 0; i < 55; i++) {
        manager.beginEdit()
        manager.set(`src:${i}:1`, 'color', `#${String(i).padStart(6, '0')}`)
        manager.commitEdit()
      }
      // Undo 50 times should work, 51st should be no-op
      for (let i = 0; i < 50; i++) {
        manager.undoOverride()
      }
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // 55 edits - 50 undos = 5 remaining overrides (oldest 5 were evicted from undo stack)
      expect(styleEl.textContent).toContain('color')
    })

    it('beginEdit is idempotent during scrub gesture', () => {
      manager.beginEdit()
      manager.set('a:1:1', 'color', 'red')
      manager.beginEdit() // second call — should not create new snapshot
      manager.set('a:1:1', 'color', 'blue')
      manager.commitEdit()

      manager.undoOverride()
      manager.flush()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // Should restore to BEFORE the first set, not between
      expect(styleEl.textContent).toBe('')
    })

    it('commitEdit without beginEdit is a no-op', () => {
      manager.set('a:1:1', 'color', 'red')
      manager.commitEdit() // no beginEdit — should not crash or create entry
      manager.undoOverride()
      manager.flush()
      // Override still present since no undo entry was created
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color')
    })
  })

  describe('deferred override removal', () => {
    let rafCallbacks: Map<number, FrameRequestCallback>
    let nextId: number

    beforeEach(() => {
      rafCallbacks = new Map()
      nextId = 1
      // Capture RAF calls instead of executing them synchronously
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

    it('commitEdit(true) before handleHMRVerified: deferRemoval called directly', () => {
      // Ordering: commitEdit(true) → handleHMRVerified (most common)
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.commitEdit(true)
      manager.handleHMRVerified('edit-1', true)

      // Override still present — deferRemoval was called but double-rAF hasn't fired
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')

      // First rAF
      flushRAF()
      expect(styleEl.textContent).toContain('color: red')

      // Second rAF — deferRemoval completes
      flushRAF()
      expect(styleEl.textContent).toBe('')
    })

    it('handleHMRVerified before commitEdit(true): deferred at drain time', () => {
      // Ordering: handleHMRVerified → commitEdit(true) → onHMRApplied (race condition)
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.handleHMRVerified('edit-1', true) // queued as non-deferred (commitEdit hasn't run)
      manager.commitEdit(true) // marks editId in deferredEditIds

      // onHMRApplied checks deferredEditIds at drain time → uses deferRemoval
      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      expect(styleEl.textContent).toContain('color: red')

      flushRAF()
      flushRAF()
      expect(styleEl.textContent).toBe('')
    })

    it('non-deferred removal clears override synchronously on onHMRApplied', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.handleHMRVerified('edit-1', true)
      manager.commitEdit(false)

      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // Override removed immediately (synchronous remove)
      expect(styleEl.textContent).toBe('')
    })

    it('commitEdit() without argument preserves backward compatibility (non-deferred)', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.handleHMRVerified('edit-1', true)
      manager.commitEdit()

      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // Override removed immediately — same as commitEdit(false)
      expect(styleEl.textContent).toBe('')
    })

    it('deferred vs non-deferred edits are handled independently', () => {
      // First edit: deferred (commitEdit before handleHMRVerified → direct deferRemoval)
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.commitEdit(true)
      manager.handleHMRVerified('edit-1', true) // deferRemoval called directly

      // Second edit: non-deferred
      manager.set('b:1:1', 'margin', '0')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-2', 'b:1:1', 'margin')
      manager.handleHMRVerified('edit-2', true) // queued as non-deferred
      manager.commitEdit(false)

      // onHMRApplied processes queued removals (only edit-2)
      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // margin removed immediately (non-deferred, via onHMRApplied)
      expect(styleEl.textContent).not.toContain('margin')
      // color still present (deferred, via deferRemoval's double-rAF)
      expect(styleEl.textContent).toContain('color: red')

      // Flush double-rAF
      flushRAF()
      flushRAF()
      expect(styleEl.textContent).toBe('')
    })

    it('pendingClearAll takes precedence over deferred removals', () => {
      manager.set('a:1:1', 'color', 'red')
      flushRAF()
      manager.beginEdit()
      manager.trackPendingEdit('edit-1', 'a:1:1', 'color')
      manager.handleHMRVerified('edit-1', true)
      manager.commitEdit(true)
      manager.queueClearAll()

      manager.onHMRApplied()
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      // clearAll takes priority — everything gone immediately
      expect(styleEl.textContent).toBe('')
    })
  })
})
