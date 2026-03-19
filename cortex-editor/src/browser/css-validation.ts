/** Allowlist for CSS property names — letters, hyphens, and custom properties (--*) */
export const VALID_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/

/** Allowlist for CSS values — design tokens, colors, units, calc() operators. Fails closed against injection. */
export const VALID_VALUE = /^[a-zA-Z0-9#()\s,.\-_'"/%+*]+$/

/** Reject url() values to prevent external resource exfiltration via CSS. */
export const REJECT_URL = /url\s*\(/i

/** Reject CSS comment markers to prevent comment injection. */
export const REJECT_COMMENT = /\/\*/
