import { useState, useEffect } from 'preact/hooks'
import type { CortexChannel } from '../../adapters/types.js'
import type { SpacingToken } from '../../core/tailwind-resolver.js'

export interface UseTokenSubscriptionResult {
  readonly tokens: readonly SpacingToken[]
  readonly isLoading: boolean
}

/**
 * Subscribes to `hello` messages on the given channel and returns spacing tokens.
 *
 * - Before the first `hello` arrives: `{ tokens: [], isLoading: true }`
 * - After first `hello`: `{ tokens, isLoading: false }` (tokens may be empty if
 *   the server omitted `spacingTokens` from the payload)
 * - The `ServerToBrowser` type is inferred from `serverToBrowserSchema` in
 *   src/schemas/wire-format.ts (compile-time safety only — there is no runtime
 *   browser-side parse; the server emits already-validated payloads).
 *   TRUST BOUNDARY: this hook trusts that `msg.spacingTokens` matches the
 *   schema shape. If a future contributor adds a raw-WebSocket path that
 *   bypasses the centralized channel, defensive `spacingTokenSchema.array()
 *   .safeParse(incoming)` here would be the recovery point.
 * - On channel transition, resets state before re-subscribing so consumers
 *   never observe stale tokens from a dead channel during the new handshake.
 * - Cleans up the channel subscription on unmount.
 */
export function useTokenSubscription(channel: CortexChannel | null): UseTokenSubscriptionResult {
  const [tokens, setTokens] = useState<readonly SpacingToken[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTokens([])
    setIsLoading(true)
    if (!channel) return

    const unsub = channel.onMessage((msg) => {
      if (msg.type !== 'hello') return
      const incoming = msg.spacingTokens ?? []
      setTokens(incoming)
      setIsLoading(false)
    })

    return unsub
  }, [channel])

  return { tokens, isLoading }
}
