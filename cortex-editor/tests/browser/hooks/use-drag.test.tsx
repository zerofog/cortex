import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { useDrag } from '../../../src/browser/hooks/useDrag.js'
import { dispatchPointerEvent } from '../helpers.js'

function DragHarness({ onPositionChange }: {
  onPositionChange?: (x: number, y: number) => void
}): JSX.Element {
  const [pos, setPos] = useState({ x: 100, y: 100 })
  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) {
      setPos({ x, y })
      onPositionChange?.(x, y)
    },
  })

  return (
    <div
      data-testid="draggable"
      style={{ position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`, width: '300px', height: '460px' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span data-testid="drag-status">{isDragging ? 'dragging' : 'idle'}</span>
      <button data-testid="interactive">Click me</button>
    </div>
  )
}

describe('useDrag', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  function setup(props?: { onPositionChange?: (x: number, y: number) => void }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<DragHarness {...props} />, container)
    return container.querySelector('[data-testid="draggable"]') as HTMLElement
  }

  it('starts in idle state', () => {
    setup()
    expect(container.querySelector('[data-testid="drag-status"]')?.textContent).toBe('idle')
  })

  it('enters dragging state on pointerdown', async () => {
    const el = setup()
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="drag-status"]')?.textContent).toBe('dragging')
  })

  it('does not start drag on interactive elements', async () => {
    setup()
    const btn = container.querySelector('[data-testid="interactive"]') as HTMLElement
    dispatchPointerEvent(btn, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="drag-status"]')?.textContent).toBe('idle')
  })

  it('calls onDrag with new position during pointermove', async () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    el.getBoundingClientRect = () => ({
      x: 100, y: 100, width: 300, height: 460,
      top: 100, left: 100, right: 400, bottom: 560,
      toJSON() { return this },
    })
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointermove', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    expect(onPositionChange).toHaveBeenCalledWith(150, 150)
  })

  it('exits dragging state on pointerup', async () => {
    const el = setup()
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointerup', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="drag-status"]')?.textContent).toBe('idle')
  })

  it('exits dragging state on pointercancel', async () => {
    const el = setup()
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointercancel')
    await new Promise(r => setTimeout(r, 0))
    expect(container.querySelector('[data-testid="drag-status"]')?.textContent).toBe('idle')
  })
})
