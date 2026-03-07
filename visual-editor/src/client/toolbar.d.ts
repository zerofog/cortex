/** px-string → token-name maps for spacing and radius. */
export interface TokenMaps {
  spacing: Record<string, string>;
  radius: Record<string, string>;
}

/** Discriminated union for style origin detection results. */
export type StyleOrigin =
  | { origin: 'mantine-prop'; prop: string; value: unknown; component: string }
  | { origin: 'mantine-default'; component: string; defaultValue: unknown }
  | { origin: 'tailwind'; className: string }
  | { origin: 'css-module' }
  | { origin: 'unknown' };

/** A single style change entry with full origin context for finalization. */
export interface ChangeEntry {
  property: string;
  token: string;
  previousToken: string | null;
  previousCssValue: string;
  cssProperty: string;
  cssValue: string;
  styleOrigin: StyleOrigin;
}

/** Result of finalizeDiff — accumulated style changes for an element. */
export interface DiffResult {
  elementSelector: string;
  selector?: string;
  componentChain: string[];
  elementType: string;
  changes: ChangeEntry[];
  timestamp: string;
}

/** Token size names for spacing properties. */
export declare const TOOLBAR_SIZES: string[];

/** Token size names for border-radius. */
export declare const RADIUS_SIZES: string[];

/** Build px→token maps using a sentinel element and CSS variable resolution. */
export declare function buildTokenMaps(
  styleGetter?: (el: Element) => { paddingTop: string; borderTopLeftRadius: string },
): TokenMaps;

/** Reverse lookup: px value → token name. Returns null if not found. */
export declare function reverseTokenLookup(
  maps: TokenMaps,
  category: 'spacing' | 'radius',
  pxValue: string,
): string | null;

/** Detect the origin of a CSS property value on an element. */
export declare function detectStyleOrigin(
  element: Record<string, unknown>,
  property: 'padding' | 'margin' | 'gap' | 'borderRadius',
  findFiberKeysFn?: (el: Record<string, unknown>) => string[],
  themeDefaults?: Record<string, Record<string, unknown>>,
): StyleOrigin;

/** Finalize accumulated changes into a diff object. */
export declare function finalizeDiff(
  selection: { testId?: string | null; componentChain?: string[]; elementType?: string },
  changes: ChangeEntry[],
  _now?: Date,
  selector?: string,
): DiffResult;

/** Find __reactFiber$ keys on a DOM element. */
export declare function findReactFiberKeys(element: Record<string, unknown>): string[];
