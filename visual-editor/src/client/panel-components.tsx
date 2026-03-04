/**
 * Panel Preact components — all UI elements for the editing panel.
 *
 * Components are stateless (receive props from PanelRoot's useReducer)
 * except SpacingControl which has local state for all/per-side toggle.
 */

import { h, type FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import {
  ELEMENT_TYPE_CATEGORIES,
  PER_SIDE_MAP,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  type SelectionPayload,
  type PendingChange,
} from './panel-state.js';

// ── PanelHeader ──────────────────────────────────────────────────

export interface PanelHeaderProps {
  wsStatus: 'connecting' | 'connected' | 'disconnected';
}

export const PanelHeader: FunctionComponent<PanelHeaderProps> = ({ wsStatus }) => (
  <div class="panel-header">
    <h2>Cortex</h2>
    <div class="connection-dot" data-status={wsStatus} />
  </div>
);

// ── ModeToggle ───────────────────────────────────────────────────

export interface ModeToggleProps {
  mode: 'browse' | 'select';
  onModeChange: (mode: 'browse' | 'select') => void;
}

export const ModeToggle: FunctionComponent<ModeToggleProps> = ({ mode, onModeChange }) => (
  <fieldset class="mode-toggle" role="radiogroup" aria-label="Interaction mode">
    <button
      class="mode-btn"
      data-active={String(mode === 'browse')}
      role="radio"
      aria-checked={mode === 'browse'}
      onClick={() => onModeChange('browse')}
    >
      Browse
    </button>
    <button
      class="mode-btn"
      data-active={String(mode === 'select')}
      role="radio"
      aria-checked={mode === 'select'}
      onClick={() => onModeChange('select')}
    >
      Select Element
    </button>
  </fieldset>
);

// ── SelectionInfo ────────────────────────────────────────────────

export interface SelectionInfoProps {
  selection: SelectionPayload | null;
}

export const SelectionInfo: FunctionComponent<SelectionInfoProps> = ({ selection }) => {
  if (!selection) {
    return <div class="selection-empty">Click "Select Element" then click an element in the preview</div>;
  }

  return (
    <div class="selection-info">
      <div class="selection-tag">&lt;{selection.element.tag.toLowerCase()}&gt;</div>
      {selection.componentChain.length > 0 && (
        <div class="selection-component">{selection.componentChain.join(' › ')}</div>
      )}
      {selection.testId && (
        <div class="selection-testid">[{selection.testId}]</div>
      )}
    </div>
  );
};

// ── TokenRow ─────────────────────────────────────────────────────

export interface TokenRowProps {
  tokens: readonly string[];
  activeToken: string | null;
  changedToken: string | null;
  onSelect: (token: string) => void;
}

export const TokenRow: FunctionComponent<TokenRowProps> = ({ tokens, activeToken, changedToken, onSelect }) => (
  <div class="token-row" role="radiogroup">
    {tokens.map(token => {
      let state = 'default';
      if (changedToken === token) state = 'changed';
      else if (activeToken === token) state = 'active';
      const isChecked = changedToken === token || (changedToken === null && activeToken === token);
      return (
        <button
          key={token}
          class="token-btn"
          data-state={state}
          role="radio"
          aria-checked={isChecked}
          onClick={() => onSelect(token)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(token);
            }
          }}
        >
          {token}
        </button>
      );
    })}
  </div>
);

// ── SpacingControl ───────────────────────────────────────────────

export interface SpacingControlProps {
  property: string;
  activeTokens: Record<string, string | null>;
  pendingChanges: PendingChange[];
  onTokenSelect: (property: string, token: string) => void;
}

const SIDE_LABELS: Record<string, string> = {
  paddingTop: 'T', paddingRight: 'R', paddingBottom: 'B', paddingLeft: 'L',
  marginTop: 'T', marginRight: 'R', marginBottom: 'B', marginLeft: 'L',
};

export const SpacingControl: FunctionComponent<SpacingControlProps> = ({
  property,
  activeTokens,
  pendingChanges,
  onTokenSelect,
}) => {
  const [perSide, setPerSide] = useState(false);
  const sides = PER_SIDE_MAP[property];
  const isSpacing = !!sides;
  const tokens = property === 'border-radius' || property === 'borderRadius'
    ? RADIUS_TOKENS
    : SPACING_TOKENS;

  const changedTokenFor = (prop: string): string | null => {
    const change = pendingChanges.find(c => c.property === prop);
    return change?.token ?? null;
  };

  if (!isSpacing || !perSide) {
    // All-sides mode (or non-spacing property like gap, borderRadius)
    const activeProp = property === 'border-radius' ? 'borderRadius' : property;
    return (
      <div class="spacing-control">
        {isSpacing && (
          <div class="spacing-mode-toggle">
            <button class="spacing-mode-btn" data-active={String(!perSide)} onClick={() => setPerSide(false)}>All</button>
            <button class="spacing-mode-btn" data-active={String(perSide)} onClick={() => setPerSide(true)}>Per-side</button>
          </div>
        )}
        <TokenRow
          tokens={tokens}
          activeToken={activeTokens[activeProp] ?? null}
          changedToken={changedTokenFor(activeProp)}
          onSelect={(token) => onTokenSelect(activeProp, token)}
        />
      </div>
    );
  }

  // Per-side mode
  return (
    <div class="spacing-control">
      <div class="spacing-mode-toggle">
        <button class="spacing-mode-btn" data-active={String(!perSide)} onClick={() => setPerSide(false)}>All</button>
        <button class="spacing-mode-btn" data-active={String(perSide)} onClick={() => setPerSide(true)}>Per-side</button>
      </div>
      {sides.map(sideProp => (
        <div key={sideProp} class="per-side-row">
          <span class="per-side-label">{SIDE_LABELS[sideProp] ?? ''}</span>
          <TokenRow
            tokens={tokens}
            activeToken={activeTokens[sideProp] ?? null}
            changedToken={changedTokenFor(sideProp)}
            onSelect={(token) => onTokenSelect(sideProp, token)}
          />
        </div>
      ))}
    </div>
  );
};

