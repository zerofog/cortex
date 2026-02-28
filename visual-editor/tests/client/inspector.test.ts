import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveSource,
  classifyElement,
  walkComponentChain,
  isFiberAncestor,
  getComponentName,
  findReactFiberKeys,
} from '../../src/client/inspector.js';

/**
 * Tests for the visual inspector's source resolution, classification,
 * component chain walking, and fiber ancestry detection.
 *
 * The inspector is an ES5 browser script with ESM exports.
 * Pure functions are exported for testing; the browser IIFE is inert in Node.
 */

// ── Mock Factories ───────────────────────────────────────────────

/**
 * Creates a React 18-style mock fiber (_debugOwner property always present).
 * For React 19-style fibers (no _debugOwner), use plain objects instead.
 */
function createMockFiber(overrides: Record<string, unknown> = {}) {
  return {
    type: overrides.type ?? null,
    _debugOwner: overrides._debugOwner ?? null,
    stateNode: overrides.stateNode ?? null,
    return: overrides.return ?? null,
    ...overrides,
  };
}

function createMockElement(overrides: Record<string, unknown> = {}) {
  const testId = (overrides.testId as string | undefined) ?? null;
  const classes = (overrides.classes as string[] | undefined) ?? [];
  const text = (overrides.text as string | undefined) ?? '';

  const defaultClosest = (selector: string) => {
    if (selector === '[data-testid]' && testId) {
      return {
        getAttribute: (attr: string) =>
          attr === 'data-testid' ? testId : null,
      };
    }
    return null;
  };

  return {
    tagName: (overrides.tagName as string | undefined) ?? 'DIV',
    getAttribute: (attr: string) => {
      if (attr === 'data-testid') return testId;
      return null;
    },
    closest:
      typeof overrides.closest === 'function'
        ? overrides.closest
        : defaultClosest,
    classList: classes,
    className: classes.join(' '),
    textContent: text,
    parentElement: (overrides.parentElement as HTMLElement | undefined) ?? null,
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      width: 100,
      height: 50,
      right: 100,
      bottom: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  };
}

// ── resolveSource ────────────────────────────────────────────────

