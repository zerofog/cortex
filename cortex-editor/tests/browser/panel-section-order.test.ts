import { describe, it, expect, vi, afterEach } from 'vitest'
import { h } from 'preact'
import { Panel } from '../../src/browser/components/Panel.js'
import { renderInShadow } from './helpers.js'

// Canonical Panel v2 ordering from DESIGN.md "Section ordering rationale":
// Elements -> Position -> Layout -> Typography (conditional) -> Appearance ->
// Background -> Border -> Effects.
const CANONICAL_ORDER_NO_TEXT = [
  'Elements',
  'Position',
  'Layout',
  'Appearance',
  'Background',
  'Border',
  'Effects',
]

const CANONICAL_ORDER_WITH_TEXT = [
  'Elements',
  'Position',
  'Layout',
  'Typography',
  'Appearance',
  'Background',
  'Border',
  'Effects',
]

const panelPositionProps = {
  position: { x: 1000, y: 12 },
  isSnapping: false,
  panelPointerDown: vi.fn(),
  panelPointerMove: vi.fn(),
  panelPointerUp: vi.fn(),
  panelPointerCancel: vi.fn(),
}

function makeOverrideManager() {
  return {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
    dispose: vi.fn(),
    flush: vi.fn(),
  }
}

function sectionLabels(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('.cortex-section-group__title'))
    .map(t => (t.textContent ?? '').trim())
}

describe('Panel — canonical section ordering', () => {
  let cleanup: (() => void) | null = null
  const createdElements: HTMLElement[] = []

  afterEach(() => {
    // Unconditional fake timer restoration (defense-in-depth against leakage).
    vi.useRealTimers()
    cleanup?.()
    cleanup = null
    while (createdElements.length > 0) createdElements.pop()?.remove()
  })

  function makeNonTextElement(): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/NonTextHost.tsx:5:3')
    // No text child — the element holds only an element child.
    const child = document.createElement('div')
    el.appendChild(child)
    document.body.appendChild(el)
    createdElements.push(el)
    return el
  }

  function makeTextElement(): HTMLElement {
    const el = document.createElement('p')
    el.setAttribute('data-cortex-source', 'src/TextHost.tsx:7:3')
    el.appendChild(document.createTextNode('Hello world'))
    document.body.appendChild(el)
    createdElements.push(el)
    return el
  }

  function mount(element: HTMLElement) {
    const overrideManager = makeOverrideManager()
    const result = renderInShadow(
      h(Panel, {
        element,
        overrideManager: overrideManager as any,
        onClose: () => {},
        onSelectElement: () => {},
        ...panelPositionProps,
      }),
    )
    cleanup = () => result.cleanup()
    return { ...result, overrideManager }
  }

  it('renders 7 section groups in canonical order for a non-text element', () => {
    const target = makeNonTextElement()
    const { root } = mount(target)
    const groups = root.querySelectorAll('.cortex-section-group')
    expect(groups.length).toBe(7)
    expect(sectionLabels(root)).toEqual(CANONICAL_ORDER_NO_TEXT)
  })

  it('renders 8 section groups (Typography included) for a text-bearing element', () => {
    const target = makeTextElement()
    const { root } = mount(target)
    const groups = root.querySelectorAll('.cortex-section-group')
    expect(groups.length).toBe(8)
    expect(sectionLabels(root)).toEqual(CANONICAL_ORDER_WITH_TEXT)
  })

  it('does not include the old "Style" section group', () => {
    const target = makeNonTextElement()
    const { root } = mount(target)
    expect(sectionLabels(root)).not.toContain('Style')
    expect(root.querySelector('[data-group="style"]')).toBeNull()
  })

  it('wraps the LayerTree inside an Elements section group at the top', () => {
    const target = makeNonTextElement()
    const { root } = mount(target)
    const elementsGroup = root.querySelector('[data-group="elements"]')
    expect(elementsGroup).not.toBeNull()
    expect(elementsGroup!.querySelector('.cortex-layer-tree')).not.toBeNull()

    // Elements must be the first group in DOM order.
    const first = root.querySelectorAll('.cortex-section-group')[0]
    expect(first).toBe(elementsGroup)
  })

  it('exposes canonical data-group attributes for all sections', () => {
    const target = makeTextElement()
    const { root } = mount(target)
    expect(root.querySelector('[data-group="elements"]')).not.toBeNull()
    expect(root.querySelector('[data-group="position"]')).not.toBeNull()
    expect(root.querySelector('[data-group="layout"]')).not.toBeNull()
    expect(root.querySelector('[data-group="typography"]')).not.toBeNull()
    expect(root.querySelector('[data-group="appearance"]')).not.toBeNull()
    expect(root.querySelector('[data-group="background"]')).not.toBeNull()
    expect(root.querySelector('[data-group="border"]')).not.toBeNull()
    expect(root.querySelector('[data-group="effects"]')).not.toBeNull()
  })

  it('hides the Position group when the element is part of a shared class selection (scope=all)', async () => {
    // Create two elements annotated with the same CSS-module selector.
    // `detectSharedClasses` keys off `data-cortex-css`, not className — it
    // parses the `file.module.css:selector` format to count shared elements.
    const cssMapping = 'src/Card.module.css:.badge'
    const a = document.createElement('div')
    a.setAttribute('data-cortex-source', 'src/A.tsx:1:1')
    a.setAttribute('data-cortex-css', cssMapping)
    document.body.appendChild(a)
    createdElements.push(a)

    const b = document.createElement('div')
    b.setAttribute('data-cortex-source', 'src/B.tsx:1:1')
    b.setAttribute('data-cortex-css', cssMapping)
    document.body.appendChild(b)
    createdElements.push(b)

    const { root } = mount(a)

    // detectSharedClasses runs in a useEffect, so the scope toggle only
    // appears after Preact flushes effects. Two microtask cycles are
    // required: one for the useEffect to fire and call setSharedInfo(),
    // and a second for Preact to flush the resulting re-render.
    await new Promise(r => setTimeout(r, 0))
    await new Promise(r => setTimeout(r, 0))

    // Scope defaults to 'instance', so Position should be visible initially.
    expect(root.querySelector('[data-group="position"]')).not.toBeNull()

    // Click the "All" scope button (scope toggle is rendered when sharedInfo detected).
    const allButton = root.querySelector<HTMLButtonElement>(
      '.cortex-panel__scope-btn:last-child',
    )
    expect(allButton).not.toBeNull()
    allButton!.click()
    await new Promise(r => setTimeout(r, 0))

    // Position group should now be hidden.
    expect(root.querySelector('[data-group="position"]')).toBeNull()

    // And the remaining groups should still be 6 (Elements, Layout, Appearance,
    // Background, Border, Effects) — Typography omitted for a non-text element.
    const labels = sectionLabels(root)
    expect(labels).toEqual([
      'Elements',
      'Layout',
      'Appearance',
      'Background',
      'Border',
      'Effects',
    ])
  })
})

