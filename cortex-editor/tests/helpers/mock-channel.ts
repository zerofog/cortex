import type { ServerChannel, ServerToBrowser, BrowserToServer } from '../../src/adapters/types.js'

/** Shared mock for ServerChannel. Captures sent messages in `sent` array. */
export function mockChannel(): ServerChannel & { sent: ServerToBrowser[] } {
  const sent: ServerToBrowser[] = []
  return {
    sent,
    send(msg: ServerToBrowser) { sent.push(msg) },
    broadcast(msg: ServerToBrowser) { sent.push(msg) },
    onMessage(_handler: (msg: BrowserToServer) => void) { return () => {} },
    async dispose() {},
  }
}
