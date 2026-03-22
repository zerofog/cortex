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
  const [pinInput, setPinInput] = useState<{ x: number; y: number; clickX: number; clickY: number; elementSource: string } | null>(null)
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

  // Comment mode: crosshair cursor + click handler
  useEffect(() => {
    if (!commentMode) {
      setPinInput(null)
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
      // Anchor input to element's top-right corner; store click coords for pin position
      setPinInput({ x: rect.right + 8, y: rect.top, clickX: e.clientX, clickY: e.clientY, elementSource: source })
    }

    window.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('click', handleClick, true)
      document.body.style.cursor = ''
    }
  }, [commentMode])

  const handlePinSubmit = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !pinText.trim() || !pinInput) return
    const el = document.querySelector(`[data-cortex-source="${pinInput.elementSource}"]`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    channel.send({
      type: 'comment',
      elementSource: pinInput.elementSource,
      text: pinText.trim(),
      pinPosition: {
        x: (pinInput.clickX - rect.left) / rect.width,
        y: (pinInput.clickY - rect.top) / rect.height,
      },
    })
    setPinText('')
    setPinInput(null)
  }, [pinText, pinInput, channel])

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

      {pinInput && (
        <div class="cortex-pin__input" style={{ left: `${pinInput.x + 16}px`, top: `${pinInput.y - 12}px` }}>
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
