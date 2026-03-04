import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/preact';
import { h } from 'preact';
import {
  PanelHeader,
  ModeToggle,
  SelectionInfo,
  PropertySections,
  SpacingControl,
  TokenRow,
  ChangeList,
  ActionBar,
  StatusBar,
} from '../../src/client/panel-components.js';
import type { PendingChange } from '../../src/client/panel-state.js';
import { makeSelection } from './helpers.js';

// ── PanelHeader ──────────────────────────────────────────────────

describe('PanelHeader', () => {
  it('renders title and connection dot', () => {
    const { container } = render(h(PanelHeader, { wsStatus: 'connected' }));
    expect(container.querySelector('h2')?.textContent).toBe('Cortex');
    expect(container.querySelector('.connection-dot')?.getAttribute('data-status')).toBe('connected');
  });

  it('reflects disconnected status', () => {
    const { container } = render(h(PanelHeader, { wsStatus: 'disconnected' }));
    expect(container.querySelector('.connection-dot')?.getAttribute('data-status')).toBe('disconnected');
  });
});

// ── ModeToggle ───────────────────────────────────────────────────

describe('ModeToggle', () => {
  it('highlights active mode button', () => {
    const { container } = render(h(ModeToggle, { mode: 'select', onModeChange: () => {} }));
    const buttons = container.querySelectorAll('.mode-btn');
    expect(buttons[0]?.getAttribute('data-active')).toBe('false');
    expect(buttons[1]?.getAttribute('data-active')).toBe('true');
  });

  it('calls onModeChange when clicking a mode button', () => {
    const handler = vi.fn();
    const { container } = render(h(ModeToggle, { mode: 'browse', onModeChange: handler }));
    const selectBtn = container.querySelectorAll('.mode-btn')[1]!;
    fireEvent.click(selectBtn);
    expect(handler).toHaveBeenCalledWith('select');
  });
});

// ── SelectionInfo ────────────────────────────────────────────────

describe('SelectionInfo', () => {
  it('shows empty state when no selection', () => {
    const { container } = render(h(SelectionInfo, { selection: null }));
    expect(container.querySelector('.selection-empty')).toBeTruthy();
  });

  it('shows element info when selected', () => {
    const sel = makeSelection();
    const { container } = render(h(SelectionInfo, { selection: sel }));
    expect(container.querySelector('.selection-tag')?.textContent).toContain('div');
    expect(container.querySelector('.selection-component')?.textContent).toContain('Card');
    expect(container.querySelector('.selection-testid')?.textContent).toContain('card-root');
  });

  it('hides testId line when no testId', () => {
    const sel = makeSelection({ testId: null });
    const { container } = render(h(SelectionInfo, { selection: sel }));
    expect(container.querySelector('.selection-testid')).toBeNull();
  });
});

// ── TokenRow ─────────────────────────────────────────────────────

describe('TokenRow', () => {
  it('renders token buttons with correct labels', () => {
    const tokens = ['xs', 'sm', 'md', 'lg', 'xl'];
    const { container } = render(h(TokenRow, { tokens, activeToken: null, changedToken: null, onSelect: () => {} }));
    const buttons = container.querySelectorAll('.token-btn');
    expect(buttons).toHaveLength(5);
    expect(buttons[0]?.textContent).toBe('xs');
  });

  it('marks active token with data-state="active"', () => {
    const tokens = ['xs', 'sm', 'md'];
    const { container } = render(h(TokenRow, { tokens, activeToken: 'sm', changedToken: null, onSelect: () => {} }));
    const buttons = container.querySelectorAll('.token-btn');
    expect(buttons[1]?.getAttribute('data-state')).toBe('active');
  });

  it('marks changed token with data-state="changed"', () => {
    const tokens = ['xs', 'sm', 'md'];
    const { container } = render(h(TokenRow, { tokens, activeToken: 'sm', changedToken: 'md', onSelect: () => {} }));
    const buttons = container.querySelectorAll('.token-btn');
    expect(buttons[2]?.getAttribute('data-state')).toBe('changed');
    // Active token is now "not changed, not current active" since changed overrides
    expect(buttons[1]?.getAttribute('data-state')).toBe('active');
  });

  it('calls onSelect with token name when clicked', () => {
    const handler = vi.fn();
    const tokens = ['xs', 'sm', 'md'];
    const { container } = render(h(TokenRow, { tokens, activeToken: null, changedToken: null, onSelect: handler }));
    fireEvent.click(container.querySelectorAll('.token-btn')[1]!);
    expect(handler).toHaveBeenCalledWith('sm');
  });
});

