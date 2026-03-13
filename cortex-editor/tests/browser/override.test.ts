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
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Nav\\.tsx\\:10\\:1"] { margin: 0 !important; }',
    )
  })

  it('remove() single prop cleans up empty source entry', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.remove('Hero.tsx:5:3', 'color')
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

    it('remove() rebuilds synchronously (user-initiated)', () => {
      // First, add and flush
      manager.set('a:1:1', 'color', 'red')
      flushRAF()

      manager.set('a:1:1', 'font-size', '16px')
      flushRAF()

      // Now remove — should be synchronous
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

      // set() schedules a new RAF
      manager.set('a:1:1', 'font-size', '16px')
      expect(rafCallbacks.size).toBe(1)

      // remove() should cancel the pending RAF
      manager.remove('a:1:1', 'font-size')
      expect(rafCallbacks.size).toBe(0)

      // Flushing RAF should be a no-op — no stale rebuild
      const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
      const afterRemove = styleEl.textContent
      flushRAF()
      expect(styleEl.textContent).toBe(afterRemove)
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
})
