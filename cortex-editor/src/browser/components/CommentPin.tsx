import type { JSX } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { Annotation, CortexChannel } from '../../adapters/types.js'
import { CommentThread } from './CommentThread.js'

export interface CommentPinProps {
  annotations: Annotation[]
  commentMode: boolean
  channel: CortexChannel
  onReply: (annotationId: string, text: string) => void
}

export function CommentPin({ annotations, commentMode, channel, onReply }: CommentPinProps): JSX.Element {
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<{ clickX: number; clickY: number; elementSource: string } | null>(null)
  const [pinInputPos, setPinInputPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [pinText, setPinText] = useState('')
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())

  // Re-compute pin positions on mount, annotation change, scroll, resize
  useEffect(() => {
    if (annotations.length === 0) {
      setPositions(new Map())
      return
    }

    function updatePositions(): void {
      const newPositions = new Map<string, { x: number; y: number }>()
      for (const ann of annotations) {
        if (!ann.pinPosition) continue
        const el = document.querySelector(`[data-cortex-source="${ann.elementSource}"]`)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        newPositions.set(ann.id, {
          x: rect.left + ann.pinPosition.x * rect.width,
          y: rect.top + ann.pinPosition.y * rect.height,
        })
      }
      setPositions(newPositions)
    }

    updatePositions()
    const handleScroll = () => requestAnimationFrame(updatePositions)
    const handleResize = () => requestAnimationFrame(updatePositions)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [annotations])

  // Pin input follows element on scroll, clamps to viewport, avoids panel (right 320px)
  useEffect(() => {
    if (!pinTarget) return
    const INPUT_W = 200
    const INPUT_H = 32
    const PANEL_W = 320
    const GAP = 8

    function reposition(): void {
      const el = document.querySelector(`[data-cortex-source="${pinTarget!.elementSource}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Ideal: centered below element
      let x = rect.left + (rect.width - INPUT_W) / 2
      let y = rect.bottom + GAP

      // If element is above viewport, stick to top
      if (rect.bottom < 0) y = GAP
      // If element is below viewport, stick to bottom
      if (rect.top > vh) y = vh - INPUT_H - GAP

      // Clamp to viewport edges
      x = Math.max(GAP, Math.min(x, vw - INPUT_W - PANEL_W - GAP))
      y = Math.max(GAP, Math.min(y, vh - INPUT_H - GAP))

      setPinInputPos({ x, y })
    }

    reposition()
    const onScroll = () => requestAnimationFrame(reposition)
    const onResize = () => requestAnimationFrame(reposition)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [pinTarget])

  // Comment mode: crosshair cursor + click handler
  useEffect(() => {
    if (!commentMode) {
      setPinTarget(null)
      document.body.style.cursor = ''
      return
    }

    document.body.style.cursor = 'crosshair'

    function handleClick(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (!target || target.closest('[data-cortex-host]')) return
      const source = target.getAttribute('data-cortex-source') || target.closest('[data-cortex-source]')?.getAttribute('data-cortex-source')
      if (!source) return
      const el = document.querySelector(`[data-cortex-source="${source}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      e.preventDefault()
      e.stopPropagation()
      setPinTarget({ clickX: e.clientX, clickY: e.clientY, elementSource: source })
    }

    window.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('click', handleClick, true)
      document.body.style.cursor = ''
    }
  }, [commentMode])

  const handlePinSubmit = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !pinText.trim() || !pinTarget) return
    const el = document.querySelector(`[data-cortex-source="${pinTarget.elementSource}"]`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    channel.send({
      type: 'comment',
      elementSource: pinTarget.elementSource,
      text: pinText.trim(),
      pinPosition: {
        x: (pinTarget.clickX - rect.left) / rect.width,
        y: (pinTarget.clickY - rect.top) / rect.height,
      },
    })
    setPinText('')
    setPinTarget(null)
  }, [pinText, pinTarget, channel])

  const pinnedAnnotations = annotations.filter(a => a.pinPosition)
  const selectedAnnotation = selectedPinId ? annotations.find(a => a.id === selectedPinId) : null

  return (
    <>
      {commentMode && <div class="cortex-pin--mode" />}

      {pinnedAnnotations.map(ann => {
        const pos = positions.get(ann.id)
        if (!pos) return null
        return (
          <div
            key={ann.id}
            class="cortex-pin"
            style={{ left: `${pos.x - 6}px`, top: `${pos.y - 6}px` }}
            onClick={() => setSelectedPinId(selectedPinId === ann.id ? null : ann.id)}
          />
        )
      })}

      {selectedAnnotation && (
        <div class="cortex-pin__thread" style={{
          left: `${(positions.get(selectedAnnotation.id)?.x ?? 0) + 16}px`,
          top: `${(positions.get(selectedAnnotation.id)?.y ?? 0) - 6}px`,
        }}>
          <CommentThread annotation={selectedAnnotation} onReply={onReply} />
        </div>
      )}

      {pinTarget && (
        <div class="cortex-pin__input" style={{ left: `${pinInputPos.x}px`, top: `${pinInputPos.y}px` }}>
          <input
            type="text"
            class="cortex-pin__input-field"
            placeholder="Add comment..."
            value={pinText}
            onInput={(e: Event) => setPinText((e.target as HTMLInputElement).value)}
            onKeyDown={handlePinSubmit}
            autoFocus
          />
        </div>
      )}
    </>
  )
}
