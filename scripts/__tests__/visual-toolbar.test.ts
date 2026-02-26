import { describe, expect, it } from 'vitest';

/**
 * Tests for the visual toolbar's pure functions.
 *
 * The toolbar runs in the browser via browser_evaluate. We test the
 * exported functions with dependency-injected mocks for browser APIs.
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
  it('returns correct spacing map from sentinel reads', () => {
    const sizeValues: Record<string, Record<string, string>> = {
      xs: { paddingTop: '4px', borderTopLeftRadius: '2px' },
      sm: { paddingTop: '8px', borderTopLeftRadius: '4px' },
      md: { paddingTop: '16px', borderTopLeftRadius: '8px' },
      lg: { paddingTop: '20px', borderTopLeftRadius: '12px' },
      xl: { paddingTop: '24px', borderTopLeftRadius: '16px' },
    };

    let callCount = 0;
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'];
    const mockStyleGetter = function () {
      // Each size calls styleGetter twice (once for spacing, once for radius)
      const sizeIndex = Math.floor(callCount / 2);
      const isRadius = callCount % 2 === 1;
      callCount++;
      const size = sizes[sizeIndex] || 'xs';
      const vals = sizeValues[size];
      return {
        paddingTop: isRadius ? '0px' : vals.paddingTop,
        borderTopLeftRadius: isRadius ? vals.borderTopLeftRadius : '0px',
      };
    };

    const maps = buildTokenMaps(mockStyleGetter);

    expect(maps.spacing['4px']).toBe('xs');
    expect(maps.spacing['8px']).toBe('sm');
    expect(maps.spacing['16px']).toBe('md');
    expect(maps.spacing['20px']).toBe('lg');
    expect(maps.spacing['24px']).toBe('xl');
  });

  it('returns correct radius map including none for 0px', () => {
    const mockStyleGetter = createMockStyleGetter({});
    const maps = buildTokenMaps(mockStyleGetter);

    expect(maps.radius['0px']).toBe('none');
  });

  it('handles missing CSS variables gracefully (sentinel returns 0px)', () => {
    const mockStyleGetter = createMockStyleGetter({});
    const maps = buildTokenMaps(mockStyleGetter);

    // 0px values should not be added to spacing map
    expect(maps.spacing['0px']).toBeUndefined();
  });

  it('maps are keyed by px strings, not rem strings', () => {
    let callCount = 0;
    const mockStyleGetter = function () {
      callCount++;
      // Only return a value for the first spacing call
      if (callCount === 1) {
        return { paddingTop: '16px', borderTopLeftRadius: '0px' };
      }
      return { paddingTop: '0px', borderTopLeftRadius: '0px' };
    };

    const maps = buildTokenMaps(mockStyleGetter);

    // Should be keyed by px, not rem
    expect(maps.spacing['16px']).toBe('xs');
    expect(maps.spacing['1rem']).toBeUndefined();
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
