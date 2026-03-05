/**
 * Panel state management — types, constants, and pure reducer.
 *
 * All state transitions are handled by panelReducer. Side effects
 * (postMessage, WS sends) are handled by the component layer after dispatch.
 *
 * H8: Framework hardcoding constraint
 * Token resolution (resolveTokenToCssValue, VAR_PREFIX) is Mantine-specific.
 * ELEMENT_TYPE_CATEGORIES maps to Mantine component names. Multi-framework
 * support is planned in the native rendering overrides spec (2026-03-01).
 * When adding framework support, parameterize VAR_PREFIX and token resolution
 * based on detected framework (e.g. Tailwind uses class swaps, not CSS vars).
 */

import type { TokenMaps, StyleOrigin, ChangeEntry } from './toolbar.js';

// ── Types ────────────────────────────────────────────────────────

export type { TokenMaps, StyleOrigin };

export interface SelectionPayload {
  id: number;
  timestamp: number;
  testId: string | null;
  componentChain: string[];
  hasClientFiber: boolean;
  elementType: string;
  element: {
    tag: string;
    classes: string[];
    text: string;
    bounds: { top: number; left: number; width: number; height: number };
  };
  styles: Record<string, string>;
  origins: Record<string, StyleOrigin>;
}

/** Alias for ChangeEntry — deduplicated to prevent structural drift. */
export type PendingChange = ChangeEntry;

export interface UndoEntry {
  property: string;
  previousToken: string | null;
  previousCssValue: string;
}

export interface PanelState {
  mode: 'browse' | 'select';
  selection: SelectionPayload | null;
  origins: Record<string, StyleOrigin> | null;
  tokenMaps: TokenMaps | null;
  activeTokens: Record<string, string | null>;
  pendingChanges: PendingChange[];
  undoStack: UndoEntry[];
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  pipelineStatus: string | null;
}

export type PanelAction =
  | { type: 'SET_MODE'; mode: 'browse' | 'select' }
  | { type: 'ELEMENT_SELECTED'; selection: SelectionPayload; origins: Record<string, StyleOrigin> }
  | { type: 'ELEMENT_DESELECTED' }
  | { type: 'APPLY_CHANGE'; property: string; token: string; cssProperty: string; cssValue: string; styleOrigin: StyleOrigin }
  | { type: 'UNDO' }
  | { type: 'DISCARD_ALL' }
  | { type: 'TOKEN_MAPS_LOADED'; tokenMaps: TokenMaps }
  | { type: 'WS_STATUS'; status: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'FINALIZE_START' }
  | { type: 'FINALIZE_QUEUED' }
  | { type: 'FINALIZE_SUCCESS' }
  | { type: 'FINALIZE_TIMEOUT' }
  | { type: 'FINALIZE_ERROR'; error: string };

// ── Constants ────────────────────────────────────────────────────

/** Which property sections to show per element type. */
export const ELEMENT_TYPE_CATEGORIES: Record<string, string[]> = {
  icon: [],
  text: ['margin'],
  interactive: ['padding', 'borderRadius'],
  container: ['padding', 'margin', 'gap', 'borderRadius'],
  input: ['borderRadius'],
  feedback: ['borderRadius'],
  layout: ['gap', 'padding'],
  unknown: ['padding', 'margin', 'gap', 'borderRadius'],
};

/** Per-side CSS property names for spacing properties. */
export const PER_SIDE_MAP: Record<string, string[]> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
};

/**
 * Maps per-side CSS properties to their origin category key.
 * Derived from PER_SIDE_MAP to avoid hand-duplicating the same property list.
 * Only includes properties that VAR_PREFIX can resolve — adding entries here
 * without a corresponding VAR_PREFIX entry causes silent live-preview failures.
 */
export const PROPERTY_TO_ORIGIN_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PER_SIDE_MAP).flatMap(([category, props]) =>
    props.map(prop => [prop, category]),
  ),
);

/** Look up origin for a property, falling back to category key. */
const UNKNOWN_ORIGIN: StyleOrigin = { origin: 'unknown' };

export function getOriginForProperty(
  property: string,
  origins: Record<string, StyleOrigin> | null,
): StyleOrigin {
  if (!origins) return UNKNOWN_ORIGIN;
  if (origins[property]) return origins[property];
  const category = PROPERTY_TO_ORIGIN_KEY[property];
  if (category && origins[category]) return origins[category];
  return UNKNOWN_ORIGIN;
}

export const SPACING_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
export const RADIUS_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

/** CSS variable prefix lookup — maps CSS property names to their Mantine var prefix. */
const BASE_VAR_PREFIX: Record<string, string> = {
  padding: '--mantine-spacing-',
  margin: '--mantine-spacing-',
  gap: '--mantine-spacing-',
  borderRadius: '--mantine-radius-',
};

/** Derived: per-side properties inherit their parent's var prefix. */
const VAR_PREFIX: Record<string, string> = {
  ...BASE_VAR_PREFIX,
  ...Object.fromEntries(
    Object.entries(PER_SIDE_MAP).flatMap(([category, props]) => {
      const prefix = BASE_VAR_PREFIX[category];
      return prefix ? props.map(prop => [prop, prefix]) : [];
    }),
  ),
};

// ── Token resolution ─────────────────────────────────────────────

/** Origins that resolve correctly via Mantine CSS var() references. */
const MANTINE_COMPATIBLE_ORIGINS = new Set(['mantine-prop', 'mantine-default', 'unknown']);

