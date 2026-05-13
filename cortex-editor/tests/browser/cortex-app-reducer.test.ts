/**
 * Unit tests for cortex-app-reducer.ts.
 *
 * One describe per action type. All assertions synchronous — no mount, render,
 * or waitFor. Mirrors the selection-metadata.test.ts conventions.
 */

import { describe, it, expect } from 'vitest'
import {
  cortexAppReducer,
  initialCortexAppReducerState,
  MAX_ACTIVITY_ENTRIES,
} from '../../src/browser/cortex-app-reducer.js'
import type {
  CortexAppReducerState,
  CortexAppEffect,
  EditDispatchEntry,
} from '../../src/browser/cortex-app-reducer.js'
import type { Annotation, ActivityEntry, StyleCapability } from '../../src/adapters/types.js'
import type { OverrideDivergence, OverrideDivergenceDiagnostics } from '../../src/browser/override-bus.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectLogWarning(effect: CortexAppEffect): asserts effect is { type: 'log_warning'; message: string } {
  expect(effect.type).toBe('log_warning')
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    status: 'pending',
    elementSource: 'src/App.tsx:10:3',
    text: 'test',
    createdAt: 0,
    updatedAt: 0,
    thread: [],
    ...overrides,
  }
}

function makeActivityEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'entry-1',
    type: 'edit',
    timestamp: 0,
    description: 'test edit',
    ...overrides,
  }
}

function makeDivergence(overrides: Partial<OverrideDivergence> = {}): OverrideDivergence {
  const diagnostics: OverrideDivergenceDiagnostics = {
    actualReadFrom: 'computed-style',
    priorValues: [],
  }
  return {
    source: 'src/App.tsx:10:3',
    property: 'color',
    expected: 'red',
    actual: 'blue',
    diagnostics,
    ...overrides,
  }
}

function makeDispatch(overrides: Partial<EditDispatchEntry> = {}): EditDispatchEntry {
  return {
    source: 'src/App.tsx:10:3',
    property: 'color',
    value: 'red',
    ...overrides,
  }
}

const baseState = initialCortexAppReducerState

// ---------------------------------------------------------------------------
// cortex
// ---------------------------------------------------------------------------

