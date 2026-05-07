import { PREVIEW_SOURCE_PREFIX, isPreviewSource } from '../shared/preview-source.js'
export { PREVIEW_SOURCE_PREFIX, isPreviewSource } from '../shared/preview-source.js'

export const PREVIEW_SOURCE_ATTR = 'data-cortex-preview-id'

let previewIdCounter = 0

export interface SourceResolutionHint {
  tagName: string
  className?: string
  id?: string
  textPreview: string
  domSelector: string
}

export interface ElementEditTarget {
  source: string
  applyMode: 'direct' | 'agent-resolve'
  sourceResolutionHint?: SourceResolutionHint
}

export function selectorForEditSource(source: string): string {
  if (isPreviewSource(source)) {
    return `[${PREVIEW_SOURCE_ATTR}="${CSS.escape(source.slice(PREVIEW_SOURCE_PREFIX.length))}"]`
  }
  return `[data-cortex-source="${CSS.escape(source)}"]`
}

export function getElementEditTarget(el: HTMLElement): ElementEditTarget {
  const source = el.getAttribute('data-cortex-source')
  if (source) return { source, applyMode: 'direct' }

  const previewId = ensurePreviewId(el)
  const previewSource = `${PREVIEW_SOURCE_PREFIX}${previewId}`
  return {
    source: previewSource,
    applyMode: 'agent-resolve',
    sourceResolutionHint: buildSourceResolutionHint(el),
  }
}

function ensurePreviewId(el: HTMLElement): string {
  const existing = el.getAttribute(PREVIEW_SOURCE_ATTR)
  if (existing) return existing
  previewIdCounter += 1
  const previewId = `p${Date.now().toString(36)}-${previewIdCounter.toString(36)}`
  el.setAttribute(PREVIEW_SOURCE_ATTR, previewId)
  return previewId
}

function buildSourceResolutionHint(el: HTMLElement): SourceResolutionHint {
  const className = typeof el.className === 'string' ? el.className.trim() : ''
  const id = el.id.trim()
  return {
    tagName: el.tagName.toLowerCase(),
    ...(className ? { className } : {}),
    ...(id ? { id } : {}),
    textPreview: (el.textContent ?? '').trim().slice(0, 240),
    domSelector: buildDomSelectorHint(el, className, id),
  }
}

function buildDomSelectorHint(el: HTMLElement, className: string, id: string): string {
  const tagName = el.tagName.toLowerCase()
  if (id) return `${tagName}#${id}`
  const testId = el.getAttribute('data-testid')
  if (testId) return `${tagName}[data-testid="${testId.slice(0, 120)}"]`
  if (className) {
    const firstClass = className.split(/\s+/)[0]
    if (firstClass) return `${tagName}.${firstClass}`
  }
  return tagName
}
