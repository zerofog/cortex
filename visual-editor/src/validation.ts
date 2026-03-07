// ─── Shared CSS validation constants (server-side trust boundary) ────
//
// These mirror the client-side constraints in inspector.js.
// Server validates incoming payloads to prevent CSS injection even
// if the client is compromised.

export const ALLOWED_CSS_PROPERTIES = new Set([
  'color', 'background', 'fontSize', 'padding', 'margin',
  'display', 'gap', 'borderRadius', 'fontWeight', 'fontFamily',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
]);

export const ALLOWED_TOKENS = new Set([
  'xs', 'sm', 'md', 'lg', 'xl', 'none',
]);

export const ALLOWED_ORIGINS = new Set([
  'mantine-prop', 'mantine-default', 'tailwind', 'css-module', 'unknown',
]);

/** Detects CSS injection patterns: expression(), url(), semicolons, braces, backslashes. */
export const CSS_VALUE_UNSAFE = /expression\s*\(|url\s*\(|image-set\s*\(|element\s*\(|paint\s*\(|@import|[;{}\\]/i;

/** Maximum allowed length for a CSS value string. */
export const CSS_VALUE_MAX_LENGTH = 200;

/** Validates nonce format: only base64-safe characters. */
export const SAFE_NONCE = /^[A-Za-z0-9+/=]+$/;
