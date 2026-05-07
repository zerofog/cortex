export { MAX_SOURCE_HINT_FIELD_BYTES } from './pending-edit-limits.js'
export const PREVIEW_SOURCE_PREFIX = 'cortex-preview:'

export function isPreviewSource(source: string): boolean {
  return source.startsWith(PREVIEW_SOURCE_PREFIX)
}
