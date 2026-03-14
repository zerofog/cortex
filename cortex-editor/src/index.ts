// Main package exports
export type {
  FrameworkAdapter,
  TransformResult,
  SourceMap,
  SourceTransformOptions,
  ServerChannel,
  BrowserToServer,
  ServerToBrowser,
  ElementContext,
  CortexChannel,
} from './adapters/types.js'

export { createSourceTransform } from './adapters/source-transform.js'

// Core edit pipeline
export { EditPipeline } from './core/edit-pipeline.js'
export type { EditRequest, EditPipelineOptions } from './core/edit-pipeline.js'
export { TailwindResolver } from './core/tailwind-resolver.js'
export type { ResolvedTheme } from './core/tailwind-resolver.js'
export { TailwindRewriter } from './core/rewriter/tailwind.js'
export type { RewriteRequest, RewriteResult } from './core/rewriter/types.js'
export { HMRVerifier } from './core/hmr-verifier.js'
export type { PendingEdit } from './core/hmr-verifier.js'