describe('cortex action', () => {
  it('activates from inactive state', () => {
    const { state, effects } = cortexAppReducer(baseState, { type: 'cortex' })
    expect(state.active).toBe(true)
    expect(effects).toEqual([])
  })

  it('is idempotent when already active — returns same state reference', () => {
    const activeState: CortexAppReducerState = { ...baseState, active: true }
    const { state, effects } = cortexAppReducer(activeState, { type: 'cortex' })
    expect(state).toBe(activeState) // reference equality
    expect(effects).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// cortex-close
// ---------------------------------------------------------------------------

describe('cortex-close action', () => {
  it('emits invoke_exit when already inactive (idempotent — same reference)', () => {
    const { state, effects } = cortexAppReducer(baseState, { type: 'cortex-close' })
    expect(state).toBe(baseState) // no state change
    expect(effects).toEqual([{ type: 'invoke_exit' }])
  })

  it('deactivates panel and emits invoke_exit when currently active', () => {
    // C1 regression: this is the path that prevents close→reopen desync —
    // the reducer must flip active to false (not return same state) so
    // applyReducerState fires setActive(false) on the React side.
    const activeState: CortexAppReducerState = { ...baseState, active: true }
    const { state, effects } = cortexAppReducer(activeState, { type: 'cortex-close' })
    expect(state.active).toBe(false)
    expect(state).not.toBe(activeState)
    expect(effects).toEqual([{ type: 'invoke_exit' }])
  })
})

// ---------------------------------------------------------------------------
// cortex-toggle
// ---------------------------------------------------------------------------

describe('cortex-toggle action', () => {
  it('activates when active=true and panel is currently closed', () => {
    const { state, effects } = cortexAppReducer(baseState, { type: 'cortex-toggle', active: true })
    expect(state.active).toBe(true)
    expect(effects).toEqual([])
  })

  it('emits invoke_exit when active=false', () => {
    const { state, effects } = cortexAppReducer(baseState, { type: 'cortex-toggle', active: false })
    expect(state).toBe(baseState)
    expect(effects).toEqual([{ type: 'invoke_exit' }])
  })
})

// ---------------------------------------------------------------------------
// capabilities
// ---------------------------------------------------------------------------

describe('capabilities action', () => {
  const systems: StyleCapability[] = [
    { name: 'Tailwind', status: 'supported' },
    { name: 'CSS Modules', status: 'preview-only' },
    { name: 'CSS-in-JS', status: 'ai-required' },
  ]

  it('filters out supported systems and keeps unsupported ones', () => {
    const { state, effects } = cortexAppReducer(baseState, { type: 'capabilities', systems })
    expect(state.capabilitySystems).toHaveLength(2)
    expect(state.capabilitySystems.map(s => s.name)).toEqual(['CSS Modules', 'CSS-in-JS'])
    expect(effects).toEqual([])
  })

  it('produces empty array when all systems are supported', () => {
    const allSupported: StyleCapability[] = [
      { name: 'Tailwind', status: 'supported' },
    ]
    const { state } = cortexAppReducer(baseState, { type: 'capabilities', systems: allSupported })
    expect(state.capabilitySystems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// hello
// ---------------------------------------------------------------------------

describe('hello action', () => {
  it('replaces swatches/textComponents/colorChips with received values', () => {
    const { state, effects } = cortexAppReducer(baseState, {
      type: 'hello',
      swatches: ['#fff', '#000'],
      textComponents: [],
      colorChips: [{ name: 'primary', hex: '#123456' }],
    })
    expect(state.swatches).toEqual(['#fff', '#000'])
    expect(state.textComponents).toEqual([])
    expect(state.colorChips).toEqual([{ name: 'primary', hex: '#123456' }])
    expect(effects).toEqual([])
  })

  it('defaults undefined fields to empty arrays (not undefined)', () => {
    const { state } = cortexAppReducer(baseState, { type: 'hello' })
    expect(state.swatches).toEqual([])
    expect(state.textComponents).toEqual([])
    expect(state.colorChips).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// edit_status: done
// ---------------------------------------------------------------------------

describe('edit_status:done action', () => {
  it('increments activityCount and clears matching editError when dispatch present', () => {
    const dispatch = makeDispatch()
    const key = `${dispatch.source}\0${dispatch.property}`
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: dispatch.source, property: dispatch.property, value: dispatch.value, reason: 'oops' }]]),
    }
    const { state, effects } = cortexAppReducer(stateWithError, {
      type: 'edit_status',
      status: 'done',
      editId: 'edit-1',
      dispatch,
    })
    expect(state.activityCount).toBe(1)
    expect(state.editErrors.has(key)).toBe(false)
    expect(effects).toEqual([])
  })

  it('increments activityCount and does NOT clear errors when dispatch absent', () => {
    const key = 'src/App.tsx:10:3\0color'
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'oops' }]]),
    }
    const { state, effects } = cortexAppReducer(stateWithError, {
      type: 'edit_status',
      status: 'done',
      editId: 'edit-1',
    })
    expect(state.activityCount).toBe(1)
    expect(state.editErrors.has(key)).toBe(true) // untouched
    expect(effects).toEqual([])
  })

  it('I2 (ZF0-1363): returns same editErrors reference when dispatch key is absent', () => {
    // Verifies the bail-out added in I2: only allocate a new Map when the key
    // actually exists. Without the bail-out, every done with dispatch would
    // unconditionally create a new Map() even when nothing was deleted.
    const existingKey = 'src/Other.tsx:1:1\0color'
    const stateWithUnrelatedError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[existingKey, { source: 'src/Other.tsx:1:1', property: 'color', value: 'blue', reason: 'err' }]]),
    }
    const dispatch = makeDispatch({ source: 'src/App.tsx:10:3', property: 'font-size', value: '16px' })
    // The dispatch key (App.tsx\0font-size) is NOT in editErrors — bail-out must fire.
    const { state } = cortexAppReducer(stateWithUnrelatedError, {
      type: 'edit_status',
      status: 'done',
      editId: 'edit-bail',
      dispatch,
    })
    // Same reference proves no new Map was allocated.
    expect(state.editErrors).toBe(stateWithUnrelatedError.editErrors)
    // Activity counter still bumped
    expect(state.activityCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// edit_status: failed
// ---------------------------------------------------------------------------

describe('edit_status:failed action', () => {
  it('sets editError with reason ?? "Unknown error" when dispatch present', () => {
    const dispatch = makeDispatch()
    const key = `${dispatch.source}\0${dispatch.property}`
    const { state, effects } = cortexAppReducer(baseState, {
      type: 'edit_status',
      status: 'failed',
      editId: 'edit-1',
      reason: 'write failed',
      dispatch,
    })
    const err = state.editErrors.get(key)
    expect(err).toBeDefined()
    expect(err!.source).toBe(dispatch.source)
    expect(err!.property).toBe(dispatch.property)
    expect(err!.value).toBe(dispatch.value)
    expect(err!.reason).toBe('write failed')
    expect(effects).toEqual([])
  })

  it('uses "Unknown error" as fallback when reason is absent', () => {
    const dispatch = makeDispatch()
    const key = `${dispatch.source}\0${dispatch.property}`
    const { state } = cortexAppReducer(baseState, {
      type: 'edit_status',
      status: 'failed',
      editId: 'edit-1',
      dispatch,
    })
    expect(state.editErrors.get(key)!.reason).toBe('Unknown error')
  })

  // Hardcode the expected substring for each row rather than recomputing
  // it from the input via `?? 'Unknown'` — the reducer uses the same nullish
  // coalesce internally, so deriving the expected from the input is a shadow
  // copy of the production fallback (CLAUDE.md anti-pattern §1).
  it.each([
    ['coalesced', 'coalesced'],
    [undefined, 'Unknown'],
  ] as Array<[string | undefined, string]>)(
    'emits log_warning when dispatch absent (reason=%s)',
    (reason, expectedSubstring) => {
      const { state, effects } = cortexAppReducer(baseState, {
        type: 'edit_status',
        status: 'failed',
        editId: 'edit-99',
        reason,
      })
      expect(state).toBe(baseState)
      expect(effects).toHaveLength(1)
      const warn = effects[0]
      expectLogWarning(warn)
      expect(warn.message).toContain('edit-99')
      expect(warn.message).toContain(expectedSubstring)
    },
  )
})

// ---------------------------------------------------------------------------
// hmr_verified
// ---------------------------------------------------------------------------

describe('hmr_verified action', () => {
  it('emits apply_hmr_verified effect and does not change state', () => {
    const { state, effects } = cortexAppReducer(baseState, {
      type: 'hmr_verified',
      editId: 'e1',
      match: true,
      kind: 'immediate',
    })
    expect(state).toBe(baseState)
    expect(effects).toEqual([
      { type: 'apply_hmr_verified', editId: 'e1', match: true, kind: 'immediate' },
    ])
  })

  it('passes undefined kind through', () => {
    const { effects } = cortexAppReducer(baseState, {
      type: 'hmr_verified',
      editId: 'e2',
      match: false,
      kind: undefined,
    })
    expect(effects[0]).toEqual({ type: 'apply_hmr_verified', editId: 'e2', match: false, kind: undefined })
  })
})

// ---------------------------------------------------------------------------
// undo_sync_status / redo_sync_status
// ---------------------------------------------------------------------------

describe.each([
  { msgType: 'undo_sync_status' as const, verb: 'undo' },
  { msgType: 'redo_sync_status' as const, verb: 'redo' },
])('$msgType action', ({ msgType, verb }) => {
  it.each([
    ['stale'],
    ['write_failed'],
  ])('emits log_warning + send(clear_server_undo) when reason_code=%s', (reason_code) => {
    const { state, effects } = cortexAppReducer(baseState, {
      type: msgType,
      status: 'failed',
      reason: 'r',
      reason_code,
    })
    expect(state).toBe(baseState)
    expect(effects).toHaveLength(2)
    const warn = effects[0]
    expectLogWarning(warn)
    expect(warn.message).toContain(verb)
    expect(effects[1]).toEqual({ type: 'send', message: { type: 'clear_server_undo' } })
  })

  it.each([
    ['empty_stack'],
    [undefined],
  ])('emits log_warning only when reason_code=%s', (reason_code) => {
    const { effects } = cortexAppReducer(baseState, {
      type: msgType,
      status: 'failed',
      reason: 'r',
      reason_code,
    })
    expect(effects).toHaveLength(1)
    const warn = effects[0]
    expectLogWarning(warn)
    expect(warn.message).toContain(verb)
  })

  it(`is a no-op when status=done`, () => {
    const { state, effects } = cortexAppReducer(baseState, { type: msgType, status: 'done' })
    expect(state).toBe(baseState)
    expect(effects).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// annotation-created
// ---------------------------------------------------------------------------

describe('annotation-created action', () => {
  it('adds the annotation to the map', () => {
    const ann = makeAnnotation({ id: 'ann-abc' })
    const { state, effects } = cortexAppReducer(baseState, {
      type: 'annotation-created',
      annotation: ann,
    })
    expect(state.annotations.get('ann-abc')).toBe(ann)
    expect(effects).toEqual([])
  })

  it('allocates a new Map (does not mutate prior state)', () => {
    const ann = makeAnnotation({ id: 'ann-abc' })
    const { state } = cortexAppReducer(baseState, { type: 'annotation-created', annotation: ann })
    expect(state.annotations).not.toBe(baseState.annotations)
  })
})

// ---------------------------------------------------------------------------
// annotation-updated
// ---------------------------------------------------------------------------

describe('annotation-updated action', () => {
  it('replaces an existing annotation in the map', () => {
    const original = makeAnnotation({ id: 'ann-1', text: 'original' })
    const updated = makeAnnotation({ id: 'ann-1', text: 'updated' })
    const stateWithAnn: CortexAppReducerState = {
      ...baseState,
      annotations: new Map([['ann-1', original]]),
    }
    const { state, effects } = cortexAppReducer(stateWithAnn, {
      type: 'annotation-updated',
      annotation: updated,
    })
    expect(state.annotations.get('ann-1')!.text).toBe('updated')
    expect(effects).toEqual([])
  })

  it('clears editError when fix-request annotation resolves', () => {
    const key = 'src/App.tsx:10:3\0color'
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'fix me' }]]),
    }
    const ann = makeAnnotation({
      kind: 'fix-request',
      status: 'resolved',
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'wrong colour' },
    })
    const { state } = cortexAppReducer(stateWithError, { type: 'annotation-updated', annotation: ann })
    expect(state.editErrors.has(key)).toBe(false)
  })

  it('clears editError when fix-request annotation is dismissed', () => {
    const key = 'src/App.tsx:10:3\0color'
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'fix me' }]]),
    }
    const ann = makeAnnotation({
      kind: 'fix-request',
      status: 'dismissed',
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'wrong colour' },
    })
    const { state } = cortexAppReducer(stateWithError, { type: 'annotation-updated', annotation: ann })
    expect(state.editErrors.has(key)).toBe(false)
  })

  it('does NOT clear editError for non-fix-request annotation update (regression)', () => {
    const key = 'src/App.tsx:10:3\0color'
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'fix me' }]]),
    }
    const ann = makeAnnotation({
      kind: 'comment', // not fix-request
      status: 'resolved',
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'wrong colour' },
    })
    const { state } = cortexAppReducer(stateWithError, { type: 'annotation-updated', annotation: ann })
    expect(state.editErrors.has(key)).toBe(true) // preserved
  })

  it('does NOT clear editError for fix-request with pending status', () => {
    const key = 'src/App.tsx:10:3\0color'
    const stateWithError: CortexAppReducerState = {
      ...baseState,
      editErrors: new Map([[key, { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'fix me' }]]),
    }
    const ann = makeAnnotation({
      kind: 'fix-request',
      status: 'pending', // not resolved or dismissed
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'wrong colour' },
    })
    const { state } = cortexAppReducer(stateWithError, { type: 'annotation-updated', annotation: ann })
    expect(state.editErrors.has(key)).toBe(true) // preserved
  })
})

