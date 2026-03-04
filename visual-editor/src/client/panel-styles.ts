/**
 * Panel CSS — string constant for Shadow DOM adopted stylesheet.
 *
 * All selectors are scoped to the shadow root. Uses :host for the
 * container element. Token button visual states use data-state attributes.
 */

export const PANEL_CSS = /* css */ `
:host {
  /* ── Design tokens (M3) ──────────────────────────────── */
  --zf-bg: #18181b;
  --zf-border: #27272a;
  --zf-text: #e4e4e7;
  --zf-text-bright: #fafafa;
  --zf-text-dim: #a1a1aa;
  --zf-text-muted: #71717a;
  --zf-surface: #27272a;
  --zf-surface-border: #3f3f46;
  --zf-surface-border-active: #52525b;
  --zf-accent: #3b82f6;
  --zf-accent-hover: #2563eb;
  --zf-success: #22c55e;
  --zf-warning: #eab308;
  --zf-error: #ef4444;

  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 0.8125rem;
  color: var(--zf-text);
  background: var(--zf-bg);
  overflow-y: auto;
}

/* ── Header ────────────────────────────────────────────── */

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--zf-border);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--zf-text-bright);
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-dot[data-status="connected"] { background: var(--zf-success); }
.connection-dot[data-status="connecting"] { background: var(--zf-warning); }
.connection-dot[data-status="disconnected"] { background: var(--zf-error); }

/* ── Mode Toggle ───────────────────────────────────────── */

.mode-toggle {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border: none;
  margin: 0;
}

.mode-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--zf-surface-border);
  border-radius: 6px;
  background: transparent;
  color: var(--zf-text-dim);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-btn:hover {
  background: var(--zf-surface);
  color: var(--zf-text);
}

.mode-btn[data-active="true"] {
  background: var(--zf-surface);
  color: var(--zf-text-bright);
  border-color: var(--zf-surface-border-active);
}

/* ── Selection Info ────────────────────────────────────── */

.selection-info {
  padding: 8px 16px;
  border-bottom: 1px solid var(--zf-border);
}

.selection-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--zf-text-muted);
  font-size: 0.75rem;
}

.selection-tag {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--zf-text-bright);
}

.selection-component {
  font-size: 0.6875rem;
  color: var(--zf-text-dim);
  margin-top: 2px;
}

.selection-testid {
  font-size: 0.6875rem;
  color: var(--zf-text-muted);
  margin-top: 2px;
  font-family: monospace;
}

/* ── Sections ──────────────────────────────────────────── */

.section {
  border-bottom: 1px solid var(--zf-border);
}

.section summary {
  padding: 8px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--zf-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.section summary::-webkit-details-marker {
  display: none;
}

.section summary::before {
  content: '▸ ';
}

.section[open] summary::before {
  content: '▾ ';
}

.section-content {
  padding: 4px 16px 12px;
}

.token-loading {
  padding: 24px 16px;
  text-align: center;
  color: var(--zf-text-muted);
  font-size: 0.75rem;
}

/* ── Spacing Control ───────────────────────────────────── */

.spacing-control {
  margin-bottom: 8px;
}

.spacing-mode-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.spacing-mode-btn {
  padding: 3px 8px;
  border: 1px solid var(--zf-surface-border);
  border-radius: 4px;
  background: transparent;
  color: var(--zf-text-muted);
  font-size: 0.6875rem;
  font-family: inherit;
  cursor: pointer;
}

.spacing-mode-btn[data-active="true"] {
  background: var(--zf-surface);
  color: var(--zf-text);
  border-color: var(--zf-surface-border-active);
}

.per-side-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.per-side-label {
  width: 18px;
  font-size: 0.625rem;
  color: var(--zf-text-muted);
  text-transform: uppercase;
  flex-shrink: 0;
}

/* ── Token Row ─────────────────────────────────────────── */

.token-row {
  display: flex;
  gap: 4px;
}

.token-btn {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--zf-text-muted);
  font-size: 0.6875rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  min-width: 32px;
  text-align: center;
}

.token-btn:hover {
  background: var(--zf-surface);
  color: var(--zf-text-dim);
}

/* Active: current value from computed styles */
.token-btn[data-state="active"] {
  background: var(--zf-surface);
  color: var(--zf-text-bright);
  border-color: var(--zf-surface-border);
}

/* Changed: staged (pending) override */
.token-btn[data-state="changed"] {
  background: var(--zf-accent);
  color: #ffffff;
  border-color: var(--zf-accent);
}

/* ── Change List ───────────────────────────────────────── */

.change-list {
  padding: 8px 16px;
  border-bottom: 1px solid var(--zf-border);
}

.change-list-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--zf-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.change-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.change-item-label {
  font-size: 0.75rem;
  color: var(--zf-text);
}

.change-item-value {
  font-size: 0.6875rem;
  color: var(--zf-accent);
  font-family: monospace;
}

.change-undo-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--zf-text-muted);
  font-size: 0.6875rem;
  font-family: inherit;
  cursor: pointer;
}

.change-undo-btn:hover {
  background: var(--zf-surface);
  color: var(--zf-text);
}

/* ── Action Bar ────────────────────────────────────────── */

.action-error {
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--zf-error);
  font-size: 0.6875rem;
}

.action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--zf-border);
  margin-top: auto;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--zf-surface-border);
  border-radius: 6px;
  background: transparent;
  color: var(--zf-text-dim);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: var(--zf-surface);
  color: var(--zf-text);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-primary {
  background: var(--zf-accent);
  color: #ffffff;
  border-color: var(--zf-accent);
}

.action-btn-primary:hover:not(:disabled) {
  background: var(--zf-accent-hover);
}

/* ── Status Bar ────────────────────────────────────────── */

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-top: 1px solid var(--zf-border);
  font-size: 0.6875rem;
  color: var(--zf-text-muted);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot[data-status="connected"] { background: var(--zf-success); }
.status-dot[data-status="connecting"] { background: var(--zf-warning); }
.status-dot[data-status="disconnected"] { background: var(--zf-error); }
`;

/**
 * Apply panel styles to a shadow root.
 * Prefers adoptedStyleSheets (sync, no FOUC); falls back to <style> element.
 */
export function applyPanelStyles(shadowRoot: ShadowRoot): void {
  // adoptedStyleSheets may be unavailable in test environments (happy-dom)
  if ('adoptedStyleSheets' in shadowRoot && typeof CSSStyleSheet !== 'undefined') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PANEL_CSS);
      shadowRoot.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Fall through to <style> element
    }
  }
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  (shadowRoot as ShadowRoot).appendChild(style);
}
