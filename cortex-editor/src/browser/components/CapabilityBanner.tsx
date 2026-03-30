import { useState, useEffect } from 'preact/hooks'
import type { CortexChannel, StyleCapability } from '../../adapters/types.js'

export function CapabilityBanner({ channel }: { channel: CortexChannel }) {
  const [systems, setSystems] = useState<StyleCapability[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return channel.onMessage((msg) => {
      if (msg.type === 'capabilities') {
        const limited = msg.systems.filter(s => s.status !== 'supported')
        if (limited.length > 0) {
          setSystems(limited)
          // Don't reset dismissed — respect user's dismissal for the session
        }
      }
    })
  }, [channel])

  if (dismissed || systems.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          lineHeight: '1.4',
          background: '#eff6ff',
          color: '#1e40af',
          border: '1px solid #93c5fd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div>
          {systems.map((sys) => (
            <div key={sys.name} style={{ marginBottom: systems.length > 1 ? '4px' : 0 }}>
              <strong>{sys.name}</strong>
              {sys.reason
                ? `: ${sys.reason}`
                : sys.status === 'preview-only'
                  ? ': visual preview active — file writes not yet available.'
                  : sys.status === 'ai-required'
                    ? ': editing requires Claude Code.'
                    : ''}
            </div>
          ))}
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#1e40af',
            fontSize: '14px',
            padding: '0',
            flexShrink: 0,
          }}
          aria-label="Dismiss capability notice"
        >
          x
        </button>
      </div>
    </div>
  )
}
