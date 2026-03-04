/**
 * Panel state management — types, constants, and pure reducer.
 *
 * All state transitions are handled by panelReducer. Side effects
 * (postMessage, WS sends) are handled by the component layer after dispatch.
 */

import { TOOLBAR_SIZES, RADIUS_SIZES, reverseTokenLookup } from './toolbar.js';
import type { TokenMaps, StyleOrigin } from './toolbar.js';

// ── Types ────────────────────────────────────────────────────────

export type { TokenMaps, StyleOrigin };

export type WsStatus = 'connecting' | 'connected' | 'disconnected';
export type InteractionMode = 'browse' | 'select';

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

export interface PendingChange {
  property: string;
  token: string;
  previousToken: string | null;
  previousCssValue: string;
  cssProperty: string;
  cssValue: string;
  styleOrigin: StyleOrigin;
}

export interface UndoEntry {
  property: string;
  previousToken: string | null;
  previousCssValue: string;
}

export interface PanelState {
  mode: InteractionMode;
  selection: SelectionPayload | null;
  tokenMaps: TokenMaps | null;
  activeTokens: Record<string, string | null>;
  originalTokens: Record<string, string | null>;
  pendingChanges: PendingChange[];
  undoStack: UndoEntry[];
  wsStatus: WsStatus;
  pipelineStatus: string | null;
}

export type PanelAction =
  | { type: 'SET_MODE'; mode: InteractionMode }
  | { type: 'ELEMENT_SELECTED'; selection: SelectionPayload }
  | { type: 'ELEMENT_DESELECTED' }
  | { type: 'APPLY_CHANGE'; property: string; token: string; cssProperty: string; cssValue: string; styleOrigin: StyleOrigin }
  | { type: 'UNDO' }
  | { type: 'UNDO_PROPERTY'; property: string }
  | { type: 'DISCARD_ALL' }
  | { type: 'TOKEN_MAPS_LOADED'; tokenMaps: TokenMaps }
  | { type: 'WS_STATUS'; status: WsStatus }
  | { type: 'FINALIZE_START' }
  | { type: 'FINALIZE_SUCCESS' }
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

export const SPACING_TOKENS = TOOLBAR_SIZES;
export const RADIUS_TOKENS = RADIUS_SIZES;

export const MAX_UNDO_STACK = 50;

/** CSS variable prefix lookup — maps CSS property names to their Mantine var prefix. */
const VAR_PREFIX: Record<string, string> = {
  padding: '--mantine-spacing-',
  paddingTop: '--mantine-spacing-',
  paddingRight: '--mantine-spacing-',
  paddingBottom: '--mantine-spacing-',
  paddingLeft: '--mantine-spacing-',
  margin: '--mantine-spacing-',
  marginTop: '--mantine-spacing-',
  marginRight: '--mantine-spacing-',
  marginBottom: '--mantine-spacing-',
  marginLeft: '--mantine-spacing-',
  gap: '--mantine-spacing-',
  borderRadius: '--mantine-radius-',
};

// ── Token resolution ─────────────────────────────────────────────

