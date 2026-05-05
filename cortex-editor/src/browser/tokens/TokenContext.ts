import { createContext } from 'preact'
import type { SpacingToken } from '../../core/tailwind-resolver.js'

/**
 * Provides resolved spacing tokens to any descendant that needs them.
 * Populated at Panel level from `cortex-app-reducer` state via the
 * `spacingTokens` prop (sourced from the `hello` handshake). NumericInput
 * reads via useContext to avoid prop-drilling the token list through
 * every section component.
 */
export const SpacingTokensContext = createContext<readonly SpacingToken[]>([])