/**
 * Resolve a token name to a CSS value for live preview.
 *
 * Origin-aware: accepts an optional StyleOrigin so the resolution strategy
 * can vary per framework. For v1 all origins resolve to Mantine CSS vars
 * because the inspector applies overrides as inline styles with !important,
 * and Mantine apps have --mantine-spacing-* on :root.
 *
 * V1 constraint: Only Mantine is supported. Non-Mantine origins will still
 * get var() values, which may resolve to initial values (likely 0) in apps
 * without Mantine CSS custom properties. Multi-framework support is planned
 * in the native rendering overrides spec (2026-03-01).
 *
 * When Tailwind native class swap lands, the 'tailwind' branch will produce
 * the computed px value (read from token maps) instead of a var() reference,
 * since Tailwind apps won't have Mantine CSS custom properties defined.
 */
export function resolveTokenToCssValue(
  cssProperty: string,
  token: string,
  origin?: StyleOrigin,
): string {
  if (origin && !MANTINE_COMPATIBLE_ORIGINS.has(origin.origin)) {
    console.warn(`[cortex] Non-Mantine origin "${origin.origin}" detected for ${cssProperty}. Live preview may be inaccurate.`);
  }
  if (token.startsWith('var(--')) return token;

  const prefix = VAR_PREFIX[cssProperty];
  if (!prefix) return token;
  return `var(${prefix}${token})`;
}

// ── Helpers ──────────────────────────────────────────────────────

function deriveActiveTokens(
  styles: Record<string, string>,
  tokenMaps: TokenMaps | null,
): Record<string, string | null> {
  if (!tokenMaps) return {};
  const tokens: Record<string, string | null> = {};

  for (const [prop, value] of Object.entries(styles)) {
    const isRadius = prop === 'borderRadius';
    const map = isRadius ? tokenMaps.radius : tokenMaps.spacing;
    tokens[prop] = map[value] ?? null;
  }

  return tokens;
}

// ── Initial state ────────────────────────────────────────────────

export const initialPanelState: PanelState = {
  mode: 'browse',
  selection: null,
  origins: null,
  tokenMaps: null,
  activeTokens: {},
  pendingChanges: [],
  undoStack: [],
  wsStatus: 'disconnected',
  pipelineStatus: null,
};

// ── Reducer ──────────────────────────────────────────────────────

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'ELEMENT_SELECTED': {
      const activeTokens = deriveActiveTokens(action.selection.styles, state.tokenMaps);
      return {
        ...state,
        selection: action.selection,
        origins: action.origins,
        activeTokens,
        pendingChanges: [],
        undoStack: [],
      };
    }

    case 'ELEMENT_DESELECTED':
      return { ...state, selection: null, origins: null, activeTokens: {} };

    case 'APPLY_CHANGE': {
      const currentToken = state.activeTokens[action.property] ?? null;
      const currentCssValue = state.selection?.styles[action.property] ?? '';

      const undoEntry: UndoEntry = {
        property: action.property,
        previousToken: currentToken,
        previousCssValue: currentCssValue,
      };

      const existing = state.pendingChanges.findIndex(c => c.property === action.property);
      let pendingChanges: PendingChange[];
      const change: PendingChange = {
        property: action.property,
        token: action.token,
        previousToken: currentToken,
        previousCssValue: currentCssValue,
        cssProperty: action.cssProperty,
        cssValue: action.cssValue,
        styleOrigin: action.styleOrigin,
      };

      if (existing >= 0) {
        pendingChanges = [...state.pendingChanges];
        pendingChanges[existing] = change;
      } else {
        pendingChanges = [...state.pendingChanges, change];
      }

      return {
        ...state,
        pendingChanges,
        undoStack: [...state.undoStack, undoEntry].slice(-100),
        activeTokens: { ...state.activeTokens, [action.property]: action.token },
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const stack = [...state.undoStack];
      const entry = stack.pop()!;

      // Revert activeTokens
      const activeTokens = { ...state.activeTokens, [entry.property]: entry.previousToken };

      // Revert pending changes: if previousToken matches original derived token, remove the change
      const originalToken = state.selection
        ? deriveActiveTokens(state.selection.styles, state.tokenMaps)[entry.property] ?? null
        : null;

      let pendingChanges: PendingChange[];
      if (entry.previousToken === originalToken) {
        pendingChanges = state.pendingChanges.filter(c => c.property !== entry.property);
      } else {
        // Update the pending change to the previous token
        pendingChanges = state.pendingChanges.map(c => {
          if (c.property !== entry.property) return c;
          return { ...c, token: entry.previousToken ?? '', cssValue: entry.previousCssValue };
        });
      }

      return { ...state, undoStack: stack, activeTokens, pendingChanges };
    }

    case 'DISCARD_ALL': {
      const activeTokens = state.selection
        ? deriveActiveTokens(state.selection.styles, state.tokenMaps)
        : {};
      return { ...state, pendingChanges: [], undoStack: [], activeTokens };
    }

    case 'TOKEN_MAPS_LOADED':
      return { ...state, tokenMaps: action.tokenMaps };

    case 'WS_STATUS':
      return { ...state, wsStatus: action.status };

    case 'FINALIZE_START':
      return { ...state, pipelineStatus: 'sending' };

    case 'FINALIZE_QUEUED':
      // Server accepted diff — processing in progress. Keep changes for recovery.
      return { ...state, pipelineStatus: 'processing' };

    case 'FINALIZE_SUCCESS':
      // edit-complete received — source code actually changed. Safe to clear.
      return { ...state, pipelineStatus: 'applied', pendingChanges: [], undoStack: [] };

    case 'FINALIZE_TIMEOUT':
      // Processing timed out — preserve changes for retry.
      return { ...state, pipelineStatus: 'timeout' };

    case 'FINALIZE_ERROR':
      return { ...state, pipelineStatus: `error: ${action.error}` };

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}
