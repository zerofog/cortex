/**
 * Selection metadata — captures enough identity signals at selection time
 * to survive HMR-induced DOM node replacement (ZF0-1292 follow-up).
 *
 * The core problem: `data-cortex-source` is per *source location* (file:line:col
 * set by the source-transform at build time), not per *rendered instance*.
 * Two rendered siblings from the same `.map()` share the attribute. When HMR
 * replaces DOM nodes, naive `document.querySelector('[data-cortex-source="..."]')`
 * can pick the wrong sibling.
 *
 * This module captures three identity signals at selection time:
 *   1. Position — nth among siblings sharing the same source
 *   2. Content — textContent snapshot (for reorder detection)
 *   3. Tree — whether the element lives inside an open shadow root
 *
 * `reResolveSelection` consumes those signals with a smart-fallback algorithm:
 *   primary   → matches[savedIndex]           (position stable, common case)
 *   secondary → find(m => textContent === hash) if position-content mismatch
 *               (reorder detected — follow content to new index)
 *   tertiary  → matches[savedIndex]           (content edited in place)
 *   clear     → matches empty OR index out of bounds
 */

const isHTMLElement = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement

/** Metadata captured at selection time. Must round-trip losslessly across
 *  HMR cycles — stored in a ref alongside the active selection. */
export interface SelectionMetadata {
  /** `data-cortex-source` value (file:line:col) at selection time.
   *  Null if the selected element had no source attribute. */
  source: string | null
  /** Zero-based index among siblings sharing the same `source`. `-1` when
   *  source is null or the element isn't among its own siblings (shouldn't
   *  happen in practice; guarded). */
  index: number
  /** Trimmed textContent at selection time. Used to distinguish array
   *  reorder from in-place content edit. Empty string is a valid hash for
   *  icon-only elements. */
  contentHash: string
  /** True if the selected element's root is a ShadowRoot (vs Document).
   *  Used to gate the deep-query fallback in re-resolution. */
  inShadowRoot: boolean
}

/**
 * Snapshot identity signals at the moment of selection. Must be called
 * while the element is still connected to the document/shadow tree.
 */
export function captureSelectionMetadata(el: HTMLElement): SelectionMetadata {
  const source = el.getAttribute('data-cortex-source')
  const contentHash = (el.textContent ?? '').trim()
  const inShadowRoot = el.getRootNode() instanceof ShadowRoot

  if (!source) {
    return { source: null, index: -1, contentHash, inShadowRoot }
  }

  const selector = `[data-cortex-source="${CSS.escape(source)}"]`
  const flat = flatQueryAll(selector)
  // If the element lives inside a shadow root, the flat query won't see it —
  // compute the index among its shadow-tree siblings via deep traversal.
  // Mirrors the fallback used in `reResolveSelection` for consistency.
  const siblings = (flat.length === 0 && inShadowRoot)
    ? deepQuerySelectorAll(selector)
    : flat
  const index = siblings.indexOf(el)
  return { source, index, contentHash, inShadowRoot }
}

/** Standard top-level-document attribute query, filtered to HTMLElement. */
function flatQueryAll(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(selector)).filter(isHTMLElement)
}

/**
 * Traverse open shadow roots recursively. Closed shadow roots are opaque
 * from outside and cannot be traversed — documented limitation.
 *
 * Performance: walks every element under `root` looking for shadow hosts.
 * Only invoked as fallback when the top-level flat query returns zero AND
 * the selected element was originally in a shadow tree.
 */
export function deepQuerySelectorAll(
  selector: string,
  root: Document | ShadowRoot = document,
): HTMLElement[] {
  const matches: HTMLElement[] = []
  for (const el of root.querySelectorAll(selector)) {
    if (isHTMLElement(el)) matches.push(el)
  }
  for (const el of root.querySelectorAll('*')) {
    // `shadowRoot` is only non-null when the shadow was attached with
    // `{mode: 'open'}`. Closed shadows are invisible from outside.
    if (el.shadowRoot) {
      matches.push(...deepQuerySelectorAll(selector, el.shadowRoot))
    }
  }
  return matches
}

/**
 * Re-resolve a selection after HMR using the captured metadata.
 *
 * Smart-fallback algorithm (confirmed by user 2026-04-21):
 *   1. If no matches at all → null (element removed)
 *   2. If `matches[savedIndex]` exists:
 *      a. content at that index === savedContent → return it (stable)
 *      b. saved content exists elsewhere in matches → return that element
 *         (reorder detected; selection follows content)
 *      c. saved content not found anywhere → return matches[savedIndex]
 *         (content edited in place; preserve position)
 *   3. If savedIndex is out of bounds → null (list shrank past the index)
 *
 * The `byContent` search is skipped for empty contentHash to avoid matching
 * the first empty-content element when the selected element was icon-only.
 */
