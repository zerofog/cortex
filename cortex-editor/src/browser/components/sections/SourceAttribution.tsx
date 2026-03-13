import type { JSX } from 'preact'
import { encodeFilePath } from '../../label.js'

export type AttributionState =
  | { type: 'static-class'; className: string; filePath?: string }
  | { type: 'css-module'; file: string; line: number }
  | { type: 'library' }
  | { type: 'dynamic' }
  | { type: 'writing'; property: string; value: string }
  | { type: 'ai-processing' }
  | { type: 'completed' }
  | { type: 'error'; message: string }

export interface SourceAttributionProps {
  attribution: AttributionState | null
}

export function SourceAttribution({ attribution }: SourceAttributionProps): JSX.Element | null {
  if (!attribution) return null

  switch (attribution.type) {
    case 'static-class':
      return attribution.filePath ? (
        <a class="cortex-attribution cortex-attribution--clickable" href={`vscode://file/${encodeFilePath(attribution.filePath)}`}>
          {attribution.className}
        </a>
      ) : (
        <span class="cortex-attribution">
          {attribution.className}
        </span>
      )
    case 'css-module':
      return (
        <span class="cortex-attribution">
          {attribution.file}:{attribution.line}
        </span>
      )
    case 'library':
      return <span class="cortex-attribution cortex-attribution--italic">(library)</span>
    case 'dynamic':
      return <span class="cortex-attribution cortex-attribution--italic">(dynamic)</span>
    case 'writing':
      return (
        <span class="cortex-attribution cortex-attribution--writing">
          {attribution.property}: {attribution.value}
        </span>
      )
    case 'ai-processing':
      return <span class="cortex-attribution cortex-attribution--processing">&#9685; updating...</span>
    case 'completed':
      return <span class="cortex-attribution cortex-attribution--completed">&#10003;</span>
    case 'error':
      return (
        <span class="cortex-attribution cortex-attribution--error" title={attribution.message}>
          &#9888;
        </span>
      )
  }
}
