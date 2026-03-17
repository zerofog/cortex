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
