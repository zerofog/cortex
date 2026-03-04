import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeAttrValue,
  resolveSource,
  classifyElement,
  walkComponentChain,
  isFiberAncestor,
  getComponentName,
  findReactFiberKeys,
  getFiberFromElement,
  parseOverrideRules,
  buildOverrideCSS,
  buildSelector,
  isTokenValue,
  resolveTokenValue,
  camelToKebab,
  ALLOWED_CSS_PROPERTIES,
  CSS_VALUE_UNSAFE,
  TOKEN_CONSTRAINED_PROPERTIES,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  TOKEN_VAR_PREFIX,
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
    childNodes: text
      ? [{ nodeType: 3, nodeValue: text }]
      : [],
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

    it('uses pre-computed bounds when provided', () => {
      const element = createMockElement({ closest: () => null });
      const preComputedBounds = { top: 10, left: 20, width: 200, height: 100 };
      const result = resolveSource(element, undefined, preComputedBounds);

      expect(result.element.bounds).toEqual(preComputedBounds);
    });

    it('falls back to getBoundingClientRect when bounds not provided', () => {
      const element = createMockElement({ closest: () => null });
      const result = resolveSource(element);

      // Default mock returns {top: 0, left: 0, width: 100, height: 50, ...}
      expect(result.element.bounds.width).toBe(100);
      expect(result.element.bounds.height).toBe(50);
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

  it('resolves name through forwardRef wrapper ({render: fn})', () => {
    function MyButton() {}
    const fiber = { type: { render: MyButton } };
    expect(getComponentName(fiber)).toBe('MyButton');
  });

  it('resolves displayName through forwardRef render', () => {
    function inner() {}
    inner.displayName = 'ForwardedButton';
    const fiber = { type: { render: inner } };
    expect(getComponentName(fiber)).toBe('ForwardedButton');
  });

  it('resolves name through memo wrapper ({type: inner})', () => {
    const fiber = { type: { type: { name: 'MemoizedCard' } } };
    expect(getComponentName(fiber)).toBe('MemoizedCard');
  });

  it('resolves name through nested memo(forwardRef(fn))', () => {
    function BaseInput() {}
    const fiber = { type: { type: { render: BaseInput } } };
    expect(getComponentName(fiber)).toBe('BaseInput');
  });

  it('returns null for deeply nested wrapper beyond depth 5', () => {
    // Build 6 levels of memo nesting: type.type.type.type.type.type.name
    let inner: Record<string, unknown> = { name: 'DeepComp' };
    for (let i = 0; i < 6; i++) {
      inner = { type: inner };
    }
    const fiber = { type: inner };
    expect(getComponentName(fiber)).toBeNull();
  });
});

// ── camelToKebab ────────────────────────────────────────────────

describe('camelToKebab', () => {
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('borderRadius')).toBe('border-radius');
  });

  it('passes through single-word properties unchanged', () => {
    expect(camelToKebab('color')).toBe('color');
  });

  it('handles multiple uppercase letters', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
  });
});

// ── getFiberFromElement ─────────────────────────────────────────

