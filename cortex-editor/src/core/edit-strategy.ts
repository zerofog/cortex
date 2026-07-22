import type { DetectionResult } from './rewriter/detector.js'
import type { ResolverState } from './capabilities.js'

export type EditStrategy = 'immediate' | 'deferred' | 'unsupported'

export interface EditClassificationInput {
  cssMapping?: string
}

/**
 * Classify an edit request into a write strategy.
 * - immediate: deterministic rewrite (CSS Modules, Tailwind AST) — <50ms, suppress HMR
 * - deferred: edit needs source-level escalation — no in-process handler; pipeline emits terminal-failed
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

  // Tailwind with a working resolver — immediate utility-class rewrite.
  if (detection.hasTailwind && resolver?.resolverAvailable) return 'immediate'

  // Tailwind WITHOUT a resolvable theme: editing the utility classes is off
  // (we can't map values to valid tokens), but a manual OVERRIDE still applies
  // and saves — an inline style, or CSS Modules if the app has them. It just
  // doesn't touch the classes. This is the P1-2b scoped degradation: an
  // unresolved theme disables Tailwind-class editing ONLY, not the whole write
  // path. Previously this returned 'unsupported' and killed even inline
  // overrides, so a config-load hiccup made every edit silently no-op. AI, if
  // present, is preferred (it can edit the class); otherwise fall through to
  // the deterministic inline rewriter below.
  if (detection.hasTailwind && !resolver?.resolverAvailable && resolver?.aiAvailable) {
    return 'deferred'
  }

  // Inline style rewriter — deterministic fallback for non-Tailwind JSX AND the
  // manual-override path for a Tailwind app whose theme won't resolve.
  if (resolver?.inlineStyleAvailable) return 'immediate'

  // AI available — deferred (covers Tailwind fallback, component libs, CSS-in-JS)
  if (resolver?.aiAvailable) return 'deferred'

  // Nothing can handle it
  return 'unsupported'
}
