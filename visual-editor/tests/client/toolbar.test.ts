import { describe, expect, it, vi } from 'vitest';
import {
  buildTokenMaps,
  reverseTokenLookup,
  detectStyleOrigin,
  finalizeDiff,
  findReactFiberKeys,
  TOOLBAR_SIZES,
  RADIUS_SIZES,
} from '../../src/client/toolbar.js';
import { findReactFiberKeys as inspectorFindReactFiberKeys } from '../../src/client/inspector.js';

/**
 * Tests for the toolbar's pure functions.
 *
 * Ported from scripts/__tests__/visual-toolbar.test.ts with ESM imports.
 * Includes 6 additional tests for IM5 Tailwind regex fix.
 */

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
    stateNode: overrides.stateNode ?? null,
    return: overrides.return ?? null,
    ...overrides,
  };
}

// ── Constants ────────────────────────────────────────────────────

describe('Constants', () => {
  it('TOOLBAR_SIZES has 5 sizes', () => {
    expect(TOOLBAR_SIZES).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
  });

  it('RADIUS_SIZES has 6 sizes including none', () => {
    expect(RADIUS_SIZES).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
  });
});

// ── buildTokenMaps ───────────────────────────────────────────────

describe('buildTokenMaps', () => {
  it('returns correct spacing and radius maps from sentinel reads', () => {
    // Style-aware mock: reads el.style.padding / el.style.borderRadius to
    // extract the CSS variable name and return corresponding px values.
    // This is order-independent — it doesn't rely on call count.
    const spacingPxMap: Record<string, string> = {
      xs: '4px', sm: '8px', md: '16px', lg: '20px', xl: '24px',
    };
    const radiusPxMap: Record<string, string> = {
      xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px',
    };

    const mockStyleGetter = function (el: Element) {
      const htmlEl = el as HTMLElement;
      const paddingVar = htmlEl.style.padding || '';
      const radiusVar = htmlEl.style.borderRadius || '';
      let paddingTop = '0px';
      let borderTopLeftRadius = '0px';

      // Extract token from var(--mantine-spacing-<token>)
      const spacingMatch = paddingVar.match(/--mantine-spacing-(\w+)/);
      if (spacingMatch?.[1] && spacingPxMap[spacingMatch[1]]) {
        paddingTop = spacingPxMap[spacingMatch[1]]!;
      }

      // Extract token from var(--mantine-radius-<token>)
      const radiusMatch = radiusVar.match(/--mantine-radius-(\w+)/);
      if (radiusMatch?.[1] && radiusPxMap[radiusMatch[1]]) {
        borderTopLeftRadius = radiusPxMap[radiusMatch[1]]!;
      }

      return { paddingTop, borderTopLeftRadius };
    };

    const maps = buildTokenMaps(mockStyleGetter);

    expect(maps.spacing['4px']).toBe('xs');
    expect(maps.spacing['8px']).toBe('sm');
    expect(maps.spacing['16px']).toBe('md');
    expect(maps.spacing['20px']).toBe('lg');
    expect(maps.spacing['24px']).toBe('xl');

    expect(maps.radius['2px']).toBe('xs');
    expect(maps.radius['4px']).toBe('sm');
    expect(maps.radius['8px']).toBe('md');
    expect(maps.radius['12px']).toBe('lg');
    expect(maps.radius['16px']).toBe('xl');
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

  it('removes sentinel even when styleGetter throws', () => {
    const throwingGetter = function () {
      throw new Error('getComputedStyle failed');
    };

    buildTokenMaps(throwingGetter);

    // Sentinel should not remain in DOM
    const sentinels = document.querySelectorAll(
      'div[style*="visibility:hidden"]'
    );
    expect(sentinels.length).toBe(0);
  });

  it('returns empty maps when styleGetter throws', () => {
    const throwingGetter = function () {
      throw new Error('getComputedStyle failed');
    };

    const maps = buildTokenMaps(throwingGetter);

    expect(maps).toEqual({ spacing: {}, radius: {} });
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

  it('batches all style writes before reads (no layout thrash)', () => {
    const readElements: { padding: string; borderRadius: string }[] = [];

    const mockStyleGetter = function (el: Element) {
      const htmlEl = el as HTMLElement;
      // Record what properties were set at read time
      readElements.push({
        padding: htmlEl.style.padding,
        borderRadius: htmlEl.style.borderRadius,
      });
      return { paddingTop: '16px', borderTopLeftRadius: '8px' };
    };

    buildTokenMaps(mockStyleGetter);

    // Each element should have BOTH padding AND borderRadius set at read time.
    // In the old interleaved code, borderRadius wouldn't be set when reading paddingTop.
    expect(readElements.length).toBe(5);
    for (const el of readElements) {
      expect(el.padding).toContain('--mantine-spacing-');
      expect(el.borderRadius).toContain('--mantine-radius-');
    }
  });

  it('cleans up all sentinel elements after completion', () => {
    const mockStyleGetter = createMockStyleGetter({
      paddingTop: '16px',
      borderTopLeftRadius: '8px',
    });

    buildTokenMaps(mockStyleGetter);

    const sentinels = document.querySelectorAll(
      'div[style*="visibility:hidden"]'
    );
    expect(sentinels.length).toBe(0);
  });

  it('returns empty maps when document.body is null', () => {
    const origBody = document.body;
    Object.defineProperty(document, 'body', { value: null, writable: true, configurable: true });
    try {
      const maps = buildTokenMaps(() => ({ paddingTop: '16px', borderTopLeftRadius: '8px' }));
      expect(maps).toEqual({ spacing: {}, radius: {} });
    } finally {
      Object.defineProperty(document, 'body', { value: origBody, writable: true, configurable: true });
    }
  });
});

// ── buildTokenMaps — SSR guard (H6) ──────────────────────────────

describe('buildTokenMaps — SSR guard (H6)', () => {
  it('returns empty maps when document is undefined', () => {
    vi.stubGlobal('document', undefined);
    try {
      const maps = buildTokenMaps();
      expect(maps).toEqual({ spacing: {}, radius: {} });
    } finally {
      vi.unstubAllGlobals();
    }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => [fiberKey]);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'border-radius', () => [
      fiberKey,
    ]);

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('radius');
    expect(result.value).toBe('sm');
  });

  it('detects Mantine default origin for Card padding', () => {
    const ownerFiber = createMockFiber({
      type: { name: 'Card' },
      memoizedProps: { children: [] },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$test3';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => [fiberKey], {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('p-4');
  });

  it('detects Tailwind origin for rounded-lg className', () => {
    const element = createMockElement({ className: 'rounded-lg border' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'border-radius', () => []);

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

// ── detectStyleOrigin — React 19 dual-strategy (F2) ──────────────

describe('detectStyleOrigin — React 19 dual-strategy (F2)', () => {
  it('detects mantine-prop via fiber.return (React 19, no _debugOwner)', () => {
    // React 19 fiber: no _debugOwner property, uses return + tag
    const componentFiber = {
      tag: 0,
      type: { name: 'Card' },
      memoizedProps: { p: 'lg' },
      return: null,
    };
    const hostFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: componentFiber,
    };
    const domFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostFiber,
    };
    const fiberKey = '__reactFiber$r19a';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => [fiberKey]);

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('p');
    expect(result.value).toBe('lg');
    expect(result.component).toBe('Card');
  });

  it('React 18 fiber (has _debugOwner) still works (regression)', () => {
    const ownerFiber = createMockFiber({
      type: { name: 'Stack' },
      memoizedProps: { gap: 'md' },
    });
    const domFiber = createMockFiber({ _debugOwner: ownerFiber });
    const fiberKey = '__reactFiber$r18reg';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'gap', () => [fiberKey]);

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('gap');
    expect(result.value).toBe('md');
  });

  it('React 19 skips HostComponent (tag 5) to reach component fiber', () => {
    // Chain: domFiber(tag 5) → host-div(tag 5) → host-span(tag 5) → Component(tag 0)
    const componentFiber = {
      tag: 0,
      type: { name: 'Button' },
      memoizedProps: { radius: 'sm' },
      return: null,
    };
    const hostSpan = {
      tag: 5,
      type: 'span',
      memoizedProps: {},
      return: componentFiber,
    };
    const hostDiv = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostSpan,
    };
    const domFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostDiv,
    };
    const fiberKey = '__reactFiber$r19skip';

    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(
      element,
      'border-radius',
      () => [fiberKey]
    );

    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('radius');
    expect(result.component).toBe('Button');
  });
});

// ── detectStyleOrigin — Tailwind regex fix (IM5) ─────────────────

describe('detectStyleOrigin — Tailwind regex fix (IM5)', () => {
  it('matches responsive prefix sm:p-4', () => {
    const element = createMockElement({ className: 'flex sm:p-4 bg-white' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('sm:p-4');
  });

  it('matches responsive prefix md:gap-2', () => {
    const element = createMockElement({ className: 'md:gap-2 flex' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'gap', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('md:gap-2');
  });

  it('does NOT false-positive on prose-lg as padding', () => {
    const element = createMockElement({ className: 'prose prose-lg max-w-none' });
    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).not.toBe('tailwind');
  });

  it('matches half-step values p-0.5', () => {
    const element = createMockElement({ className: 'p-0.5 text-sm' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('p-0.5');
  });

  it('matches auto value m-auto', () => {
    const element = createMockElement({ className: 'mx-auto flex' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'margin', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('mx-auto');
  });

  it('matches px value p-px', () => {
    const element = createMockElement({ className: 'p-px border' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('p-px');
  });
});

// ── detectStyleOrigin — Tailwind regex gaps (F3) ─────────────

describe('detectStyleOrigin — Tailwind regex gaps (F3)', () => {
  it('matches stacked modifiers sm:hover:p-4', () => {
    const element = createMockElement({ className: 'flex sm:hover:p-4 bg-white' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('sm:hover:p-4');
  });

  it('matches negative margin -m-4', () => {
    const element = createMockElement({ className: 'flex -m-4 bg-white' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'margin', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('-m-4');
  });

  it('matches arbitrary bracket value p-[16px]', () => {
    const element = createMockElement({ className: 'flex p-[16px] bg-white' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('p-[16px]');
  });

  it('matches hyphenated modifier group-hover:p-4', () => {
    const element = createMockElement({ className: 'flex group-hover:p-4 bg-white' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('group-hover:p-4');
  });

  it('still rejects prose-lg (regression)', () => {
    const element = createMockElement({ className: 'prose prose-lg max-w-none' });
    const result = detectStyleOrigin(element, 'padding', () => []);

    expect(result.origin).not.toBe('tailwind');
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((diff.changes[0] as any).token).toBe('xl');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((diff.changes[0] as any).previousToken).toBe('lg');
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

  it('returns unknown selector when no testId (H1 behavioral change)', () => {
    const selection = {
      testId: null,
      componentChain: ['Card', 'Dashboard'],
      elementType: 'container',
    };

    const diff = finalizeDiff(selection, []);

    expect(diff.elementSelector).toBe('unknown');
  });

  it('escapes double-quote in testId (injection prevention)', () => {
    const diff = finalizeDiff({ testId: 'foo"bar' }, []);
    expect(diff.elementSelector).toBe('[data-testid="foo\\"bar"]');
  });

  it('escapes backslash in testId', () => {
    const diff = finalizeDiff({ testId: 'foo\\bar' }, []);
    expect(diff.elementSelector).toBe('[data-testid="foo\\\\bar"]');
  });

  it('returns unknown with empty componentChain', () => {
    const diff = finalizeDiff({ testId: null, componentChain: [] }, []);
    expect(diff.elementSelector).toBe('unknown');
  });

  it('defaults componentChain to [] when undefined', () => {
    const diff = finalizeDiff({ testId: 'x' }, []);
    expect(diff.componentChain).toEqual([]);
  });

  it('defaults elementType to unknown when undefined', () => {
    const diff = finalizeDiff({ testId: 'x' }, []);
    expect(diff.elementType).toBe('unknown');
  });

  it('handles empty {} selection gracefully', () => {
    const diff = finalizeDiff({}, []);
    expect(diff.elementSelector).toBe('unknown');
    expect(diff.componentChain).toEqual([]);
    expect(diff.elementType).toBe('unknown');
  });

  it('accepts _now parameter for deterministic timestamps', () => {
    const fixedDate = new Date('2026-01-15T12:00:00.000Z');
    const diff = finalizeDiff({ testId: 'test' }, [], fixedDate);
    expect(diff.timestamp).toBe('2026-01-15T12:00:00.000Z');
  });

  it('timestamp matches ISO 8601 format (M9)', () => {
    const diff = finalizeDiff({ testId: 'test' }, [], new Date());
    expect(diff.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((diff.changes[0] as any).previousToken).toBeNull();
  });
});

// ── findReactFiberKeys ───────────────────────────────────────────

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
});

// ── findReactFiberKeys — cross-module parity (H3) ────────────────

describe('findReactFiberKeys — cross-module parity (H3)', () => {
  const testCases: Array<{ name: string; element: Record<string, unknown> }> = [
    { name: 'single fiber key', element: { '__reactFiber$abc123': { tag: 0 }, id: 'a' } },
    { name: 'no fiber keys', element: { id: 'test', className: 'foo' } },
    { name: 'multiple fiber keys', element: { '__reactFiber$a1': {}, '__reactFiber$b2': {}, x: 1 } },
    { name: 'props key only (not fiber)', element: { '__reactProps$abc': {}, id: 'b' } },
    { name: 'empty object', element: {} },
  ];

  for (const tc of testCases) {
    it(`parity: ${tc.name}`, () => {
      expect(findReactFiberKeys(tc.element)).toEqual(inspectorFindReactFiberKeys(tc.element));
    });
  }
});

// ── detectStyleOrigin — ForwardRef/Memo tags (H2) ────────────────

describe('detectStyleOrigin — ForwardRef/Memo tags (H2)', () => {
  function buildReact19FiberChain(ownerTag: number, ownerType: Record<string, unknown>, props: Record<string, unknown>) {
    const componentFiber = {
      tag: ownerTag,
      type: ownerType,
      memoizedProps: props,
      return: null,
    };
    const hostFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: componentFiber,
    };
    const domFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostFiber,
    };
    return domFiber;
  }

  it('ForwardRef (tag 11) detects mantine-prop', () => {
    const domFiber = buildReact19FiberChain(11, { displayName: 'ForwardRef(Button)', name: '' }, { radius: 'sm' });
    const fiberKey = '__reactFiber$fwdref';
    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'border-radius', () => [fiberKey]);
    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('radius');
  });

  it('MemoComponent (tag 14) detects mantine-prop', () => {
    const domFiber = buildReact19FiberChain(14, { displayName: 'Memo(Card)', name: '' }, { p: 'lg' });
    const fiberKey = '__reactFiber$memo14';
    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => [fiberKey]);
    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('p');
  });

  it('SimpleMemoComponent (tag 15) detects mantine-prop', () => {
    const domFiber = buildReact19FiberChain(15, { name: 'SimpleCard' }, { m: 'xs' });
    const fiberKey = '__reactFiber$memo15';
    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'margin', () => [fiberKey]);
    expect(result.origin).toBe('mantine-prop');
    expect(result.prop).toBe('m');
  });

  it('HostRoot (tag 3) is still skipped (unknown)', () => {
    // Chain: dom → host(5) → HostRoot(3, no type.name) — should not detect
    const hostRoot = {
      tag: 3,
      type: null,
      memoizedProps: { p: 'lg' },
      return: null,
    };
    const hostFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostRoot,
    };
    const domFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: hostFiber,
    };
    const fiberKey = '__reactFiber$hostroot';
    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'padding', () => [fiberKey]);
    expect(result.origin).toBe('unknown');
  });
});

// ── detectStyleOrigin — MAX_DEPTH termination (M3) ────────────────

describe('detectStyleOrigin — MAX_DEPTH termination (M3)', () => {
  it('25-deep fiber chain — prop at depth 25 unreachable', () => {
    // Build a chain of 25 ClassComponent fibers (tag 1), only last one has the prop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = {
      tag: 1,
      type: { name: 'DeepComponent' },
      memoizedProps: { p: 'lg' },
      return: null,
    };
    for (let i = 0; i < 24; i++) {
      current = {
        tag: 1,
        type: { name: `Wrapper${i}` },
        memoizedProps: { children: [] },
        return: current,
      };
    }
    // domFiber is a host element (no _debugOwner → React 19 path)
    const domFiber = {
      tag: 5,
      type: 'div',
      memoizedProps: {},
      return: current,
    };
    const fiberKey = '__reactFiber$deep25';
    const element = createMockElement();
    (element as Record<string, unknown>)[fiberKey] = domFiber;

    const result = detectStyleOrigin(element, 'padding', () => [fiberKey]);
    // MAX_DEPTH is 20, so depth 25 is unreachable
    expect(result.origin).toBe('unknown');
  });
});

// ── detectStyleOrigin — SVGAnimatedString (C2) ───────────────────

describe('detectStyleOrigin — SVGAnimatedString (C2)', () => {
  it('SVGAnimatedString className object returns unknown without throwing', () => {
    // SVG elements have className as SVGAnimatedString (an object, not a string)
    const element = createMockElement({
      className: { baseVal: 'my-svg-class', animVal: 'my-svg-class' },
    });

    const result = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).toBe('unknown');
  });

  it('undefined className returns unknown', () => {
    const element = createMockElement({ className: undefined });

    const result = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).toBe('unknown');
  });
});

// ── detectStyleOrigin — Tailwind regex gaps (H4 additions) ────────

describe('detectStyleOrigin — Tailwind regex gaps (H4)', () => {
  it('matches rounded-t-lg (directional)', () => {
    const element = createMockElement({ className: 'rounded-t-lg border' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'border-radius', () => []);
    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('rounded-t-lg');
  });

  it('matches rounded-bl-md (corner)', () => {
    const element = createMockElement({ className: 'rounded-bl-md border' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'border-radius', () => []);
    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('rounded-bl-md');
  });

  it('matches pe-4 (logical property)', () => {
    const element = createMockElement({ className: 'pe-4 text-sm' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('pe-4');
  });

  it('matches ms-2 (logical property)', () => {
    const element = createMockElement({ className: 'ms-2 flex' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'margin', () => []);
    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('ms-2');
  });

  it('matches !p-4 (important modifier)', () => {
    const element = createMockElement({ className: '!p-4 text-sm' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).toBe('tailwind');
    expect(result.className).toBe('!p-4');
  });

  it('does NOT match space-y-4 (negative)', () => {
    const element = createMockElement({ className: 'space-y-4 flex' });
    const result = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).not.toBe('tailwind');
  });

  it('does NOT match snap-x (negative)', () => {
    const element = createMockElement({ className: 'snap-x flex' });
    const result = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).not.toBe('tailwind');
  });

  it('does NOT match tracking-wide (negative)', () => {
    const element = createMockElement({ className: 'tracking-wide text-sm' });
    const result = detectStyleOrigin(element, 'padding', () => []);
    expect(result.origin).not.toBe('tailwind');
  });
});

// ── detectStyleOrigin — CSS Module edge cases (M4) ────────────────

describe('detectStyleOrigin — CSS Module edge cases (M4)', () => {
  it('5-char hash (minimum valid) matches', () => {
    const element = createMockElement({ className: 'Card_a1b2c' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).toBe('css-module');
  });

  it('8-char hash (maximum valid) matches', () => {
    const element = createMockElement({ className: 'Card_a1b2c3d4' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).toBe('css-module');
  });

  it('4-char hash (too short) rejected', () => {
    const element = createMockElement({ className: 'Card_a1b2' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).not.toBe('css-module');
  });

  it('9-char hash (too long) rejected', () => {
    const element = createMockElement({ className: 'Card_a1b2c3d4e' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).not.toBe('css-module');
  });

  it('starts with number rejected', () => {
    const element = createMockElement({ className: '1Card_abcde' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).not.toBe('css-module');
  });

  it('CSS module in multi-class string matches', () => {
    const element = createMockElement({ className: 'flex justify-center Card_abc12345 text-sm' });
    expect(detectStyleOrigin(element, 'padding', () => []).origin).toBe('css-module');
  });
});
