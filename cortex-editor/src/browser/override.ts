/** Allowlist for CSS property names — letters, hyphens, and custom properties (--*) */
const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/

/** Allowlist for CSS values — design tokens, colors, units. Fails closed against injection. */
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_%]+$/

/**
 * Manages a <style> tag in document.head for CSS override previews.
 * Uses [data-cortex-source] selectors (stable across HMR) with !important.
 */
export class CSSOverrideManager {
  private styleEl: HTMLStyleElement
  private overrides = new Map<string, Map<string, string>>()

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

  /** Apply an override (instant preview). Rejects invalid property names or values. */
  set(source: string, property: string, value: string): void {
    if (!VALID_PROPERTY.test(property)) return
    if (!VALID_VALUE.test(value)) return

    let props = this.overrides.get(source)
    if (!props) {
      props = new Map()
      this.overrides.set(source, props)
    }
    props.set(property, value)
    this.scheduleRebuild()
  }

  /** Remove an override. If property omitted, removes all overrides for source. */
  remove(source: string, property?: string): void {
    if (property) {
      this.overrides.get(source)?.delete(property)
      // Clean up empty source entries
      if (this.overrides.get(source)?.size === 0) {
        this.overrides.delete(source)
      }
    } else {
      this.overrides.delete(source)
    }
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Clear all overrides (e.g. on SPA navigation) */
  clearAll(): void {
    this.overrides.clear()
    this.cancelPendingRebuild()
    this.rebuild()
  }

  /** Remove the <style> element from the DOM */
  dispose(): void {
    this.cancelPendingRebuild()
    this.overrides.clear()
    this.styleEl.remove()
  }

  private rebuild(): void {
    const rules: string[] = []
    for (const [source, props] of this.overrides) {
      const declarations = Array.from(props.entries())
        .map(([prop, val]) => `${prop}: ${val} !important`)
        .join('; ')
      // CSS.escape() prevents selector breakout from source values containing " or ]
      rules.push(`[data-cortex-source="${CSS.escape(source)}"] { ${declarations}; }`)
    }
    this.styleEl.textContent = rules.join('\n')
  }
}
