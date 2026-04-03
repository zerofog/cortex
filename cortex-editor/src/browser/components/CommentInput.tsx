import type { JSX } from 'preact'
import { useState, useCallback, useRef, useEffect } from 'preact/hooks'

export interface CommentInputProps {
  onSubmit: (text: string) => Promise<void>
  agentConnected: boolean
}

export function CommentInput({ onSubmit, agentConnected }: CommentInputProps): JSX.Element {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => () => {
    mountedRef.current = false
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && text.trim() && !pending) {
      const submitted = text.trim()
      setPending(true)
      setError(false)
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current)
        errorTimerRef.current = null
      }
      onSubmit(submitted).then(
        () => { if (mountedRef.current) { setPending(false); setText('') } },
        (err: unknown) => {
          if (!mountedRef.current) return
          console.warn('[cortex] Comment submission failed:', err instanceof Error ? err.message : err)
          setPending(false)
          setError(true)
          // Don't clear text — user can press Enter to retry
          errorTimerRef.current = setTimeout(() => { if (mountedRef.current) setError(false) }, 5000)
        },
      )
    }
  }, [text, onSubmit, pending])

  const handleInput = useCallback((e: Event) => {
    setText((e.target as HTMLInputElement).value)
  }, [])

  const wrapperClass = error
    ? 'cortex-comment-input cortex-comment-input--error'
    : 'cortex-comment-input'

  const placeholder = pending
    ? 'Sending...'
    : error
      ? 'Failed — press Enter to retry'
      : agentConnected
        ? 'Ask the AI agent...'
        : 'Waiting for agent — run cortex mcp'

  return (
    <div class={wrapperClass}>
      <input
        type="text"
        class="cortex-comment-input__field"
        aria-label="Comment to AI agent"
        placeholder={placeholder}
        value={text}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={!agentConnected || pending}
      />
      {pending && <span class="cortex-comment-input__spinner" />}
    </div>
  )
}
