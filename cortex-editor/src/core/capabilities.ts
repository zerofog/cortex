import type { DetectionResult } from './rewriter/detector.js'

export type CapabilityStatus = 'supported' | 'preview-only' | 'ai-required'

export interface StyleCapability {
  name: string
  status: CapabilityStatus
  reason?: string
}

export interface ResolverState {
  resolverAvailable: boolean
  aiAvailable?: boolean
  /** InlineStyleRewriter available — deterministic fallback for any JSX element */
  inlineStyleAvailable?: boolean
}

export function computeCapabilities(
  detection: DetectionResult,
  resolver: ResolverState,
): StyleCapability[] {
  const capabilities: StyleCapability[] = []

  if (detection.hasTailwind) {
    if (resolver.resolverAvailable) {
      capabilities.push({ name: 'Tailwind', status: 'supported' })
    } else if (resolver.aiAvailable) {
      capabilities.push({ name: 'Tailwind', status: 'supported', reason: 'AI-assisted editing active.' })
    } else {
      // Theme couldn't be resolved → editing utility CLASSES is off. But if the
      // inline-style rewriter is available, manual overrides still apply and
      // save to source (P1-2b) — set the reason to match, so the user knows
      // their edits persist even though the classes stay untouched.
      const versionNote = detection.tailwindVersion === 4
        ? 'Tailwind v4 theme could not be resolved'
        : 'Tailwind theme could not be resolved (is tailwindcss installed and the config readable?)'
      capabilities.push({
        name: 'Tailwind',
        status: 'preview-only',
        reason: resolver.inlineStyleAvailable
          ? `${versionNote}, so editing utility classes is disabled — inline-style overrides still apply and save to source.`
          : `${versionNote}. Visual preview is active — file writes require a valid Tailwind config.`,
      })
    }
  }

  if (detection.hasCSSModules) {
    capabilities.push({ name: 'CSS Modules', status: 'supported' })
  }

  if (detection.hasCSSInJS) {
    if (resolver.aiAvailable) {
      capabilities.push({ name: 'CSS-in-JS', status: 'supported', reason: 'AI-assisted editing active.' })
    } else {
      capabilities.push({
        name: 'CSS-in-JS',
        status: 'ai-required',
        reason: 'CSS-in-JS editing requires Claude Code. Visual preview is active.',
      })
    }
  }

  if (detection.hasComponentLibrary) {
    if (resolver.aiAvailable) {
      capabilities.push({ name: 'Component Library', status: 'supported', reason: 'AI-assisted editing active.' })
    } else {
      capabilities.push({
        name: 'Component Library',
        status: 'ai-required',
        reason: 'Component library editing requires Claude Code. Visual preview is active.',
      })
    }
  }

  return capabilities
}
