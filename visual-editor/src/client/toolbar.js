/**
 * Zerofog Token Toolbar — pure functions for design token editing.
 *
 * Ported from scripts/visual-toolbar.js (pure functions only).
 * Provides token map building, reverse lookup, style origin detection,
 * and diff finalization. The toolbar UI IIFE is NOT included here —
 * this module is used for token resolution and style analysis.
 *
 * Template variables: none (no server-replaced values).
 */

// NOTE: This module is NOT injected at runtime — not in tsup.config.ts
// entry points, not referenced by inject.ts. Library of pure functions
// tested via ESM imports, consumed by Phase 4b toolbar UI.

// ── Constants ────────────────────────────────────────────────────

var TOOLBAR_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
var RADIUS_SIZES = ['none', 'xs', 'sm', 'md', 'lg', 'xl']; // Phase 4b: radius picker UI

// ── Pure Functions ───────────────────────────────────────────────

/**
 * Build px→token maps by creating a hidden sentinel element and
 * resolving CSS custom properties (--mantine-spacing-*, --mantine-radius-*).
 *
 * Returns { spacing: { '16px': 'md', ... }, radius: { '8px': 'md', ... } }
 */
function buildTokenMaps(styleGetter) {
  if (typeof document === 'undefined') {
    return { spacing: {}, radius: {} };
  }

  var _getStyle =
    styleGetter ||
    function (el) {
      return getComputedStyle(el);
    };
  var spacingMap = Object.create(null);
  var radiusMap = Object.create(null);

  if (!document.body) {
    return { spacing: {}, radius: {} };
  }

  // Batch writes: one sentinel per token size, all styles set before any reads.
  // Avoids layout thrash (interleaved write→read forces synchronous reflow each time).
  var sentinels = [];
  var frag = document.createDocumentFragment();
  for (let i = 0; i < TOOLBAR_SIZES.length; i++) {
    let s = TOOLBAR_SIZES[i];
    let el = document.createElement('div');
    el.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
    el.style.padding = 'var(--mantine-spacing-' + s + ')';
    el.style.borderRadius = 'var(--mantine-radius-' + s + ')';
    sentinels.push(el);
    frag.appendChild(el);
  }
  document.body.appendChild(frag);

  try {
    // Batch reads: no writes between reads, so browser resolves layout once
    // on first getComputedStyle call; subsequent reads use cached layout.
    for (let i = 0; i < TOOLBAR_SIZES.length; i++) {
      let s = TOOLBAR_SIZES[i];
      let styles = _getStyle(sentinels[i]);

      let spacingPx = styles.paddingTop;
      if (spacingPx && spacingPx !== '0px') spacingMap[spacingPx] = s;

      let radiusPx = styles.borderTopLeftRadius;
      if (radiusPx && radiusPx !== '0px') radiusMap[radiusPx] = s;
    }
  } catch (_e) {
    return { spacing: {}, radius: {} };
  } finally {
    for (let i = 0; i < sentinels.length; i++) {
      sentinels[i].remove();
    }
  }

  // Special radius values
  radiusMap['0px'] = 'none';

  return { spacing: spacingMap, radius: radiusMap };
}

/**
 * Reverse lookup: given a px value and category, return the token name.
 * For radius values > 1000px, returns 'full'.
 */
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

/**
 * Extract a human-readable component name from a React fiber.
 * Returns null for non-component fibers (HostComponent, HostRoot, etc.)
 * DUPLICATED: canonical source is inspector.js. Keep in sync.
 */
function getComponentName(fiber) {
  if (!fiber || !fiber.type) return null;
  var type = fiber.type;
  if (typeof type === 'string') return null;
  var depth = 0;
  while (type && depth < 10) {
    if (type.displayName || type.name) return type.displayName || type.name;
    if (type.render && typeof type.render === 'function') {
      return type.render.displayName || type.render.name || null;
    }
    if (type.type && typeof type.type !== 'string') { type = type.type; depth++; continue; }
    break;
  }
  return null;
}

