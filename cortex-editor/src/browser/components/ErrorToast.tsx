import { useState, useEffect } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'

interface Toast {
  id: string
  message: string
  type: 'error' | 'success'
}

export function ErrorToast({ channel }: { channel: CortexChannel }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  function addToast(t: Omit<Toast, 'id'>, autoDismissMs?: number) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...t, id }])
    if (autoDismissMs) setTimeout(() => removeToast(id), autoDismissMs)
  }

  function removeToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    return channel.onMessage((msg) => {
      if (msg.type === 'edit_status' && msg.status === 'failed') {
        const isActionable = msg.reason?.includes('Connect') || msg.reason?.includes('install')
        addToast(
          { message: msg.reason ?? 'Edit failed', type: 'error' },
          isActionable ? undefined : 5000,
        )
      }
      if (msg.type === 'undo_status') {
        if (msg.status === 'done') {
          addToast({ message: `Undo: restored ${msg.restoredFile}`, type: 'success' }, 2000)
        } else if (msg.status === 'failed') {
          addToast({ message: msg.reason, type: 'error' }, 5000)
        }
      }
      if (msg.type === 'redo_status') {
        if (msg.status === 'done') {
          addToast({ message: `Redo: restored ${msg.restoredFile}`, type: 'success' }, 2000)
        } else if (msg.status === 'failed') {
          addToast({ message: msg.reason, type: 'error' }, 5000)
        }
      }
    })
  }, [channel])

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, padding: '8px' }}>
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
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
