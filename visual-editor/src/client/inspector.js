/**
 * Zerofog Visual Inspector — browser-injectable element-selection tool.
 *
 * Injected by the sidecar proxy into HTML responses. Provides:
 * - Hover highlight overlay (blue)
 * - Select-mode click to select (green highlight)
 * - Escape to deactivate
 * - Source resolution via data-testid + React fiber chain
 * - Cross-frame postMessage bridge for panel communication
 *
 * Template variables (replaced by server at injection time):
 *   SESSION_ID, SIDECAR_ORIGIN
 */

// ── Template variables (server-replaced) ─────────────────────────

var SESSION_ID = '__SESSION_ID__';
var SIDECAR_ORIGIN = '__SIDECAR_ORIGIN__';

// ── Constants ────────────────────────────────────────────────────

var MAX_CHAIN_DEPTH = 20;
var MAX_ANCESTOR_DEPTH = 50;
var MAX_ELEMENT_MAP_SIZE = 50;
var MSG_VERSION = 1;

// ── Pure functions (exported for testing) ────────────────────────

function getComponentName(fiber) {
  if (!fiber || !fiber.type) return null;
  return fiber.type.displayName || fiber.type.name || null;
}

function findReactFiberKeys(element) {
  var keys = [];
  var allKeys = Object.keys(element);
  for (var i = 0; i < allKeys.length; i++) {
    if (allKeys[i].indexOf('__reactFiber$') === 0) {
      keys.push(allKeys[i]);
    }
  }
  return keys;
}

/**
 * Walk fiber tree to extract component names.
 * Strategy A (React 18): _debugOwner chain — uses property existence check.
 * Strategy B (React 19): fiber.return with tag filtering (0=Function, 1=Class).
 */
function walkComponentChain(fiber) {
  var chain = [];
  if (!fiber) return chain;

  // Strategy A: React 18 — own-property existence check (not truthiness!)
  // React 18 leaf components have _debugOwner: null (property exists but is null).
  // Truthiness check would incorrectly fall through to Strategy B.
  // Uses hasOwnProperty to avoid prototype chain pollution.
  if (Object.prototype.hasOwnProperty.call(fiber, '_debugOwner')) {
    var currentA = fiber;
    var depthA = 0;
    while (currentA && depthA < MAX_CHAIN_DEPTH) {
      var nameA = getComponentName(currentA);
      if (nameA) chain.push(nameA);
      currentA = currentA._debugOwner;
      depthA++;
    }
    return chain;
  }

  // Strategy B: React 19 — fiber.return traversal
  // Only include FunctionComponent (tag 0) and ClassComponent (tag 1)
  var currentB = fiber;
  var depthB = 0;
  while (currentB && depthB < MAX_CHAIN_DEPTH) {
    if (currentB.tag === 0 || currentB.tag === 1) {
      var nameB = getComponentName(currentB);
      if (nameB) chain.push(nameB);
    }
    currentB = currentB.return;
    depthB++;
  }
  return chain;
}

/**
 * Check if ancestorElement is a fiber ancestor of childElement.
 * Walks fiber.return chain checking stateNode references.
 * Returns true (conservative) when no fiber data is available.
 */
function isFiberAncestor(childElement, ancestorElement, fiberKeys) {
  if (!childElement || !ancestorElement) return true;

  var keys = fiberKeys || findReactFiberKeys(childElement);
  var fiber = null;
  for (var k = 0; k < keys.length && !fiber; k++) {
    fiber = childElement[keys[k]];
  }

  // No fiber data — conservatively assume it is an ancestor
  if (!fiber) return true;

  var current = fiber;
  var depth = 0;
  while (current && depth < MAX_ANCESTOR_DEPTH) {
    if (current.stateNode === ancestorElement) return true;
    current = current.return;
    depth++;
  }

  return false;
}

