/** React fiber node (minimal shape for source resolution). */
export interface Fiber {
  type: { displayName?: string; name?: string } | string | null;
  _debugOwner?: Fiber | null;
  stateNode?: unknown;
  return?: Fiber | null;
  tag?: number;
  [key: string]: unknown;
}

export interface ResolvedSource {
  testId: string | null;
  componentChain: string[];
  hasClientFiber: boolean;
  element: {
    tag: string;
    classes: string[];
    text: string;
    bounds: { top: number; left: number; width: number; height: number };
  };
}

export type ElementCategory =
  | 'icon'
  | 'layout'
  | 'text'
  | 'interactive'
  | 'container'
  | 'feedback'
  | 'input'
  | 'unknown';

/** Escape special characters for use inside a CSS attribute-value selector. */
export declare function escapeAttrValue(val: string): string;

/** Build a unique CSS selector for a DOM element. */
export declare function buildSelector(element: Element): string;

/** Extract component display name from a fiber node. */
export declare function getComponentName(fiber: unknown): string | null;

/** Find __reactFiber$ keys on a DOM element. */
export declare function findReactFiberKeys(element: Record<string, unknown>): string[];

/** Get fiber from element using cached key (fast path for hover). */
export declare function getFiberFromElement(element: Record<string, unknown>): Fiber | null;

/** Walk fiber tree to extract component name chain. */
export declare function walkComponentChain(fiber: unknown): string[];

/** Check if ancestorElement is a fiber ancestor of childElement. */
export declare function isFiberAncestor(
  childElement: Record<string, unknown>,
  ancestorElement: Record<string, unknown>,
  fiberKeys?: string[],
): boolean;

/** Resolve source info (testId, component chain, metadata) from a DOM element. */
export declare function resolveSource(
  element: Record<string, unknown>,
  fiberKeys?: string[],
  bounds?: { top: number; left: number; width: number; height: number },
): ResolvedSource;

/** Classify an element by its component chain and tag name. */
export declare function classifyElement(
  componentChain: string[],
  tagName: string | null | undefined,
): ElementCategory;

/** Check if a CSS value is a valid token for a given property. */
export declare function isTokenValue(cssProperty: string, cssValue: string): boolean;

/** Resolve bare token names to CSS var() references for constrained properties. */
export declare function resolveTokenValue(cssProperty: string, cssValue: string): string;

/** Convert camelCase string to kebab-case. */
export declare function camelToKebab(str: string): string;

/** CSS variable prefix lookup for token-constrained properties. */
export declare const TOKEN_VAR_PREFIX: Record<string, string>;

/** CSS properties that can be overridden via applyOverride. */
export declare const ALLOWED_CSS_PROPERTIES: Set<string>;

/** Regex matching unsafe CSS values (expression(), url(), @import, etc). */
export declare const CSS_VALUE_UNSAFE: RegExp;

/** CSS properties that require token values (not arbitrary pixels). */
export declare const TOKEN_CONSTRAINED_PROPERTIES: Set<string>;

/** Valid spacing token names. */
export declare const SPACING_TOKENS: string[];

/** Valid radius token names. */
export declare const RADIUS_TOKENS: string[];

/** Result of applyOverride — either success or a typed error. */
export type ApplyOverrideResult =
  | { ok: true }
  | { ok: false; error: 'unknown-property' | 'unsafe-value' | 'token-required' | 'unknown-element' | 'invalid-input' };

/** CSS rules object: { selector: { property: value, ... }, ... } */
export type OverrideRules = Record<string, Record<string, string>>;

/** Parse CSS text into a rules object. Handles @media/@supports nesting. */
export declare function parseOverrideRules(cssText: string): OverrideRules;

/** Serialize a rules object back to CSS text. */
export declare function buildOverrideCSS(rules: OverrideRules): string;

/** Runtime selection shape produced by the click handler. */
export interface Selection {
  id: number;
  timestamp: number;
  testId: string | null;
  componentChain: string[];
  hasClientFiber: boolean;
  elementType: ElementCategory;
  element: {
    tag: string;
    classes: string[];
    text: string;
    bounds: { top: number; left: number; width: number; height: number };
  };
  styles: {
    color: string;
    background: string;
    fontSize: string;
    padding: string;
    margin: string;
    display: string;
    gap: string;
    borderRadius: string;
    fontWeight: string;
    fontFamily: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
  };
  origins: Partial<Record<'padding' | 'margin' | 'gap' | 'borderRadius', import('./toolbar.js').StyleOrigin>>;
}

/** Shape of the window.__ZEROFOG__ runtime namespace. */
export interface ZerofogGlobal {
  activateInspector: () => void;
  deactivateInspector: () => void;
  pauseInspector: () => void;
  discardOverrides: () => void;
  buildSelector: (element: Element) => string;
  applyOverride: (elementId: number, cssProperty: string, cssValue: string) => ApplyOverrideResult;
  removeOverride: (elementId: number, cssProperty: string) => void;
  overrideRules: OverrideRules;
  selected: Selection | null;
  inspectorActive: boolean;
  selectMode: boolean;
  elementMap: Record<string, Element>;
  /** Internal: prune callback reference for pushState sentinel pattern. */
  _pruneCallback: (() => void) | null;
}

declare global {
  interface Window {
    __ZEROFOG__?: ZerofogGlobal;
  }
}
