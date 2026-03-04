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

/**
 * Escape special characters for use inside a CSS attribute-value selector.
 * E.g. `card"panel` → `card\"panel`, `path\to` → `path\\to`
 *
 * Scope: escapes backslash and double-quote only. Does NOT handle null bytes,
 * control characters, or other Unicode edge cases. testId values are
 * developer-controlled strings that should not contain such characters.
 */
function escapeAttrValue(val) {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

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

/**
 * Parse semicolon-delimited CSS declarations into a property→value map.
 * E.g. "padding: 16px !important; color: red" → { padding: "16px !important", color: "red" }
 *
 * Splits on semicolons naively. Semicolons inside quoted values will cause incorrect splits.
 */
function parseDeclarations(body, target) {
  var declarations = body.split(';');
  for (var j = 0; j < declarations.length; j++) {
    var decl = declarations[j].trim();
    if (!decl) continue;
    var colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    var prop = decl.substring(0, colonIdx).trim();
    var val = decl.substring(colonIdx + 1).trim();
    if (prop) target[prop] = val;
  }
}

/**
 * Parse a CSS text block into a rules object.
 * Returns { selector: { property: value, ... }, ... }
 * Uses brace-depth tracking to correctly handle @media/@supports nesting.
 *
 * Handles one level of @-rule nesting. Double-nested (e.g. @supports inside @media) drops inner rules.
 */
function parseOverrideRules(cssText) {
  var rules = {};
  if (!cssText || !cssText.trim()) return rules;

  var depth = 0;
  var buffer = '';
  var currentSelector = '';
  var inAtRule = false;

  for (var i = 0; i < cssText.length; i++) {
    var ch = cssText[i];

    if (ch === '{') {
      if (depth === 0) {
        // Depth 0→1: entering a top-level block
        var sel = buffer.trim();
        if (sel.charAt(0) === '@') {
          // @media or @supports — wrapper, not a rule selector
          inAtRule = true;
        } else {
          currentSelector = sel;
        }
        buffer = '';
      } else if (depth === 1 && inAtRule) {
        // Depth 1→2: entering inner rule inside @-rule
        currentSelector = buffer.trim();
        buffer = '';
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && !inAtRule) {
        // End of flat rule — parse declarations
        if (currentSelector) {
          if (!rules[currentSelector]) rules[currentSelector] = {};
          parseDeclarations(buffer, rules[currentSelector]);
        }
        buffer = '';
        currentSelector = '';
      } else if (depth === 1 && inAtRule) {
        // End of nested rule inside @-rule
        if (currentSelector) {
          if (!rules[currentSelector]) rules[currentSelector] = {};
          parseDeclarations(buffer, rules[currentSelector]);
        }
        buffer = '';
        currentSelector = '';
      } else if (depth === 0 && inAtRule) {
        // End of @-rule wrapper
        inAtRule = false;
        buffer = '';
      }
    } else {
      buffer += ch;
    }
  }

  return rules;
}

/**
 * Serialize a rules object back to CSS text.
 */
function buildOverrideCSS(rules) {
  var css = '';
  for (var selector in rules) {
    if (!Object.prototype.hasOwnProperty.call(rules, selector)) continue;
    var props = [];
    for (var prop in rules[selector]) {
      if (!Object.prototype.hasOwnProperty.call(rules[selector], prop)) continue;
      props.push(prop + ': ' + rules[selector][prop]);
    }
    if (props.length > 0) {
      css += selector + ' { ' + props.join('; ') + '; }\n';
    }
  }
  return css;
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

// ── Module-level alias for IIFE-scoped buildSelector (ESM export bridge) ──
// Initialized to a stub that throws in non-browser contexts (SSR/Node).
// The IIFE overwrites this with the real implementation at runtime.
var _buildSelector = function () {
  throw new Error('buildSelector requires a browser environment');
};

// ── Browser Inspector (only runs in browser context) ─────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Initialize consolidated namespace (idempotent — safe for re-injection)
  window.__ZEROFOG__ = window.__ZEROFOG__ || {};

  // Guard: deactivate previous IIFE instance before new closure replaces references.
  // Prevents ghost listeners from old closure that become unreachable after re-injection.
  if (window.__ZEROFOG__.deactivateInspector) {
    window.__ZEROFOG__.deactivateInspector();
  }

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
    var overrideRules = Object.create(null);
    var overrideStyleEl = null;
    function pruneDetachedElements() {
      var mapKeys = Object.keys(elementMap);
      for (var i = 0; i < mapKeys.length; i++) {
        var el = elementMap[mapKeys[i]];
        if (el && !document.contains(el)) {
          delete elementMap[mapKeys[i]];
        }
      }
    }

    /**
     * Attach navigation listeners to prune detached elements on SPA route changes.
     *
     * Uses a sentinel pattern: pushState/replaceState are wrapped once (guarded by
     * `__cortexPatched`) and read `_pruneCallback` from the global on each invocation.
     * On teardown, we null the callback instead of restoring originals — this avoids
     * breaking framework router patches installed above ours.
     *
     * Known limitation: if a framework router also patches pushState, and the
     * inspector loads/unloads between the framework's setup and teardown, the
     * restore-on-teardown can break the framework's wrapper.
     */
    function setupNavListeners() {
      window.__ZEROFOG__._pruneCallback = pruneDetachedElements;
      window.addEventListener('popstate', pruneDetachedElements);
      if (!history.pushState.__cortexPatched) {
        var origPush = history.pushState;
        history.pushState = function () {
          origPush.apply(history, arguments);
          if (window.__ZEROFOG__ && window.__ZEROFOG__._pruneCallback) {
            window.__ZEROFOG__._pruneCallback();
          }
        };
        history.pushState.__cortexPatched = true;
      }
      if (!history.replaceState.__cortexPatched) {
        var origReplace = history.replaceState;
        history.replaceState = function () {
          origReplace.apply(history, arguments);
          if (window.__ZEROFOG__ && window.__ZEROFOG__._pruneCallback) {
            window.__ZEROFOG__._pruneCallback();
          }
        };
        history.replaceState.__cortexPatched = true;
      }
    }

    function teardownNavListeners() {
      window.removeEventListener('popstate', pruneDetachedElements);
      if (window.__ZEROFOG__) {
        window.__ZEROFOG__._pruneCallback = null;
      }
    }

    function ensureOverrideStyle() {
      if (overrideStyleEl && overrideStyleEl.parentNode) return;
      overrideStyleEl = document.createElement('style');
      overrideStyleEl.id = '__zerofog_overrides__';
      overrideStyleEl.setAttribute('data-zerofog-ui', 'true');
      document.head.appendChild(overrideStyleEl);
    }

    function syncOverrideCSS() {
      ensureOverrideStyle();
      overrideStyleEl.textContent = buildOverrideCSS(overrideRules);
    }

    function emitTokenMaps() {
      var spacingMap = {};
      var radiusMap = {};
      var tokens = ['xs', 'sm', 'md', 'lg', 'xl'];
      var radiusTokens = ['xs', 'sm', 'md', 'lg', 'xl'];

      // Batch writes: create separate elements for each token to avoid layout thrash
      var fragment = document.createDocumentFragment();
      var spacingEls = [];
      var radiusEls = [];
      var i, j;

      for (i = 0; i < tokens.length; i++) {
        var el = document.createElement('div');
        el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:var(--mantine-spacing-' + tokens[i] + ')';
        el.setAttribute('data-zerofog-ui', 'true');
        fragment.appendChild(el);
        spacingEls.push(el);
      }
      for (j = 0; j < radiusTokens.length; j++) {
        var rEl = document.createElement('div');
        rEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;border-radius:var(--mantine-radius-' + radiusTokens[j] + ')';
        rEl.setAttribute('data-zerofog-ui', 'true');
        fragment.appendChild(rEl);
        radiusEls.push(rEl);
      }

      document.body.appendChild(fragment);

      // Batch reads: single forced layout for all elements
      for (i = 0; i < tokens.length; i++) {
        var computed = window.getComputedStyle(spacingEls[i]).paddingTop;
        if (computed && computed !== '0px') {
          spacingMap[computed] = tokens[i];
        }
      }
      for (j = 0; j < radiusTokens.length; j++) {
        var computedR = window.getComputedStyle(radiusEls[j]).borderTopLeftRadius;
        if (computedR && computedR !== '0px') {
          radiusMap[computedR] = radiusTokens[j];
        }
      }
      radiusMap['0px'] = 'none';

      // Cleanup
      for (i = 0; i < spacingEls.length; i++) spacingEls[i].remove();
      for (j = 0; j < radiusEls.length; j++) radiusEls[j].remove();

      postToParent('zerofog:token-maps', { spacing: spacingMap, radius: radiusMap });
    }

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
          } else if (overlay) {
            overlay.style.display = 'none';
            labelEl.style.display = 'none';
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
        origins: {},
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
    messageHandlers['inspector:apply-override'] = function (payload) {
      if (!payload || !payload.elementId || !payload.cssProperty) return;
      var el = elementMap[payload.elementId];
      if (!el) return;
      var selector = buildSelector(el);
      if (!overrideRules[selector]) overrideRules[selector] = Object.create(null);
      overrideRules[selector][payload.cssProperty] = payload.cssValue + ' !important';
      syncOverrideCSS();
      postToParent('zerofog:apply-override-result', { ok: true });
    };
    messageHandlers['inspector:remove-override'] = function (payload) {
      if (!payload || !payload.elementId || !payload.cssProperty) return;
      var el = elementMap[payload.elementId];
      if (!el) return;
      var selector = buildSelector(el);
      if (overrideRules[selector]) {
        delete overrideRules[selector][payload.cssProperty];
        if (Object.keys(overrideRules[selector]).length === 0) {
          delete overrideRules[selector];
        }
      }
      syncOverrideCSS();
    };
    messageHandlers['inspector:discard-overrides'] = function () {
      discardOverrides();
    };
    messageHandlers['inspector:build-selector'] = function (payload) {
      if (!payload || !payload.elementId) return;
      var el = elementMap[payload.elementId];
      if (!el) return;
      var selector = buildSelector(el);
      postToParent('zerofog:selector', { selector: selector });
    };

    function handleMessage(e) {
      if (!isValidInbound(e)) return;
      var handler = messageHandlers[e.data.type];
      if (handler) handler(e.data.payload);
    }

    function teardownListeners() {
      var wasActive = active;
      active = false;
      selectMode = false;
      lastHoverTarget = null;
      hoverRafPending = false;
      window.__ZEROFOG__.inspectorActive = false;
      window.__ZEROFOG__.selectMode = false;
      if (overlay) overlay.style.display = 'none';
      if (selectedOverlay) selectedOverlay.style.display = 'none';
      if (labelEl) labelEl.style.display = 'none';
      document.removeEventListener('mouseover', handleHover, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('message', handleMessage);
      teardownNavListeners();
      if (wasActive) {
        document.dispatchEvent(new CustomEvent('zerofog:deselected'));
        postToParent('zerofog:deselected', null);
      }
    }

    function discardOverrides() {
      // Clear element references to allow GC of detached DOM nodes
      var mapKeys = Object.keys(elementMap);
      for (var i = 0; i < mapKeys.length; i++) {
        delete elementMap[mapKeys[i]];
      }
      // Clear override CSS
      overrideRules = Object.create(null);
      if (overrideStyleEl) overrideStyleEl.textContent = '';
      window.__ZEROFOG__.selected = null;
    }

    function deactivate() {
      teardownListeners();
      discardOverrides();
      if (overrideStyleEl && overrideStyleEl.parentNode) {
        overrideStyleEl.remove();
        overrideStyleEl = null;
      }
    }

    function activate() {
      // Idempotent — tear down listeners before re-attaching (preserves override state)
      teardownListeners();

      // Recover cortexIdCounter from pre-existing DOM (survives HMR/re-injection)
      var existingIds = document.querySelectorAll('[data-cortex-id]');
      var maxId = cortexIdCounter;
      for (var ei = 0; ei < existingIds.length; ei++) {
        var val = existingIds[ei].getAttribute('data-cortex-id');
        var match = val && val.match(/^cx-(\d+)$/);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num > maxId) maxId = num;
        }
      }
      cortexIdCounter = maxId;

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
      setupNavListeners();

      postToParent('zerofog:ready', null);
      emitTokenMaps();
    }

    var cortexIdCounter = 0;

    function buildSelector(element) {
      // Prefer data-testid if unique on the page
      var testId = element.getAttribute('data-testid');
      if (testId) {
        var escaped = escapeAttrValue(testId);
        var matches = document.querySelectorAll('[data-testid="' + escaped + '"]');
        if (matches.length === 1) {
          return '[data-testid="' + escaped + '"]';
        }
      }

      // Fallback: use or assign data-cortex-id for a unique selector
      var cortexId = element.getAttribute('data-cortex-id');
      if (!cortexId) {
        cortexIdCounter++;
        cortexId = 'cx-' + cortexIdCounter;
        element.setAttribute('data-cortex-id', cortexId);
      }
      return '[data-cortex-id="' + cortexId + '"]';
    }

    // Bridge IIFE-scoped buildSelector to module scope for ESM export
    _buildSelector = buildSelector;

    // Expose for re-activation, deactivation, and state checking
    window.__ZEROFOG__.activateInspector = activate;
    window.__ZEROFOG__.deactivateInspector = deactivate;
    window.__ZEROFOG__.pauseInspector = teardownListeners;
    window.__ZEROFOG__.discardOverrides = discardOverrides;
    window.__ZEROFOG__.buildSelector = buildSelector;
    window.__ZEROFOG__.selected = null;
    window.__ZEROFOG__.inspectorActive = false;
    window.__ZEROFOG__.selectMode = false;
    window.__ZEROFOG__._pruneCallback = null;
    /** Internal/unstable: elementMap exposed as mutable reference for first-party
     *  panel code. Not part of the public API. */
    window.__ZEROFOG__.elementMap = elementMap;

    // Auto-activate on injection
    activate();
  })();
}

// ── Exports (for testing; stripped by tsup IIFE bundling) ────────
export {
  escapeAttrValue,
  resolveSource,
  getComponentName,
  findReactFiberKeys,
  walkComponentChain,
  isFiberAncestor,
  classifyElement,
  parseOverrideRules,
  buildOverrideCSS,
  _buildSelector as buildSelector,
};