describe('Panel — Typography conditional rendering', () => {
  let cleanup: (() => void) | null = null
  const createdElements: HTMLElement[] = []

  afterEach(() => {
    vi.useRealTimers()
    cleanup?.()
    cleanup = null
    while (createdElements.length > 0) createdElements.pop()?.remove()
  })

  function mount(element: HTMLElement) {
    const overrideManager = makeOverrideManager()
    const result = renderInShadow(
      h(Panel, {
        element,
        overrideManager: overrideManager as any,
        onClose: () => {},
        onSelectElement: () => {},
        ...panelPositionProps,
      }),
    )
    cleanup = () => result.cleanup()
    return result
  }

  it('omits Typography for an element with only element children (no direct text)', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Wrap.tsx:1:1')
    el.appendChild(document.createElement('span'))
    document.body.appendChild(el)
    createdElements.push(el)
    const { root } = mount(el)
    expect(root.querySelector('[data-group="typography"]')).toBeNull()
  })

  it('omits Typography for an element whose only text child is whitespace', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Ws.tsx:1:1')
    el.appendChild(document.createTextNode('   \n\t  '))
    document.body.appendChild(el)
    createdElements.push(el)
    const { root } = mount(el)
    expect(root.querySelector('[data-group="typography"]')).toBeNull()
  })

  it('includes Typography for an element with a non-empty text child', () => {
    const el = document.createElement('p')
    el.setAttribute('data-cortex-source', 'src/Txt.tsx:1:1')
    el.appendChild(document.createTextNode('Hello'))
    document.body.appendChild(el)
    createdElements.push(el)
    const { root } = mount(el)
    expect(root.querySelector('[data-group="typography"]')).not.toBeNull()
  })

  it('includes Typography when text sits alongside element children (mixed content)', () => {
    const el = document.createElement('p')
    el.setAttribute('data-cortex-source', 'src/Mixed.tsx:1:1')
    el.appendChild(document.createTextNode('Intro '))
    el.appendChild(document.createElement('strong'))
    document.body.appendChild(el)
    createdElements.push(el)
    const { root } = mount(el)
    expect(root.querySelector('[data-group="typography"]')).not.toBeNull()
  })
})
