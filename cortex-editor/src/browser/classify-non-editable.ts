const NON_VISUAL_TAGS: ReadonlySet<string> = new Set(['script', 'style', 'meta', 'head', 'title', 'link', 'noscript'])

export function isNonEditable(el: Element): boolean {
  return NON_VISUAL_TAGS.has(el.tagName.toLowerCase()) || !el.closest('[data-cortex-source]')
}
