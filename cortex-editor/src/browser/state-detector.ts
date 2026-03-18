/** Allowlist for CSS property names (same as override.ts) */
const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/
/** Allowlist for CSS values */
const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%]+$/
/** Reject url() values */
const REJECT_URL = /url\s*\(/i

export interface StateDeclarations {
  hover: Map<string, string>
  focus: Map<string, string>
  active: Map<string, string>
}

type StateName = 'hover' | 'focus' | 'active'

const STATE_PSEUDOS: readonly StateName[] = ['hover', 'focus', 'active'] as const

/**
 * Inspect all document stylesheets to find :hover/:focus/:active rules
 * matching the given element. Returns declarations grouped by state.
 *
 * Business logic: This powers the "state lens" feature — when a user selects
 * an element, the editor needs to know which interaction states have CSS rules
 * so it can offer toggle buttons (e.g., show :hover appearance). The detected
 * declarations are later applied as CSS overrides to force-preview the state.
 */
export function detectStates(element: HTMLElement): StateDeclarations {
  const result: StateDeclarations = {
    hover: new Map(),
    focus: new Map(),
    active: new Map(),
  }

  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin stylesheet
    }
    collectFromRules(rules, element, result)
  }

  return result
}

function collectFromRules(
  rules: CSSRuleList,
  element: HTMLElement,
  result: StateDeclarations,
): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      processStyleRule(rule, element, result)
    } else if (
      rule instanceof CSSMediaRule ||
      rule instanceof CSSSupportsRule ||
      (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule)
    ) {
      collectFromRules(rule.cssRules, element, result)
    } else if (
      // Fallback: recurse into any grouping rule with a cssRules property
      // (covers CSSLayerBlockRule in environments where the global isn't defined)
      !(rule instanceof CSSStyleRule) &&
      'cssRules' in rule &&
      rule.cssRules instanceof CSSRuleList
    ) {
      collectFromRules(rule.cssRules, element, result)
    }
  }
}

function processStyleRule(
  rule: CSSStyleRule,
  element: HTMLElement,
  result: StateDeclarations,
): void {
  const selector = rule.selectorText

  // Skip rules with pseudo-elements
  if (selector.includes('::before') || selector.includes('::after')) return

  for (const state of STATE_PSEUDOS) {
    const pseudo = `:${state}`
    if (!selector.includes(pseudo)) continue

    // Strip the pseudo-class and test if the base selector matches
    const baseSelector = selector.replace(new RegExp(`:${state}`, 'g'), '').trim()
    if (!baseSelector) continue

    try {
      if (!element.matches(baseSelector)) continue
    } catch {
      continue // invalid selector after stripping
    }

    // Extract declarations
    const style = rule.style
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]
      const val = style.getPropertyValue(prop).trim()
      if (!prop || !val) continue
      // Skip 'initial' values — these are noise from shorthand expansion
      if (val === 'initial') continue
      if (!VALID_PROPERTY.test(prop)) continue
      if (!VALID_VALUE.test(val) || REJECT_URL.test(val)) continue
      result[state].set(prop, val)
    }
  }
}
