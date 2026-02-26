/**
 * Zerofog Token Toolbar — browser-injectable design token editor.
 *
 * Injected via Playwright MCP's browser_evaluate. Provides:
 * - Segmented token buttons for spacing (padding/margin/gap) and radius
 * - Live preview via element.style with full snapshot for revert
 * - Diff finalization to window.__ZEROFOG__.styleDiff
 *
 * Listens for CustomEvent('zerofog:selected') from visual-inspect.js.
 *
 * Usage (from /visual slash command):
 *   browser_evaluate → <contents of this file>
 */

// ── Pure Functions (exported for testing) ────────────────────────

var TOOLBAR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
var RADIUS_SIZES = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];

function buildTokenMaps(styleGetter) {
  var _getStyle =
    styleGetter ||
    function (el) {
      return getComputedStyle(el);
    };
  var spacingMap = {};
  var radiusMap = {};

  // Create hidden sentinel element for CSS variable resolution
  var sentinel = document.createElement('div');
  sentinel.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
  document.body.appendChild(sentinel);

  for (var i = 0; i < TOOLBAR_SIZES.length; i++) {
    var s = TOOLBAR_SIZES[i];

    // Resolve spacing: apply CSS variable as padding, read back resolved px
    sentinel.style.padding = 'var(--mantine-spacing-' + s + ')';
    var spacingPx = _getStyle(sentinel).paddingTop;
    if (spacingPx && spacingPx !== '0px') spacingMap[spacingPx] = s;

    // Resolve radius: apply CSS variable as border-radius, read back resolved px
    sentinel.style.borderRadius = 'var(--mantine-radius-' + s + ')';
    var radiusPx = _getStyle(sentinel).borderTopLeftRadius;
    if (radiusPx && radiusPx !== '0px') radiusMap[radiusPx] = s;
  }

  document.body.removeChild(sentinel);

  // Special radius values
  radiusMap['0px'] = 'none';

  return { spacing: spacingMap, radius: radiusMap };
}

function reverseTokenLookup(maps, category, pxValue) {
  var map = category === 'radius' ? maps.radius : maps.spacing;
  if (map[pxValue]) return map[pxValue];
  // For radius="full", check if value is very large
  if (category === 'radius') {
    var num = parseFloat(pxValue);
    if (num > 1000) return 'full';
  }
  return null;
}

