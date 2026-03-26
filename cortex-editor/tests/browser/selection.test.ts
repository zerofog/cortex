import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSelection } from '../../src/browser/selection.js'
import { createShadowHost, mockElementFromPoint, dispatchMouseEvent } from './helpers.js'

describe('initSelection', () => {
  let host: HTMLDivElement
  let shadow: ShadowRoot
  let cleanupHost: () => void
  let onHover: ReturnType<typeof vi.fn>
  let onSelect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const shadowHost = createShadowHost()
    host = shadowHost.host
    shadow = shadowHost.shadow
    cleanupHost = shadowHost.cleanup

    onHover = vi.fn()
    onSelect = vi.fn()
  })

  afterEach(() => {
    cleanupHost()
  })

  // Canary: verify capture-phase listener on window receives events dispatched on child elements
  it('canary: capture-phase listener fires for child element events', () => {
    const captured = vi.fn()
    window.addEventListener('click', captured, { capture: true })
    const child = document.createElement('div')
    document.body.appendChild(child)
    child.click()
    expect(captured).toHaveBeenCalled()
    window.removeEventListener('click', captured, { capture: true })
    child.remove()
  })

  it('returns cleanup and setDesignMode', () => {
    const handle = initSelection(shadow, onHover, onSelect)
    expect(handle).toHaveProperty('cleanup')
    expect(handle).toHaveProperty('setDesignMode')
    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.setDesignMode).toBe('function')
    handle.cleanup()
  })

  it('capture-phase mousemove calls onHover with the element', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    expect(onHover).toHaveBeenCalledWith(target)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('capture-phase click calls onSelect and prevents default', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    const event = dispatchMouseEvent(target, 'click', { clientX: 50, clientY: 50 })
    expect(onSelect).toHaveBeenCalledWith(target)
    expect(event.defaultPrevented).toBe(true)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('events from Cortex shadow DOM are passed through', () => {
    const handle = initSelection(shadow, onHover, onSelect)

    // Create an element inside the shadow DOM (simulating panel UI)
    const panelButton = document.createElement('button')
    shadow.appendChild(panelButton)

    // Mock elementFromPoint to return the cortex host
    const restoreEfp = mockElementFromPoint(host)

    // Dispatch from inside shadow — composedPath will include host with data-cortex-host
    dispatchMouseEvent(panelButton, 'click', { clientX: 50, clientY: 50 })

    // Should not intercept — onSelect should not be called
    expect(onSelect).not.toHaveBeenCalled()

    handle.cleanup()
    restoreEfp()
  })

  it('setDesignMode(false) disables interception', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.setDesignMode(false)
    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    dispatchMouseEvent(target, 'click', { clientX: 50, clientY: 50 })
    expect(onHover).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('setDesignMode(true) re-enables interception', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.setDesignMode(false)
    handle.setDesignMode(true)
    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    expect(onHover).toHaveBeenCalledWith(target)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('cleanup removes all listeners', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.cleanup()

    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    dispatchMouseEvent(target, 'click', { clientX: 50, clientY: 50 })

    expect(onHover).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()

    restoreEfp()
    target.remove()
  })

  it('onHover is called with null when elementFromPoint returns null', () => {
    const restoreEfp = mockElementFromPoint(null)
    const handle = initSelection(shadow, onHover, onSelect)

    const target = document.createElement('div')
    document.body.appendChild(target)
    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    expect(onHover).toHaveBeenCalledWith(null)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('excludes elements with data-cortex-host attribute from targeting', () => {
    const restoreEfp = mockElementFromPoint(host)
    const handle = initSelection(shadow, onHover, onSelect)

    dispatchMouseEvent(document.body, 'mousemove', { clientX: 50, clientY: 50 })
    expect(onHover).toHaveBeenCalledWith(null)

    handle.cleanup()
    restoreEfp()
  })

  it('setInterceptClicks(false) allows clicks through without interception', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.setInterceptClicks(false)
    const event = dispatchMouseEvent(target, 'click', { clientX: 50, clientY: 50 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('hover still works when setInterceptClicks(false)', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.setInterceptClicks(false)
    dispatchMouseEvent(target, 'mousemove', { clientX: 50, clientY: 50 })
    expect(onHover).toHaveBeenCalledWith(target)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })

  it('setInterceptClicks(true) re-enables click interception', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const restoreEfp = mockElementFromPoint(target)
    const handle = initSelection(shadow, onHover, onSelect)

    handle.setInterceptClicks(false)
    handle.setInterceptClicks(true)
    const event = dispatchMouseEvent(target, 'click', { clientX: 50, clientY: 50 })
    expect(onSelect).toHaveBeenCalledWith(target)
    expect(event.defaultPrevented).toBe(true)

    handle.cleanup()
    restoreEfp()
    target.remove()
  })
})