// ---------------------------------------------------------------------------
// annotations-snapshot — server-pushed hydration on browser init
// ---------------------------------------------------------------------------

describe('annotations-snapshot action', () => {
  it('replaces empty state with the server snapshot on first connect', () => {
    const a = makeAnnotation({ id: 'persisted-1', text: 'survived restart 1' })
    const b = makeAnnotation({ id: 'persisted-2', text: 'survived restart 2', status: 'acknowledged' })
    const { state } = cortexAppReducer(initialCortexAppReducerState, {
      type: 'annotations-snapshot',
      annotations: [a, b],
    })
    expect(state.annotations.size).toBe(2)
    expect(state.annotations.get('persisted-1')).toEqual(a)
    expect(state.annotations.get('persisted-2')).toEqual(b)
  })

  it('replaces any existing local annotations with the snapshot (server is authoritative)', () => {
    const stale = makeAnnotation({ id: 'stale-1', text: 'stale local' })
    const baseState: CortexAppReducerState = {
      ...initialCortexAppReducerState,
      annotations: new Map([[stale.id, stale]]),
    }
    const fresh = makeAnnotation({ id: 'fresh-1', text: 'fresh from disk' })
    const { state } = cortexAppReducer(baseState, {
      type: 'annotations-snapshot',
      annotations: [fresh],
    })
    expect(state.annotations.has('stale-1')).toBe(false)
    expect(state.annotations.get('fresh-1')).toEqual(fresh)
    expect(state.annotations.size).toBe(1)
  })

  it('handles an empty snapshot by clearing existing annotations', () => {
    const existing = makeAnnotation({ id: 'a' })
    const baseState: CortexAppReducerState = {
      ...initialCortexAppReducerState,
      annotations: new Map([[existing.id, existing]]),
    }
    const { state } = cortexAppReducer(baseState, {
      type: 'annotations-snapshot',
      annotations: [],
    })
    expect(state.annotations.size).toBe(0)
  })

  it('emits no effects', () => {
    const ann = makeAnnotation()
    const { effects } = cortexAppReducer(initialCortexAppReducerState, {
      type: 'annotations-snapshot',
      annotations: [ann],
    })
    expect(effects).toEqual([])
  })

  it('clears editErrors for fix-request annotations resolved/dismissed in the snapshot', () => {
    // Scenario flagged by Greptile P1 on PR #140: browser had an edit failure
    // (editErrors populated via edit_status:failed), briefly disconnected, server
    // resolved the corresponding fix-request during that window. On reconnect,
    // the annotations-snapshot must clear the stale error entry — same
    // reconciliation logic the annotation-updated case already implements.
    const baseStateWithErrors: CortexAppReducerState = {
      ...initialCortexAppReducerState,
      editErrors: new Map([
        ['src/App.tsx:10:3\0color', { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'design' }],
        ['src/Other.tsx:5:1\0padding', { source: 'src/Other.tsx:5:1', property: 'padding', value: '1rem', reason: 'design' }],
      ]),
    }
    const resolvedFixRequest = makeAnnotation({
      id: 'fix-1',
      status: 'resolved',
      kind: 'fix-request',
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'design' },
    })
    const dismissedFixRequest = makeAnnotation({
      id: 'fix-2',
      status: 'dismissed',
      kind: 'fix-request',
      elementSource: 'src/Other.tsx:5:1',
      fixMeta: { property: 'padding', value: '1rem', reason: 'design' },
    })
    const { state } = cortexAppReducer(baseStateWithErrors, {
      type: 'annotations-snapshot',
      annotations: [resolvedFixRequest, dismissedFixRequest],
    })
    expect(state.editErrors.size).toBe(0)
    expect(state.editErrors.has('src/App.tsx:10:3\0color')).toBe(false)
    expect(state.editErrors.has('src/Other.tsx:5:1\0padding')).toBe(false)
  })

  it('preserves editErrors for fix-requests that are still pending or acknowledged in the snapshot', () => {
    // Inverse of the previous test: only resolved/dismissed terminal-state
    // fix-requests should clear their editErrors. Pending or acknowledged ones
    // mean the failure is still actionable; the error must remain visible.
    const baseStateWithErrors: CortexAppReducerState = {
      ...initialCortexAppReducerState,
      editErrors: new Map([
        ['src/App.tsx:10:3\0color', { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'design' }],
      ]),
    }
    const pendingFixRequest = makeAnnotation({
      id: 'fix-1',
      status: 'pending',
      kind: 'fix-request',
      elementSource: 'src/App.tsx:10:3',
      fixMeta: { property: 'color', value: 'red', reason: 'design' },
    })
    const { state } = cortexAppReducer(baseStateWithErrors, {
      type: 'annotations-snapshot',
      annotations: [pendingFixRequest],
    })
    expect(state.editErrors.has('src/App.tsx:10:3\0color')).toBe(true)
  })

  it('keeps editErrors Map identity-stable when no fix-request reconciliation is needed', () => {
    // Avoid spurious re-renders: if no fix-request in the snapshot triggers a
    // clear, the existing editErrors Map reference must pass through.
    const errorMap = new Map([
      ['src/App.tsx:10:3\0color', { source: 'src/App.tsx:10:3', property: 'color', value: 'red', reason: 'design' }],
    ])
    const baseStateWithErrors: CortexAppReducerState = {
      ...initialCortexAppReducerState,
      editErrors: errorMap,
    }
    const commentAnn = makeAnnotation({ id: 'c1', status: 'resolved', kind: 'comment' })
    const { state } = cortexAppReducer(baseStateWithErrors, {
      type: 'annotations-snapshot',
      annotations: [commentAnn],
    })
    expect(state.editErrors).toBe(errorMap)
  })
})

