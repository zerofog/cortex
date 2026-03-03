import { describe, expect, it } from 'vitest';

/**
 * Tests for the visual toolbar's pure functions.
 *
 * The toolbar runs in the browser via browser_evaluate. We test the
 * exported functions with dependency-injected mocks for browser APIs.
 *
 * NOTE: This test file runs in Node.js (no DOM). buildTokenMaps tests
 * verify the SSR guard behavior here. Full DOM-dependent buildTokenMaps
 * tests live in visual-editor/tests/client/toolbar.test.ts (happy-dom).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildTokenMaps,
  reverseTokenLookup,
  detectStyleOrigin,
  finalizeDiff,
} = require('../visual-toolbar.js');

// ── Helpers ──────────────────────────────────────────────────────

function createMockStyleGetter(tokenMap: Record<string, string>) {
  return function (_el: unknown) {
    return {
      paddingTop: tokenMap['paddingTop'] || '0px',
      borderTopLeftRadius: tokenMap['borderTopLeftRadius'] || '0px',
    };
  };
}

function createMockElement(overrides: Record<string, unknown> = {}) {
  return {
    className: (overrides.className as string) ?? '',
    getAttribute: (_attr: string) => null,
    ...overrides,
  };
}

function createMockFiber(overrides: Record<string, unknown> = {}) {
  return {
    type: overrides.type ?? null,
    _debugOwner: overrides._debugOwner ?? null,
    memoizedProps: overrides.memoizedProps ?? {},
    ...overrides,
  };
}

// ── buildTokenMaps ───────────────────────────────────────────────

describe('buildTokenMaps', () => {
  // NOTE: Full DOM-dependent buildTokenMaps tests (sentinel reads, token
  // resolution, error handling) live in visual-editor/tests/client/toolbar.test.ts
  // which runs in a happy-dom environment. This file tests SSR/non-browser behavior.

  it('returns empty maps when document is undefined (SSR guard)', () => {
    // In Node.js (no DOM), buildTokenMaps should return empty maps safely.
    const maps = buildTokenMaps();
    expect(maps).toEqual({ spacing: {}, radius: {} });
  });

  it('SSR guard prevents styleGetter from being called', () => {
    let called = false;
    const mockStyleGetter = function () {
      called = true;
      return { paddingTop: '16px', borderTopLeftRadius: '8px' };
    };

    buildTokenMaps(mockStyleGetter);
    expect(called).toBe(false);
  });
});

// ── reverseTokenLookup ───────────────────────────────────────────

describe('reverseTokenLookup', () => {
  const maps = {
    spacing: { '8px': 'sm', '16px': 'md', '20px': 'lg' },
    radius: { '0px': 'none', '4px': 'sm', '8px': 'md' },
  };

  it('maps 16px to md for spacing', () => {
    expect(reverseTokenLookup(maps, 'spacing', '16px')).toBe('md');
  });

  it('maps 8px to sm for spacing', () => {
    expect(reverseTokenLookup(maps, 'spacing', '8px')).toBe('sm');
  });

  it('returns full for radius values > 1000px', () => {
    expect(reverseTokenLookup(maps, 'radius', '9999px')).toBe('full');
  });

  it('returns null for non-token values', () => {
    expect(reverseTokenLookup(maps, 'spacing', '7px')).toBeNull();
  });
});

// ── detectStyleOrigin ────────────────────────────────────────────

describe('detectStyleOrigin', () => {
  it('detects Mantine prop origin when owner has memoizedProps.p', () => {
    const ownerFiber = createMockFiber({
      type: { name: 'Card' },
      memoizedProps: { p: 'lg' },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$test1';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'padding', () => [fiberKey]);

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('p');
    expect(result.value).toBe('lg');
    expect(result.component).toBe('Card');
  });

  it('detects Mantine prop origin for radius', () => {
    const ownerFiber = createMockFiber({
      type: { name: 'Button' },
      memoizedProps: { radius: 'sm' },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$test2';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'border-radius', () => [
      fiberKey,
    ]);

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('radius');
    expect(result.value).toBe('sm');
  });

  it('detects Mantine default origin for Card padding', () => {
    // Owner fiber has no explicit padding prop, but Card is in THEME_DEFAULTS
    const ownerFiber = createMockFiber({
      type: { name: 'Card' },
      memoizedProps: { children: [] },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$test3';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'padding', () => [fiberKey], {
      Card: { padding: 'lg', radius: 'md' },
    });

    expect(result.origin).toBe('mantine-default');
    expect(result.component).toBe('Card');
    expect(result.defaultValue).toBe('lg');
  });

  it('does NOT return mantine-default for Stack gap (not in defaults)', () => {
    const ownerFiber = createMockFiber({
      type: { name: 'Stack' },
      memoizedProps: { children: [] },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$test4';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'gap', () => [fiberKey], {});

    expect(result.origin).not.toBe('mantine-default');
  });

  it('detects Tailwind origin for p-4 className', () => {
    const element = createMockElement({ className: 'flex p-4 bg-white' });

    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('p-4');
  });

  it('detects Tailwind origin for rounded-lg className', () => {
    const element = createMockElement({ className: 'rounded-lg border' });

    const result = detectStyleOrigin(element, 'border-radius', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('rounded-lg');
  });

  it('detects CSS Module origin for hashed class pattern', () => {
    const element = createMockElement({ className: 'Card_abc12345' });

    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('css-module');
  });

  it('does not false-positive CSS Module on Mantine class', () => {
    const element = createMockElement({ className: 'mantine-Card-root' });

    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).not.toBe('css-module');
  });

  it('returns unknown when no origin detected', () => {
    const element = createMockElement({ className: '' });

    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('unknown');
  });
});

// ── finalizeDiff ─────────────────────────────────────────────────

describe('finalizeDiff', () => {
  it('produces correct structure with single change', () => {
    const selection = {
      testId: 'risk-card',
      componentChain: ['Card', 'RiskList'],
      elementType: 'container',
    };
    const changes = [
      {
        property: 'padding',
        token: 'xl',
        previousToken: 'lg',
        previousCssValue: '20px',
        cssProperty: 'padding',
        cssValue: '24px',
        styleOrigin: {
          origin: 'mantine-prop',
          prop: 'p',
          value: 'lg',
          component: 'Card',
        },
      },
    ];

    const diff = finalizeDiff(selection, changes);

    expect(diff.elementSelector).toBe('[data-testid="risk-card"]');
    expect(diff.componentChain).toEqual(['Card', 'RiskList']);
    expect(diff.elementType).toBe('container');
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].token).toBe('xl');
    expect(diff.changes[0].previousToken).toBe('lg');
    expect(diff.timestamp).toBeDefined();
  });

  it('produces correct structure with multiple changes', () => {
    const selection = {
      testId: 'my-card',
      componentChain: ['Card'],
      elementType: 'container',
    };
    const changes = [
      {
        property: 'padding',
        token: 'xl',
        previousToken: 'lg',
        previousCssValue: '20px',
        cssProperty: 'padding',
        cssValue: '24px',
        styleOrigin: { origin: 'mantine-prop' },
      },
      {
        property: 'border-radius',
        token: 'lg',
        previousToken: 'md',
        previousCssValue: '8px',
        cssProperty: 'border-radius',
        cssValue: '12px',
        styleOrigin: { origin: 'mantine-prop' },
      },
    ];

    const diff = finalizeDiff(selection, changes);
    expect(diff.changes).toHaveLength(2);
  });

  it('uses data-testid selector when testId available', () => {
    const selection = {
      testId: 'entity-panel',
      componentChain: ['Panel'],
      elementType: 'container',
    };

    const diff = finalizeDiff(selection, []);

    expect(diff.elementSelector).toBe('[data-testid="entity-panel"]');
  });

  it('falls back to component-based selector when no testId', () => {
    const selection = {
      testId: null,
      componentChain: ['Card', 'Dashboard'],
      elementType: 'container',
    };

    const diff = finalizeDiff(selection, []);

    expect(diff.elementSelector).toBe('Card');
  });

  it('sets previousToken to null for non-token numeric values', () => {
    const selection = {
      testId: 'stack-1',
      componentChain: ['Stack'],
      elementType: 'container',
    };
    const changes = [
      {
        property: 'gap',
        token: 'md',
        previousToken: null,
        previousCssValue: '4px',
        cssProperty: 'gap',
        cssValue: '16px',
        styleOrigin: { origin: 'mantine-prop' },
      },
    ];

    const diff = finalizeDiff(selection, changes);

    expect(diff.changes[0].previousToken).toBeNull();
  });
});
