import { describe, it, expect, beforeEach } from 'vitest'
import { CSSOverrideManager } from '../../src/browser/override.js'

describe('CSSOverrideManager', () => {
  let manager: CSSOverrideManager

  beforeEach(() => {
    // Clean up any leftover style elements
    document.querySelectorAll('[data-cortex-override]').forEach(el => el.remove())
    manager = new CSSOverrideManager()
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
    const styleEl = document.head.querySelector('[data-cortex-override]') as HTMLStyleElement
    expect(styleEl.textContent).toBe(
      '[data-cortex-source="Hero\\.tsx\\:5\\:3"] { color: red !important; font-size: 16px !important; }',
    )
  })

  it('multiple sources produce separate rules', () => {
    manager.set('Hero.tsx:5:3', 'color', 'red')
    manager.set('Nav.tsx:10:1', 'margin', '0')
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

  it('accepts normal CSS values', () => {
    manager.set('a:1:1', 'color', 'red')
    manager.set('b:1:1', 'font-size', '16px')
    manager.set('c:1:1', 'color', 'rgb(0,0,0)')
    manager.set('d:1:1', 'border', '1px solid black')
    manager.set('e:1:1', 'margin', '0')
    manager.set('f:1:1', 'padding', '10%')
    manager.set('g:1:1', 'color', '#ff0000')
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