function resolveSource(element, fiberKeys) {
  var testId = null;
  var componentChain = [];
  var hasClientFiber = false;

  // Strategy 1: data-testid (highest confidence)
  var ownTestId = element.getAttribute('data-testid');
  var testIdEl = ownTestId
    ? element
    : element.closest
      ? element.closest('[data-testid]')
      : null;
  if (testIdEl) {
    testId = testIdEl.getAttribute('data-testid');
  }

  // Strategy 2: React fiber chain
  var fiber = null;
  var keys = fiberKeys || findReactFiberKeys(element);
  for (var k = 0; k < keys.length && !fiber; k++) {
    fiber = element[keys[k]];
  }

  if (fiber) {
    hasClientFiber = true;
    componentChain = walkComponentChain(fiber);
  }

  // Portal detection: testId from ancestor (not own) needs fiber ancestry check
  if (testId && !ownTestId && testIdEl) {
    if (!isFiberAncestor(element, testIdEl, keys)) {
      testId = null; // discard — portal detected
    }
  }

  // Element metadata
  var tag = element.tagName || 'UNKNOWN';
  var classes = element.classList
    ? Array.prototype.slice.call(element.classList)
    : [];
  var text = (element.textContent || '').substring(0, 100);
  var bounds = element.getBoundingClientRect
    ? element.getBoundingClientRect()
    : { top: 0, left: 0, width: 0, height: 0 };

  return {
    testId: testId,
    componentChain: componentChain,
    hasClientFiber: hasClientFiber,
    element: {
      tag: tag,
      classes: classes,
      text: text,
      bounds: bounds,
    },
  };
}

function classifyElement(componentChain, tagName) {
  for (var i = 0; i < componentChain.length; i++) {
    var compName = componentChain[i];
    if (/^Icon[A-Z]/.test(compName)) return 'icon';
    if (
      ['AppShell', 'Navbar', 'Header', 'Footer', 'Aside'].indexOf(compName) !==
      -1
    )
      return 'layout';
    if (['Text', 'Title', 'Heading'].indexOf(compName) !== -1) return 'text';
    if (
      [
        'Button',
        'ActionIcon',
        'Menu',
        'MenuItem',
        'UnstyledButton',
        'Tabs.Tab',
        'NavLink',
      ].indexOf(compName) !== -1
    )
      return 'interactive';
    if (
      [
        'Card',
        'Paper',
        'Box',
        'Group',
        'Stack',
        'Flex',
        'Grid',
        'Container',
        'SimpleGrid',
      ].indexOf(compName) !== -1
    )
      return 'container';
    if (
      ['Badge', 'Alert', 'Notification', 'Skeleton', 'Loader'].indexOf(
        compName
      ) !== -1
    )
      return 'feedback';
    if (
      [
        'TextInput',
        'Select',
        'Textarea',
        'NumberInput',
        'PasswordInput',
        'MultiSelect',
        'Checkbox',
        'Switch',
        'Radio',
      ].indexOf(compName) !== -1
    )
      return 'input';
  }

  var tag = (tagName || '').toLowerCase();
  if (tag === 'svg' || tag === 'path') return 'icon';
  if (
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].indexOf(
      tag
    ) !== -1
  )
    return 'text';
  if (['button', 'a'].indexOf(tag) !== -1) return 'interactive';
  if (['input', 'textarea', 'select'].indexOf(tag) !== -1) return 'input';
  if (['nav', 'header', 'footer', 'aside', 'main'].indexOf(tag) !== -1)
    return 'layout';

  return 'unknown';
}

// ── PostMessage helpers ──────────────────────────────────────────

function postToParent(type, payload) {
  if (
    typeof window === 'undefined' ||
    !window.parent ||
    window.parent === window
  )
    return;
  window.parent.postMessage(
    {
      type: type,
      sessionId: SESSION_ID,
      version: MSG_VERSION,
      payload: payload,
    },
    SIDECAR_ORIGIN
  );
}

function isValidInbound(e) {
  return (
    e.origin === SIDECAR_ORIGIN &&
    e.data &&
    typeof e.data === 'object' &&
    Object.prototype.hasOwnProperty.call(e.data, 'sessionId') &&
    e.data.sessionId === SESSION_ID
  );
}

