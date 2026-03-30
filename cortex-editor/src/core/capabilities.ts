import type { DetectionResult } from './rewriter/detector.js'

export type CapabilityStatus = 'supported' | 'preview-only' | 'ai-required'

export interface StyleCapability {
  name: string
  status: CapabilityStatus
  reason?: string
}

export interface ResolverState {
  resolverAvailable: boolean
}

export function computeCapabilities(
  detection: DetectionResult,
  resolver: ResolverState,
): StyleCapability[] {
  const capabilities: StyleCapability[] = []

  if (detection.hasTailwind) {
    if (resolver.resolverAvailable) {
      capabilities.push({ name: 'Tailwind', status: 'supported' })
    } else {
      capabilities.push({
        name: 'Tailwind',
        status: 'preview-only',
        reason: detection.tailwindVersion === 4
          ? 'Tailwind v4 theme could not be resolved. Visual preview is active — file writes are not yet available.'
          : 'Tailwind theme could not be resolved. Visual preview is active — file writes require a valid Tailwind config.',
      })
    }
  }

  if (detection.hasCSSModules) {
    capabilities.push({ name: 'CSS Modules', status: 'supported' })
  }

  if (detection.hasCSSInJS) {
    capabilities.push({
      name: 'CSS-in-JS',
      status: 'ai-required',
      reason: 'CSS-in-JS editing requires Claude Code. Visual preview is active.',
    })
  }

  return capabilities
}
