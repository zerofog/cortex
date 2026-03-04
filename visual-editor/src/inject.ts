const MARKER = '<!-- __zerofog_injected__ -->';

const HEAD_SCRIPTS = `
${MARKER}
<script src="/__zerofog/client/nav-blocker.js"></script>
`;

const BODY_SCRIPTS = `
<script src="/__zerofog/client/inspector.js"></script>
`;

/**
 * Inject editor scripts into an HTML response body.
 *
 * - Idempotent: won't double-inject if marker is already present
 * - Inserts nav-blocker before </head> (case-insensitive) for early execution
 * - Inserts inspector before </body> (case-insensitive) for DOM-ready access
 * - Falls back to appending if tags not found
 */
export function injectScripts(html: string): string {
  if (html.includes(MARKER)) return html;

  const headIdx = html.search(/<\/head>/i);
  const bodyIdx = html.search(/<\/body>/i);

  let result = html;

  // Insert body scripts first (higher index) so head insertion offsets stay valid
  result = bodyIdx !== -1
    ? result.slice(0, bodyIdx) + BODY_SCRIPTS + result.slice(bodyIdx)
    : result + BODY_SCRIPTS;

  result = headIdx !== -1
    ? result.slice(0, headIdx) + HEAD_SCRIPTS + result.slice(headIdx)
    : result + HEAD_SCRIPTS;

  return result;
}