describe('resolveSource', () => {
  describe('data-testid resolution (strategy #1)', () => {
    it('returns testId from the element itself', () => {
      const element = createMockElement({ testId: 'risk-detail-panel' });
      const result = resolveSource(element);

      expect(result.testId).toBe('risk-detail-panel');
    });

    it('finds testId on an ancestor via closest()', () => {
      const ancestor = createMockElement({ testId: 'entity-card' });
      const element = createMockElement({
        closest: (selector: string) => {
          if (selector === '[data-testid]') return ancestor;
          return null;
        },
      });
      const result = resolveSource(element);

      expect(result.testId).toBe('entity-card');
    });

    it('returns null testId when none found', () => {
      const element = createMockElement({
        closest: () => null,
      });
      const result = resolveSource(element);

      expect(result.testId).toBeNull();
    });
  });

  describe('React fiber component chain (strategy #2)', () => {
    it('extracts component names from fiber _debugOwner chain', () => {
      const grandparent = createMockFiber({
        type: { name: 'ObjectDetail', displayName: undefined },
      });
      const parent = createMockFiber({
        type: { name: 'PropertyList', displayName: undefined },
        _debugOwner: grandparent,
      });
      const fiber = createMockFiber({
        type: { name: 'PropertyItem', displayName: undefined },
        _debugOwner: parent,
      });

      // Attach fiber to element via React internal key
      const element = createMockElement({
        closest: () => null,
      });
      // Simulate __reactFiber$ key
      const fiberKey = '__reactFiber$test123';
      (element as Record<string, unknown>)[fiberKey] = fiber;

      const result = resolveSource(element, [fiberKey]);

      expect(result.componentChain).toEqual([
        'PropertyItem',
        'PropertyList',
        'ObjectDetail',
      ]);
    });

    it('uses displayName when available over type.name', () => {
      const fiber = createMockFiber({
        type: { name: 'WrappedComp', displayName: 'MyComponent' },
      });

      const element = createMockElement({ closest: () => null });
      const fiberKey = '__reactFiber$test456';
      (element as Record<string, unknown>)[fiberKey] = fiber;

      const result = resolveSource(element, [fiberKey]);

      expect(result.componentChain).toEqual(['MyComponent']);
    });

    it('skips anonymous/unnamed components', () => {
      const named = createMockFiber({
        type: { name: 'Dashboard' },
      });
      const anonymous = createMockFiber({
        type: {},
        _debugOwner: named,
      });
      const fiber = createMockFiber({
        type: { name: 'Widget' },
        _debugOwner: anonymous,
      });

      const element = createMockElement({ closest: () => null });
      const fiberKey = '__reactFiber$test789';
      (element as Record<string, unknown>)[fiberKey] = fiber;

      const result = resolveSource(element, [fiberKey]);

      expect(result.componentChain).toEqual(['Widget', 'Dashboard']);
    });

    it('limits chain depth to prevent infinite loops', () => {
      // Create a long chain of 100 components
      let current = createMockFiber({
        type: { name: 'Root' },
      });
      for (let i = 0; i < 100; i++) {
        current = createMockFiber({
          type: { name: `Component${i}` },
          _debugOwner: current,
        });
      }

      const element = createMockElement({ closest: () => null });
      const fiberKey = '__reactFiber$deep';
      (element as Record<string, unknown>)[fiberKey] = current;

      const result = resolveSource(element, [fiberKey]);

      // Should cap at exactly depth 20
      expect(result.componentChain.length).toBe(20);
    });
  });

  describe('client fiber detection', () => {
    it('hasClientFiber is false when no fiber found', () => {
      const element = createMockElement({ closest: () => null });
      const result = resolveSource(element);

      expect(result.hasClientFiber).toBe(false);
    });

    it('hasClientFiber is true when fiber is found', () => {
      const fiber = createMockFiber({
        type: { name: 'ClientWidget' },
      });
      const element = createMockElement({ closest: () => null });
      const fiberKey = '__reactFiber$client';
      (element as Record<string, unknown>)[fiberKey] = fiber;

      const result = resolveSource(element, [fiberKey]);

      expect(result.hasClientFiber).toBe(true);
    });
  });

  describe('element metadata', () => {
    it('captures tag, classes, and truncated text', () => {
      const longText = 'A'.repeat(200);
      const element = createMockElement({
        tagName: 'BUTTON',
        classes: ['btn', 'btn-primary'],
        text: longText,
        closest: () => null,
      });

      const result = resolveSource(element);

      expect(result.element.tag).toBe('BUTTON');
      expect(result.element.classes).toEqual(['btn', 'btn-primary']);
      expect(result.element.text.length).toBeLessThanOrEqual(100);
    });
  });

  describe('portal detection (IH3/IH4)', () => {
    it('keeps testId when fiber ancestor confirms DOM ancestor', () => {
      const ancestorEl = createMockElement({ testId: 'card-container' });
      const childEl = createMockElement({
        closest: (sel: string) =>
          sel === '[data-testid]' ? ancestorEl : null,
      });

      // Fiber return chain includes a fiber whose stateNode matches ancestorEl
      const parentFiber = createMockFiber({
        stateNode: ancestorEl,
        return: null,
      });
      const childFiber = createMockFiber({
        type: { name: 'CardContent' },
        return: parentFiber,
      });

      const fiberKey = '__reactFiber$portal';
      (childEl as Record<string, unknown>)[fiberKey] = childFiber;

      const result = resolveSource(childEl, [fiberKey]);
      expect(result.testId).toBe('card-container');
    });

    it('discards testId when portal detected (DOM ancestor ≠ fiber ancestor)', () => {
      const ancestorEl = createMockElement({ testId: 'card-container' });
      const childEl = createMockElement({
        closest: (sel: string) =>
          sel === '[data-testid]' ? ancestorEl : null,
      });

      // Fiber return chain does NOT include ancestorEl — portal!
      const unrelatedFiber = createMockFiber({
        stateNode: { notTheAncestor: true },
        return: null,
      });
      const childFiber = createMockFiber({
        type: { name: 'PortaledContent' },
        return: unrelatedFiber,
      });

      const fiberKey = '__reactFiber$portal';
      (childEl as Record<string, unknown>)[fiberKey] = childFiber;

      const result = resolveSource(childEl, [fiberKey]);
      expect(result.testId).toBeNull();
    });

    it('keeps testId when element itself has data-testid (no ancestry check)', () => {
      const element = createMockElement({ testId: 'self-labeled' });

      // Even with no fiber data, own testId is preserved
      const result = resolveSource(element);
      expect(result.testId).toBe('self-labeled');
    });
  });
});