/**
 * Resolve a token name to a CSS value for live preview.
 *
 * Origin-aware: accepts an optional StyleOrigin so the resolution strategy
 * can vary per framework. For v1 all origins resolve to Mantine CSS vars
 * because the inspector applies overrides as inline styles with !important,
 * and Mantine apps have --mantine-spacing-* on :root.
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
  if (token.startsWith('var(--')) return token;

  // TODO(v2): Tailwind origins need computed px values from token maps,
  // not Mantine CSS vars, since Tailwind apps lack --mantine-* custom properties.
  if (origin && 'origin' in origin && origin.origin === 'tailwind') {
    console.warn('[zerofog] Tailwind origin resolved to Mantine var — override may not render correctly');
  }

  const prefix = VAR_PREFIX[cssProperty];
  if (!prefix) return token;
  return `var(${prefix}${token})`;
}

/** Convert camelCase property name to kebab-case CSS property name. */
export function toKebabCase(prop: string): string {
  return prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

// ── Helpers ──────────────────────────────────────────────────────

function deriveActiveTokens(
  styles: Record<string, string>,
  tokenMaps: TokenMaps | null,
): Record<string, string | null> {
  if (!tokenMaps) return {};
  const tokens: Record<string, string | null> = {};

  for (const [prop, value] of Object.entries(styles)) {
    if (!(prop in VAR_PREFIX)) continue;
    const category = prop === 'borderRadius' ? 'radius' : 'spacing';
    tokens[prop] = reverseTokenLookup(tokenMaps, category, value);
  }

  return tokens;
}

// ── Initial state ────────────────────────────────────────────────

export const initialPanelState: PanelState = {
  mode: 'browse',
  selection: null,
  tokenMaps: null,
  activeTokens: {},
  originalTokens: {},
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
        activeTokens,
        originalTokens: activeTokens,
        pendingChanges: [],
        undoStack: [],
      };
    }

    case 'ELEMENT_DESELECTED':
      return {
        ...state,
        selection: null,
        activeTokens: {},
        originalTokens: {},
        pendingChanges: [],
        undoStack: [],
      };

    case 'APPLY_CHANGE': {
      const currentToken = state.activeTokens[action.property] ?? null;
      const existingChange = state.pendingChanges.find(c => c.property === action.property);
      // Record previous CSS value from the current override (if any), not from original styles
      const previousCssValue = existingChange?.cssValue ?? state.selection?.styles[action.property] ?? '';

      const undoEntry: UndoEntry = {
        property: action.property,
        previousToken: currentToken,
        previousCssValue,
      };

      const existingIdx = state.pendingChanges.findIndex(c => c.property === action.property);
      let pendingChanges: PendingChange[];
      const change: PendingChange = {
        property: action.property,
        token: action.token,
        previousToken: currentToken,
        previousCssValue,
        cssProperty: action.cssProperty,
        cssValue: action.cssValue,
        styleOrigin: action.styleOrigin,
      };

      if (existingIdx >= 0) {
        pendingChanges = [...state.pendingChanges];
        pendingChanges[existingIdx] = change;
      } else {
        pendingChanges = [...state.pendingChanges, change];
      }

      const newStack = [...state.undoStack, undoEntry];
      if (newStack.length > MAX_UNDO_STACK) newStack.shift();

      return {
        ...state,
        pendingChanges,
        undoStack: newStack,
        activeTokens: { ...state.activeTokens, [action.property]: action.token },
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const stack = [...state.undoStack];
      const entry = stack.pop()!;

      const activeTokens = { ...state.activeTokens, [entry.property]: entry.previousToken };
      const originalToken = state.originalTokens[entry.property] ?? null;

      let pendingChanges: PendingChange[];
      if (entry.previousToken === originalToken) {
        pendingChanges = state.pendingChanges.filter(c => c.property !== entry.property);
      } else {
        pendingChanges = state.pendingChanges.map(c => {
          if (c.property !== entry.property) return c;
          return { ...c, token: entry.previousToken ?? '', cssValue: entry.previousCssValue };
        });
      }

      return { ...state, undoStack: stack, activeTokens, pendingChanges };
    }

    case 'UNDO_PROPERTY': {
      const originalToken = state.originalTokens[action.property] ?? null;
      return {
        ...state,
        undoStack: state.undoStack.filter(e => e.property !== action.property),
        pendingChanges: state.pendingChanges.filter(c => c.property !== action.property),
        activeTokens: { ...state.activeTokens, [action.property]: originalToken },
      };
    }

    case 'DISCARD_ALL':
      return { ...state, pendingChanges: [], undoStack: [], activeTokens: { ...state.originalTokens }, pipelineStatus: null };

    case 'TOKEN_MAPS_LOADED':
      return { ...state, tokenMaps: action.tokenMaps };

    case 'WS_STATUS':
      return { ...state, wsStatus: action.status };

    case 'FINALIZE_START':
      return { ...state, pipelineStatus: 'sending' };

    case 'FINALIZE_SUCCESS':
      return { ...state, pipelineStatus: 'applied' };

    case 'FINALIZE_ERROR':
      return { ...state, pipelineStatus: `error: ${action.error}` };

    default:
      return state;
  }
}
