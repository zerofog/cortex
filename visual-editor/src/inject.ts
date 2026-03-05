const MARKER = '<!-- __zerofog_injected__ -->';

function headScripts(nonce?: string): string {
  const attr = nonce ? ` nonce="${nonce}"` : '';
  return `\n${MARKER}\n<script${attr} src="/__zerofog/client/nav-blocker.js"></script>\n`;
}

function bodyScripts(nonce?: string): string {
  const attr = nonce ? ` nonce="${nonce}"` : '';
  return `\n<script${attr} src="/__zerofog/client/inspector.js"></script>\n`;
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
export function injectScripts(html: string, nonce?: string): string {
  if (html.includes(MARKER)) return html;

  const headIdx = html.search(/<\/head>/i);
  const bodyIdx = html.search(/<\/body>/i);

  const head = headScripts(nonce);
  const body = bodyScripts(nonce);

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
