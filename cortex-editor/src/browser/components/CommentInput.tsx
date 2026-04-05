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
      setText('')  // Clear immediately (optimistic)
      setPending(true)
      setError(false)
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current)
        errorTimerRef.current = null
      }
      onSubmit(submitted).then(
        () => { if (mountedRef.current) { setPending(false) } },
        (err: unknown) => {
          if (!mountedRef.current) return
          console.warn('[cortex] Comment submission failed:', err instanceof Error ? err.message : err)
          setPending(false)
          setError(true)
          setText(submitted)  // Restore text on error for retry
          errorTimerRef.current = setTimeout(() => { if (mountedRef.current) setError(false) }, 3000)
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

  const placeholder = !agentConnected
    ? 'Waiting for agent — run cortex mcp'
    : pending
      ? 'Sending...'
      : error
        ? 'No response'
        : 'Ask the AI agent...'

  return (
    <div class={wrapperClass}>
      <input
        type="text"
        class="cortex-comment-input__field"
        aria-label="Comment to AI agent"
        aria-describedby={error ? 'cortex-comment-error' : undefined}
        placeholder={placeholder}
        value={text}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={!agentConnected || pending}
      />
      {pending && <span class="cortex-comment-input__spinner" />}
      {error && <span id="cortex-comment-error" class="cortex-comment-input__error" role="alert">Failed — press Enter to retry</span>}
    </div>
  )
}
