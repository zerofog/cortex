/**
 * Zerofog Visual Inspector — browser-injectable click-to-select tool.
 *
 * Injected via Playwright MCP's browser_evaluate. Provides:
 * - Hover highlight overlay (blue)
 * - Alt+Click to select (green highlight)
 * - Escape to deactivate
 * - Source resolution via data-testid + React fiber chain
 *
 * Usage (from /visual slash command):
 *   browser_evaluate → <contents of this file>
 *
 * Reactivate after Escape:
 *   browser_evaluate → window.__ZEROFOG__.activateInspector()
 */

// ── Source Resolution (exported for testing) ──────────────────────

var MAX_CHAIN_DEPTH = 20;

function resolveSource(element, fiberKeys) {
  var testId = null;
  var componentChain = [];
  var isServerComponent = true;

  // Strategy 1: data-testid (highest confidence)
  var testIdEl = element.getAttribute('data-testid')
    ? element
    : element.closest('[data-testid]');
  if (testIdEl) {
    testId = testIdEl.getAttribute('data-testid');
  }

  // Strategy 2: React fiber _debugOwner chain
  var fiber = null;
  var keys = fiberKeys || findReactFiberKeys(element);
  for (var k = 0; k < keys.length && !fiber; k++) {
    fiber = element[keys[k]];
  }

  if (fiber) {
    isServerComponent = false;

    // Extract component name from current fiber
    var currentFiber = fiber;
    var depth = 0;
    while (currentFiber && depth < MAX_CHAIN_DEPTH) {
      var name = getComponentName(currentFiber);
      if (name) {
        componentChain.push(name);
      }
      currentFiber = currentFiber._debugOwner;
      depth++;
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
    isServerComponent: isServerComponent,
    element: {
      tag: tag,
      classes: classes,
      text: text,
      bounds: bounds,
    },
  };
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
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].indexOf(tag) !==
    -1
  )
    return 'text';
  if (['button', 'a'].indexOf(tag) !== -1) return 'interactive';
  if (['input', 'textarea', 'select'].indexOf(tag) !== -1) return 'input';
  if (['nav', 'header', 'footer', 'aside', 'main'].indexOf(tag) !== -1)
    return 'layout';

  return 'unknown';
}

// ── Browser Inspector (only runs in browser context) ──────────────

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Initialize consolidated namespace (idempotent — safe for re-injection)
  window.__ZEROFOG__ = window.__ZEROFOG__ || {};

  (function () {
    var OVERLAY_ID = '__zerofog_inspector_overlay__';
    var overlay = null;
    var selectedOverlay = null;
    var labelEl = null;
    var active = false;

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

    var selectionId = 0;

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

    function handlePointerDown(e) {
      if (!active || !e.altKey) return;
      e.stopPropagation();
      e.preventDefault();
    }

    function handleClick(e) {
      if (!active || !e.altKey) return;
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
      var selection = {
        id: selectionId,
        timestamp: Date.now(),
        testId: info.testId,
        componentChain: info.componentChain,
        isServerComponent: info.isServerComponent,
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
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        deactivate();
      }
    }

    function deactivate() {
      var wasActive = active;
      active = false;
      window.__ZEROFOG__.inspectorActive = false;
      window.__ZEROFOG__.selected = null;
      if (overlay) overlay.style.display = 'none';
      if (selectedOverlay) selectedOverlay.style.display = 'none';
      if (labelEl) labelEl.style.display = 'none';
      document.removeEventListener('mouseover', handleHover, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (wasActive) {
        document.dispatchEvent(new CustomEvent('zerofog:deselected'));
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
    }

    // Expose for re-activation and state checking
    window.__ZEROFOG__.activateInspector = activate;
    window.__ZEROFOG__.selected = null;
    window.__ZEROFOG__.inspectorActive = false;

    // Auto-activate on injection
    activate();
  })();
}

// ── Module exports (for testing in Node.js) ───────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveSource: resolveSource,
    getComponentName: getComponentName,
    findReactFiberKeys: findReactFiberKeys,
    classifyElement: classifyElement,
  };
}
