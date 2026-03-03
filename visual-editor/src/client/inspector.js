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
var TEMPLATE_OK = SESSION_ID.indexOf('__') !== 0 && SIDECAR_ORIGIN.indexOf('__') !== 0;

// ── Constants ────────────────────────────────────────────────────

var MAX_CHAIN_DEPTH = 20;
var MAX_ANCESTOR_DEPTH = 50;
var MAX_ELEMENT_MAP_SIZE = 50;
var MSG_VERSION = 1;
var FIBER_TAG_FUNCTION = 0;
var FIBER_TAG_CLASS = 1;

var ALLOWED_CSS_PROPERTIES = new Set([
  'color', 'background', 'fontSize', 'padding', 'margin',
  'display', 'gap', 'borderRadius', 'fontWeight', 'fontFamily',
]);

var CSS_VALUE_UNSAFE = /expression\s*\(|url\s*\(|image-set\s*\(|element\s*\(|paint\s*\(|@import|[;{}\\]/i;

var TOKEN_CONSTRAINED_PROPERTIES = new Set([
  'padding', 'margin', 'gap', 'borderRadius',
]);

var SPACING_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl'];
var RADIUS_TOKENS  = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];
Object.freeze(SPACING_TOKENS);
Object.freeze(RADIUS_TOKENS);

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
}

var TOKEN_VAR_PREFIX = Object.create(null);
TOKEN_VAR_PREFIX['padding'] = '--mantine-spacing-';
TOKEN_VAR_PREFIX['margin'] = '--mantine-spacing-';
TOKEN_VAR_PREFIX['gap'] = '--mantine-spacing-';
TOKEN_VAR_PREFIX['borderRadius'] = '--mantine-radius-';

var OVERRIDE_STYLE_ID = 'zerofog-override-styles';

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
  var type = fiber.type;
  if (typeof type === 'string') return null;
  var depth = 0;
  while (type && depth < 5) {
    if (type.displayName || type.name) return type.displayName || type.name;
    if (type.render && typeof type.render === 'function') {
      return type.render.displayName || type.render.name || null;
    }
    if (type.type && typeof type.type !== 'string') { type = type.type; depth++; continue; }
    break;
  }
  return null;
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

var cachedFiberKey = null;

function getFiberFromElement(element) {
  if (cachedFiberKey) {
    var cached = element[cachedFiberKey];
    return cached !== undefined ? cached : null;
  }
  var keys = findReactFiberKeys(element);
  if (keys.length > 0) {
    cachedFiberKey = keys[0];
    return element[keys[0]] || null;
  }
  return null;
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
    if (currentB.tag === FIBER_TAG_FUNCTION || currentB.tag === FIBER_TAG_CLASS) {
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

function resolveSource(element, fiberKeys, bounds) {
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
  var fiber = fiberKeys ? element[fiberKeys[0]] || null : getFiberFromElement(element);
  var keys = fiberKeys || (cachedFiberKey ? [cachedFiberKey] : []);

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
  var text = '';
  var cn = element.childNodes;
  if (cn) {
    for (var ti = 0; ti < cn.length && text.length < 100; ti++) {
      if (cn[ti].nodeType === 3) text += cn[ti].nodeValue;
    }
    text = text.substring(0, 100);
  }
  var actualBounds = bounds || (element.getBoundingClientRect
    ? element.getBoundingClientRect()
    : { top: 0, left: 0, width: 0, height: 0 });

  return {
    testId: testId,
    componentChain: componentChain,
    hasClientFiber: hasClientFiber,
    element: {
      tag: tag,
      classes: classes,
      text: text,
      bounds: actualBounds,
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

function isTokenValue(cssProperty, cssValue) {
  if (!TOKEN_CONSTRAINED_PROPERTIES.has(cssProperty)) return true;
  if (/^var\(--mantine-(?:spacing|radius)-(?:none|xs|sm|md|lg|xl)\)$/.test(cssValue)) return true;
  var tokens = cssProperty === 'borderRadius' ? RADIUS_TOKENS : SPACING_TOKENS;
  var parts = cssValue.split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    if (tokens.indexOf(parts[i]) === -1) return false;
  }
  return parts.length > 0;
}

function resolveTokenValue(cssProperty, cssValue) {
  if (!TOKEN_CONSTRAINED_PROPERTIES.has(cssProperty)) return cssValue;
  if (/^var\(--/.test(cssValue)) return cssValue;
  var prefix = TOKEN_VAR_PREFIX[cssProperty];
  if (!prefix) return cssValue;
  var parts = cssValue.split(/\s+/);
  var resolved = [];
  for (var i = 0; i < parts.length; i++) {
    resolved.push('var(' + prefix + parts[i] + ')');
  }
  return resolved.join(' ');
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
      var cssName = camelToKebab(prop);
      props.push(cssName + ': ' + rules[selector][prop]);
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
    e.data.version === MSG_VERSION &&
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
  if (!TEMPLATE_OK && typeof console !== 'undefined' && console.warn) {
    console.warn('[zerofog] Template variables not substituted — message auth will reject all inbound messages');
  }

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
    function pruneDetachedElements() {
      var mapKeys = Object.keys(elementMap);
      for (var i = 0; i < mapKeys.length; i++) {
        var el = elementMap[mapKeys[i]];
        if (el && !document.contains(el)) {
          delete elementMap[mapKeys[i]];
        }
      }
      // Prune override rules whose selectors match zero DOM elements
      var ruleKeys = Object.keys(overrideRules);
      var pruned = false;
      for (var j = 0; j < ruleKeys.length; j++) {
        if (!document.querySelector(ruleKeys[j])) {
          delete overrideRules[ruleKeys[j]];
          pruned = true;
        }
      }
      if (pruned) scheduleOverrideSheet();
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
        'transition:top 0.1s ease,left 0.1s ease,width 0.1s ease,height 0.1s ease;display:none;';
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
      var info = resolveSource(target, undefined, rect);
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
    messageHandlers['inspector:discard-overrides'] = function () {
      discardOverrides();
    };
    messageHandlers['inspector:build-selector'] = function (payload) {
      if (!payload || typeof payload.elementId !== 'number' || payload.elementId !== payload.elementId) return;
      var el = elementMap[payload.elementId];
      if (!el) return;
      var selector = buildSelector(el);
      postToParent('zerofog:selector', { selector: selector });
    };
    messageHandlers['inspector:apply-override'] = function (payload) {
      if (!payload || typeof payload.elementId !== 'number' || payload.elementId !== payload.elementId) return;
      var result = applyOverride(payload.elementId, payload.cssProperty, payload.cssValue);
      postToParent('zerofog:apply-override-result', result);
    };
    messageHandlers['inspector:remove-override'] = function (payload) {
      if (!payload || typeof payload.elementId !== 'number' || payload.elementId !== payload.elementId) return;
      removeOverride(payload.elementId, payload.cssProperty);
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
      // Clear override rules in-place (preserves window.__ZEROFOG__.overrideRules reference)
      var ruleKeys = Object.keys(overrideRules);
      for (var ri = 0; ri < ruleKeys.length; ri++) {
        delete overrideRules[ruleKeys[ri]];
      }
      var tag = document.getElementById(OVERRIDE_STYLE_ID);
      if (tag) tag.remove();
      if (selectedOverlay) selectedOverlay.style.display = 'none';
      if (labelEl) labelEl.style.display = 'none';
      window.__ZEROFOG__.selected = null;
    }

    function deactivate() {
      teardownListeners();
      discardOverrides();
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

      // Recover overrideRules from previous IIFE instance (survives HMR/re-injection)
      if (window.__ZEROFOG__ && window.__ZEROFOG__.overrideRules) {
        var prevRules = window.__ZEROFOG__.overrideRules;
        var prevKeys = Object.keys(prevRules);
        for (var ri = 0; ri < prevKeys.length; ri++) {
          var ruleKey = prevKeys[ri];
          overrideRules[ruleKey] = {};
          var propKeys = Object.keys(prevRules[ruleKey]);
          for (var pi = 0; pi < propKeys.length; pi++) {
            overrideRules[ruleKey][propKeys[pi]] = prevRules[ruleKey][propKeys[pi]];
          }
        }
        updateOverrideSheet();
      }

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

    var overrideRules = Object.create(null);
    var overrideSheetPending = false;

    function scheduleOverrideSheet() {
      if (overrideSheetPending) return;
      overrideSheetPending = true;
      requestAnimationFrame(function () {
        overrideSheetPending = false;
        updateOverrideSheet();
      });
    }

    function updateOverrideSheet() {
      var css = buildOverrideCSS(overrideRules);
      var tag = document.getElementById(OVERRIDE_STYLE_ID);
      if (!css) {
        if (tag) tag.remove();
        return;
      }
      if (!tag) {
        tag = document.createElement('style');
        tag.id = OVERRIDE_STYLE_ID;
        tag.setAttribute('data-zerofog-ui', 'true');
        document.head.appendChild(tag);
      }
      tag.textContent = css;
    }

    function applyOverride(elementId, cssProperty, cssValue) {
      if (typeof cssProperty !== 'string' || typeof cssValue !== 'string') {
        return { ok: false, error: 'unknown-property' };
      }
      if (!ALLOWED_CSS_PROPERTIES.has(cssProperty)) {
        return { ok: false, error: 'unknown-property' };
      }
      if (CSS_VALUE_UNSAFE.test(cssValue)) {
        return { ok: false, error: 'unsafe-value' };
      }
      if (!isTokenValue(cssProperty, cssValue)) {
        return { ok: false, error: 'token-required' };
      }
      var el = elementMap[elementId];
      if (!el) {
        return { ok: false, error: 'unknown-element' };
      }
      var selector = buildSelector(el);
      if (!overrideRules[selector]) overrideRules[selector] = {};
      var resolvedValue = resolveTokenValue(cssProperty, cssValue);
      overrideRules[selector][cssProperty] = resolvedValue + ' !important';
      scheduleOverrideSheet();
      return { ok: true };
    }

    function removeOverride(elementId, cssProperty) {
      var el = elementMap[elementId];
      if (!el) return;
      var selector = buildSelector(el);
      if (!overrideRules[selector]) return;
      delete overrideRules[selector][cssProperty];
      if (Object.keys(overrideRules[selector]).length === 0) {
        delete overrideRules[selector];
      }
      scheduleOverrideSheet();
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
    window.__ZEROFOG__.applyOverride = applyOverride;
    window.__ZEROFOG__.removeOverride = removeOverride;
    window.__ZEROFOG__.overrideRules = overrideRules;
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
  getFiberFromElement,
  walkComponentChain,
  isFiberAncestor,
  classifyElement,
  isTokenValue,
  resolveTokenValue,
  parseOverrideRules,
  buildOverrideCSS,
  _buildSelector as buildSelector,
  ALLOWED_CSS_PROPERTIES,
  CSS_VALUE_UNSAFE,
  TOKEN_CONSTRAINED_PROPERTIES,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  camelToKebab,
  TOKEN_VAR_PREFIX,
};
