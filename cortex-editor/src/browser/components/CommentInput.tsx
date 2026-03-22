import type { JSX } from 'preact'
import { useState, useCallback } from 'preact/hooks'

export interface CommentInputProps {
  onSubmit: (text: string) => void
  agentConnected: boolean
}

export function CommentInput({ onSubmit, agentConnected }: CommentInputProps): JSX.Element {
  const [text, setText] = useState('')

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && text.trim()) {
      onSubmit(text.trim())
      setText('')
    }
  }, [text, onSubmit])

  const handleInput = useCallback((e: Event) => {
    setText((e.target as HTMLInputElement).value)
  }, [])

  return (
    <div class="cortex-comment-input">
      <input
        type="text"
        class="cortex-comment-input__field"
        placeholder={agentConnected ? 'Ask the AI agent...' : 'No agent connected'}
        value={text}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={!agentConnected}
      />
    </div>
  )
}
