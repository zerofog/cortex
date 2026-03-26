import { describe, it, expect, afterEach } from 'vitest'
import {
  getDeepActiveElement, isInputFocused, isCortexUIFocused,
  isRealEvent, _setCortexHost,
} from '../../src/browser/focus-utils.js'

describe('getDeepActiveElement', () => {
  afterEach(() => { _setCortexHost(null, null); (document.activeElement as HTMLElement)?.blur?.() })

  it('returns document.activeElement when no shadow DOM', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(getDeepActiveElement()).toBe(input)
    input.remove()
  })

  it('traverses into open shadow roots', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('input')
    shadow.appendChild(inner)
    inner.focus()
    expect(getDeepActiveElement()).toBe(inner)
    host.remove()
  })

  it('traverses into closed shadow root using stored ref', () => {
    const host = document.createElement('div')
    host.setAttribute('tabindex', '0')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })
    const inner = document.createElement('input')
    shadow.appendChild(inner)
    _setCortexHost(host, shadow)
    inner.focus()
    // document.activeElement is the host (closed mode), but getDeepActiveElement
    // should use the stored shadow ref to find the real focused element
    expect(getDeepActiveElement()).toBe(inner)
    host.remove()
  })
})

describe('isInputFocused', () => {
  afterEach(() => { _setCortexHost(null, null); (document.activeElement as HTMLElement)?.blur?.() })

  it('returns true for focused <input>', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns true for role="textbox"', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'textbox')
    el.setAttribute('tabindex', '0')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(true)
    el.remove()
  })

  it('returns false for focused <button>', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.focus()
    expect(isInputFocused()).toBe(false)
    el.remove()
  })
})

describe('isCortexUIFocused', () => {
  afterEach(() => { _setCortexHost(null, null); (document.activeElement as HTMLElement)?.blur?.() })

  it('returns true when activeElement is the cortex host', () => {
    const host = document.createElement('div')
    host.setAttribute('tabindex', '0')
    document.body.appendChild(host)
    _setCortexHost(host, null)
    host.focus()
    expect(isCortexUIFocused()).toBe(true)
    host.remove()
  })

  it('returns true when focus is inside cortex shadow root', () => {
    const host = document.createElement('div')
    host.setAttribute('tabindex', '0')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    _setCortexHost(host, shadow)
    const btn = document.createElement('button')
    btn.setAttribute('tabindex', '0')
    shadow.appendChild(btn)
    btn.focus()
    expect(isCortexUIFocused()).toBe(true)
    host.remove()
  })

  it('returns false when focus is on a non-cortex element', () => {
    const host = document.createElement('div')
    _setCortexHost(host, null)
    const other = document.createElement('button')
    other.setAttribute('tabindex', '0')
    document.body.appendChild(other)
    other.focus()
    expect(isCortexUIFocused()).toBe(false)
    other.remove()
  })
})

describe('isRealEvent', () => {
  it('returns false for synthetic events (isTrusted = false)', () => {
    const e = new KeyboardEvent('keydown', { key: 'v' })
    expect(isRealEvent(e)).toBe(false)
  })
})