export function reResolveSelection(meta: SelectionMetadata): HTMLElement | null {
  if (!meta.source) return null

  const selector = `[data-cortex-source="${CSS.escape(meta.source)}"]`
  const flat = flatQueryAll(selector)
  const matches = (flat.length === 0 && meta.inShadowRoot)
    ? deepQuerySelectorAll(selector)
    : flat

  if (matches.length === 0) return null

  const atIndex = meta.index >= 0 ? matches[meta.index] ?? null : null
  if (!atIndex) return null // index out of bounds → clear

  if (atIndex.textContent?.trim() === meta.contentHash) return atIndex

  // Content differs at the saved index. Check if the saved content lives
  // elsewhere (list was reordered). Skip the search for empty content — it
  // would false-positive on the first icon-only element.
  //
  // Tie-break: if multiple matches carry the saved content (e.g., `[A, B, A]`
  // reordered to `[A, A, B]` — both zeroth and first carry the user's "A"),
  // prefer the candidate closest to the saved index. This handles the
  // duplicate-content reorder case where a naive find() would collapse to
  // index 0.
  if (meta.contentHash !== '') {
    const candidates: number[] = []
    for (let i = 0; i < matches.length; i++) {
      if (matches[i]?.textContent?.trim() === meta.contentHash) candidates.push(i)
    }
    if (candidates.length > 0) {
      const nearest = candidates.reduce((best, idx) =>
        Math.abs(idx - meta.index) < Math.abs(best - meta.index) ? idx : best,
      )
      return matches[nearest] ?? null
    }
  }

  // Content edited in place: preserve at saved index.
  return atIndex
}

/** File extensions treated as CSS for HMR-filter purposes. Any file in the
 *  HMR change list matching this regex triggers a full Panel refresh because
 *  cascade changes can affect any element. */
const CSS_EXT = /\.(css|scss|sass|less|styl|stylus)$/i

/** Default maximum depth for ancestor walk in `hmrFilesAffectElement`. Chosen
 *  empirically — 20 levels covers typical React component nesting without the
 *  unbounded-walk cost on pathological trees. Override via the `maxDepth`
 *  parameter if needed. */
const DEFAULT_ANCESTOR_DEPTH = 20

/**
 * Given a list of files changed in a single HMR cycle, decide whether the
 * Panel should refresh its computed state for the currently selected element.
 *
 * Returns true (refresh) if ANY of:
 *   - A CSS/SCSS/module CSS file is in the list (cascade could affect anything)
 *   - The element's own `data-cortex-source` file is in the list
 *   - Any ancestor's `data-cortex-source` file (up to maxDepth) is in the list
 *
 * Returns false (skip) only when we're confident the change is unrelated.
 * Conservative by design: false is only returned when all ancestor files are
 * known and none match. Callers should treat an empty or missing `files`
 * argument as "refresh always" (pass true) — this function assumes the caller
 * has already confirmed the list is present.
 */
export function hmrFilesAffectElement(
  files: string[],
  element: HTMLElement,
  maxDepth: number = DEFAULT_ANCESTOR_DEPTH,
): boolean {
  // Any CSS file: cascade may affect anything visible.
  if (files.some(f => CSS_EXT.test(f))) return true

  // Path normalization: Vite's `update.updates[].path` is URL-style with a
  // leading `/` (e.g. `/src/App.tsx`) and may include query strings. The
  // source-transform stores `data-cortex-source` as relative without the
  // leading slash (e.g. `src/App.tsx:12:3`). Normalize both sides to the
  // same shape before comparing, or the filter never matches JSX edits —
  // Round 2 ship-blocker.
  const normalizePath = (p: string): string =>
    p.replace(/^\/+/, '').split('?')[0] ?? ''
  const normalizedFiles = new Set(files.map(normalizePath))

  // Source format is `relativePath:line:col` (per source-transform.ts:252);
  // strip only the trailing `:line:col` so file paths containing colons (rare
  // but possible on Unix) don't get truncated.
  const stripLineCol = (src: string): string => src.replace(/:\d+:\d+$/, '')
  let current: HTMLElement | null = element
  let depth = 0
  while (current && depth < maxDepth) {
    const src = current.getAttribute('data-cortex-source')
    if (src) {
      const file = stripLineCol(src)
      if (file && normalizedFiles.has(file)) return true
    }
    current = current.parentElement
    depth++
  }
  return false
}
