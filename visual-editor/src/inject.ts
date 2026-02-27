const MARKER = '<!-- __zerofog_injected__ -->';

const SCRIPTS = `
${MARKER}
<script src="/__zerofog/client/inspector.js"></script>
<script src="/__zerofog/client/nav-blocker.js"></script>
`;

/**
 * Inject editor scripts into an HTML response body.
 *
 * - Idempotent: won't double-inject if marker is already present
 * - Inserts before the last </body> (case-insensitive)
 * - Falls back to appending if no </body> tag exists
 */
export function injectScripts(html: string): string {
  if (html.includes(MARKER)) return html;

  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx !== -1) {
    return html.slice(0, idx) + SCRIPTS + html.slice(idx);
  }

  return html + SCRIPTS;
}
