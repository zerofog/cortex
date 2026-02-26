import { describe, expect, it } from 'vitest';

/**
 * Tests for the visual inspector's source resolution logic.
 *
 * The inspector runs in the browser via browser_evaluate, so we test
 * the exported resolveSource function with mock fiber trees.
 */

// Import the source resolution function (will be exported for testing)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveSource, classifyElement } = require('../visual-inspect.js');

// ── Mock Fiber Trees ─────────────────────────────────────────────

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

      // Should cap at a reasonable depth (20)
      expect(result.componentChain.length).toBeLessThanOrEqual(20);
    });
  });

  describe('server component detection', () => {
    it('marks as server component when no fiber found', () => {
      const element = createMockElement({ closest: () => null });
      const result = resolveSource(element);

      expect(result.isServerComponent).toBe(true);
    });

    it('marks as client component when fiber is found', () => {
      const fiber = createMockFiber({
        type: { name: 'ClientWidget' },
      });
      const element = createMockElement({ closest: () => null });
      const fiberKey = '__reactFiber$client';
      (element as Record<string, unknown>)[fiberKey] = fiber;

      const result = resolveSource(element, [fiberKey]);

      expect(result.isServerComponent).toBe(false);
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
});

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