// ── Browser Inspector (only runs in browser context) ─────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Initialize consolidated namespace (idempotent — safe for re-injection)
  window.__ZEROFOG__ = window.__ZEROFOG__ || {};

  (function () {
    var OVERLAY_ID = '__zerofog_inspector_overlay__';
    var overlay = null;
    var selectedOverlay = null;
    var labelEl = null;
    var active = false;
    var selectMode = false;
    var selectionId = 0;
    var elementMap = Object.create(null);
    var lastHoverTarget = null;
    var hoverRafPending = false;

    function createOverlay(id, borderColor, bgColor) {
      var el = document.getElementById(id);
      if (el) el.remove();
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('data-zerofog-ui', 'true');
      el.style.cssText =
        'position:fixed;pointer-events:none;z-index:2147483647;' +
        'border:2px solid ' +
        borderColor +
        ';' +
        'background:' +
        bgColor +
        ';' +
        'transition:all 0.1s ease;display:none;';
      document.body.appendChild(el);
      return el;
    }

    function createLabel() {
      var el = document.getElementById('__zerofog_inspector_label__');
      if (el) el.remove();
      el = document.createElement('div');
      el.id = '__zerofog_inspector_label__';
      el.setAttribute('data-zerofog-ui', 'true');
      el.style.cssText =
        'position:fixed;pointer-events:none;z-index:2147483647;' +
        'background:#18181b;color:#fff;font-size:11px;font-family:monospace;' +
        'padding:2px 6px;border-radius:3px;display:none;white-space:nowrap;';
      document.body.appendChild(el);
      return el;
    }

    function positionOverlay(el, rect) {
      el.style.top = rect.top + 'px';
      el.style.left = rect.left + 'px';
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      el.style.display = 'block';
    }

    function updateHoverOverlay(target) {
      var rect = target.getBoundingClientRect();
      positionOverlay(overlay, rect);

      // Show component label
      var info = resolveSource(target);
      var labelText =
        info.componentChain.length > 0
          ? info.componentChain[0] + ' <' + info.element.tag.toLowerCase() + '>'
          : '<' + info.element.tag.toLowerCase() + '>';
      if (info.testId) labelText += ' [' + info.testId + ']';
      labelEl.textContent = labelText;
      labelEl.style.top = Math.max(0, rect.top - 22) + 'px';
      labelEl.style.left = rect.left + 'px';
      labelEl.style.display = 'block';
    }

    function handleHover(e) {
      if (!active) return;
      var target = e.target;
      if (
        !target ||
        target === overlay ||
        target === selectedOverlay ||
        target === labelEl
      )
        return;
      if (target.closest && target.closest('[data-zerofog-ui="true"]')) return;
      // Skip if same element as last hover
      if (target === lastHoverTarget) return;
      lastHoverTarget = target;
      // Throttle to one update per animation frame
      if (!hoverRafPending) {
        hoverRafPending = true;
        requestAnimationFrame(function () {
          hoverRafPending = false;
          if (active && lastHoverTarget && document.contains(lastHoverTarget)) {
            updateHoverOverlay(lastHoverTarget);
          }
        });
      }
    }

    function handlePointerDown(e) {
      if (!active || !selectMode) return;
      e.stopPropagation();
      e.preventDefault();
    }

    function handleClick(e) {
      if (!active || !selectMode) return;
      e.stopPropagation();
      e.preventDefault();

      var target = e.target;
      if (
        !target ||
        target === overlay ||
        target === selectedOverlay ||
        target === labelEl
      )
        return;
      if (target.closest && target.closest('[data-zerofog-ui="true"]')) return;

      var rect = target.getBoundingClientRect();
      positionOverlay(selectedOverlay, rect);

      var info = resolveSource(target);
      var computed = window.getComputedStyle(target);
      var elementType = classifyElement(
        info.componentChain || [],
        target.tagName
      );

      selectionId++;
      elementMap[selectionId] = target;

      // Evict oldest entries when map exceeds cap
      var mapKeys = Object.keys(elementMap);
      while (mapKeys.length > MAX_ELEMENT_MAP_SIZE) {
        delete elementMap[mapKeys.shift()];
      }

      var selection = {
        id: selectionId,
        timestamp: Date.now(),
        testId: info.testId,
        componentChain: info.componentChain,
        hasClientFiber: info.hasClientFiber,
        elementType: elementType,
        element: {
          tag: info.element.tag,
          classes: info.element.classes,
          text: info.element.text,
          bounds: info.element.bounds,
        },
        styles: {
          color: computed.color,
          background: computed.background,
          fontSize: computed.fontSize,
          padding: computed.padding,
          margin: computed.margin,
          display: computed.display,
          gap: computed.gap,
          borderRadius: computed.borderRadius,
          fontWeight: computed.fontWeight,
          fontFamily: computed.fontFamily,
        },
      };

      window.__ZEROFOG__.selected = selection;
      document.dispatchEvent(
        new CustomEvent('zerofog:selected', { detail: selection })
      );
      postToParent('zerofog:selected', selection);
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        deactivate();
      }
    }

    // Dispatch table for inbound message types — extensible for Phase 4+
    var messageHandlers = Object.create(null);
    messageHandlers['inspector:enter-select'] = function () {
      selectMode = true;
      window.__ZEROFOG__.selectMode = true;
    };
    messageHandlers['inspector:exit-select'] = function () {
      selectMode = false;
      window.__ZEROFOG__.selectMode = false;
    };

    function handleMessage(e) {
      if (!isValidInbound(e)) return;
      var handler = messageHandlers[e.data.type];
      if (handler) handler(e.data.payload);
    }

    function deactivate() {
      var wasActive = active;
      active = false;
      selectMode = false;
      // Clear element references to allow GC of detached DOM nodes
      var mapKeys = Object.keys(elementMap);
      for (var i = 0; i < mapKeys.length; i++) {
        delete elementMap[mapKeys[i]];
      }
      lastHoverTarget = null;
      hoverRafPending = false;
      window.__ZEROFOG__.inspectorActive = false;
      window.__ZEROFOG__.selectMode = false;
      window.__ZEROFOG__.selected = null;
      if (overlay) overlay.style.display = 'none';
      if (selectedOverlay) selectedOverlay.style.display = 'none';
      if (labelEl) labelEl.style.display = 'none';
      document.removeEventListener('mouseover', handleHover, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('message', handleMessage);
      if (wasActive) {
        document.dispatchEvent(new CustomEvent('zerofog:deselected'));
        postToParent('zerofog:deselected', null);
      }
    }

    function activate() {
      // Idempotent — clean up before re-attaching
      deactivate();

      overlay = createOverlay(OVERLAY_ID, '#3b82f6', 'rgba(59,130,246,0.08)');
      selectedOverlay = createOverlay(
        '__zerofog_inspector_selected__',
        '#22c55e',
        'rgba(34,197,94,0.1)'
      );
      labelEl = createLabel();

      active = true;
      window.__ZEROFOG__.inspectorActive = true;

      document.addEventListener('mouseover', handleHover, true);
      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('click', handleClick, true);
      document.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('message', handleMessage);

      postToParent('zerofog:ready', null);
    }

    // Expose for re-activation, deactivation, and state checking
    window.__ZEROFOG__.activateInspector = activate;
    window.__ZEROFOG__.deactivateInspector = deactivate;
    window.__ZEROFOG__.selected = null;
    window.__ZEROFOG__.inspectorActive = false;
    window.__ZEROFOG__.selectMode = false;
    window.__ZEROFOG__.elementMap = elementMap;

    // Auto-activate on injection
    activate();
  })();
}

// ── Exports (for testing; stripped by tsup IIFE bundling) ────────
export {
  resolveSource,
  getComponentName,
  findReactFiberKeys,
  walkComponentChain,
  isFiberAncestor,
  classifyElement,
};