// ── walkComponentChain ───────────────────────────────────────────

describe('walkComponentChain', () => {
  it('extracts names via _debugOwner chain (React 18 / Strategy A)', () => {
    const grandparent = createMockFiber({
      type: { name: 'App' },
    });
    const parent = createMockFiber({
      type: { name: 'Layout' },
      _debugOwner: grandparent,
    });
    const fiber = createMockFiber({
      type: { name: 'Header' },
      _debugOwner: parent,
    });

    const chain = walkComponentChain(fiber);
    expect(chain).toEqual(['Header', 'Layout', 'App']);
  });

  it('extracts names via fiber.return with tag filtering (React 19 / Strategy B)', () => {
    // Plain objects without _debugOwner property → Strategy B
    const root = { tag: 0, type: { name: 'App' }, stateNode: null, return: null };
    const layout = { tag: 0, type: { name: 'Layout' }, stateNode: null, return: root };
    const fiber = { tag: 1, type: { name: 'Header' }, stateNode: null, return: layout };

    const chain = walkComponentChain(fiber);
    expect(chain).toEqual(['Header', 'Layout', 'App']);
  });

  it('returns empty array for null fiber', () => {
    expect(walkComponentChain(null)).toEqual([]);
  });

  it('caps at depth 20 (Strategy A — _debugOwner)', () => {
    let current = createMockFiber({ type: { name: 'Root' } });
    for (let i = 0; i < 100; i++) {
      current = createMockFiber({
        type: { name: `C${i}` },
        _debugOwner: current,
      });
    }

    const chain = walkComponentChain(current);
    expect(chain.length).toBe(20);
    expect(chain[0]).toBe('C99');
    expect(chain[19]).toBe('C80');
  });

  it('caps at depth 20 (Strategy B — fiber.return)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = { tag: 0, type: { name: 'Root' }, stateNode: null, return: null };
    for (let i = 0; i < 100; i++) {
      current = { tag: 0, type: { name: `C${i}` }, stateNode: null, return: current };
    }

    const chain = walkComponentChain(current);
    expect(chain.length).toBe(20);
    expect(chain[0]).toBe('C99');
    expect(chain[19]).toBe('C80');
  });

  it('skips HostComponent fibers (tag 5) in Strategy B', () => {
    const root = { tag: 0, type: { name: 'App' }, stateNode: null, return: null };
    const hostDiv = { tag: 5, type: 'div', stateNode: null, return: root };
    const fiber = { tag: 0, type: { name: 'Button' }, stateNode: null, return: hostDiv };

    const chain = walkComponentChain(fiber);
    expect(chain).toEqual(['Button', 'App']);
  });

  it('uses Strategy A (not B) when _debugOwner is null (React 18 leaf)', () => {
    // React 18 HostComponent fiber: _debugOwner exists but is null.
    // The 'in' check detects the property; Strategy A is used.
    // The return chain has a named component that Strategy B would find.
    const fiber = createMockFiber({
      type: 'div', // HostComponent — string type, no displayName/name
      return: { tag: 0, type: { name: 'ShouldNotAppear' }, stateNode: null, return: null },
    });
    // createMockFiber defaults _debugOwner to null (property present)

    const chain = walkComponentChain(fiber);
    // Strategy A: _debugOwner is null → loop exits immediately after fiber itself (no name)
    // Strategy B would have returned ['ShouldNotAppear']
    expect(chain).toEqual([]);
  });
});

// ── isFiberAncestor ──────────────────────────────────────────────

