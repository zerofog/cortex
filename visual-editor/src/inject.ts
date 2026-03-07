import { SAFE_NONCE } from './validation.js';

const MARKER = '<!-- __zerofog_injected__ -->';

function headScripts(nonce?: string, cacheBuster?: string): string {
  if (nonce && !SAFE_NONCE.test(nonce)) throw new Error('Invalid nonce format');
  const attr = nonce ? ` nonce="${nonce}"` : '';
  const qs = cacheBuster ? `?v=${cacheBuster}` : '';
  return `\n${MARKER}\n<script${attr} src="/__zerofog/client/nav-blocker.js${qs}"></script>\n`;
}

function bodyScripts(nonce?: string, cacheBuster?: string): string {
  if (nonce && !SAFE_NONCE.test(nonce)) throw new Error('Invalid nonce format');
  const attr = nonce ? ` nonce="${nonce}"` : '';
  const qs = cacheBuster ? `?v=${cacheBuster}` : '';
  return `\n<script${attr} src="/__zerofog/client/inspector.js${qs}"></script>\n`;
}

/**
 * Inject editor scripts into an HTML response body.
 *
 * - Idempotent: won't double-inject if marker is already present
 * - Inserts nav-blocker before </head> (case-insensitive) for early execution
 * - Inserts inspector before </body> (case-insensitive) for DOM-ready access
 * - Falls back to appending if tags not found
 * - Optional nonce: added to script tags for CSP compliance
 */
export function injectScripts(html: string, nonce?: string, cacheBuster?: string): string {
  if (html.includes(MARKER)) return html;

  const headIdx = html.search(/<\/head>/i);
  const bodyIdx = html.search(/<\/body>/i);

  const head = headScripts(nonce, cacheBuster);
  const body = bodyScripts(nonce, cacheBuster);

  let result = html;

  // Insert body scripts first (higher index) so head insertion offsets stay valid
  result = bodyIdx !== -1
    ? result.slice(0, bodyIdx) + body + result.slice(bodyIdx)
    : result + body;

  result = headIdx !== -1
    ? result.slice(0, headIdx) + head + result.slice(headIdx)
    : result + head;

  return result;
}