// ---------------------------------------------------------------------------
// agent-status
// ---------------------------------------------------------------------------

describe('agent-status action', () => {
  it('sets agentConnected to false', () => {
    const connectedState: CortexAppReducerState = { ...baseState, agentConnected: true }
    const { state, effects } = cortexAppReducer(connectedState, { type: 'agent-status', connected: false })
    expect(state.agentConnected).toBe(false)
    expect(effects).toEqual([])
  })

  it('sets agentConnected to true', () => {
    const { state } = cortexAppReducer(baseState, { type: 'agent-status', connected: true })
    expect(state.agentConnected).toBe(true)
  })

  it('is idempotent when value is unchanged — returns same reference', () => {
    const { state } = cortexAppReducer(baseState, { type: 'agent-status', connected: false })
    expect(state).toBe(baseState)
  })
})

// ---------------------------------------------------------------------------
// activity-entry
// ---------------------------------------------------------------------------

describe('activity-entry action', () => {
  it('appends entry and increments activityCount', () => {
    const entry = makeActivityEntry({ id: 'e1' })
    const { state, effects } = cortexAppReducer(baseState, { type: 'activity-entry', entry })
    expect(state.activityEntries).toHaveLength(1)
    expect(state.activityEntries[0]).toBe(entry)
    expect(state.activityCount).toBe(1)
    expect(effects).toEqual([])
  })

  it('caps activity entries at MAX_ACTIVITY_ENTRIES (ring-buffer behaviour)', () => {
    // Build state with exactly MAX_ACTIVITY_ENTRIES entries
    const entries: ActivityEntry[] = Array.from({ length: MAX_ACTIVITY_ENTRIES }, (_, i) =>
      makeActivityEntry({ id: `e${i}`, description: `edit ${i}` }),
    )
    const fullState: CortexAppReducerState = {
      ...baseState,
      activityEntries: entries,
    }
    const newEntry = makeActivityEntry({ id: 'new', description: 'new edit' })
    const { state } = cortexAppReducer(fullState, { type: 'activity-entry', entry: newEntry })
    expect(state.activityEntries).toHaveLength(MAX_ACTIVITY_ENTRIES)
    // New entry is last
    expect(state.activityEntries[MAX_ACTIVITY_ENTRIES - 1]).toBe(newEntry)
    // First entry (oldest) was dropped
    expect(state.activityEntries[0].id).toBe('e1')
  })
})