describe('isFiberAncestor', () => {
  it('returns true when ancestor stateNode is in fiber.return chain', () => {
    const ancestorEl = createMockElement({ tagName: 'SECTION' });
    const childEl = createMockElement();

    const parentFiber = createMockFiber({
      stateNode: ancestorEl,
      return: null,
    });
    const childFiber = createMockFiber({
      stateNode: null,
      return: parentFiber,
    });

    const fiberKey = '__reactFiber$anc';
    (childEl as Record<string, unknown>)[fiberKey] = childFiber;

    expect(isFiberAncestor(childEl, ancestorEl, [fiberKey])).toBe(true);
  });

  it('returns false for portaled element (DOM ancestor ≠ fiber ancestor)', () => {
    const domAncestor = createMockElement({ tagName: 'SECTION' });
    const childEl = createMockElement();

    // Fiber chain has a DIFFERENT stateNode — not the DOM ancestor
    const unrelatedFiber = createMockFiber({
      stateNode: { portalRoot: true },
      return: null,
    });
    const childFiber = createMockFiber({
      stateNode: null,
      return: unrelatedFiber,
    });

    const fiberKey = '__reactFiber$port';
    (childEl as Record<string, unknown>)[fiberKey] = childFiber;

    expect(isFiberAncestor(childEl, domAncestor, [fiberKey])).toBe(false);
  });

  it('returns true (conservative) when no fiber data available', () => {
    const childEl = createMockElement();
    const ancestorEl = createMockElement();

    // No fiber key on element → no fiber data
    expect(isFiberAncestor(childEl, ancestorEl, [])).toBe(true);
  });

  it('caps ancestor walk at depth 50', () => {
    const targetEl = { deepTarget: true };

    // Build a fiber chain of depth 60 — target stateNode at depth 55
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chain: any = { stateNode: targetEl, return: null };
    for (let i = 0; i < 55; i++) {
      chain = { stateNode: null, return: chain };
    }

    const childEl = createMockElement();
    const fiberKey = '__reactFiber$deep';
    (childEl as Record<string, unknown>)[fiberKey] = chain;

    // Target at depth 55 — beyond the 50-depth cap
    expect(isFiberAncestor(childEl, targetEl, [fiberKey])).toBe(false);
  });
});

// ── classifyElement ──────────────────────────────────────────────

describe('classifyElement', () => {
  it('classifies icon component', () => {
    expect(classifyElement(['IconSettings'], 'svg')).toBe('icon');
  });

  it('classifies layout component', () => {
    expect(classifyElement(['AppShell'], 'div')).toBe('layout');
  });

  it('classifies text component', () => {
    expect(classifyElement(['Text'], 'span')).toBe('text');
  });

  it('classifies interactive component', () => {
    expect(classifyElement(['Button'], 'button')).toBe('interactive');
  });

  it('classifies container component', () => {
    expect(classifyElement(['Card'], 'div')).toBe('container');
  });

  it('classifies input component', () => {
    expect(classifyElement(['TextInput'], 'input')).toBe('input');
  });

  it('classifies feedback component', () => {
    expect(classifyElement(['Badge'], 'span')).toBe('feedback');
  });

  it('falls back to tag for SVG without components', () => {
    expect(classifyElement([], 'svg')).toBe('icon');
  });

  it('falls back to tag for button without components', () => {
    expect(classifyElement([], 'button')).toBe('interactive');
  });

  it('finds classification at depth in component chain', () => {
    expect(classifyElement(['UnknownWrapper', 'Button'], 'div')).toBe(
      'interactive'
    );
  });

  it('returns unknown for unrecognized element', () => {
    expect(classifyElement([], 'div')).toBe('unknown');
  });

  it('classifies Tabs.Tab as interactive', () => {
    expect(classifyElement(['Tabs.Tab'], 'button')).toBe('interactive');
  });

  it('classifies Skeleton as feedback', () => {
    expect(classifyElement(['Skeleton'], 'div')).toBe('feedback');
  });

  it('classifies SVG path element as icon', () => {
    expect(classifyElement([], 'path')).toBe('icon');
  });

  it('handles null tagName gracefully', () => {
    expect(classifyElement([], null)).toBe('unknown');
  });

  it('handles undefined tagName gracefully', () => {
    expect(classifyElement([], undefined)).toBe('unknown');
  });
});

// ── getComponentName ────────────────────────────────────────────

describe('getComponentName', () => {
  it('returns displayName when available', () => {
    expect(getComponentName({ type: { displayName: 'MyComp', name: 'Fallback' } })).toBe('MyComp');
  });

  it('returns name when displayName is absent', () => {
    expect(getComponentName({ type: { name: 'FuncComp' } })).toBe('FuncComp');
  });

  it('returns null for string type (HostComponent)', () => {
    expect(getComponentName({ type: 'div' })).toBeNull();
  });

  it('returns null for empty type object', () => {
    expect(getComponentName({ type: {} })).toBeNull();
  });

  it('returns null for null fiber', () => {
    expect(getComponentName(null)).toBeNull();
  });

  it('returns null when fiber.type is null', () => {
    expect(getComponentName({ type: null })).toBeNull();
  });
});

