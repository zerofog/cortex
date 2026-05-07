export const PREVIEW_SOURCE_PREFIX = 'cortex-preview:'

export function isPreviewSource(source: string): boolean {
  return source.startsWith(PREVIEW_SOURCE_PREFIX)
}
