import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { Annotation } from '../../adapters/types.js'

export interface CommentThreadProps {
  annotation: Annotation
  onReply: (annotationId: string, text: string) => void
}

export function CommentThread({ annotation, onReply }: CommentThreadProps): JSX.Element {
  const [replyText, setReplyText] = useState('')

  const handleReplyKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && replyText.trim()) {
      onReply(annotation.id, replyText.trim())
      setReplyText('')
    }
  }, [replyText, onReply, annotation.id])

  const statusClass = `cortex-thread__status--${annotation.status}`

  return (
    <div class="cortex-thread">
      <div class="cortex-thread__header">
        <span class={`cortex-thread__status ${statusClass}`}>
          {annotation.status === 'pending' && '○'}
          {annotation.status === 'acknowledged' && '◉'}
          {annotation.status === 'resolved' && '✓'}
          {annotation.status === 'dismissed' && '✗'}
        </span>
        <span class="cortex-thread__text">{annotation.text}</span>
      </div>

      {annotation.status === 'acknowledged' && (
        <div class="cortex-thread__working">Working...</div>
      )}

      {annotation.resolution && (
        <div class="cortex-thread__resolution">
          Applied: {annotation.resolution.summary}
        </div>
      )}

      {annotation.dismissReason && (
        <div class="cortex-thread__dismiss-reason">
          Dismissed: {annotation.dismissReason}
        </div>
      )}

      {annotation.thread.length > 0 && (
        <div class="cortex-thread__messages">
          {annotation.thread.map(msg => (
            <div key={msg.id} class={`cortex-thread__message cortex-thread__message--${msg.from}`}>
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {(annotation.status === 'pending' || annotation.status === 'acknowledged') && (
        <input
          type="text"
          class="cortex-thread__reply"
          placeholder="Reply..."
          value={replyText}
          onInput={(e: Event) => setReplyText((e.target as HTMLInputElement).value)}
          onKeyDown={handleReplyKeyDown}
        />
      )}
    </div>
  )
}