// ---------------------------------------------------------------------------
// divergence
// ---------------------------------------------------------------------------

describe('divergence action', () => {
  it('sets editError with source\\0property\\0pseudo key', () => {
    const diag = makeDivergence({
      source: 'src/App.tsx:10:3',
      property: 'color',
      expected: 'red',
      actual: 'blue',
      pseudo: '::before',
    })
    const { state, effects } = cortexAppReducer(baseState, {
      type: 'divergence',
      diagnostic: diag,
    })
    const key = 'src/App.tsx:10:3\0color\0::before'
    const err = state.editErrors.get(key)
    expect(err).toBeDefined()
    expect(err!.source).toBe('src/App.tsx:10:3')
    expect(err!.property).toBe('color')
    expect(err!.value).toBe('red')
    expect(err!.reason).toContain('"red"')
    expect(err!.reason).toContain('"blue"')
    expect(err!.diagnostics).toBe(diag.diagnostics)
    expect(effects).toEqual([])
  })

  it('uses empty string for pseudo when absent', () => {
    const diag = makeDivergence({ pseudo: undefined })
    const { state } = cortexAppReducer(baseState, { type: 'divergence', diagnostic: diag })
    const key = `${diag.source}\0${diag.property}\0`
    expect(state.editErrors.has(key)).toBe(true)
  })

  it('uses "(empty)" when actual is falsy', () => {
    const diag = makeDivergence({ actual: '' })
    const { state } = cortexAppReducer(baseState, { type: 'divergence', diagnostic: diag })
    const key = `${diag.source}\0${diag.property}\0`
    const err = state.editErrors.get(key)!
    expect(err.reason).toContain('(empty)')
  })

  it('overwrites a prior divergence for the same key', () => {
    const diag1 = makeDivergence({ actual: 'old' })
    const diag2 = makeDivergence({ actual: 'new' })
    const { state: s1 } = cortexAppReducer(baseState, { type: 'divergence', diagnostic: diag1 })
    const { state: s2 } = cortexAppReducer(s1, { type: 'divergence', diagnostic: diag2 })
    const key = `${diag2.source}\0${diag2.property}\0`
    expect(s2.editErrors.get(key)!.reason).toContain('"new"')
  })
})
