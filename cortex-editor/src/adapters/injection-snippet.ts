/**
 * Leaf module: the bootstrap injection snippet + the two constants and the type
 * it needs. Extracted from webpack.ts so the snippet builder can be imported
 * WITHOUT dragging in webpack.ts's heavy module graph (ws, the session/edit
 * pipeline, zod). <CortexDevScripts/> (next-dev-scripts.ts) runs in every Next
 * RSC process that renders the root layout and only needs to emit a <script> —
 * pulling the whole bridge into that process just to build the string was pure
 * dead weight.
 *
 * This module has NO runtime imports on purpose. Nothing heavier than JSON may
 * be added here — webpack.ts re-exports these symbols so its public surface is
 * unchanged, and next-dev-scripts.ts imports straight from here.
 */

/** Path the standalone bridge serves the browser IIFE bundle from. */
export const CORTEX_BROWSER_PATH = '/@cortex/browser.js'

/** Default keyboard shortcut for toggling the editor. */
export const DEFAULT_TOGGLE_SHORTCUT = '$mod+Shift+Period'

/** tinykeys-shaped shortcut grammar accepted by the editor toggle. Kept in this
 *  leaf module (with validateToggleShortcut) so next.ts can validate a shortcut
 *  WITHOUT statically importing webpack.ts's heavy graph. webpack.ts re-exports
 *  validateToggleShortcut for its own consumers. */
const VALID_SHORTCUT = /^\$mod\+(?:Shift\+)?(?:Alt\+)?(?:Key[A-Z]|Digit\d|Period|Comma|Slash|Backslash|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Minus|Equal)$/

export function validateToggleShortcut(shortcut: string): string {
  if (!VALID_SHORTCUT.test(shortcut)) {
    throw new Error(
      `[cortex] Invalid toggleShortcut: "${shortcut}". ` +
      `Expected format: "$mod+[Alt+][Shift+]KeyCode" (e.g., "$mod+Shift+Period"). ` +
      `See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code`,
    )
  }
  return shortcut
}

export interface InjectionState {
  port: number
  token: string
  sessionId: string
  browserScriptUrl: string
  toggleShortcut: string
}

function safeJSONForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** The snippet's inner JavaScript, without the <script> wrapper. Consumed by
 *  <CortexDevScripts/> (next-dev-scripts.ts), which must emit the body through
 *  React's dangerouslySetInnerHTML on its own <script> element, and by the
 *  webpack adapter via createManualInjectionSnippet (webpack.ts). */
export function createManualInjectionScriptBody(state: InjectionState): string {
  const config = safeJSONForScript({ toggleShortcut: state.toggleShortcut })
  const scriptUrl = safeJSONForScript(state.browserScriptUrl)
  return `
window.__cortex_ws_port__=${state.port};
window.__CORTEX_TOKEN__=${safeJSONForScript(state.token)};
window.__CORTEX_SESSION_ID__=${safeJSONForScript(state.sessionId)};
// Pillar 1: generate a stable per-tab ID at injection time (before any cortex
// script loads). Used by the single-tab gate and to filter cortex/active-changed
// broadcasts. Each new page load generates a fresh UUID so a refreshed tab gets
// a new ID and can take over from the stale one.
if (!window.__cortex_tab_id__) {
  Object.defineProperty(window, '__cortex_tab_id__', {
    value: 'tab-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + '-' + Date.now()),
    writable: false, configurable: false,
  });
}
// Pillar 1: cache of the server's last cortex/active-changed for this tab —
// read by the keyboard handler to decide which state to flip to. Defined as a
// mutable wrapper object so the channel can write .active after setup without
// needing to redefine the property.
if (!Object.prototype.hasOwnProperty.call(window, '__cortex_active_cache__')) {
  Object.defineProperty(window, '__cortex_active_cache__', {
    value: { active: false }, writable: false, configurable: false,
  });
}
// Toggle shortcut — capture phase, always active. Pillar 1 rewrite: no DOM
// mutation here — the reducer's useEffect on active (CortexApp.tsx) is the
// SINGLE writer of data-cortex-active. Keyboard handler captures __cortex_send__
// into its OWN closure at injection time (before the channel's capture-and-delete
// XSS-hardening step), so subsequent keypresses still have a working send even
// after the channel deletes the window global. Mirrors vite.ts fix for the same
// ZF0-1881 codex P1.1 regression caught by E2E post-merge.
if (!Object.prototype.hasOwnProperty.call(window, '__cortex_toggle_registered__')) {
  Object.defineProperty(window, '__cortex_toggle_registered__', {
    value: true, writable: false, configurable: false,
  });
  var __cortexConfig = ${config};
  var __cortexParts = __cortexConfig.toggleShortcut.split('+');
  var __cortexCode = __cortexParts[__cortexParts.length - 1];
  var __cortexNeedShift = __cortexParts.includes('Shift');
  var __cortexNeedAlt = __cortexParts.includes('Alt');
  // Closure-captured send — see vite.ts for the rationale comment.
  var __cortexKeyboardSend = window.__cortex_send__;
  window.addEventListener('keydown', function(e) {
    if (!e.isTrusted) return;
    var mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (__cortexNeedShift && !e.shiftKey) return;
    if (!__cortexNeedShift && e.shiftKey) return;
    if (__cortexNeedAlt && !e.altKey) return;
    if (!__cortexNeedAlt && e.altKey) return;
    if (e.code !== __cortexCode) return;
    e.preventDefault();
    e.stopPropagation();
    var nextActive = !window.__cortex_active_cache__.active;
    var msg = {
      type: 'cortex/set-active',
      active: nextActive,
      tabId: window.__cortex_tab_id__,
    };
    if (typeof __cortexKeyboardSend === 'function') {
      __cortexKeyboardSend(msg);
    } else if (typeof window.__cortex_send__ === 'function') {
      window.__cortex_send__(msg);
    } else {
      // Channel not initialized yet — queue for bootstrap drain.
      window.__cortex_pending_set_active__ = msg;
    }
  }, { capture: true });
}
if (!document.querySelector('[data-cortex-host]')) {
  var __cortexScript = document.createElement('script');
  __cortexScript.src = ${scriptUrl};
  __cortexScript.onerror = function() { console.error('[cortex] Failed to load browser UI.'); };
  document.head.appendChild(__cortexScript);
}
`
}

// KNOWN LIMITATION — token in inline markup (review finding, deliberately not
// "fixed" by self-removal). The token is inlined as literal text
// (window.__CORTEX_TOKEN__=...). The browser bundle reads it off the window
// GLOBAL and captures+deletes that global on boot (channel.ts, ZF0-1326), but
// the token text still lingers in this script node where a late same-origin
// script could read it back via textContent — the same posture as the shipped
// webpack/Vite adapters (createManualInjectionSnippet inlines it too).
//
// Self-removing the node (document.currentScript.remove()) was tried and
// REVERTED: <CortexDevScripts/> renders this <script> through a React server
// component, so the node is part of the SSR tree React hydrates. Removing it
// during SSR-parse execution makes the hydrated DOM disagree with the server
// HTML → React regenerates the whole tree, the browser-bundle <script> never
// runs, and the editor never boots. The security gain (shrinking an
// already-narrow window) was not worth breaking activation on every page.
//
// A real fix requires never exposing the token as a readable bearer credential
// on a same-origin page (any fetch endpoint is equally readable by an XSS), so
// it is a cross-adapter security-design change tracked as a separate ticket.
