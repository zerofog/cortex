// Element (not HTMLElement): tag-name classification works for all Elements.
const NON_VISUAL_TAGS: ReadonlySet<string> = new Set(['script', 'style', 'meta', 'head', 'title', 'link', 'noscript', 'template'])
const DOCUMENT_ROOT_TAGS: ReadonlySet<string> = new Set(['html', 'body'])

export function isNonEditable(el: Element): boolean {
  const tagName = el.tagName.toLowerCase()
  return NON_VISUAL_TAGS.has(tagName) || DOCUMENT_ROOT_TAGS.has(tagName)
}
