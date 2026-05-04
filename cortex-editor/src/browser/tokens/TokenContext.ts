import { createContext } from 'preact'
import type { SpacingToken } from '../../core/tailwind-resolver.js'

/**
 * Provides resolved spacing tokens to any descendant that needs them.
 * Populated at Panel level via useTokenSubscription(channel); NumericInput
 * reads via useContext to avoid prop-drilling the channel or token list
 * through every section component.
 */
export const SpacingTokensContext = createContext<readonly SpacingToken[]>([])
