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
 * - Channel validation is handled upstream by the centralized zod parse in vite.ts;
 *   this hook trusts the already-validated `ServerToBrowser` type from onMessage.
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