// ── findReactFiberKeys ──────────────────────────────────────────

describe('findReactFiberKeys', () => {
  it('finds __reactFiber$ keys on an element', () => {
    const element = {
      '__reactFiber$abc123': { tag: 0 },
      '__reactProps$abc123': { children: [] },
      id: 'test',
    };
    const keys = findReactFiberKeys(element);
    expect(keys).toEqual(['__reactFiber$abc123']);
  });

  it('returns empty array when no fiber keys', () => {
    const element = { id: 'test', className: 'foo' };
    expect(findReactFiberKeys(element)).toEqual([]);
  });

  it('finds multiple fiber keys (concurrent root)', () => {
    const element = {
      '__reactFiber$abc': { tag: 0 },
      '__reactFiber$def': { tag: 1 },
    };
    const keys = findReactFiberKeys(element);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('__reactFiber$abc');
    expect(keys).toContain('__reactFiber$def');
  });
});

// ── walkComponentChain strategy conflict ────────────────────────

describe('walkComponentChain — strategy conflict', () => {
  it('uses Strategy A when both _debugOwner and return/tag are present', () => {
    // Fiber has _debugOwner (Strategy A) AND return+tag (Strategy B)
    // Strategy A should win — _debugOwner takes precedence
    const ownerFiber = createMockFiber({
      type: { name: 'OwnerParent' },
    });
    const returnFiber = { tag: 0, type: { name: 'ReturnParent' }, stateNode: null, return: null };

    const fiber = {
      type: { name: 'Child' },
      _debugOwner: ownerFiber,
      tag: 0,
      stateNode: null,
      return: returnFiber,
    };

    const chain = walkComponentChain(fiber);
    expect(chain).toEqual(['Child', 'OwnerParent']);
    // NOT ['Child', 'ReturnParent'] — Strategy A wins
  });
});

// ── Inspector IIFE Integration Tests ─────────────────────────────
//
// These tests exercise the browser runtime code (the IIFE that wraps
// the hover/click/message handling). Uses vi.resetModules() + dynamic
// import() so each test gets a fresh IIFE execution with clean state.
//
// Environment: happy-dom (configured in vitest.config.ts client project).
// - rAF callbacks fire synchronously (no timing issues)
// - window.parent === window (postToParent is a no-op)
// - getBoundingClientRect() returns zeros (fine for overlay positioning tests)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zf(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__ZEROFOG__;
}

function sendInspectorMessage(type: string) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type, sessionId: '__SESSION_ID__', version: 1 },
      origin: '__SIDECAR_ORIGIN__',
    })
  );
}