// ── Section ──────────────────────────────────────────────────────

export interface SectionProps {
  title: string;
  children: preact.ComponentChildren;
}

export const Section: FunctionComponent<SectionProps> = ({ title, children }) => (
  <details class="section" open>
    <summary>{title}</summary>
    <div class="section-content">{children}</div>
  </details>
);

// ── PropertySections ─────────────────────────────────────────────

export interface PropertySectionsProps {
  elementType: string;
  activeTokens: Record<string, string | null>;
  pendingChanges: PendingChange[];
  tokenMaps: unknown | null;
  onTokenSelect: (property: string, token: string) => void;
}

const SECTION_TITLES: Record<string, string> = {
  'padding': 'Padding',
  'margin': 'Margin',
  'gap': 'Gap',
  'border-radius': 'Border Radius',
};

export const PropertySections: FunctionComponent<PropertySectionsProps> = ({
  elementType,
  activeTokens,
  pendingChanges,
  tokenMaps,
  onTokenSelect,
}) => {
  const categories = ELEMENT_TYPE_CATEGORIES[elementType] ?? ELEMENT_TYPE_CATEGORIES['unknown'] ?? [];
  if (categories.length === 0) return null;

  if (tokenMaps === null) {
    return <div class="token-loading">Loading design tokens...</div>;
  }

  return (
    <div>
      {categories.map((category: string) => (
        <Section key={category} title={SECTION_TITLES[category] ?? category}>
          <SpacingControl
            property={category}
            activeTokens={activeTokens}
            pendingChanges={pendingChanges}
            onTokenSelect={onTokenSelect}
          />
        </Section>
      ))}
    </div>
  );
};

// ── ChangeList ───────────────────────────────────────────────────

export interface ChangeListProps {
  changes: PendingChange[];
  onUndo: (property: string) => void;
}

export const ChangeList: FunctionComponent<ChangeListProps> = ({ changes, onUndo }) => {
  if (changes.length === 0) return null;

  return (
    <div class="change-list">
      <div class="change-list-title">Pending Changes ({changes.length})</div>
      {changes.map(change => (
        <div key={change.property} class="change-item">
          <span class="change-item-label">{change.property}</span>
          <span class="change-item-value">{change.token}</span>
          <button class="change-undo-btn" onClick={() => onUndo(change.property)}>undo</button>
        </div>
      ))}
    </div>
  );
};

// ── ActionBar ────────────────────────────────────────────────────

export interface ActionBarProps {
  hasChanges: boolean;
  wsConnected: boolean;
  pipelineStatus: string | null;
  onDiscard: () => void;
  onApply: () => void;
}

export const ActionBar: FunctionComponent<ActionBarProps> = ({ hasChanges, wsConnected, pipelineStatus, onDiscard, onApply }) => {
  const isSending = pipelineStatus === 'sending';
  const isError = pipelineStatus !== null && pipelineStatus.startsWith('error:');
  const buttonLabel = isSending ? 'Applying...' : isError ? 'Retry' : 'Apply to Code';

  return (
    <div class="action-bar">
      {isError && (
        <div class="action-error">{pipelineStatus!.replace(/^error:\s*/, '')}</div>
      )}
      <button class="action-btn" onClick={onDiscard} disabled={!hasChanges}>
        Discard All
      </button>
      <button
        class="action-btn action-btn-primary"
        onClick={onApply}
        disabled={!hasChanges || !wsConnected || isSending}
      >
        {buttonLabel}
      </button>
    </div>
  );
};

// ── StatusBar ────────────────────────────────────────────────────

export interface StatusBarProps {
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  pipelineStatus: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
};

export const StatusBar: FunctionComponent<StatusBarProps> = ({ wsStatus, pipelineStatus }) => (
  <div class="status-bar">
    <div class="status-dot" data-status={wsStatus} />
    <span>{STATUS_LABELS[wsStatus] ?? wsStatus}</span>
    {pipelineStatus && <span> · {pipelineStatus}</span>}
  </div>
);
