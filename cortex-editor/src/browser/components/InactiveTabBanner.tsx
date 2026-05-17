import { useState } from 'preact/hooks'

export interface InactiveTabBannerProps {
  message: string | null
}

export function InactiveTabBanner({ message }: InactiveTabBannerProps) {
  // Track which exact message string was dismissed instead of a boolean flag.
  // A new message (different string from the one that was dismissed) re-shows
  // the banner without needing an effect to reset state on the prop change.
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null)

  if (!message || message === dismissedMessage) return null

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
          background: '#fef3c7',
          color: '#92400e',
          border: '1px solid #fcd34d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div>{message}</div>
        <button
          onClick={() => setDismissedMessage(message)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#92400e',
            fontSize: '14px',
            padding: '0',
            flexShrink: 0,
          }}
          aria-label="Dismiss inactive-tab notice"
        >
          x
        </button>
      </div>
    </div>
  )
}