describe('Inspector IIFE Integration', () => {
  beforeEach(async () => {
    // Deactivate previous inspector instance to remove its event listeners.
    // Each IIFE creates its own closure, so the new instance's deactivate()
    // can't remove the old closure's handlers — must call the old one first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ZEROFOG__?.deactivateInspector?.();
    // Clear DOM state from previous test
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__ZEROFOG__;
    vi.resetModules();
    vi.restoreAllMocks();
    // Stub rAF to fire synchronously — happy-dom queues callbacks
    // but doesn't auto-flush them. This lets us test rAF-gated logic.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    });
    await import('../../src/client/inspector.js');
  });

  // ── Activation / Deactivation ───────────────────────────────

  describe('Activation / Deactivation', () => {
    it('auto-activates on module load', () => {
      expect(zf().inspectorActive).toBe(true);
    });

    it('creates 3 overlay DOM elements', () => {
      expect(document.getElementById('__zerofog_inspector_overlay__')).not.toBeNull();
      expect(document.getElementById('__zerofog_inspector_selected__')).not.toBeNull();
      expect(document.getElementById('__zerofog_inspector_label__')).not.toBeNull();
    });

    it('deactivateInspector hides overlays and sets inactive', () => {
      zf().deactivateInspector();

      expect(zf().inspectorActive).toBe(false);
      expect(
        document.getElementById('__zerofog_inspector_overlay__')!.style.display
      ).toBe('none');
      expect(
        document.getElementById('__zerofog_inspector_selected__')!.style.display
      ).toBe('none');
      expect(
        document.getElementById('__zerofog_inspector_label__')!.style.display
      ).toBe('none');
    });

    it('idempotent re-activation does not duplicate overlays', () => {
      zf().activateInspector();
      zf().activateInspector();

      const overlays = document.querySelectorAll('#__zerofog_inspector_overlay__');
      expect(overlays.length).toBe(1);
      expect(zf().inspectorActive).toBe(true);
    });
  });

  // ── Event Handling ──────────────────────────────────────────

  describe('Event Handling', () => {
    it('mouseover on a div shows hover overlay', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      const overlay = document.getElementById('__zerofog_inspector_overlay__')!;
      expect(overlay.style.display).toBe('block');
    });

    it('mouseover on data-zerofog-ui element is ignored', () => {
      const uiEl = document.createElement('div');
      uiEl.setAttribute('data-zerofog-ui', 'true');
      document.body.appendChild(uiEl);

      uiEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      const overlay = document.getElementById('__zerofog_inspector_overlay__')!;
      expect(overlay.style.display).toBe('none');
    });

    it('Escape keydown deactivates inspector', () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );

      expect(zf().inspectorActive).toBe(false);
    });

    it('click without selectMode does not select', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(zf().selected).toBeNull();
    });
  });

  // ── Select Mode + Selection ─────────────────────────────────

  describe('Select Mode + Selection', () => {
    it('inbound inspector:enter-select sets selectMode', () => {
      sendInspectorMessage('inspector:enter-select');

      expect(zf().selectMode).toBe(true);
    });

    it('click in selectMode creates selection with correct shape', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      div.textContent = 'test element';
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const sel = zf().selected;
      expect(sel).not.toBeNull();
      expect(sel.id).toBeGreaterThan(0);
      expect(sel.timestamp).toBeGreaterThan(0);
      expect(sel.element).toBeDefined();
      expect(sel.element.tag).toBe('DIV');
      expect(sel.styles).toBeDefined();
      expect(sel.styles).toHaveProperty('color');
      expect(sel.styles).toHaveProperty('fontSize');
      expect(sel.componentChain).toEqual([]);
    });

    it('inbound inspector:exit-select clears selectMode', () => {
      sendInspectorMessage('inspector:enter-select');
      expect(zf().selectMode).toBe(true);

      sendInspectorMessage('inspector:exit-select');
      expect(zf().selectMode).toBe(false);
    });

    it('selectionId increases monotonically across deactivate/reactivate', () => {
      sendInspectorMessage('inspector:enter-select');

      const div1 = document.createElement('div');
      document.body.appendChild(div1);
      div1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const firstId = zf().selected.id;

      // Deactivate → reactivate → select again
      zf().deactivateInspector();
      zf().activateInspector();
      sendInspectorMessage('inspector:enter-select');

      const div2 = document.createElement('div');
      document.body.appendChild(div2);
      div2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const secondId = zf().selected.id;

      expect(secondId).toBeGreaterThan(firstId);
    });
  });

  // ── elementMap + Eviction ───────────────────────────────────

  describe('elementMap + Eviction', () => {
    it('selection adds entry to elementMap', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);
    });

    it('after 51 clicks, elementMap has exactly 50 entries (oldest evicted)', () => {
      sendInspectorMessage('inspector:enter-select');

      for (let i = 0; i < 51; i++) {
        const div = document.createElement('div');
        div.textContent = `item-${i}`;
        document.body.appendChild(div);
        div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }

      expect(Object.keys(zf().elementMap).length).toBe(50);
    });
  });

  // ── Message Validation ──────────────────────────────────────

  describe('Message Validation', () => {
    it('rejects message from wrong origin', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', sessionId: '__SESSION_ID__', version: 1 },
        origin: 'https://evil.example.com',
      }));

      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with missing sessionId', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', version: 1 },
        origin: '__SIDECAR_ORIGIN__',
      }));

      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with non-object data', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: 'inspector:enter-select',
        origin: '__SIDECAR_ORIGIN__',
      }));

      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with inherited (non-own) sessionId', () => {
      const proto = { sessionId: '__SESSION_ID__', type: 'inspector:enter-select', version: 1 };
      window.dispatchEvent(new MessageEvent('message', {
        data: Object.create(proto),
        origin: '__SIDECAR_ORIGIN__',
      }));

      expect(zf().selectMode).toBe(false);
    });
  });
});
