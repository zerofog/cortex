import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectStates } from '../../src/browser/state-detector.js'
import type { StateDeclarations } from '../../src/browser/state-detector.js'

describe('detectStates', () => {
  let styleEl: HTMLStyleElement
  let target: HTMLElement

  beforeEach(() => {
    styleEl = document.createElement('style')
    document.head.appendChild(styleEl)
    target = document.createElement('button')
    target.className = 'btn'
    document.body.appendChild(target)
  })

  afterEach(() => {
    styleEl.remove()
    target.remove()
  })

  it('returns empty maps when no state rules exist', () => {
    styleEl.textContent = '.btn { color: red; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.size).toBe(0)
    expect(result.active.size).toBe(0)
  })

  it('detects :hover declarations for matching element', () => {
    // CSSOM expands shorthand "background" to longhand properties.
    // background-color is the meaningful longhand; others get "initial" and are filtered.
    styleEl.textContent = '.btn:hover { background-color: blue; color: white; }'
    const result = detectStates(target)
    expect(result.hover.get('background-color')).toBe('blue')
    expect(result.hover.get('color')).toBe('white')
    expect(result.focus.size).toBe(0)
    expect(result.active.size).toBe(0)
  })

  it('detects :focus and :active independently', () => {
    // CSSOM expands shorthand "outline" to longhand properties.
    // Use longhand properties directly for reliable CSSOM testing.
    styleEl.textContent = `
      .btn:focus { outline-color: blue; outline-style: solid; outline-width: 2px; }
      .btn:active { transform: scale(0.95); }
    `
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.get('outline-color')).toBe('blue')
    expect(result.focus.get('outline-style')).toBe('solid')
    expect(result.focus.get('outline-width')).toBe('2px')
    expect(result.active.get('transform')).toBe('scale(0.95)')
  })

  it('ignores rules that do not match the element', () => {
    styleEl.textContent = '.other:hover { color: red; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
  })

  it('later rules override earlier ones for same property', () => {
    styleEl.textContent = `
      .btn:hover { color: red; }
      .btn:hover { color: blue; }
    `
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('blue')
  })

  it('skips rules with pseudo-element selectors (::before, ::after)', () => {
    styleEl.textContent = '.btn:hover::before { content: "x"; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
  })

  it('recurses into @media rules', () => {
    styleEl.textContent = '@media (min-width: 0px) { .btn:hover { color: green; } }'
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('green')
  })

  it('recurses into @supports rules', () => {
    styleEl.textContent = '@supports (display: flex) { .btn:hover { display: flex; } }'
    const result = detectStates(target)
    expect(result.hover.get('display')).toBe('flex')
  })

  // TODO: requires real CSSOM (happy-dom limitation)
  it.skip('recurses into @layer rules', () => {
    styleEl.textContent = '@layer base { .btn:hover { opacity: 0.8; } }'
    const result = detectStates(target)
    expect(result.hover.get('opacity')).toBe('0.8')
  })

  // TODO: requires real CSSOM (happy-dom limitation)
  it.skip('handles cross-origin stylesheets gracefully (no throw)', () => {
    // Needs real cross-origin simulation to verify SecurityError handling.
    // With a real cross-origin <link>, cssRules access throws SecurityError.
    // The function should catch it and return empty maps (no states detected).
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.size).toBe(0)
    expect(result.active.size).toBe(0)
  })

  it('handles descendant selectors: .parent:hover .child', () => {
    const parent = document.createElement('div')
    parent.className = 'parent'
    const child = document.createElement('span')
    child.className = 'child'
    parent.appendChild(child)
    document.body.appendChild(parent)

    styleEl.textContent = '.parent:hover .child { color: red; }'
    const result = detectStates(child)
    expect(result.hover.get('color')).toBe('red')

    parent.remove()
  })

  it('drops compound pseudo-class rules when stripped selector does not match', () => {
    // .btn:hover:focus → strip :hover → .btn:focus → element not focused → no match
    styleEl.textContent = '.btn:hover:focus { color: purple; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
    expect(result.focus.size).toBe(0)
  })

  it('validates VALID_PROPERTY and VALID_VALUE on extracted declarations', () => {
    // Declarations from CSSOM are browser-parsed, but we validate anyway
    styleEl.textContent = '.btn:hover { color: red; }'
    const result = detectStates(target)
    expect(result.hover.has('color')).toBe(true)
  })

  it('filters out initial values from shorthand expansion', () => {
    // When "background: blue" is set, CSSOM expands to longhand properties.
    // Sub-properties like background-image get "initial" which should be filtered.
    styleEl.textContent = '.btn:hover { background: blue; }'
    const result = detectStates(target)
    expect(result.hover.get('background-color')).toBe('blue')
    // Shorthand expansion noise should be filtered out
    expect(result.hover.has('background-image')).toBe(false)
  })

  it('detects multiple states on the same element', () => {
    styleEl.textContent = `
      .btn:hover { color: red; }
      .btn:focus { color: blue; }
      .btn:active { color: green; }
    `
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('red')
    expect(result.focus.get('color')).toBe('blue')
    expect(result.active.get('color')).toBe('green')
  })

  it('handles comma-separated selectors correctly (.btn, .link:hover)', () => {
    // Only .link:hover has a :hover pseudo — .btn should NOT get hover declarations
    const link = document.createElement('a')
    link.className = 'link'
    document.body.appendChild(link)

    styleEl.textContent = '.btn, .link:hover { color: red; }'
    const btnResult = detectStates(target) // target is .btn
    const linkResult = detectStates(link)

    // .btn should NOT have hover declarations (it's in a comma-separated
    // selector but has no :hover pseudo on its segment)
    expect(btnResult.hover.size).toBe(0)

    // .link should have hover declarations
    expect(linkResult.hover.get('color')).toBe('red')

    link.remove()
  })

  it('handles comma-separated selectors where both segments have :hover', () => {
    const link = document.createElement('a')
    link.className = 'link'
    document.body.appendChild(link)

    styleEl.textContent = '.btn:hover, .link:hover { background-color: blue; }'
    const btnResult = detectStates(target)
    const linkResult = detectStates(link)

    expect(btnResult.hover.get('background-color')).toBe('blue')
    expect(linkResult.hover.get('background-color')).toBe('blue')

    link.remove()
  })

  // TODO: requires real CSSOM (happy-dom limitation)
  it.skip('handles CSS nesting (&:hover inside parent rule)', () => {
    styleEl.textContent = '.btn { color: red; &:hover { background-color: blue; } }'
    const result = detectStates(target)
    expect(result.hover.get('background-color')).toBe('blue')
  })

  it('skips ::after pseudo-element selectors', () => {
    styleEl.textContent = '.btn:hover::after { content: "→"; }'
    const result = detectStates(target)
    expect(result.hover.size).toBe(0)
  })

  it('does not corrupt :focus-visible when stripping :focus', () => {
    // :focus-visible should NOT be detected as a :focus rule.
    // The old regex /:focus/g would match inside :focus-visible, strip it,
    // leaving '-visible' which is an invalid selector.
    styleEl.textContent = '.btn:focus-visible { outline-color: blue; outline-style: solid; outline-width: 2px; }'
    const result = detectStates(target)
    expect(result.focus.size).toBe(0)
  })

  it('does not corrupt :focus-within when stripping :focus', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'wrapper'
    wrapper.appendChild(target)
    document.body.appendChild(wrapper)

    styleEl.textContent = '.wrapper:focus-within { border-color: blue; }'
    const result = detectStates(wrapper)
    expect(result.focus.size).toBe(0)

    wrapper.remove()
  })

  // TODO: requires real CSSOM (happy-dom limitation)
  it.skip('handles &.modifier:hover in nested CSS (no crash)', () => {
    styleEl.textContent = '.btn { &.primary:hover { color: white; } }'
    const result = detectStates(target)
    expect(result.hover.get('color')).toBe('white')
  })
})
