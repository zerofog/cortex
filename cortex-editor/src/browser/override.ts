import { VALID_PROPERTY, VALID_VALUE, REJECT_URL, REJECT_COMMENT } from './css-validation.js'

/**
 * Manages a <style> tag in document.head for CSS override previews.
 * Uses [data-cortex-source] selectors (stable across HMR) with !important.
 *
 * Two separate override maps:
 * - `overrides`: user edits — keyed by composite key (source or source+pseudo)
 * - `stateOverrides`: forced state declarations — keyed by raw source (no pseudo)
 *
 * During rebuild(), both maps merge per-source. User edits win over state overrides.
 */
export class CSSOverrideManager {
  private styleEl: HTMLStyleElement
  private overrides = new Map<string, Map<string, string>>()
  private stateOverrides = new Map<string, Map<string, string>>()

  constructor() {
    this.styleEl = document.createElement('style')
    this.styleEl.setAttribute('data-cortex-override', '')
    document.head.appendChild(this.styleEl)
  }

  private rafId: number | null = null

  private scheduleRebuild(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.rebuild()
    })
  }

  private cancelPendingRebuild(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /** Force any pending RAF rebuild to execute synchronously. */
  flush(): void {
    if (this.rafId !== null) {
      this.cancelPendingRebuild()
      this.rebuild()
    }
  }

  /** Apply an override (instant preview). Rejects invalid property names or values.
   *  Pass `pseudo` ('::before' | '::after') to target a pseudo-element. */
  set(source: string, property: string, value: string, pseudo?: '::before' | '::after'): void {
    if (!VALID_PROPERTY.test(property)) {
      console.warn('[cortex] Override rejected: invalid property name:', property)
      return
    }
    if (!VALID_VALUE.test(value) || REJECT_URL.test(value) || REJECT_COMMENT.test(value)) {
      console.warn('[cortex] Override rejected: invalid value for', property, ':', value)
      return
    }

    const key = `${source}${pseudo ?? ''}`
    let props = this.overrides.get(key)
    if (!props) {
      props = new Map()
      this.overrides.set(key, props)
    }
    props.set(property, value)
    this.scheduleRebuild()
  }

  /** Remove an override. If property omitted, removes all overrides for source(+pseudo).
   *  Pass `pseudo` to target a pseudo-element override. */
  remove(source: string, property?: string, pseudo?: '::before' | '::after'): void {
    const key = `${source}${pseudo ?? ''}`
    if (property) {
      this.overrides.get(key)?.delete(property)
      // Clean up empty source entries
      if (this.overrides.get(key)?.size === 0) {
        this.overrides.delete(key)
      }
    } else {
      this.overrides.delete(key)
    }
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /**
   * Apply state-forced declarations (e.g. from :hover CSSOM inspection).
   * Validates each entry against VALID_PROPERTY/VALID_VALUE/REJECT_URL/REJECT_COMMENT.
   * State overrides are keyed by raw source (no pseudo suffix) — they only
   * merge with element-level rules, not pseudo-element rules.
   */
  setStateOverrides(source: string, declarations: Map<string, string>): void {
    const validated = new Map<string, string>()
    for (const [prop, val] of declarations) {
      if (!VALID_PROPERTY.test(prop)) continue
      if (!VALID_VALUE.test(val) || REJECT_URL.test(val) || REJECT_COMMENT.test(val)) continue
      validated.set(prop, val)
    }
    if (validated.size > 0) {
      this.stateOverrides.set(source, validated)
    } else {
      if (declarations.size > 0) {
        console.warn(`[cortex] setStateOverrides: all ${declarations.size} declarations rejected for source "${source}"`)
      }
      this.stateOverrides.delete(source)
    }
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /**
   * Clear all state-forced overrides. Rebuilds synchronously (not via RAF)
   * to ensure the <style> tag is updated before the next getComputedStyle read.
   */
  clearStateOverrides(): void {
    this.stateOverrides.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Clear all overrides (e.g. on SPA navigation) */
  clearAll(): void {
    this.overrides.clear()
    this.stateOverrides.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.cancelPendingRebuild()
    this.overrides.clear()
    this.stateOverrides.clear()
    this.styleEl.remove()
  }

  private rebuild(): void {
    const allKeys = new Set([...this.overrides.keys(), ...this.stateOverrides.keys()])
    const rules: string[] = []

    for (const compositeKey of allKeys) {
      // Split pseudo suffix from the composite key
      const pseudoSuffix = compositeKey.endsWith('::before') ? '::before'
                         : compositeKey.endsWith('::after') ? '::after'
                         : ''
      const rawSource = pseudoSuffix ? compositeKey.slice(0, -pseudoSuffix.length) : compositeKey

      const userProps = this.overrides.get(compositeKey)
      // State overrides are always keyed by raw source (no pseudo suffix) —
      // they only merge with element-level rules, not pseudo rules
      const stateProps = pseudoSuffix ? undefined : this.stateOverrides.get(rawSource)

      // Merge: user edits win over state overrides (user intent > forced state)
      const merged = new Map<string, string>()
      if (stateProps) for (const [p, v] of stateProps) merged.set(p, v)
      if (userProps) for (const [p, v] of userProps) merged.set(p, v)
      if (merged.size === 0) continue

      const declarations = Array.from(merged.entries())
        .map(([prop, val]) => `${prop}: ${val} !important`)
        .join('; ')
      // CSS.escape only the source part; pseudo suffix appended outside the attribute selector
      const selector = `[data-cortex-source="${CSS.escape(rawSource)}"]${pseudoSuffix}`
      rules.push(`${selector} { ${declarations}; }`)
    }
    this.styleEl.textContent = rules.join('\n')
  }
}
