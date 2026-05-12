import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import type { VNode } from 'preact'
import { SectionGroup } from '../../../src/browser/components/SectionGroup.js'

/**
 * Task 4 (ZF0-1182) coverage for the `headerAction` slot.
 *
 * The pre-existing tests in tests/browser/section-group.test.tsx cover the
 * original `label` + `groupId` + `children` contract. This file locks the
 * NEW behavior specific to Panel v2: the optional right-aligned header slot
 * used by Tasks 5-16 (Typography T-toggle, Position lock badge, etc.) and
 * asserts absence of the wrapper when the prop is omitted so we don't leak
 * empty divs into the DOM.
 */
describe('SectionGroup — Panel v2 headerAction slot', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function mount(node: VNode) {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(node, container)
  }

  it('renders header with the provided label text', () => {
    mount(
      <SectionGroup label="Typography" groupId="typography">
        <span data-testid="body" />
      </SectionGroup>,
    )
    const title = container.querySelector('.cortex-section-group__title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toBe('Typography')
  })

  it('renders children inside the content wrapper', () => {
    mount(
      <SectionGroup label="Layout" groupId="layout">
        <span data-testid="payload">payload</span>
      </SectionGroup>,
    )
    const content = container.querySelector('.cortex-section-group__content')
    expect(content).not.toBeNull()
    const child = content!.querySelector('[data-testid="payload"]')
    expect(child).not.toBeNull()
    expect(child!.textContent).toBe('payload')
  })

  it('renders headerAction inside the header when provided', () => {
    mount(
      <SectionGroup
        label="Typography"
        groupId="typography"
        headerAction={<button data-testid="t-toggle" type="button">T</button>}
      >
        <span />
      </SectionGroup>,
    )
    const header = container.querySelector('.cortex-section-group__header')
    expect(header).not.toBeNull()
    const actionSlot = header!.querySelector('.cortex-section-group__header-action')
    expect(actionSlot).not.toBeNull()
    const button = actionSlot!.querySelector<HTMLButtonElement>('[data-testid="t-toggle"]')
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe('T')
  })

  it('sets role="group" and aria-labelledby linking to title element', () => {
    mount(
      <SectionGroup label="Layout" groupId="layout">
        <span />
      </SectionGroup>,
    )
    const root = container.querySelector('.cortex-section-group') as HTMLElement
    expect(root.getAttribute('role')).toBe('group')
    expect(root.getAttribute('aria-labelledby')).toBe('cortex-section-title-layout')
    const title = container.querySelector('#cortex-section-title-layout')
    expect(title).not.toBeNull()
    expect(title!.textContent).toBe('Layout')
  })

  it('omits the headerAction wrapper entirely when the prop is not passed', () => {
    mount(
      <SectionGroup label="Elements" groupId="elements">
        <span data-testid="body" />
      </SectionGroup>,
    )
    const header = container.querySelector('.cortex-section-group__header')
    expect(header).not.toBeNull()
    // When headerAction is absent, the header must contain exactly the title
    // — no empty action wrapper leaking into the DOM and shifting flexbox layout.
    expect(header!.querySelector('.cortex-section-group__header-action')).toBeNull()
    expect(header!.children.length).toBe(1)
    expect(header!.children[0].classList.contains('cortex-section-group__title')).toBe(true)
  })

  // Computed-typography coverage lives in real Chromium — happy-dom cannot
  // resolve `var(--cx-text-lg)` / `var(--cx-weight-heading)` / `var(--cx-ink)`
  // to meaningful values.
  // See `tests/e2e/section-group-title-typography.spec.ts` (ZF0-1565).
})
