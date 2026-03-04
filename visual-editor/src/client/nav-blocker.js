/**
 * Zerofog Navigation Blocker — prevents in-app navigation while editing.
 *
 * Injected into <head> by sidecar proxy. Patches History.prototype methods
 * so nav-blocker's wrappers are captured by inspector.js's instance-level patch.
 *
 * Template variables (replaced by server at injection time):
 *   SESSION_ID, SIDECAR_ORIGIN
 */

// ── Exported pure functions (for testing) ────────────────────────

/**
 * Check if href points to a different route (pathname) than current location.
 * Hash-only and query-only changes return false.
 */
function isDifferentRoute(href) {
  try {
    var url = new URL(href, window.location.href);
    return url.pathname !== window.location.pathname;
  } catch (e) {
    return false;
  }
}

/**
 * Check if an anchor element should be blocked.
 * Blocks same-origin, different-path links without target="_blank".
 */
function shouldBlockAnchor(anchor) {
  // External links — don't block
  if (anchor.origin !== window.location.origin) return false;
  // target="_blank" opens new tab — don't block
  if (anchor.target === '_blank') return false;
  // Same path — don't block (modals, dropdowns, etc.)
  if (anchor.pathname === window.location.pathname) return false;
  // Same origin, different path — block
  return true;
}

// ── Testable init function ───────────────────────────────────────

/**
 * Initialize the navigation blocker with the given session and origin.
 * Extracted from the IIFE so tests can call it directly.
 */
function initNavBlocker(sessionId, sidecarOrigin) {
  // Guard against double-patching (check before teardown clears the marker)
  var hasPriorTeardown = window.__ZEROFOG__ && typeof window.__ZEROFOG__.teardownNavBlocker === 'function';
  if (History.prototype.pushState.__cortexNavBlocker && !hasPriorTeardown) {
    return;
  }

  // ── Teardown prior instance (HMR / double-inject guard) ─────
  if (hasPriorTeardown) {
    window.__ZEROFOG__.teardownNavBlocker();
  }

  var active = false;
  var currentUrl = window.location.href;

  // ── History.prototype patching ──────────────────────────────

  var origPushState = History.prototype.pushState;
  var origReplaceState = History.prototype.replaceState;

  History.prototype.pushState = function () {
    if (active && isDifferentRoute(arguments[2] || '')) {
      console.warn('[cortex] Navigation blocked: pushState to ' + arguments[2]);
      return;
    }
    var result = origPushState.apply(this, arguments);
    if (active) currentUrl = window.location.href;
    return result;
  };
  History.prototype.pushState.__cortexNavBlocker = true;

  History.prototype.replaceState = function () {
    if (active && isDifferentRoute(arguments[2] || '')) {
      console.warn('[cortex] Navigation blocked: replaceState to ' + arguments[2]);
      return;
    }
    var result = origReplaceState.apply(this, arguments);
    if (active) currentUrl = window.location.href;
    return result;
  };
  History.prototype.replaceState.__cortexNavBlocker = true;

  // ── Named event listeners (for teardown) ────────────────────

  function onPopstate() {
    if (active && window.location.href !== currentUrl) {
      console.warn('[cortex] Navigation blocked: popstate');
      // Use origReplaceState to avoid triggering our wrapper; replaceState avoids stack pollution
      origReplaceState.call(history, null, '', currentUrl);
    }
  }

  function onClick(e) {
    if (!active) return;

    // Walk up to find <a> element
    var el = e.target;
    while (el && el.tagName !== 'A') {
      el = el.parentElement;
    }
    if (!el) return;

    if (shouldBlockAnchor(el)) {
      e.preventDefault();
      e.stopPropagation();
      console.warn('[cortex] Navigation blocked: click on ' + el.href);
    }
  }

  // Note: beforeunload is suppressed in sandboxed iframes by Chrome/Safari.
  // This handler provides a best-effort guard for non-sandboxed contexts.
  function onBeforeunload(e) {
    if (!active) return;
    e.preventDefault();
    e.returnValue = '';
  }

  function onMessage(e) {
    if (e.origin !== sidecarOrigin) return;

    // Structured message format: { type, version, sessionId }
    if (typeof e.data !== 'object' || e.data === null) return;
    if (e.data.version !== 1 || e.data.sessionId !== sessionId) return;

    if (e.data.type === 'nav-blocker-enable') {
      active = true;
      currentUrl = window.location.href;
    } else if (e.data.type === 'nav-blocker-disable') {
      active = false;
    }
  }

  window.addEventListener('popstate', onPopstate);
  document.addEventListener('click', onClick, true); // capture phase
  window.addEventListener('beforeunload', onBeforeunload);
  window.addEventListener('message', onMessage);

  // ── Teardown function ──────────────────────────────────────

  function teardown() {
    History.prototype.pushState = origPushState;
    History.prototype.replaceState = origReplaceState;
    window.removeEventListener('popstate', onPopstate);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('beforeunload', onBeforeunload);
    window.removeEventListener('message', onMessage);
    active = false;
  }

  // Expose teardown for HMR and testing
  if (!window.__ZEROFOG__) window.__ZEROFOG__ = {};
  window.__ZEROFOG__.teardownNavBlocker = teardown;

  return { teardown: teardown };
}

// ── IIFE (browser-only) ─────────────────────────────────────────

(function () {
  // Template variables (server-replaced)
  var SESSION_ID = '__SESSION_ID__';
  var SIDECAR_ORIGIN = '__SIDECAR_ORIGIN__';

  // Guard: don't run if templates weren't replaced (test env)
  if (SESSION_ID.indexOf('__') === 0) return;

  initNavBlocker(SESSION_ID, SIDECAR_ORIGIN);
})();

// ── Exports (for testing; stripped by tsup IIFE bundling) ────────
export { isDifferentRoute, shouldBlockAnchor, initNavBlocker };
