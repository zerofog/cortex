import type { ServerToBrowser } from '../adapters/types.js'

/** Augment Window with Cortex globals injected by framework adapters */
declare global {
  interface Window {
    /** Vite adapter: sends a message to the server via HMR custom event */
    __cortex_send__?: (msg: unknown) => void
    /** Vite adapter: receives server messages routed through HMR */
    __cortex_channel__?: {
      handleServerMessage(data: ServerToBrowser): void
    }
    /** WebSocket port injected by server adapter. Falls back to 24678. */
    __cortex_ws_port__?: number
    /** Idempotency guard: toggle shortcut keydown listener already registered */
    __cortex_toggle_registered__?: boolean
    /** Queued toggle message when channel is not yet created */
    __cortex_pending_toggle__?: { type: 'cortex-toggle'; active: boolean }
  }
}

/** Declare vanilla-colorful Web Component for JSX/TSX usage */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace preact.JSX {
    interface IntrinsicElements {
      'hex-color-picker': preact.JSX.HTMLAttributes & { color?: string }
    }
  }
}

export {}