function detectStyleOrigin(element, property, findFiberKeysFn, themeDefaults) {
  var _findKeys = findFiberKeysFn || findReactFiberKeys;
  var _themeDefaults =
    themeDefaults !== undefined
      ? themeDefaults
      : (typeof window !== 'undefined' &&
          window.__ZEROFOG__ &&
          window.__ZEROFOG__.themeDefaults) ||
        {};
  var fiberKeys = _findKeys(element);

  if (fiberKeys.length > 0) {
    var domFiber = element[fiberKeys[0]];

    // Walk _debugOwner to find the Mantine component fiber
    var owner = domFiber ? domFiber._debugOwner : null;
    var depth = 0;
    var MAX_DEPTH = 20;

    while (owner && depth < MAX_DEPTH) {
      var compName = '';
      if (owner.type) {
        compName = owner.type.displayName || owner.type.name || '';
      }

      if (compName && owner.memoizedProps) {
        // Check 1: Explicit Mantine prop on this component
        var propMap = {
          padding: ['padding', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr'],
          margin: ['margin', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr'],
          gap: ['gap'],
          'border-radius': ['radius'],
        };
        var candidates = propMap[property] || [];
        for (var ci = 0; ci < candidates.length; ci++) {
          if (owner.memoizedProps[candidates[ci]] !== undefined) {
            return {
              origin: 'mantine-prop',
              prop: candidates[ci],
              value: owner.memoizedProps[candidates[ci]],
              component: compName,
            };
          }
        }

        // Check 2: Theme defaultProps
        var defaults = _themeDefaults[compName];
        if (defaults) {
          var defaultPropName =
            property === 'border-radius' ? 'radius' : property;
          if (defaults[defaultPropName] !== undefined) {
            return {
              origin: 'mantine-default',
              component: compName,
              defaultValue: defaults[defaultPropName],
            };
          }
        }
      }

      owner = owner._debugOwner;
      depth++;
    }
  }

  // Check 3: Tailwind className
  var classes = element.className || '';
  if (typeof classes === 'string') {
    var twPatterns = {
      padding: /\bp[xytblr]?-(\S+)/,
      margin: /\bm[xytblr]?-(\S+)/,
      gap: /\bgap-(\S+)/,
      'border-radius': /\brounded(?:-(\S+))?/,
    };
    if (twPatterns[property] && twPatterns[property].test(classes)) {
      var match = classes.match(twPatterns[property]);
      return { origin: 'tailwind', className: match[0] };
    }
  }

  // Check 4: CSS Module (hashed class)
  if (typeof classes === 'string') {
    var classTokens = classes.split(/\s+/);
    for (var j = 0; j < classTokens.length; j++) {
      if (/^[a-zA-Z][a-zA-Z0-9-]+_[a-z0-9]{5,8}$/.test(classTokens[j])) {
        return { origin: 'css-module' };
      }
    }
  }

  return { origin: 'unknown' };
}

function finalizeDiff(selection, changes) {
  var selector = selection.testId
    ? '[data-testid="' + selection.testId + '"]'
    : selection.componentChain && selection.componentChain.length > 0
      ? selection.componentChain[0]
      : 'unknown';

  return {
    elementSelector: selector,
    componentChain: selection.componentChain || [],
    elementType: selection.elementType || 'unknown',
    changes: changes,
    timestamp: new Date().toISOString(),
  };
}

// ── findReactFiberKeys (shared with visual-inspect.js) ───────────
// Duplicated here to avoid cross-script dependency in browser context.
// In Node.js tests, the injected findFiberKeysFn overrides this.

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

// ── Browser Toolbar (only runs in browser context) ───────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__ZEROFOG__ = window.__ZEROFOG__ || {};

  (function () {
    var ELEMENT_TYPE_CATEGORIES = {
      icon: [],
      text: ['margin'],
      interactive: ['padding', 'border-radius'],
      container: ['padding', 'margin', 'gap', 'border-radius'],
      input: ['border-radius'],
      feedback: ['border-radius'],
      layout: ['gap', 'padding'],
      unknown: ['padding', 'margin', 'gap', 'border-radius'],
    };

    var CATEGORY_LABELS = {
      padding: 'Padding',
      margin: 'Margin',
      gap: 'Gap',
      'border-radius': 'Radius',
    };

    var CATEGORY_CSS_PROPS = {
      padding: 'paddingTop',
      margin: 'marginTop',
      gap: 'rowGap',
      'border-radius': 'borderTopLeftRadius',
    };

    var tokenMaps = null;
    var toolbarEl = null;
    var currentTarget = null;
    var currentSelection = null;
    var styleSnapshot = null;
    var pendingChanges = {};

    function ensureTokenMaps() {
      if (!tokenMaps) {
        tokenMaps = buildTokenMaps();
      }
      return tokenMaps;
    }

    function snapshotStyle(element) {
      styleSnapshot = element.getAttribute('style');
    }

    function applyPreview(element, cssProp, value) {
      if (styleSnapshot === null && !element.getAttribute('style')) {
        styleSnapshot = null;
      } else if (styleSnapshot === null) {
        styleSnapshot = element.getAttribute('style');
      }
      element.style.setProperty(cssProp, value, 'important');
    }

    function revertPreview(element) {
      if (!element) return;
      if (styleSnapshot === null) {
        element.removeAttribute('style');
      } else {
        element.setAttribute('style', styleSnapshot);
      }
      styleSnapshot = null;
    }

    function getCategoryValue(element, category) {
      var cssProp = CATEGORY_CSS_PROPS[category];
      if (!cssProp) return null;
      var computed = window.getComputedStyle(element);
      return computed[cssProp] || null;
    }

    function createToolbarDOM(categories, currentValues, maps) {
      var container = document.createElement('div');
      container.id = '__zerofog_toolbar__';
      container.setAttribute('data-zerofog-ui', 'true');
      container.style.cssText =
        'position:fixed;z-index:2147483647;background:#18181b;color:#fff;' +
        'font-family:monospace;font-size:12px;padding:12px;border-radius:8px;' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.4);min-width:260px;pointer-events:auto;';

      // Header with close button
      var header = document.createElement('div');
      header.setAttribute('data-zerofog-ui', 'true');
      header.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      var title = document.createElement('span');
      title.setAttribute('data-zerofog-ui', 'true');
      title.textContent = 'Token Toolbar';
      title.style.cssText =
        'font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;';
      var closeBtn = document.createElement('button');
      closeBtn.setAttribute('data-zerofog-ui', 'true');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText =
        'background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:14px;' +
        'padding:2px 6px;border-radius:4px;';
      closeBtn.onmouseover = function () {
        closeBtn.style.color = '#fff';
      };
      closeBtn.onmouseout = function () {
        closeBtn.style.color = '#a1a1aa';
      };
      closeBtn.onclick = function () {
        hideToolbar();
      };
      header.appendChild(title);
      header.appendChild(closeBtn);
      container.appendChild(header);

      // Category rows
      for (var ci = 0; ci < categories.length; ci++) {
        var cat = categories[ci];
        var label = CATEGORY_LABELS[cat] || cat;
        var currentPx = currentValues[cat];
        var currentToken = currentPx
          ? reverseTokenLookup(
              maps,
              cat === 'border-radius' ? 'radius' : 'spacing',
              currentPx
            )
          : null;

        var row = document.createElement('div');
        row.setAttribute('data-zerofog-ui', 'true');
        row.style.cssText = 'margin-bottom:8px;';

        var rowLabel = document.createElement('div');
        rowLabel.setAttribute('data-zerofog-ui', 'true');
        rowLabel.textContent = label;
        rowLabel.style.cssText =
          'font-size:10px;color:#71717a;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;';

        // Custom value indicator
        if (currentPx && !currentToken) {
          var customIndicator = document.createElement('span');
          customIndicator.setAttribute('data-zerofog-ui', 'true');
          customIndicator.textContent = ' [custom: ' + currentPx + ']';
          customIndicator.style.cssText = 'color:#fbbf24;font-size:10px;';
          rowLabel.appendChild(customIndicator);
        }

        row.appendChild(rowLabel);

        var btnGroup = document.createElement('div');
        btnGroup.setAttribute('data-zerofog-ui', 'true');
        btnGroup.style.cssText = 'display:flex;gap:2px;';

        var sizes = cat === 'border-radius' ? RADIUS_SIZES : TOOLBAR_SIZES;
        for (var si = 0; si < sizes.length; si++) {
          var size = sizes[si];
          var btn = createTokenButton(size, cat, currentToken, currentPx);
          btnGroup.appendChild(btn);
        }

        row.appendChild(btnGroup);
        container.appendChild(row);
      }

      // Done button
      var doneRow = document.createElement('div');
      doneRow.setAttribute('data-zerofog-ui', 'true');
      doneRow.style.cssText = 'margin-top:8px;text-align:center;';
      var doneBtn = document.createElement('button');
      doneBtn.setAttribute('data-zerofog-ui', 'true');
      doneBtn.textContent = 'Done';
      doneBtn.style.cssText =
        'background:#22c55e;color:#fff;border:none;padding:6px 24px;border-radius:4px;' +
        'cursor:pointer;font-family:monospace;font-size:12px;font-weight:bold;';
      doneBtn.onmouseover = function () {
        doneBtn.style.background = '#16a34a';
      };
      doneBtn.onmouseout = function () {
        doneBtn.style.background = '#22c55e';
      };
      doneBtn.onclick = function () {
        handleDone();
      };
      doneRow.appendChild(doneBtn);
      container.appendChild(doneRow);

      return container;
    }

    function createTokenButton(size, category, currentToken, currentPx) {
      var btn = document.createElement('button');
      btn.setAttribute('data-zerofog-ui', 'true');
      var isActive = currentToken === size;
      var isChanged =
        pendingChanges[category] && pendingChanges[category].token === size;
      var bgColor = isChanged
        ? '#3b82f6'
        : isActive
          ? '#27272a'
          : 'transparent';
      var textColor = isChanged ? '#fff' : isActive ? '#fff' : '#a1a1aa';
      var border = isActive ? '1px solid #3f3f46' : '1px solid transparent';

      btn.textContent = size;
      btn.style.cssText =
        'background:' +
        bgColor +
        ';color:' +
        textColor +
        ';border:' +
        border +
        ';' +
        'padding:3px 8px;border-radius:3px;cursor:pointer;font-family:monospace;font-size:11px;' +
        'transition:all 0.1s;';

      btn.onmouseover = function () {
        if (!isChanged) btn.style.background = '#27272a';
        previewToken(category, size);
      };
      btn.onmouseout = function () {
        if (!isChanged)
          btn.style.background = isActive ? '#27272a' : 'transparent';
        // Only revert if not clicked (pending)
        if (
          !pendingChanges[category] ||
          pendingChanges[category].token !== size
        ) {
          revertAndReapplyPending();
        }
      };
      btn.onclick = function () {
        selectToken(category, size, currentPx);
        refreshToolbar();
      };

      return btn;
    }

    function previewToken(category, size) {
      if (!currentTarget) return;
      var maps = ensureTokenMaps();
      var mapCategory = category === 'border-radius' ? 'radius' : 'spacing';
      var map = mapCategory === 'radius' ? maps.radius : maps.spacing;

      // Find the px value for this token
      var pxValue = null;
      if (size === 'none') {
        pxValue = '0px';
      } else if (size === 'full') {
        pxValue = '9999px';
      } else {
        for (var px in map) {
          if (map[px] === size) {
            pxValue = px;
            break;
          }
        }
      }

      if (pxValue) {
        var cssPropMap = {
          padding: 'padding',
          margin: 'margin',
          gap: 'gap',
          'border-radius': 'border-radius',
        };
        applyPreview(currentTarget, cssPropMap[category] || category, pxValue);
      }
    }

    function revertAndReapplyPending() {
      if (!currentTarget) return;
      revertPreview(currentTarget);
      snapshotStyle(currentTarget);

      // Re-apply any pending changes
      var keys = Object.keys(pendingChanges);
      for (var i = 0; i < keys.length; i++) {
        var cat = keys[i];
        var change = pendingChanges[cat];
        if (change && change.cssValue) {
          var cssPropMap = {
            padding: 'padding',
            margin: 'margin',
            gap: 'gap',
            'border-radius': 'border-radius',
          };
          currentTarget.style.setProperty(
            cssPropMap[cat] || cat,
            change.cssValue,
            'important'
          );
        }
      }
    }

    function selectToken(category, size, previousPx) {
      var maps = ensureTokenMaps();
      var mapCategory = category === 'border-radius' ? 'radius' : 'spacing';
      var map = mapCategory === 'radius' ? maps.radius : maps.spacing;

      var pxValue = null;
      if (size === 'none') {
        pxValue = '0px';
      } else if (size === 'full') {
        pxValue = '9999px';
      } else {
        for (var px in map) {
          if (map[px] === size) {
            pxValue = px;
            break;
          }
        }
      }

      var previousToken = previousPx
        ? reverseTokenLookup(maps, mapCategory, previousPx)
        : null;

      var styleOrigin = currentTarget
        ? detectStyleOrigin(currentTarget, category)
        : { origin: 'unknown' };

      pendingChanges[category] = {
        property: category,
        token: size,
        previousToken: previousToken,
        previousCssValue: previousPx || '0px',
        cssProperty: category,
        cssValue: pxValue || '0px',
        styleOrigin: styleOrigin,
      };
    }

    function refreshToolbar() {
      if (!toolbarEl || !currentTarget || !currentSelection) return;
      var maps = ensureTokenMaps();
      var categories =
        ELEMENT_TYPE_CATEGORIES[currentSelection.elementType] ||
        ELEMENT_TYPE_CATEGORIES.unknown;
      if (categories.length === 0) return;

      var currentValues = {};
      for (var i = 0; i < categories.length; i++) {
        currentValues[categories[i]] = getCategoryValue(
          currentTarget,
          categories[i]
        );
      }

      var bounds = currentSelection.element
        ? currentSelection.element.bounds
        : { bottom: 100, left: 0, width: 200, top: 100 };
      var parent = toolbarEl.parentElement;
      if (parent) parent.removeChild(toolbarEl);
      toolbarEl = createToolbarDOM(categories, currentValues, maps);
      document.body.appendChild(toolbarEl);
      positionToolbar(toolbarEl, bounds);
    }

    function handleDone() {
      if (!currentSelection) return;

      var changeList = [];
      var keys = Object.keys(pendingChanges);
      for (var i = 0; i < keys.length; i++) {
        changeList.push(pendingChanges[keys[i]]);
      }

      if (changeList.length > 0) {
        var diff = finalizeDiff(currentSelection, changeList);
        window.__ZEROFOG__.styleDiff = diff;
      }

      // Clean up toolbar but keep the style preview applied
      if (toolbarEl && toolbarEl.parentElement) {
        toolbarEl.parentElement.removeChild(toolbarEl);
      }
      toolbarEl = null;
      window.__ZEROFOG__.toolbarActive = false;
      pendingChanges = {};
    }

    function showToolbar(selection) {
      ensureTokenMaps();
      var categories =
        ELEMENT_TYPE_CATEGORIES[selection.elementType] ||
        ELEMENT_TYPE_CATEGORIES.unknown;
      if (categories.length === 0) return;

      currentSelection = selection;
      pendingChanges = {};

      // Find the actual DOM element via selection bounds
      var bounds = selection.element ? selection.element.bounds : null;
      if (bounds) {
        var el = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2
        );
        if (el && !el.closest('[data-zerofog-ui="true"]')) {
          currentTarget = el;
        }
      }

      if (!currentTarget) return;

      snapshotStyle(currentTarget);

      var currentValues = {};
      for (var i = 0; i < categories.length; i++) {
        currentValues[categories[i]] = getCategoryValue(
          currentTarget,
          categories[i]
        );
      }

      toolbarEl = createToolbarDOM(categories, currentValues, tokenMaps);
      document.body.appendChild(toolbarEl);
      positionToolbar(toolbarEl, bounds);
      window.__ZEROFOG__.toolbarActive = true;
    }

    function hideToolbar() {
      if (currentTarget) {
        revertPreview(currentTarget);
      }
      if (toolbarEl && toolbarEl.parentElement) {
        toolbarEl.parentElement.removeChild(toolbarEl);
      }
      toolbarEl = null;
      currentTarget = null;
      currentSelection = null;
      styleSnapshot = null;
      pendingChanges = {};
      window.__ZEROFOG__.toolbarActive = false;
    }

    function positionToolbar(el, targetBounds) {
      var MARGIN = 8;
      var toolbarHeight = el.offsetHeight;
      var toolbarWidth = el.offsetWidth;
      var viewportHeight = window.innerHeight;
      var viewportWidth = window.innerWidth;

      // Prefer below the element
      var top = targetBounds.bottom + MARGIN;

      // Fall back to above if below would go off-screen
      if (top + toolbarHeight > viewportHeight) {
        top = targetBounds.top - toolbarHeight - MARGIN;
      }

      // Pin to viewport edge as last resort
      if (top < 0) top = MARGIN;
      if (top + toolbarHeight > viewportHeight)
        top = viewportHeight - toolbarHeight - MARGIN;

      // Horizontal: center-align with element, clamp to viewport
      var left = targetBounds.left + targetBounds.width / 2 - toolbarWidth / 2;
      if (left < MARGIN) left = MARGIN;
      if (left + toolbarWidth > viewportWidth)
        left = viewportWidth - toolbarWidth - MARGIN;

      el.style.top = top + 'px';
      el.style.left = left + 'px';
    }

    function destroy() {
      hideToolbar();
      document.removeEventListener('zerofog:selected', onSelected);
      document.removeEventListener('zerofog:deselected', onDeselected);
      window.removeEventListener('scroll', onScroll);
      tokenMaps = null;
    }

    function onSelected(e) {
      hideToolbar();
      var selection = e.detail;
      if (selection && selection.elementType !== 'icon') {
        showToolbar(selection);
      }
    }

    function onDeselected() {
      hideToolbar();
    }

    function onScroll() {
      if (window.__ZEROFOG__ && window.__ZEROFOG__.toolbarActive) {
        hideToolbar();
      }
    }

    // Idempotent: destroy previous instance before re-attaching
    if (typeof window.__ZEROFOG__.destroyToolbar === 'function') {
      window.__ZEROFOG__.destroyToolbar();
    }

    document.addEventListener('zerofog:selected', onSelected);
    document.addEventListener('zerofog:deselected', onDeselected);
    window.addEventListener('scroll', onScroll, { passive: true });

    window.__ZEROFOG__.destroyToolbar = destroy;
    window.__ZEROFOG__.toolbarActive = false;
  })();
}

// ── Module exports (for testing in Node.js) ──────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildTokenMaps: buildTokenMaps,
    reverseTokenLookup: reverseTokenLookup,
    detectStyleOrigin: detectStyleOrigin,
    finalizeDiff: finalizeDiff,
    findReactFiberKeys: findReactFiberKeys,
  };
}
