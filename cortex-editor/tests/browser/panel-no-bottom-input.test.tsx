import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { Panel } from '../../src/browser/components/Panel.js'
import { CommandStack } from '../../src/browser/command-stack.js'
import { CSSOverrideManager } from '../../src/browser/override.js'
import { createMockChannel } from './helpers.js'
import type { TextComponent } from '../../src/core/text-components.js'
import type { ColorChip } from '../../src/browser/token-detector.js'

/**
 * Regression guard for ZF0-1605: panel-bottom CommentInput removal.
 *
 * Asserts the input with aria-label="Comment to AI agent" is absent from the
 * panel body. Falsifies on re-mount of CommentInput (or any equivalent using
 * the same aria-label); other future text inputs with different aria-labels
 * are out of scope.
 */

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
  offset: vi.fn().mockReturnValue({}),
  autoUpdate: vi.fn(() => () => {}),
}))

const BUNDLES: readonly TextComponent[] = [
  { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
]

const CHIPS: readonly ColorChip[] = [
  { name: 'brand-500', hex: '#3b82f6' },
]

let container: HTMLDivElement
let targetElement: HTMLElement

const flushEffects = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('Panel bottom-input removal (ZF0-1605 regression)', () => {
  const originalRAF = window.requestAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(performance.now())
      return 0
    }) as typeof requestAnimationFrame

    container = document.createElement('div')
    document.body.appendChild(container)

    targetElement = document.createElement('div')
    targetElement.setAttribute('data-cortex-source', 'App.tsx:10:3')
    targetElement.textContent = 'Hello'
    document.body.appendChild(targetElement)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    render(null, container)
    container.remove()
    if (targetElement.parentElement) targetElement.remove()
  })

  it('renders no <input type="text"> in the panel body when a channel is present', async () => {
    const channel = createMockChannel()
    const commandStack = new CommandStack()
    const overrideManager = new CSSOverrideManager()

    render(
      <Panel
        selectedElements={[targetElement]}
        overrideManager={overrideManager}
        commandStack={commandStack}
        channel={channel}
        onClose={vi.fn()}
        onSelectElement={vi.fn()}
        hmrAppliedVersion={0}
        swatches={[]}
        textComponents={[...BUNDLES]}
        colorChips={[...CHIPS]}
        position={{ x: 0, y: 0 }}
        isSnapping={false}
        panelPointerDown={vi.fn()}
        panelPointerMove={vi.fn()}
        panelPointerUp={vi.fn()}
        panelPointerCancel={vi.fn()}
        agentConnected={true}
        onEditDispatch={vi.fn()}
      />,
      container,
    )
    await flushEffects()

    const panelBody = container.querySelector('.cortex-panel__body')
    expect(panelBody, 'panel body must render').not.toBeNull()

    const commentInput = panelBody!.querySelector('input[aria-label="Comment to AI agent"]')
    expect(commentInput, 'panel body must not contain the CommentInput field (ZF0-1605 regression)').toBeNull()
  })
})
