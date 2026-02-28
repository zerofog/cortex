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

/** Extract component display name from a fiber node. */
export declare function getComponentName(fiber: unknown): string | null;

/** Find __reactFiber$ keys on a DOM element. */
export declare function findReactFiberKeys(element: Record<string, unknown>): string[];

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
): ResolvedSource;

/** Classify an element by its component chain and tag name. */
export declare function classifyElement(
  componentChain: string[],
  tagName: string | null | undefined,
): ElementCategory;
