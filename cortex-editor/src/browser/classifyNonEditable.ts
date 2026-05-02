const NON_VISUAL_TAGS: ReadonlySet<string> = Object.freeze(
  new Set(['script', 'style', 'meta', 'head', 'title', 'link', 'noscript']),
)

export function isNonEditable(el: HTMLElement): boolean {
  if (NON_VISUAL_TAGS.has(el.tagName.toLowerCase())) return true
  if (!el.closest('[data-cortex-source]')) return true
  return false
}
