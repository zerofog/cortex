import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { useDrag } from '../../../src/browser/hooks/useDrag.js'
import { dispatchPointerEvent } from '../helpers.js'

function DragHarness({ onPositionChange, onDragEnd }: {
  onPositionChange?: (x: number, y: number) => void
  onDragEnd?: (x: number, y: number) => void
}): JSX.Element {
  const [pos, setPos] = useState({ x: 100, y: 100 })
  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDrag({
    onDrag(x, y) {
      setPos({ x, y })
      onPositionChange?.(x, y)
    },
    onDragEnd,
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

  function setup(props?: { onPositionChange?: (x: number, y: number) => void, onDragEnd?: (x: number, y: number) => void }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<DragHarness {...props} />, container)
    return container.querySelector('[data-testid="draggable"]') as HTMLElement
  }

  it('does not call onDrag without pointerdown', () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    dispatchPointerEvent(el, 'pointermove', { clientX: 200, clientY: 200 })
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('calls onDrag after pointerdown + pointermove', async () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointermove', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    expect(onPositionChange).toHaveBeenCalled()
  })

  it('does not start drag on interactive elements', async () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    const btn = el.querySelector('[data-testid="interactive"]') as HTMLElement
    dispatchPointerEvent(btn, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointermove', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    expect(onPositionChange).not.toHaveBeenCalled()
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

  it('stops drag on pointerup', async () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointerup', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    onPositionChange.mockClear()
    dispatchPointerEvent(el, 'pointermove', { clientX: 250, clientY: 250 })
    await new Promise(r => setTimeout(r, 0))
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('stops drag on pointercancel', async () => {
    const onPositionChange = vi.fn()
    const el = setup({ onPositionChange })
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointercancel')
    await new Promise(r => setTimeout(r, 0))
    onPositionChange.mockClear()
    dispatchPointerEvent(el, 'pointermove', { clientX: 250, clientY: 250 })
    await new Promise(r => setTimeout(r, 0))
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it('calls onDragEnd on pointercancel', async () => {
    const onDragEnd = vi.fn()
    const el = setup({ onDragEnd })
    dispatchPointerEvent(el, 'pointerdown', { clientX: 150, clientY: 150 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointermove', { clientX: 200, clientY: 200 })
    await new Promise(r => setTimeout(r, 0))
    dispatchPointerEvent(el, 'pointercancel')
    await new Promise(r => setTimeout(r, 0))
    expect(onDragEnd).toHaveBeenCalled()
  })
})
