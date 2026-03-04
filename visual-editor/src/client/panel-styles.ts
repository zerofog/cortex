/**
 * Panel CSS — string constant for Shadow DOM adopted stylesheet.
 *
 * All selectors are scoped to the shadow root. Uses :host for the
 * container element. Token button visual states use data-state attributes.
 */

export const PANEL_CSS = /* css */ `
:host {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #e4e4e7;
  background: #18181b;
  overflow-y: auto;
}

/* ── Header ────────────────────────────────────────────── */

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #27272a;
}

.panel-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fafafa;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-dot[data-status="connected"] { background: #22c55e; }
.connection-dot[data-status="connecting"] { background: #eab308; }
.connection-dot[data-status="disconnected"] { background: #ef4444; }

/* ── Mode Toggle ───────────────────────────────────────── */

.mode-toggle {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
}

.mode-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-btn:hover {
  background: #27272a;
  color: #e4e4e7;
}

.mode-btn[data-active="true"] {
  background: #27272a;
  color: #fafafa;
  border-color: #52525b;
}

/* ── Selection Info ────────────────────────────────────── */

.selection-info {
  padding: 8px 16px;
  border-bottom: 1px solid #27272a;
}

.selection-empty {
  padding: 24px 16px;
  text-align: center;
  color: #71717a;
  font-size: 12px;
}

.selection-tag {
  font-size: 13px;
  font-weight: 500;
  color: #fafafa;
}

.selection-component {
  font-size: 11px;
  color: #a1a1aa;
  margin-top: 2px;
}

.selection-testid {
  font-size: 11px;
  color: #71717a;
  margin-top: 2px;
  font-family: monospace;
}

/* ── Sections ──────────────────────────────────────────── */

.section {
  border-bottom: 1px solid #27272a;
}

.section summary {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #a1a1aa;
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
  border: 1px solid #3f3f46;
  border-radius: 4px;
  background: transparent;
  color: #71717a;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}

.spacing-mode-btn[data-active="true"] {
  background: #27272a;
  color: #e4e4e7;
  border-color: #52525b;
}

.per-side-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.per-side-label {
  width: 18px;
  font-size: 10px;
  color: #71717a;
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
  color: #71717a;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  min-width: 32px;
  text-align: center;
}

.token-btn:hover {
  background: #27272a;
  color: #a1a1aa;
}

/* Active: current value from computed styles */
.token-btn[data-state="active"] {
  background: #27272a;
  color: #fafafa;
  border-color: #3f3f46;
}

/* Changed: staged (pending) override */
.token-btn[data-state="changed"] {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

/* ── Change List ───────────────────────────────────────── */

.change-list {
  padding: 8px 16px;
  border-bottom: 1px solid #27272a;
}

.change-list-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
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
  font-size: 12px;
  color: #e4e4e7;
}

.change-item-value {
  font-size: 11px;
  color: #3b82f6;
  font-family: monospace;
}

.change-undo-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: #71717a;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}

.change-undo-btn:hover {
  background: #27272a;
  color: #e4e4e7;
}

/* ── Action Bar ────────────────────────────────────────── */

.action-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #27272a;
  margin-top: auto;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: #27272a;
  color: #e4e4e7;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn-primary {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

.action-btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

/* ── Status Bar ────────────────────────────────────────── */

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-top: 1px solid #27272a;
  font-size: 11px;
  color: #71717a;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot[data-status="connected"] { background: #22c55e; }
.status-dot[data-status="connecting"] { background: #eab308; }
.status-dot[data-status="disconnected"] { background: #ef4444; }
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
  shadowRoot.appendChild(style);
}