// ── SpacingControl ───────────────────────────────────────────────

describe('SpacingControl', () => {
  it('defaults to all-sides mode with one token row', () => {
    const { container } = render(h(SpacingControl, {
      property: 'padding',
      activeTokens: { padding: 'md' },
      pendingChanges: [],
      onTokenSelect: () => {},
    }));
    const rows = container.querySelectorAll('.token-row');
    expect(rows).toHaveLength(1);
  });

  it('switches to per-side mode showing 4 token rows', () => {
    const { container } = render(h(SpacingControl, {
      property: 'padding',
      activeTokens: { paddingTop: 'md', paddingRight: 'md', paddingBottom: 'md', paddingLeft: 'md' },
      pendingChanges: [],
      onTokenSelect: () => {},
    }));
    // Click per-side button
    const perSideBtn = container.querySelectorAll('.spacing-mode-btn')[1]!;
    fireEvent.click(perSideBtn);
    const rows = container.querySelectorAll('.token-row');
    expect(rows).toHaveLength(4);
  });
});

// ── ChangeList ───────────────────────────────────────────────────

describe('ChangeList', () => {
  it('does not render when no changes', () => {
    const { container } = render(h(ChangeList, { changes: [], onUndo: () => {} }));
    expect(container.querySelector('.change-list')).toBeNull();
  });

  it('renders change items with single "Undo Last" button (M2)', () => {
    const changes: PendingChange[] = [
      { property: 'padding', token: 'lg', previousToken: 'md', previousCssValue: '16px', cssProperty: 'padding', cssValue: 'var(--mantine-spacing-lg)', styleOrigin: { origin: 'unknown' } },
      { property: 'gap', token: 'sm', previousToken: 'xs', previousCssValue: '4px', cssProperty: 'gap', cssValue: 'var(--mantine-spacing-sm)', styleOrigin: { origin: 'unknown' } },
    ];
    const handler = vi.fn();
    const { container } = render(h(ChangeList, { changes, onUndo: handler }));
    expect(container.querySelectorAll('.change-item')).toHaveLength(2);
    // Single undo button at list level, not per item
    const undoButtons = container.querySelectorAll('.change-undo-btn');
    expect(undoButtons).toHaveLength(1);
    expect(undoButtons[0]?.textContent).toBe('Undo Last');
    fireEvent.click(undoButtons[0]!);
    expect(handler).toHaveBeenCalled();
  });
});

// ── ActionBar ────────────────────────────────────────────────────

describe('ActionBar', () => {
  it('disables Apply when no changes', () => {
    const { container } = render(h(ActionBar, {
      hasChanges: false, wsConnected: true, onDiscard: () => {}, onApply: () => {},
    }));
    const applyBtn = container.querySelector('.action-btn-primary') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it('disables Apply when WS disconnected', () => {
    const { container } = render(h(ActionBar, {
      hasChanges: true, wsConnected: false, onDiscard: () => {}, onApply: () => {},
    }));
    const applyBtn = container.querySelector('.action-btn-primary') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it('enables Apply when changes exist and WS connected', () => {
    const { container } = render(h(ActionBar, {
      hasChanges: true, wsConnected: true, onDiscard: () => {}, onApply: () => {},
    }));
    const applyBtn = container.querySelector('.action-btn-primary') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
  });

  it('calls onApply when Apply button clicked', () => {
    const handler = vi.fn();
    const { container } = render(h(ActionBar, {
      hasChanges: true, wsConnected: true, onDiscard: () => {}, onApply: handler,
    }));
    fireEvent.click(container.querySelector('.action-btn-primary')!);
    expect(handler).toHaveBeenCalled();
  });
});

// ── StatusBar ────────────────────────────────────────────────────

describe('StatusBar', () => {
  it('shows connected status', () => {
    const { container } = render(h(StatusBar, { wsStatus: 'connected', pipelineStatus: null }));
    expect(container.querySelector('.status-dot')?.getAttribute('data-status')).toBe('connected');
    expect(container.textContent).toContain('Connected');
  });

  it('shows pipeline status when present', () => {
    const { container } = render(h(StatusBar, { wsStatus: 'connected', pipelineStatus: 'sending' }));
    expect(container.textContent).toContain('sending');
  });
});
