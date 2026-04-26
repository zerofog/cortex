import { describe, it, expect, vi, afterEach } from 'vitest'
import { computePanelStyleSnapshot } from '../../../src/browser/components/panel-style-snapshot.js'
import { mockGetComputedStyle } from '../helpers.js'

describe('computePanelStyleSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty parsed shells when element is null', () => {
    const result = computePanelStyleSnapshot({
      element: null,
      activePseudo: 'element',
      activeState: 'default',
      sharedInfo: null,
      editScope: 'instance',
      overrideManager: { get: vi.fn().mockReturnValue(undefined) },
      defaultStyles: null,
    })
    // Early-return branch: numeric zero-value fields come from the parse shells.
    // These assertions ARE falsifiable: if the early return were removed, the
    // function would crash on getComputedStyle(null) before returning.
    expect(result.computedStyles.spacing.padding.top).toBe(0)
    expect(result.computedStyles.spacing.padding.right).toBe(0)
    // dimmedProperties and mixedProperties must be undefined from the early-return path
    expect(result.dimmedProperties).toBeUndefined()
    expect(result.mixedProperties).toBeUndefined()
    expect(result.parentDisplay).toBe('')
  })

  it('returns text-align from getComputedStyle', () => {
    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/hero.tsx:10:5')
    document.body.appendChild(target)

    const styles: Record<string, string> = { textAlign: 'left' }
    const restoreStyles = mockGetComputedStyle(target, styles)

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: null,
      })
      // THIS IS THE FAILING ASSERTION from the original flaky integration test,
      // restated as a synchronous unit test.
      expect(result.computedStyles.typography.textAlign).toBe('left')
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('reflects style change on second call', () => {
    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/hero.tsx:10:5')
    document.body.appendChild(target)

    const styles: Record<string, string> = { textAlign: 'left' }
    const restoreStyles = mockGetComputedStyle(target, styles)

    const overrideManager = { get: vi.fn().mockReturnValue(undefined) }
    const input = {
      element: target,
      activePseudo: 'element' as const,
      activeState: 'default' as const,
      sharedInfo: null,
      editScope: 'instance' as const,
      overrideManager,
      defaultStyles: null,
    }

    try {
      const first = computePanelStyleSnapshot(input)
      expect(first.computedStyles.typography.textAlign).toBe('left')

      // Mutate styles ref — mockGetComputedStyle spreads on every call
      styles.textAlign = 'center'

      const second = computePanelStyleSnapshot(input)
      expect(second.computedStyles.typography.textAlign).toBe('center')
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('override-manager value takes precedence over getComputedStyle for width/height', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    // getComputedStyle returns a resolved pixel width
    const styles: Record<string, string> = { width: '200px', height: '100px' }
    const restoreStyles = mockGetComputedStyle(target, styles)

    // overrideManager.get returns keyword for width
    const overrideManager = { get: vi.fn() }
    overrideManager.get.mockImplementation((source: string, prop: string, _pseudo?: string) => {
      if (prop === 'width') return '100%'
      if (prop === 'height') return 'fit-content'
      return undefined
    })

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager,
        defaultStyles: null,
      })
      expect(result.computedStyles.layout.width).toBe('100%')
      expect(result.computedStyles.layout.height).toBe('fit-content')
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('override-manager value takes precedence for border-top-width when present', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    const styles: Record<string, string> = { borderTopWidth: '1px' }
    const restoreStyles = mockGetComputedStyle(target, styles)

    const overrideManager = { get: vi.fn() }
    overrideManager.get.mockImplementation((_source: string, prop: string, _pseudo?: string) => {
      if (prop === 'border-top-width') return '4px'
      return undefined
    })

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager,
        defaultStyles: null,
      })
      expect(result.computedStyles.border.borderTopWidth).toBe(4)
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('dimmedProperties is undefined when activeState is "default"', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    const restoreStyles = mockGetComputedStyle(target, { color: 'rgb(0,0,0)' })

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: { color: 'rgb(255,0,0)' },
      })
      expect(result.dimmedProperties).toBeUndefined()
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('dimmedProperties contains property when activeState is non-default AND defaultStyles differ', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    // Proxy-based mock so getPropertyValue works (needed by dimming logic)
    const originalGCS = window.getComputedStyle
    const currentStyles: Record<string, string> = { color: 'rgb(255,0,0)' }
    const makeProxy = (styles: Record<string, string>): CSSStyleDeclaration =>
      new Proxy(styles, {
        get(obj, prop) {
          if (prop === 'getPropertyValue') {
            return (p: string) => {
              const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
              return (obj as Record<string, string>)[camel] ?? (obj as Record<string, string>)[p] ?? ''
            }
          }
          return (obj as Record<string, string>)[prop as string] ?? ''
        },
      }) as unknown as CSSStyleDeclaration
    window.getComputedStyle = ((_el: Element, _pseudo?: string | null) =>
      makeProxy(currentStyles)) as typeof window.getComputedStyle

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'hover',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        // Default state has different color
        defaultStyles: { color: 'rgb(0,0,0)' },
      })
      expect(result.dimmedProperties).toBeDefined()
      expect(result.dimmedProperties?.has('color')).toBe(true)
    } finally {
      window.getComputedStyle = originalGCS
      target.remove()
    }
  })

  it('mixedProperties is undefined when sharedInfo is null', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    const restoreStyles = mockGetComputedStyle(target, { color: 'rgb(0,0,0)' })

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'all',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: null,
      })
      expect(result.mixedProperties).toBeUndefined()
    } finally {
      restoreStyles()
      target.remove()
    }
  })

  it('mixedProperties contains property when sharedInfo siblings differ for that property in "all" editScope', () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')
    document.body.appendChild(target)

    const sibling = document.createElement('div')
    sibling.setAttribute('data-cortex-source', 'src/comp.tsx:10:3')
    document.body.appendChild(sibling)

    // Proxy-based mock so getPropertyValue works for both elements
    const originalGCS = window.getComputedStyle
    const makeProxy = (styles: Record<string, string>): CSSStyleDeclaration =>
      new Proxy(styles, {
        get(obj, prop) {
          if (prop === 'getPropertyValue') {
            return (p: string) => {
              const camel = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
              return (obj as Record<string, string>)[camel] ?? (obj as Record<string, string>)[p] ?? ''
            }
          }
          return (obj as Record<string, string>)[prop as string] ?? ''
        },
      }) as unknown as CSSStyleDeclaration

    const targetStyles: Record<string, string> = { color: 'rgb(0,0,0)', display: 'block' }
    const siblingStyles: Record<string, string> = { color: 'rgb(255,0,0)', display: 'block' }

    window.getComputedStyle = ((el: Element, _pseudo?: string | null) => {
      if (el === target) return makeProxy(targetStyles)
      if (el === sibling) return makeProxy(siblingStyles)
      return makeProxy({})
    }) as typeof window.getComputedStyle

    const sharedInfo = {
      selector: '.badge',
      cssFilePath: 'Component.module.css',
      elements: [target, sibling],
      count: 2,
    }

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo,
        editScope: 'all',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: null,
      })
      expect(result.mixedProperties).toBeDefined()
      expect(result.mixedProperties?.has('color')).toBe(true)
      // display is same across siblings, should not be mixed
      expect(result.mixedProperties?.has('display')).toBe(false)
    } finally {
      window.getComputedStyle = originalGCS
      target.remove()
      sibling.remove()
    }
  })

  it('parentDisplay returns parent getComputedStyle().display', () => {
    const parent = document.createElement('div')
    const target = document.createElement('p')
    target.setAttribute('data-cortex-source', 'src/hero.tsx:10:5')
    parent.appendChild(target)
    document.body.appendChild(parent)

    // Mock getComputedStyle to return display: 'flex' for the parent
    const originalGCS = window.getComputedStyle
    window.getComputedStyle = ((el: Element, _pseudo?: string | null) => {
      if (el === parent) return { display: 'flex', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration
      return { ...originalGCS.call(window, el), getPropertyValue: () => '' } as CSSStyleDeclaration
    }) as typeof window.getComputedStyle

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: null,
      })
      expect(result.parentDisplay).toBe('flex')
    } finally {
      window.getComputedStyle = originalGCS
      target.remove()
      parent.remove()
    }
  })

  it('parentDisplay returns empty string when element has no parent', () => {
    // Detached element — parentElement is null
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/comp.tsx:5:3')

    const restoreStyles = mockGetComputedStyle(target, {})

    try {
      const result = computePanelStyleSnapshot({
        element: target,
        activePseudo: 'element',
        activeState: 'default',
        sharedInfo: null,
        editScope: 'instance',
        overrideManager: { get: vi.fn().mockReturnValue(undefined) },
        defaultStyles: null,
      })
      expect(result.parentDisplay).toBe('')
    } finally {
      restoreStyles()
    }
  })
})