/**
 * Detect the origin of a CSS property value on an element.
 * Returns a discriminated union: { origin: 'mantine-prop' | 'mantine-default' | 'tailwind' | 'css-module' | 'unknown', ... }
 *
 * 4-check cascade:
 * 1. Mantine explicit prop (via React fiber memoizedProps)
 * 2. Mantine theme defaultProps
 * 3. Tailwind className (with fixed regex — no false positives on prose-lg etc.)
 * 4. CSS Module (hashed class pattern)
 */
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

    // useDebugOwner: derived from property existence, not truthiness.
    // React 18: _debugOwner always exists (even null for leaf components).
    // React 19: property absent entirely → falls to fiber.return strategy.
    var useDebugOwner = domFiber &&
      Object.prototype.hasOwnProperty.call(domFiber, '_debugOwner');

    // useDebugOwner is truthy only when domFiber is truthy, so the
    // null-guard is only needed in the else branch.
    var owner = useDebugOwner
      ? domFiber._debugOwner
      : (domFiber ? domFiber.return : null);

    var depth = 0;
    var MAX_DEPTH = 20;

    while (owner && depth < MAX_DEPTH) {
      // C3: Use type-based filter instead of tag-number allowlist.
      // getComponentName returns null for non-component fibers (HostComponent, HostRoot, etc.)
      var compName = getComponentName(owner) || '';
      if (!useDebugOwner && !compName) {
        owner = owner.return;
        depth++;
        continue;
      }

      if (compName && owner.memoizedProps) {
        // Check 1: Explicit Mantine prop on this component
        var propMap = {
          padding: ['padding', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr'],
          margin: ['margin', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr'],
          gap: ['gap'],
          borderRadius: ['radius'],
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
            property === 'borderRadius' ? 'radius' : property;
          if (defaults[defaultPropName] !== undefined) {
            return {
              origin: 'mantine-default',
              component: compName,
              defaultValue: defaults[defaultPropName],
            };
          }
        }
      }

      owner = useDebugOwner ? owner._debugOwner : owner.return;
      depth++;
    }
  }

  // Check 3: Tailwind className (IM5 — fixed regex to prevent false positives)
  //
  // Changes from original:
  // - (?:^|\s) for class boundary instead of \b (prevents matching inside compound words like "prose-lg")
  // - (?:[\w]+:)? for responsive/state prefixes (sm:, md:, hover:, etc.)
  // - Restricted value sets instead of greedy \S+ capture
  var classes = element.className || '';
  if (typeof classes === 'string') {
    // Note: (?:[\w-]+:)* is safe against ReDoS — the mandatory ':'
    // delimiter prevents overlapping matches. className is DOM-sourced.
    var twPatterns = {
      padding: /(?:^|\s)!?(?:[\w-]+:)*p[xytblrse]?-(\d+(?:\.5)?|px|auto|\[\S+?\])/,
      margin: /(?:^|\s)!?(?:[\w-]+:)*-?m[xytblrse]?-(\d+(?:\.5)?|px|auto|\[\S+?\])/,
      gap: /(?:^|\s)!?(?:[\w-]+:)*gap-(\d+(?:\.5)?|px|auto|\[\S+?\])/,
      borderRadius:
        /(?:^|\s)!?(?:[\w-]+:)*rounded(?:-(?:tl|tr|bl|br|t|b|l|r|s|e)(?=-|\s|$))?(?:-(none|sm|md|lg|xl|2xl|3xl|full|\[\S+?\]))?/,
    };
    if (twPatterns[property] && twPatterns[property].test(classes)) {
      var match = classes.match(twPatterns[property]);
      return { origin: 'tailwind', className: match[0].trim() };
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

/**
 * Escape special characters for CSS attribute selectors.
 * Mirrors inspector.js — intentional duplicate (IIFEs independent).
 * Phase 9: Also escapes `]` and strips null bytes.
 */
function escapeAttrValue(val) {
  return val
    .replace(/\0/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/]/g, '\\]');
}

/**
 * Finalize a diff object from selection metadata and accumulated changes.
 * Pure data transformation — no DOM access.
 *
 * C5-client: Accepts optional `selector` parameter (from window.__ZEROFOG__.buildSelector)
 * to include the actual CSS selector in the payload for server-side source editing.
 */
function finalizeDiff(selection, changes, _now, selector) {
  var elementSelector = selector
    || (selection.testId
      ? '[data-testid="' + escapeAttrValue(selection.testId) + '"]'
      : 'unknown');

  return {
    elementSelector: elementSelector,
    selector: selector || null,
    componentChain: selection.componentChain || [],
    elementType: selection.elementType || 'unknown',
    changes: changes,
    timestamp: (_now || new Date()).toISOString(),
  };
}

/**
 * Find React internal fiber keys on a DOM element.
 * Intentional duplicate of inspector.js version — IIFEs are independent at runtime.
 */
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

// ── Exports (for testing; stripped by tsup IIFE bundling) ────────
export {
  TOOLBAR_SIZES,
  RADIUS_SIZES,
  buildTokenMaps,
  reverseTokenLookup,
  detectStyleOrigin,
  finalizeDiff,
  findReactFiberKeys,
};