describe('getFiberFromElement', () => {
  it('returns fiber and caches the key for subsequent lookups', () => {
    const fiber = { tag: 0, type: { name: 'App' } };
    const element = { '__reactFiber$xyz789': fiber, id: 'test' };
    const result = getFiberFromElement(element as Record<string, unknown>);
    expect(result).toBe(fiber);

    // Second call on different element should use cached key
    const fiber2 = { tag: 1, type: { name: 'Other' } };
    const element2 = { '__reactFiber$xyz789': fiber2 };
    const result2 = getFiberFromElement(element2 as Record<string, unknown>);
    expect(result2).toBe(fiber2);
  });

  it('returns null for element without fiber keys', () => {
    const element = { id: 'no-react' };
    const result = getFiberFromElement(element as Record<string, unknown>);
    expect(result).toBeNull();
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

// ── parseOverrideRules ──────────────────────────────────────

describe('parseOverrideRules', () => {
  it('parses flat CSS rules into selector→properties map', () => {
    const css = '[data-testid="card"] { padding: 16px !important; color: red !important }';
    const result = parseOverrideRules(css);

    expect(result['[data-testid="card"]']).toBeDefined();
    expect(result['[data-testid="card"]']!['padding']).toBe('16px !important');
    expect(result['[data-testid="card"]']!['color']).toBe('red !important');
  });

  it('parses multiple flat rules', () => {
    const css = '.foo { color: red !important }\n.bar { margin: 8px !important }';
    const result = parseOverrideRules(css);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['.foo']!['color']).toBe('red !important');
    expect(result['.bar']!['margin']).toBe('8px !important');
  });

  it('correctly parses CSS with @media nesting', () => {
    const css = '@media (min-width: 768px) { .responsive { font-size: 18px !important } }';
    const result = parseOverrideRules(css);

    // Should extract the inner rule, not break on the nested braces
    expect(result['.responsive']).toBeDefined();
    expect(result['.responsive']!['font-size']).toBe('18px !important');
  });

  it('returns empty object for empty string', () => {
    expect(parseOverrideRules('')).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    expect(parseOverrideRules('   \n  ')).toEqual({});
  });

  it('handles mixed flat and nested rules', () => {
    const css = '.flat { color: blue !important }\n@media (max-width: 600px) { .nested { padding: 4px !important } }';
    const result = parseOverrideRules(css);

    expect(result['.flat']!['color']).toBe('blue !important');
    expect(result['.nested']!['padding']).toBe('4px !important');
  });

  it('mangles double-nested at-rules (known limitation)', () => {
    const css = '@media (min-width: 768px) { @supports (display: grid) { .inner { color: red } } }';
    const result = parseOverrideRules(css);

    // Double-nested at-rules produce garbled output — inner braces collapse
    // into the declaration buffer, yielding a mangled selector+property key.
    // This documents the known limitation: only one level of @-rule nesting is supported.
    expect(result['.inner']).toBeUndefined();
  });

  it('splits incorrectly on semicolons inside quoted values (known limitation)', () => {
    const css = '.sel { content: "a; b"; color: red }';
    const result = parseOverrideRules(css);

    // Naive semicolon splitting breaks the content value — documents known behavior
    expect(result['.sel']).toBeDefined();
    // content gets truncated at the semicolon inside the quotes
    expect(result['.sel']!['content']).toBe('"a');
  });
});

// ── buildOverrideCSS ────────────────────────────────────────

describe('buildOverrideCSS', () => {
  it('serializes rules object to CSS text', () => {
    const rules = {
      '.foo': { color: 'red !important', padding: '8px !important' },
    };
    const css = buildOverrideCSS(rules);

    expect(css).toContain('.foo');
    expect(css).toContain('color: red !important');
    expect(css).toContain('padding: 8px !important');
  });

  it('returns empty string for empty rules', () => {
    expect(buildOverrideCSS({})).toBe('');
  });

  it('roundtrips with parseOverrideRules', () => {
    const original = { '.card': { padding: '16px !important' } };
    const css = buildOverrideCSS(original);
    const parsed = parseOverrideRules(css);

    expect(parsed['.card']!['padding']).toBe('16px !important');
  });

  it('ignores inherited properties on rules object', () => {
    const proto = { '.inherited': { color: 'blue' } };
    const rules = Object.create(proto);
    rules['.own'] = { padding: '8px' };

    const css = buildOverrideCSS(rules);

    expect(css).toContain('.own');
    expect(css).not.toContain('.inherited');
  });

  it('ignores inherited properties on individual rule declarations', () => {
    const declProto = { 'font-size': '14px' };
    const decls = Object.create(declProto);
    decls['color'] = 'red';

    const css = buildOverrideCSS({ '.sel': decls });

    expect(css).toContain('color: red');
    expect(css).not.toContain('font-size');
  });

  it('emits trailing semicolon after last declaration', () => {
    const rules = { '.foo': { color: 'red', padding: '8px' } };
    const css = buildOverrideCSS(rules);

    expect(css).toMatch(/; \}$/m);
  });

  it('converts fontSize to font-size in CSS output', () => {
    const css = buildOverrideCSS({ '.sel': { fontSize: '14px' } });
    expect(css).toContain('font-size: 14px');
    expect(css).not.toContain('fontSize');
  });

  it('converts borderRadius to border-radius in CSS output', () => {
    const css = buildOverrideCSS({ '.sel': { borderRadius: '8px' } });
    expect(css).toContain('border-radius: 8px');
  });

  it('converts fontWeight to font-weight in CSS output', () => {
    const css = buildOverrideCSS({ '.sel': { fontWeight: '700' } });
    expect(css).toContain('font-weight: 700');
  });

  it('converts fontFamily to font-family in CSS output', () => {
    const css = buildOverrideCSS({ '.sel': { fontFamily: 'monospace' } });
    expect(css).toContain('font-family: monospace');
  });

  it('handles mixed camelCase and single-word properties', () => {
    const css = buildOverrideCSS({ '.sel': { color: 'red', fontSize: '14px' } });
    expect(css).toContain('color: red');
    expect(css).toContain('font-size: 14px');
  });
});

// ── isTokenValue ────────────────────────────────────────────

describe('isTokenValue', () => {
  it('accepts spacing token names for padding', () => {
    expect(isTokenValue('padding', 'xs')).toBe(true);
    expect(isTokenValue('padding', 'md')).toBe(true);
    expect(isTokenValue('padding', 'xl')).toBe(true);
  });

  it('accepts spacing token names for margin', () => {
    expect(isTokenValue('margin', 'sm')).toBe(true);
    expect(isTokenValue('margin', 'lg')).toBe(true);
  });

  it('accepts spacing token names for gap', () => {
    expect(isTokenValue('gap', 'xs')).toBe(true);
    expect(isTokenValue('gap', 'xl')).toBe(true);
  });

  it('accepts radius token names including "none"', () => {
    expect(isTokenValue('borderRadius', 'none')).toBe(true);
    expect(isTokenValue('borderRadius', 'xs')).toBe(true);
    expect(isTokenValue('borderRadius', 'lg')).toBe(true);
  });

  it('accepts CSS var references for constrained properties', () => {
    expect(isTokenValue('padding', 'var(--mantine-spacing-md)')).toBe(true);
    expect(isTokenValue('borderRadius', 'var(--mantine-radius-sm)')).toBe(true);
  });

  it('rejects pixel values for constrained properties', () => {
    expect(isTokenValue('padding', '16px')).toBe(false);
    expect(isTokenValue('margin', '2rem')).toBe(false);
    expect(isTokenValue('gap', '10px')).toBe(false);
    expect(isTokenValue('borderRadius', '4px')).toBe(false);
  });

  it('rejects "auto" for constrained properties', () => {
    expect(isTokenValue('padding', 'auto')).toBe(false);
    expect(isTokenValue('margin', 'auto')).toBe(false);
  });

  it('passes through any value for non-constrained properties', () => {
    expect(isTokenValue('color', '#ff0000')).toBe(true);
    expect(isTokenValue('fontSize', '14px')).toBe(true);
    expect(isTokenValue('fontWeight', '700')).toBe(true);
    expect(isTokenValue('display', 'flex')).toBe(true);
  });

  it('rejects "none" for spacing properties (only valid for radius)', () => {
    expect(isTokenValue('padding', 'none')).toBe(false);
    expect(isTokenValue('margin', 'none')).toBe(false);
  });
});

// ── CSS_VALUE_UNSAFE ────────────────────────────────────────

describe('CSS_VALUE_UNSAFE', () => {
  it('catches expression()', () => {
    expect(CSS_VALUE_UNSAFE.test('expression(alert(1))')).toBe(true);
  });

  it('catches url()', () => {
    expect(CSS_VALUE_UNSAFE.test('url(javascript:alert(1))')).toBe(true);
  });

  it('catches @import', () => {
    expect(CSS_VALUE_UNSAFE.test('@import "evil.css"')).toBe(true);
  });

  it('catches semicolons', () => {
    expect(CSS_VALUE_UNSAFE.test('red; background: url(evil)')).toBe(true);
  });

  it('catches braces', () => {
    expect(CSS_VALUE_UNSAFE.test('red } .evil { color: green')).toBe(true);
    expect(CSS_VALUE_UNSAFE.test('red { color: green')).toBe(true);
  });

  it('catches backslash', () => {
    expect(CSS_VALUE_UNSAFE.test('red\\n')).toBe(true);
  });

  it('allows normal CSS values', () => {
    expect(CSS_VALUE_UNSAFE.test('md')).toBe(false);
    expect(CSS_VALUE_UNSAFE.test('#ff0000')).toBe(false);
    expect(CSS_VALUE_UNSAFE.test('var(--mantine-spacing-md)')).toBe(false);
    expect(CSS_VALUE_UNSAFE.test('rgb(255, 0, 0)')).toBe(false);
  });

  it('catches image-set()', () => {
    expect(CSS_VALUE_UNSAFE.test('image-set("foo.png" 1x)')).toBe(true);
  });

  it('catches element()', () => {
    expect(CSS_VALUE_UNSAFE.test('element(#target)')).toBe(true);
  });

  it('catches paint()', () => {
    expect(CSS_VALUE_UNSAFE.test('paint(myPainter)')).toBe(true);
  });
});

// ── resolveTokenValue ───────────────────────────────────────

describe('resolveTokenValue', () => {
  it('resolves spacing token for padding', () => {
    expect(resolveTokenValue('padding', 'md')).toBe('var(--mantine-spacing-md)');
  });

  it('resolves spacing token for margin', () => {
    expect(resolveTokenValue('margin', 'lg')).toBe('var(--mantine-spacing-lg)');
  });

  it('resolves radius token for borderRadius', () => {
    expect(resolveTokenValue('borderRadius', 'sm')).toBe('var(--mantine-radius-sm)');
  });

  it('resolves "none" radius token', () => {
    expect(resolveTokenValue('borderRadius', 'none')).toBe('var(--mantine-radius-none)');
  });

  it('resolves spacing token for gap', () => {
    expect(resolveTokenValue('gap', 'xl')).toBe('var(--mantine-spacing-xl)');
  });

  it('passes through existing CSS var references', () => {
    expect(resolveTokenValue('padding', 'var(--mantine-spacing-md)')).toBe('var(--mantine-spacing-md)');
  });

  it('passes through values for non-constrained properties', () => {
    expect(resolveTokenValue('color', '#ff0000')).toBe('#ff0000');
  });

  it('resolves compound token values', () => {
    expect(resolveTokenValue('padding', 'md lg')).toBe('var(--mantine-spacing-md) var(--mantine-spacing-lg)');
  });
});

// ── isTokenValue — tightened var() validation ───────────────

describe('isTokenValue — tightened validation', () => {
  it('rejects arbitrary CSS var references', () => {
    expect(isTokenValue('padding', 'var(--evil)')).toBe(false);
  });

  it('accepts exact Mantine radius CSS var', () => {
    expect(isTokenValue('borderRadius', 'var(--mantine-radius-xl)')).toBe(true);
  });

  it('rejects non-Mantine CSS var for constrained property', () => {
    expect(isTokenValue('gap', 'var(--custom-thing)')).toBe(false);
  });

  it('accepts compound token values for padding', () => {
    expect(isTokenValue('padding', 'md lg')).toBe(true);
  });

  it('accepts four-value compound tokens', () => {
    expect(isTokenValue('padding', 'xs sm md lg')).toBe(true);
  });

  it('rejects mixed token and pixel values', () => {
    expect(isTokenValue('margin', 'md 16px')).toBe(false);
  });

  it('accepts compound radius tokens', () => {
    expect(isTokenValue('borderRadius', 'sm lg')).toBe(true);
  });
});

// ── Token enforcement constants ─────────────────────────────

describe('Token enforcement constants', () => {
  it('ALLOWED_CSS_PROPERTIES matches Selection.styles keys', () => {
    const styleKeys = ['color', 'background', 'fontSize', 'padding', 'margin',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'display', 'gap', 'borderRadius', 'fontWeight', 'fontFamily'];
    for (const key of styleKeys) {
      expect(ALLOWED_CSS_PROPERTIES.has(key)).toBe(true);
    }
    expect(ALLOWED_CSS_PROPERTIES.size).toBe(styleKeys.length);
  });

  it('TOKEN_CONSTRAINED_PROPERTIES is a subset of ALLOWED_CSS_PROPERTIES', () => {
    for (const prop of TOKEN_CONSTRAINED_PROPERTIES) {
      expect(ALLOWED_CSS_PROPERTIES.has(prop)).toBe(true);
    }
  });

  it('SPACING_TOKENS has 5 entries', () => {
    expect(SPACING_TOKENS).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
  });

  it('RADIUS_TOKENS has 6 entries (includes "none")', () => {
    expect(RADIUS_TOKENS).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
  });
});

// ── escapeAttrValue ─────────────────────────────────────────

describe('escapeAttrValue', () => {
  it('escapes double quotes in testId', () => {
    expect(escapeAttrValue('card"panel')).toBe('card\\"panel');
  });

  it('escapes backslashes in testId', () => {
    expect(escapeAttrValue('path\\to')).toBe('path\\\\to');
  });

  it('handles closing bracket without throwing', () => {
    // Bracket is safe inside quoted attribute values — just verify no error
    expect(() => escapeAttrValue('a]b')).not.toThrow();
    expect(escapeAttrValue('a]b')).toBe('a]b');
  });
});

// ── buildSelector (ESM export) ───────────────────────────────────

describe('buildSelector (ESM export)', () => {
  it('is callable as an ESM import', () => {
    expect(typeof buildSelector).toBe('function');
  });

  it('returns data-testid selector for unique testid', () => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'esm-test-unique');
    document.body.appendChild(div);

    try {
      const selector = buildSelector(div);
      expect(selector).toBe('[data-testid="esm-test-unique"]');
    } finally {
      div.remove();
    }
  });

  it('falls back to data-cortex-id when no testid', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    try {
      const selector = buildSelector(div);
      expect(selector).toMatch(/\[data-cortex-id="/);
    } finally {
      div.remove();
    }
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

function sendInspectorMessage(type: string, payload?: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type, sessionId: '__SESSION_ID__', version: 1, payload },
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

    it('selectionId increases monotonically across pause/reactivate', () => {
      sendInspectorMessage('inspector:enter-select');

      const div1 = document.createElement('div');
      document.body.appendChild(div1);
      div1.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const firstId = zf().selected.id;

      // Pause → reactivate → select again
      zf().pauseInspector();
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

  // ── buildSelector Uniqueness (Bug C) ────────────────────────

  describe('buildSelector Uniqueness', () => {
    it('uses data-testid when it is unique on the page', () => {
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'unique-card');
      document.body.appendChild(div);

      const selector = zf().buildSelector(div);

      expect(selector).toBe('[data-testid="unique-card"]');
      // Should NOT stamp data-cortex-id
      expect(div.hasAttribute('data-cortex-id')).toBe(false);
    });

    it('returns data-cortex-id selector when data-testid is shared', () => {
      // Create two elements with the same testId
      const div1 = document.createElement('div');
      div1.setAttribute('data-testid', 'card');
      document.body.appendChild(div1);

      const div2 = document.createElement('div');
      div2.setAttribute('data-testid', 'card');
      document.body.appendChild(div2);

      const selector = zf().buildSelector(div1);

      // Should fall back to data-cortex-id since testId is not unique
      expect(selector).toMatch(/\[data-cortex-id=/);
      expect(div1.hasAttribute('data-cortex-id')).toBe(true);
    });

    it('returns data-cortex-id selector when element has no testId', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const selector = zf().buildSelector(div);

      expect(selector).toMatch(/\[data-cortex-id=/);
      expect(div.hasAttribute('data-cortex-id')).toBe(true);
    });

    it('handles special characters in data-testid without throwing', () => {
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'card"panel');
      document.body.appendChild(div);

      // Should not throw DOMException on the escaped querySelectorAll
      const selector = zf().buildSelector(div);

      // happy-dom doesn't support CSS \" escaping, so querySelectorAll returns 0 matches
      // and buildSelector falls through to data-cortex-id. The important property is
      // that it doesn't throw — the escapeAttrValue unit tests verify correctness.
      expect(selector).toBeTruthy();
      expect(() => document.querySelectorAll(selector)).not.toThrow();
    });

    it('reuses existing data-cortex-id if already stamped', () => {
      const div = document.createElement('div');
      div.setAttribute('data-cortex-id', 'existing-id');
      document.body.appendChild(div);

      const selector = zf().buildSelector(div);

      expect(selector).toBe('[data-cortex-id="existing-id"]');
    });
  });

  // ── cortexIdCounter Recovery (H2) ──────────────────────────

  describe('cortexIdCounter Recovery', () => {
    it('resumes counter from pre-existing data-cortex-id values', () => {
      // Pre-populate DOM with cx-5 before re-activation
      const existing = document.createElement('div');
      existing.setAttribute('data-cortex-id', 'cx-5');
      document.body.appendChild(existing);

      // Re-activate to trigger counter recovery
      zf().deactivateInspector();
      zf().activateInspector();

      // Next assigned id should be cx-6
      const div = document.createElement('div');
      document.body.appendChild(div);
      const selector = zf().buildSelector(div);

      expect(selector).toBe('[data-cortex-id="cx-6"]');
    });

    it('ignores non-matching data-cortex-id formats', () => {
      const existing = document.createElement('div');
      existing.setAttribute('data-cortex-id', 'custom-id');
      document.body.appendChild(existing);

      // Re-activate to trigger counter recovery
      zf().deactivateInspector();
      zf().activateInspector();

      // Counter stays at 0, next assigned is cx-1
      const div = document.createElement('div');
      document.body.appendChild(div);
      const selector = zf().buildSelector(div);

      expect(selector).toBe('[data-cortex-id="cx-1"]');
    });
  });

  // ── elementMap SPA Navigation Cleanup (Bug A) ──────────────

  describe('elementMap SPA Navigation Cleanup', () => {
    it('prunes detached DOM nodes from elementMap on popstate', () => {
      sendInspectorMessage('inspector:enter-select');

      // Select an element, then detach it (simulates React unmount on SPA nav)
      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      // Simulate SPA navigation — React unmounts and removes the element
      document.body.removeChild(div);

      // Fire popstate (browser back/forward)
      window.dispatchEvent(new PopStateEvent('popstate'));

      // Stale entry should be pruned
      expect(Object.keys(zf().elementMap).length).toBe(0);
    });

    it('keeps attached DOM nodes in elementMap on popstate', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Don't detach — element is still in the document
      window.dispatchEvent(new PopStateEvent('popstate'));

      // Entry should survive since element is still attached
      expect(Object.keys(zf().elementMap).length).toBe(1);
    });

    it('prunes detached DOM nodes on pushState', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Detach and trigger pushState (SPA forward navigation)
      document.body.removeChild(div);
      history.pushState({}, '', '/new-route');

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });
  });

  // ── pushState Sentinel Pattern (M-R5) ──────────────────────

  describe('pushState Sentinel Pattern', () => {
    it('pushState wrapper is pass-through after teardown (no throw, sentinel persists)', () => {
      zf().deactivateInspector();

      // pushState should still work — sentinel wrapper remains, just nulled callback
      expect(() => history.pushState({}, '', '/after-teardown')).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((history.pushState as any).__cortexPatched).toBe(true);
    });

    it('does not double-patch on re-activation (same function reference)', () => {
      const pushRef = history.pushState;

      zf().deactivateInspector();
      zf().activateInspector();

      // Same patched function — sentinel guard prevents re-wrapping
      expect(history.pushState).toBe(pushRef);
    });

    it('prune callback fires through sentinel wrapper on pushState', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Detach and trigger pushState — prune should fire via sentinel
      document.body.removeChild(div);
      history.pushState({}, '', '/sentinel-prune');

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });
  });

  // ── State Preservation Across Mode Toggle (Bug D) ──────────

  describe('State Preservation Across Mode Toggle', () => {
    it('elementMap entries survive pauseInspector → activate cycle', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      // Soft-pause and reactivate — state preserved
      zf().pauseInspector();
      zf().activateInspector();

      // elementMap should still have the entry
      expect(Object.keys(zf().elementMap).length).toBe(1);
    });

    it('discardOverrides clears elementMap', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      // Explicit discard should clear state
      zf().discardOverrides();

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });

    it('selected state survives pauseInspector → activate cycle', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const selectedBefore = zf().selected;
      expect(selectedBefore).not.toBeNull();

      zf().pauseInspector();
      zf().activateInspector();

      // selected should be preserved
      expect(zf().selected).toEqual(selectedBefore);
    });

    it('deactivateInspector clears elementMap (full cleanup)', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      zf().deactivateInspector();

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });

    it('pauseInspector preserves elementMap (soft pause)', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      zf().pauseInspector();

      expect(Object.keys(zf().elementMap).length).toBe(1);
    });
  });

  // ── postMessage Handlers (M4) ──────────────────────────────

  describe('postMessage Handlers', () => {
    it('inspector:discard-overrides clears elementMap', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      sendInspectorMessage('inspector:discard-overrides');

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });

    it('inspector:build-selector responds with selector for valid elementMap entry', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      div.setAttribute('data-testid', 'msg-target');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const selId = zf().selected.id;

      // Listen for the zerofog:selector custom event dispatched by postToParent
      // In test env window.parent === window, so postToParent is a no-op.
      // Instead, verify buildSelector works on the mapped element directly.
      const el = zf().elementMap[selId];
      expect(el).toBe(div);

      // Trigger the handler — it calls buildSelector internally
      sendInspectorMessage('inspector:build-selector', { elementId: selId });

      // Verify the element is still properly mapped (handler didn't error)
      expect(zf().elementMap[selId]).toBe(div);
    });
  });

  // ── Stale Hover Overlay (M-R8) ─────────────────────────────

  describe('Stale Hover Overlay on Ephemeral Elements', () => {
    it('hides overlay when hovered element is removed before rAF fires', async () => {
      // Re-import with deferred rAF to control timing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__?.deactivateInspector?.();
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ZEROFOG__;
      vi.resetModules();

      let pendingRafCallback: FrameRequestCallback | null = null;
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        pendingRafCallback = cb;
        return 0;
      });

      await import('../../src/client/inspector.js');

      const div = document.createElement('div');
      div.textContent = 'ephemeral tooltip';
      document.body.appendChild(div);

      // Trigger mouseover — rAF callback is captured but not fired
      div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(pendingRafCallback).not.toBeNull();

      // Remove the element before rAF fires (simulates tooltip vanishing)
      document.body.removeChild(div);

      // Now fire the rAF callback
      pendingRafCallback!(performance.now());

      const overlay = document.getElementById('__zerofog_inspector_overlay__')!;
      expect(overlay.style.display).toBe('none');
    });

    it('shows overlay when hovered element is still in DOM when rAF fires', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__?.deactivateInspector?.();
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ZEROFOG__;
      vi.resetModules();

      let pendingRafCallback: FrameRequestCallback | null = null;
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        pendingRafCallback = cb;
        return 0;
      });

      await import('../../src/client/inspector.js');

      const div = document.createElement('div');
      div.textContent = 'stable element';
      document.body.appendChild(div);

      div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      // Element stays in DOM — fire rAF
      pendingRafCallback!(performance.now());

      const overlay = document.getElementById('__zerofog_inspector_overlay__')!;
      expect(overlay.style.display).toBe('block');
    });
  });

  // ── IIFE Re-injection Guard (M-R6) ──────────────────────────

  describe('IIFE Re-injection Guard', () => {
    it('calls old deactivateInspector on re-import to prevent ghost listeners', async () => {
      const oldDeactivate = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__.deactivateInspector = oldDeactivate;

      vi.resetModules();
      await import('../../src/client/inspector.js');

      // Old deactivate should have been called by the guard
      expect(oldDeactivate).toHaveBeenCalledOnce();
      // New instance should be active
      expect(zf().inspectorActive).toBe(true);
    });
  });

  // ── postToParent Cross-Frame Messaging (M-R2) ──────────────

  describe('postToParent Cross-Frame Messaging', () => {
    let postMessageSpy: ReturnType<typeof vi.fn>;
    let originalParentDesc: PropertyDescriptor | undefined;

    beforeEach(() => {
      // Save original parent descriptor for cleanup
      originalParentDesc = Object.getOwnPropertyDescriptor(window, 'parent');
    });

    afterEach(() => {
      // Restore window.parent
      if (originalParentDesc) {
        Object.defineProperty(window, 'parent', originalParentDesc);
      }
    });

    it('sends zerofog:ready message on activation', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__?.deactivateInspector?.();
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ZEROFOG__;
      vi.resetModules();

      // Mock window.parent as a different object with postMessage spy
      postMessageSpy = vi.fn();
      Object.defineProperty(window, 'parent', {
        value: { postMessage: postMessageSpy },
        writable: true,
        configurable: true,
      });

      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(performance.now());
        return 0;
      });

      await import('../../src/client/inspector.js');

      // Verify zerofog:ready was sent
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'zerofog:ready',
          sessionId: '__SESSION_ID__',
          version: 1,
        }),
        '__SIDECAR_ORIGIN__'
      );
    });

    it('sends zerofog:selected message on element click in select mode', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__?.deactivateInspector?.();
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ZEROFOG__;
      vi.resetModules();

      postMessageSpy = vi.fn();
      Object.defineProperty(window, 'parent', {
        value: { postMessage: postMessageSpy },
        writable: true,
        configurable: true,
      });

      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(performance.now());
        return 0;
      });

      await import('../../src/client/inspector.js');
      postMessageSpy.mockClear(); // Clear the zerofog:ready call

      // Enter select mode and click
      sendInspectorMessage('inspector:enter-select');
      const div = document.createElement('div');
      div.textContent = 'post-target';
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'zerofog:selected',
          sessionId: '__SESSION_ID__',
          version: 1,
          payload: expect.objectContaining({
            id: expect.any(Number),
            element: expect.objectContaining({ tag: 'DIV' }),
          }),
        }),
        '__SIDECAR_ORIGIN__'
      );
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

  // ── Override Engine (applyOverride / removeOverride) ───────

  describe('Override Engine', () => {
    function selectElement(): { div: HTMLElement; id: number } {
      sendInspectorMessage('inspector:enter-select');
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'override-target');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { div, id: zf().selected.id };
    }

    it('applyOverride rejects unknown CSS property', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'zIndex', 'md');
      expect(result).toEqual({ ok: false, error: 'unknown-property' });
    });

    it('applyOverride rejects unsafe CSS value', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'color', 'expression(alert(1))');
      expect(result).toEqual({ ok: false, error: 'unsafe-value' });
    });

    it('applyOverride rejects non-token value for constrained property', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'padding', '16px');
      expect(result).toEqual({ ok: false, error: 'token-required' });
    });

    it('applyOverride rejects unknown elementId', () => {
      const result = zf().applyOverride(99999, 'color', 'red');
      expect(result).toEqual({ ok: false, error: 'unknown-element' });
    });

    it('applyOverride accepts valid token and injects <style> tag', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'padding', 'md');

      expect(result).toEqual({ ok: true });
      const tag = document.getElementById('zerofog-override-styles');
      expect(tag).not.toBeNull();
      expect(tag!.textContent).toContain('padding: var(--mantine-spacing-md) !important');
    });

    it('applyOverride accepts non-constrained property with arbitrary value', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'color', '#ff0000');

      expect(result).toEqual({ ok: true });
      const tag = document.getElementById('zerofog-override-styles');
      expect(tag!.textContent).toContain('color: #ff0000 !important');
    });

    it('applyOverride accepts CSS var reference for constrained property', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'padding', 'var(--mantine-spacing-md)');

      expect(result).toEqual({ ok: true });
      const tag = document.getElementById('zerofog-override-styles');
      expect(tag!.textContent).toContain('var(--mantine-spacing-md) !important');
    });

    it('removeOverride removes property and updates <style> tag', () => {
      const { id } = selectElement();
      zf().applyOverride(id, 'padding', 'md');
      zf().applyOverride(id, 'color', '#ff0000');

      const tagBefore = document.getElementById('zerofog-override-styles');
      expect(tagBefore!.textContent).toContain('padding');
      expect(tagBefore!.textContent).toContain('color');

      zf().removeOverride(id, 'padding');

      const tagAfter = document.getElementById('zerofog-override-styles');
      expect(tagAfter!.textContent).not.toContain('padding');
      expect(tagAfter!.textContent).toContain('color');
    });

    it('removeOverride removes <style> tag when last property is removed', () => {
      const { id } = selectElement();
      zf().applyOverride(id, 'padding', 'md');

      expect(document.getElementById('zerofog-override-styles')).not.toBeNull();

      zf().removeOverride(id, 'padding');

      expect(document.getElementById('zerofog-override-styles')).toBeNull();
    });

    it('discardOverrides clears all overrideRules and removes <style> tag', () => {
      const { id } = selectElement();
      zf().applyOverride(id, 'padding', 'md');
      zf().applyOverride(id, 'color', 'red');

      expect(document.getElementById('zerofog-override-styles')).not.toBeNull();

      zf().discardOverrides();

      expect(document.getElementById('zerofog-override-styles')).toBeNull();
      expect(Object.keys(zf().overrideRules).length).toBe(0);
    });

    it('overrideRules is exposed on window.__ZEROFOG__', () => {
      expect(zf().overrideRules).toBeDefined();
      expect(typeof zf().overrideRules).toBe('object');
    });

    it('overrideRules has null prototype', () => {
      const rules = zf().overrideRules;
      expect(Object.getPrototypeOf(rules)).toBeNull();
    });

    it('SPACING_TOKENS is frozen', () => {
      expect(Object.isFrozen(SPACING_TOKENS)).toBe(true);
    });

    it('RADIUS_TOKENS is frozen', () => {
      expect(Object.isFrozen(RADIUS_TOKENS)).toBe(true);
    });

    it('prunes stale override rules when element is removed from DOM', () => {
      const { div, id } = selectElement();
      zf().applyOverride(id, 'padding', 'md');

      const tagBefore = document.getElementById('zerofog-override-styles');
      expect(tagBefore).not.toBeNull();

      // Remove element from DOM and trigger prune via popstate
      div.remove();
      window.dispatchEvent(new PopStateEvent('popstate'));

      const tagAfter = document.getElementById('zerofog-override-styles');
      expect(tagAfter).toBeNull();
      expect(Object.keys(zf().overrideRules).length).toBe(0);
    });

    it('data-testid selector survives prune when element is still in DOM', () => {
      const { id } = selectElement();
      zf().applyOverride(id, 'color', 'red');

      // Trigger prune — element is still in DOM
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(Object.keys(zf().overrideRules).length).toBe(1);
      const tag = document.getElementById('zerofog-override-styles');
      expect(tag).not.toBeNull();
    });

    it('discardOverrides hides selectedOverlay and labelEl', () => {
      selectElement();

      // selectedOverlay should be visible after selection
      const selectedOverlay = document.getElementById('__zerofog_inspector_selected__');
      expect(selectedOverlay).not.toBeNull();
      expect(selectedOverlay!.style.display).toBe('block');

      zf().discardOverrides();

      expect(selectedOverlay!.style.display).toBe('none');
    });

    it('message handler ignores non-numeric elementId', () => {
      // Should not throw — handler silently rejects
      sendInspectorMessage('inspector:apply-override', {
        elementId: 'not-a-number' as unknown as number,
        cssProperty: 'padding',
        cssValue: 'md',
      });
      // No style tag should be created
      expect(document.getElementById('zerofog-override-styles')).toBeNull();
    });

    it('applyOverride with camelCase property produces kebab-case in style tag (end-to-end)', () => {
      const { id } = selectElement();
      zf().applyOverride(id, 'fontSize', '14px');

      const tag = document.getElementById('zerofog-override-styles');
      expect(tag).not.toBeNull();
      expect(tag!.textContent).toContain('font-size:');
      expect(tag!.textContent).not.toContain('fontSize');
    });

    it('message handler inspector:apply-override posts result back', async () => {
      // Re-import with parent mock to capture postToParent calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ZEROFOG__?.deactivateInspector?.();
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__ZEROFOG__;
      vi.resetModules();

      const postMessageSpy = vi.fn();
      Object.defineProperty(window, 'parent', {
        value: { postMessage: postMessageSpy },
        writable: true,
        configurable: true,
      });
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(performance.now());
        return 0;
      });

      await import('../../src/client/inspector.js');

      // Select an element
      sendInspectorMessage('inspector:enter-select');
      const div = document.createElement('div');
      div.setAttribute('data-testid', 'msg-override');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const selId = zf().selected.id;

      postMessageSpy.mockClear();

      // Send apply-override message
      sendInspectorMessage('inspector:apply-override', {
        elementId: selId,
        cssProperty: 'padding',
        cssValue: 'md',
      });

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'zerofog:apply-override-result',
          payload: { ok: true },
        }),
        '__SIDECAR_ORIGIN__'
      );

      // Restore parent
      Object.defineProperty(window, 'parent', {
        value: window,
        writable: true,
        configurable: true,
      });
    });

    it('applyOverride rejects non-string cssProperty', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, undefined, 'red');
      expect(result).toEqual({ ok: false, error: 'invalid-input' });
    });

    it('applyOverride rejects non-string cssValue', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, 'color', 42);
      expect(result).toEqual({ ok: false, error: 'invalid-input' });
    });

    it('applyOverride rejects null cssProperty', () => {
      const { id } = selectElement();
      const result = zf().applyOverride(id, null, 'red');
      expect(result).toEqual({ ok: false, error: 'invalid-input' });
    });
  });

  // ── Message Security Boundary (H4) ────────────────────────

  describe('Message Security Boundary', () => {
    it('accepts valid message with correct origin, sessionId, and version', () => {
      sendInspectorMessage('inspector:enter-select');
      expect(zf().selectMode).toBe(true);
    });

    it('rejects message with wrong origin', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', sessionId: '__SESSION_ID__', version: 1 },
        origin: 'https://evil.example.com',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with missing sessionId property', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', version: 1 },
        origin: '__SIDECAR_ORIGIN__',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with wrong sessionId value', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', sessionId: 'wrong-session', version: 1 },
        origin: '__SIDECAR_ORIGIN__',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with wrong version', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'inspector:enter-select', sessionId: '__SESSION_ID__', version: 99 },
        origin: '__SIDECAR_ORIGIN__',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with null data', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: null,
        origin: '__SIDECAR_ORIGIN__',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('rejects message with string data (non-object)', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: 'inspector:enter-select',
        origin: '__SIDECAR_ORIGIN__',
      }));
      expect(zf().selectMode).toBe(false);
    });

    it('message handler ignores NaN elementId', () => {
      sendInspectorMessage('inspector:apply-override', {
        elementId: NaN as unknown as number,
        cssProperty: 'padding',
        cssValue: 'md',
      });
      expect(document.getElementById('zerofog-override-styles')).toBeNull();
    });

    it('message handler ignores string elementId', () => {
      sendInspectorMessage('inspector:apply-override', {
        elementId: 'not-a-number' as unknown as number,
        cssProperty: 'padding',
        cssValue: 'md',
      });
      expect(document.getElementById('zerofog-override-styles')).toBeNull();
    });
  });

  // ── replaceState Sentinel Pattern (M7) ────────────────────

  describe('replaceState Sentinel Pattern', () => {
    it('prunes detached DOM nodes on replaceState', () => {
      sendInspectorMessage('inspector:enter-select');

      const div = document.createElement('div');
      document.body.appendChild(div);
      div.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(Object.keys(zf().elementMap).length).toBe(1);

      // Detach and trigger replaceState (SPA route replacement)
      document.body.removeChild(div);
      history.replaceState({}, '', '/replaced-route');

      expect(Object.keys(zf().elementMap).length).toBe(0);
    });

    it('replaceState wrapper is pass-through after teardown', () => {
      zf().deactivateInspector();
      expect(() => history.replaceState({}, '', '/after-teardown')).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((history.replaceState as any).__cortexPatched).toBe(true);
    });
  });

  // ── Overlay Transition Properties (M3) ────────────────────

  describe('Overlay Transition Properties', () => {
    it('overlay uses specific transition properties instead of all', () => {
      const overlay = document.getElementById('__zerofog_inspector_overlay__');
      expect(overlay).not.toBeNull();
      expect(overlay!.style.cssText).not.toContain('transition:all');
      expect(overlay!.style.cssText).toContain('transition');
    });
  });
});
