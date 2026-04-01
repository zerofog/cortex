import type { DetectionResult } from './rewriter/detector.js'
import type { ResolverState } from './capabilities.js'

export type EditStrategy = 'immediate' | 'deferred' | 'unsupported'

export interface EditClassificationInput {
  cssMapping?: string
}

/**
 * Classify an edit request into a write strategy.
 * - immediate: deterministic rewrite (CSS Modules, Tailwind AST) — <50ms, suppress HMR
 * - deferred: AI writer — batched, async, HMR required
 * - unsupported: no write path available — preview-only
 */
export function classifyEdit(
  edit: EditClassificationInput,
  detection: Pick<DetectionResult, 'hasCSSModules' | 'hasTailwind' | 'hasComponentLibrary' | 'hasCSSInJS'>,
  resolver?: Pick<ResolverState, 'resolverAvailable' | 'aiAvailable' | 'inlineStyleAvailable'>,
): EditStrategy {
  // CSS Modules annotated path — always immediate
  if (edit.cssMapping && detection.hasCSSModules) return 'immediate'

  // CSS Modules without annotation — inline style fallback or AI
  if (detection.hasCSSModules && !detection.hasTailwind) {
    if (resolver?.inlineStyleAvailable) return 'immediate'
    return resolver?.aiAvailable ? 'deferred' : 'unsupported'
  }

  // Tailwind with working resolver — immediate
  if (detection.hasTailwind && resolver?.resolverAvailable) return 'immediate'

  // Tailwind without resolver — inline styles are NOT the right fallback
  // (would accumulate inline styles alongside Tailwind utility classes)
  if (detection.hasTailwind && !resolver?.resolverAvailable) {
    return resolver?.aiAvailable ? 'deferred' : 'unsupported'
  }

  // Inline style rewriter — deterministic fallback for non-Tailwind JSX
  if (resolver?.inlineStyleAvailable) return 'immediate'

  // AI available — deferred (covers Tailwind fallback, component libs, CSS-in-JS)
  if (resolver?.aiAvailable) return 'deferred'

  // Nothing can handle it
  return 'unsupported'
}
