import { useState, useEffect, useRef } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'

interface Toast {
  id: string
  message: string
  type: 'error' | 'success'
}

export function ErrorToast({ channel }: { channel: CortexChannel }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function addToast(t: Omit<Toast, 'id'>, autoDismissMs?: number) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...t, id }])
    if (autoDismissMs) {
      const timer = setTimeout(() => removeToast(id), autoDismissMs)
      timers.current.set(id, timer)
    }
  }

  function removeToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }

  useEffect(() => {
    return channel.onMessage((msg) => {
      if (msg.type === 'undo_sync_status' || msg.type === 'redo_sync_status') {
        // empty_stack is expected (browser stack leads, server may be shorter) — no toast.
        if (msg.status === 'failed' && msg.reason_code !== 'empty_stack') {
          const label = msg.type === 'undo_sync_status' ? 'Undo' : 'Redo'
          addToast({ message: msg.reason ?? `${label} sync failed`, type: 'error' }, 5000)
        }
      }
    })
  }, [channel])

  // Clear all timers on unmount
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t) }, [])

  if (toasts.length === 0) return null

  return (
    <div role="alert" aria-live="assertive" style={{ padding: '8px', pointerEvents: 'auto' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          data-toast={toast.type}
          style={{
            padding: '8px 12px',
            marginBottom: '4px',
            borderRadius: '4px',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: toast.type === 'error' ? '#991b1b' : '#166534',
            border: `1px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`,
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', padding: '0 0 0 8px' }}
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
