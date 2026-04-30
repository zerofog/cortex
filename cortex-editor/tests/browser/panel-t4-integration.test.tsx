/**
 * ZF0-1470 (T4 of ZF0-1453): Panel integration tests for staging-drift signals.
 *
 * Covers acceptance criteria from parent ticket:
 *   #7  HMR with no relevant changed files → reconcile returns empty divergent → banner stays hidden
 *   #16 Stale override on a property → corresponding control shows stale variant
 *   #17 Override clears (staleSources empty) → stale indicator clears
 *   #18 Hover on stale indicator → tooltip with recovery hint
 *
 * Integration tests:
 *   - Banner appears when intentDriftCount > 0 (via hmrChangedFiles prop)
 *   - Banner appears when staleOverrideCount > 0 (via staleOverrideCount prop)
 *   - Both signals simultaneously → merged banner
 *   - Apply click → channel.sendAndAck called once with staged-edits-ready
 *   - Apply click → sendAndAck rejects → panel still renders (no crash)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { Panel } from '../../src/browser/components/Panel.js'
import { renderInShadow, createMockChannel } from './helpers.js'
import { _resetTransformBusForTesting } from '../../src/browser/transform-bus.js'
import { _resetBusForTesting } from '../../src/browser/override-bus.js'
import { cortexStorage } from '../../src/browser/persistence.js'
import type { PendingEdit } from '../../src/browser/hooks/useEditStagingBuffer.js'

const panelPositionProps = {
  position: { x: 1000, y: 12 },
  isSnapping: false,
  panelPointerDown: vi.fn(),
  panelPointerMove: vi.fn(),
  panelPointerUp: vi.fn(),
  panelPointerCancel: vi.fn(),
  hmrAppliedVersion: 0,
}

/** Minimal mock overrideManager that satisfies Panel's interface for these tests. */
function makeOverrideManager(
  overrideStore: Map<string, string> = new Map(),
  opts?: { readSourceValue?: (el: Element, property: string, pseudo: '::before' | '::after' | null) => string },
) {
  return {
    set: vi.fn((src: string, prop: string, val: string) => {
      overrideStore.set(`${src}\0${prop}`, val)
    }),
    get: vi.fn((src: string, prop: string) => overrideStore.get(`${src}\0${prop}`)),
    remove: vi.fn(),
    clearAll: vi.fn(),
    dispose: vi.fn(),
    flush: vi.fn(),
    readSourceValue: opts?.readSourceValue ?? vi.fn(() => ''),
  }
}

/** Seed localStorage with a PendingEdit so useEditStagingBuffer rehydrates it on mount. */
function seedEdit(edit: PendingEdit): void {
  cortexStorage.set('staging-buffer', [edit])
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  _resetBusForTesting()
  _resetTransformBusForTesting()
})

describe('Panel T4 — StagingDriftBanner wiring', () => {
  // #7: HMR with no relevant changed files → reconcile divergent is empty → banner hidden.
  // The staged intent lives at 'src/Hero.tsx:14:5'; hmrChangedFiles is ['src/Other.tsx']
  // (no intersection). After hmrAppliedVersion bumps, intentDriftCount should stay 0.
  it('#7: banner stays hidden when hmr changedFiles do not intersect any staged intent', async () => {
    const edit: PendingEdit = {
      intentId: 'id-1',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    // Place element in DOM with matching data-cortex-source
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const overrideManager = makeOverrideManager()
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        // hmrChangedFiles references a DIFFERENT file — no intersection with staged intent
        hmrChangedFiles={['src/Other.tsx']}
        // Pass a new hmrAppliedVersion to trigger reconcile effect
        hmrAppliedVersion={1}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    // Banner should not be present — no divergence and no stale overrides
    const banner = root.querySelector('.cortex-drift-banner')
    expect(banner).toBeNull()

    cleanup()
    target.remove()
  })

  // Integration: intentDriftCount > 0 → banner visible with intent-drift row.
  // This test uses a real hmrChangedFiles intersection to trigger reconcile.
  it('banner appears when hmr changedFiles intersect a staged intent (divergence detected)', async () => {
    const edit: PendingEdit = {
      intentId: 'id-2',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',   // previousValue = 'blue'; readSourceValue returns '' → divergent
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    // readSourceValue returns '' (different from previousValue 'blue') → divergent
    const overrideManager = makeOverrideManager(new Map(), {
      readSourceValue: () => '',
    })

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        hmrChangedFiles={['src/Hero.tsx']}  // intersects edit.source (stripLineCol)
        hmrAppliedVersion={1}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    // Banner should be present with the intent-drift row
    const banner = root.querySelector('.cortex-drift-banner')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('staged edit(s) may be affected by external changes')

    cleanup()
    target.remove()
  })

  // Integration: staleOverrideCount > 0 → banner visible with stale-override row.
  it('banner appears when staleOverrideCount > 0 (stale override signal)', async () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const overrideManager = makeOverrideManager()
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        hmrChangedFiles={[]}
        staleOverrideCount={2}
        staleSources={new Set(['src/Hero.tsx:14:5'])}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    // Banner should be present with the stale-override row
    const banner = root.querySelector('.cortex-drift-banner')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain("edit(s) saved but HMR didn't apply")

    cleanup()
    target.remove()
  })

  // Integration: both signals → merged banner with both rows.
  it('merged banner renders both rows when both intentDriftCount and staleOverrideCount are non-zero', async () => {
    const edit: PendingEdit = {
      intentId: 'id-3',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const overrideManager = makeOverrideManager(new Map(), {
      readSourceValue: () => '', // causes divergence
    })

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        hmrChangedFiles={['src/Hero.tsx']}
        hmrAppliedVersion={1}
        staleOverrideCount={1}
        staleSources={new Set(['src/Hero.tsx:14:5'])}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    const banner = root.querySelector('.cortex-drift-banner')
    expect(banner).not.toBeNull()
    // Exactly one banner element
    expect(root.querySelectorAll('.cortex-drift-banner').length).toBe(1)
    // Both rows present
    expect(banner!.textContent).toContain('staged edit(s) may be affected by external changes')
    expect(banner!.textContent).toContain("edit(s) saved but HMR didn't apply")

    cleanup()
    target.remove()
  })
})

describe('Panel T4 — Apply button wiring', () => {
  // Apply click → channel.sendAndAck called once with staged-edits-ready.
  // Buffer has 1 entry seeded in localStorage.
  it('Apply click calls channel.sendAndAck with staged-edits-ready and buffer count', async () => {
    const edit: PendingEdit = {
      intentId: 'id-apply-1',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const channel = createMockChannel()
    // Add sendAndAck mock — resolves immediately
    const sendAndAck = vi.fn(() => Promise.resolve({ type: 'staged-edits-acked', requestId: 'r1' } as any))
    ;(channel as any).sendAndAck = sendAndAck

    const overrideManager = makeOverrideManager()

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        channel={channel as any}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    // Apply button should be visible (buffer.size() = 1 from seeded localStorage)
    const applyBtn = root.querySelector('[data-action="apply"]') as HTMLButtonElement | null
    expect(applyBtn).not.toBeNull()

    await act(async () => {
      applyBtn!.click()
      await new Promise(r => setTimeout(r, 20))
    })

    // sendAndAck was called exactly once with staged-edits-ready
    expect(sendAndAck).toHaveBeenCalledTimes(1)
    expect(sendAndAck).toHaveBeenCalledWith({ type: 'staged-edits-ready', count: 1 })

    cleanup()
    target.remove()
  })

  // Apply click → sendAndAck rejects → panel still renders, no crash.
  it('Apply click with sendAndAck rejection does not crash Panel', async () => {
    const edit: PendingEdit = {
      intentId: 'id-apply-2',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const channel = createMockChannel()
    // sendAndAck rejects (simulates timeout / disconnect)
    const sendAndAck = vi.fn(() => Promise.reject(new Error('sendAndAck timeout after 10000ms')))
    ;(channel as any).sendAndAck = sendAndAck

    const overrideManager = makeOverrideManager()

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        channel={channel as any}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    const applyBtn = root.querySelector('[data-action="apply"]') as HTMLButtonElement | null
    expect(applyBtn).not.toBeNull()

    // Click Apply — rejection must not throw (PanelHeader handles it internally)
    await act(async () => {
      applyBtn!.click()
      await new Promise(r => setTimeout(r, 20))
    })

    // Panel is still mounted and functional
    expect(root.querySelector('.cortex-panel')).not.toBeNull()
    expect(sendAndAck).toHaveBeenCalledTimes(1)

    cleanup()
    target.remove()
  })
})

describe('Panel T4 fix-up — IMPORTANT 1: hmrEventVersion triggers reconcile for non-selected elements', () => {
  // IMPORTANT 1: When HMR fires for a file that does NOT affect the selected element
  // (shouldRefreshOnHMR returns false → hmrAppliedVersion stays flat), Panel's
  // reconcile effect must still fire for buffered intents whose source IS in the
  // changed files. This is driven by hmrEventVersion (always-bump), not
  // hmrAppliedVersion (selection-aware). The test verifies that a staged intent
  // for a NON-selected element's source produces intentDriftCount > 0 after HMR
  // for that source file, even when hmrAppliedVersion does NOT bump.
  it('banner shows intentDrift when hmrEventVersion bumps but hmrAppliedVersion stays flat', async () => {
    // Staged intent for a DIFFERENT source than the selected element
    const nonSelectedSource = 'src/Sidebar.tsx:22:3'
    const edit: PendingEdit = {
      intentId: 'id-non-selected-1',
      source: nonSelectedSource,
      property: 'color',
      value: 'red',
      previousValue: 'blue',  // readSourceValue returns '' → divergent
      timestamp: Date.now(),
    }
    seedEdit(edit)

    // Selected element uses a DIFFERENT source — simulates the case where
    // shouldRefreshOnHMR returned false (files don't touch selected element).
    const selectedSource = 'src/Hero.tsx:14:5'
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', selectedSource)
    document.body.appendChild(target)

    // readSourceValue returns '' (different from previousValue 'blue') → divergent
    const overrideManager = makeOverrideManager(new Map(), {
      readSourceValue: () => '',
    })

    // hmrAppliedVersion stays at 0 (as if shouldRefreshOnHMR returned false for
    // the selected element). hmrEventVersion=1 simulates the always-bump counter.
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        hmrAppliedVersion={0}       // NOT bumped — selected element unaffected
        hmrEventVersion={1}          // always bumps on every hmr-applied event
        hmrChangedFiles={['src/Sidebar.tsx']}  // intersects nonSelectedSource
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    // Banner should appear: intent for nonSelectedSource is divergent
    const banner = root.querySelector('.cortex-drift-banner')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain('staged edit(s) may be affected by external changes')

    cleanup()
    target.remove()
  })
})

describe('Panel T4 fix-up — IMPORTANT 4: onApplyError surfaces failures to user', () => {
  // IMPORTANT 4: When sendAndAck rejects, the error message must appear in DOM.
  it('shows apply error message in DOM when sendAndAck rejects with a specific Error', async () => {
    const edit: PendingEdit = {
      intentId: 'id-apply-err-1',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const channel = createMockChannel()
    const errorMsg = 'sendAndAck timeout after 10000ms'
    const sendAndAck = vi.fn(() => Promise.reject(new Error(errorMsg)))
    ;(channel as any).sendAndAck = sendAndAck

    const overrideManager = makeOverrideManager()

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        channel={channel as any}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    const applyBtn = root.querySelector('[data-action="apply"]') as HTMLButtonElement | null
    expect(applyBtn).not.toBeNull()

    await act(async () => {
      applyBtn!.click()
      await new Promise(r => setTimeout(r, 20))
    })

    // The specific error message must appear in the DOM
    const errorEl = root.querySelector('.cortex-apply-error')
    expect(errorEl).not.toBeNull()
    expect(errorEl!.textContent).toContain(errorMsg)

    cleanup()
    target.remove()
  })

  // Dismissing the error clears it from DOM.
  it('dismisses apply error when X button is clicked', async () => {
    const edit: PendingEdit = {
      intentId: 'id-apply-err-2',
      source: 'src/Hero.tsx:14:5',
      property: 'color',
      value: 'red',
      previousValue: 'blue',
      timestamp: Date.now(),
    }
    seedEdit(edit)

    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    document.body.appendChild(target)

    const channel = createMockChannel()
    const sendAndAck = vi.fn(() => Promise.reject(new Error('Apply failed')))
    ;(channel as any).sendAndAck = sendAndAck

    const overrideManager = makeOverrideManager()

    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        channel={channel as any}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    const applyBtn = root.querySelector('[data-action="apply"]') as HTMLButtonElement | null
    expect(applyBtn).not.toBeNull()

    await act(async () => {
      applyBtn!.click()
      await new Promise(r => setTimeout(r, 20))
    })

    // Error should be visible
    expect(root.querySelector('.cortex-apply-error')).not.toBeNull()

    // Dismiss it
    await act(async () => {
      const dismissBtn = root.querySelector('.cortex-apply-error button') as HTMLButtonElement | null
      expect(dismissBtn).not.toBeNull()
      dismissBtn!.click()
      await new Promise(r => setTimeout(r, 10))
    })

    // Error should be gone
    expect(root.querySelector('.cortex-apply-error')).toBeNull()

    cleanup()
    target.remove()
  })
})

describe('Panel T4 — per-control stale indicator', () => {
  // #16: staleSources contains the element's source → Position section NumericInput shows stale class.
  it('#16: NumericInput in PositionSection shows stale CSS class when element source is in staleSources', async () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    // Give it a non-static position so the PositionSection renders X/Y inputs
    target.style.position = 'relative'
    document.body.appendChild(target)

    // Mock getComputedStyle to return relative positioning so X/Y inputs render
    const originalGCS = window.getComputedStyle
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (el === target && !pseudo) {
        const base = originalGCS.call(window, el)
        return {
          ...base,
          position: 'relative',
          left: '0px',
          top: '0px',
          zIndex: 'auto',
          rotate: 'none',
          scale: 'none',
          display: 'block',
          visibility: 'visible',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          rowGap: '0px',
          columnGap: '0px',
          flexWrap: 'nowrap',
          gridTemplateColumns: 'none',
          gridTemplateRows: 'none',
          gridAutoFlow: 'row',
          justifyItems: 'stretch',
          width: 'auto',
          height: 'auto',
          minWidth: '0px',
          maxWidth: 'none',
          minHeight: '0px',
          maxHeight: 'none',
          overflow: 'visible',
          boxSizing: 'content-box',
          getPropertyValue: (p: string) => (base as any).getPropertyValue?.(p) ?? '',
        } as unknown as CSSStyleDeclaration
      }
      return originalGCS.call(window, el, pseudo)
    }) as typeof window.getComputedStyle

    const overrideManager = makeOverrideManager()
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        // Source is stale
        staleSources={new Set(['src/Hero.tsx:14:5'])}
        staleOverrideCount={1}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    window.getComputedStyle = originalGCS

    // At least one NumericInput should have the stale CSS class
    const staleInputs = root.querySelectorAll('.cortex-numeric-input--stale')
    expect(staleInputs.length).toBeGreaterThan(0)

    cleanup()
    target.remove()
  })

  // #17: staleSources is empty → stale class absent.
  it('#17: NumericInput does NOT show stale class when staleSources is empty', async () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    target.style.position = 'relative'
    document.body.appendChild(target)

    const originalGCS = window.getComputedStyle
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (el === target && !pseudo) {
        const base = originalGCS.call(window, el)
        return {
          ...base,
          position: 'relative',
          left: '0px',
          top: '0px',
          zIndex: 'auto',
          rotate: 'none',
          scale: 'none',
          display: 'block',
          visibility: 'visible',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          rowGap: '0px',
          columnGap: '0px',
          flexWrap: 'nowrap',
          gridTemplateColumns: 'none',
          gridTemplateRows: 'none',
          gridAutoFlow: 'row',
          justifyItems: 'stretch',
          width: 'auto',
          height: 'auto',
          minWidth: '0px',
          maxWidth: 'none',
          minHeight: '0px',
          maxHeight: 'none',
          overflow: 'visible',
          boxSizing: 'content-box',
          getPropertyValue: (p: string) => (base as any).getPropertyValue?.(p) ?? '',
        } as unknown as CSSStyleDeclaration
      }
      return originalGCS.call(window, el, pseudo)
    }) as typeof window.getComputedStyle

    const overrideManager = makeOverrideManager()
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        // staleSources is empty — override cleared
        staleSources={new Set()}
        staleOverrideCount={0}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    window.getComputedStyle = originalGCS

    // No stale indicators
    const staleInputs = root.querySelectorAll('.cortex-numeric-input--stale')
    expect(staleInputs.length).toBe(0)

    cleanup()
    target.remove()
  })

  // #18: stale indicator has correct data-tooltip attribute with recovery hint.
  it('#18: stale NumericInput has data-tooltip with recovery hint text', async () => {
    const target = document.createElement('div')
    target.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    target.style.position = 'relative'
    document.body.appendChild(target)

    const originalGCS = window.getComputedStyle
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (el === target && !pseudo) {
        const base = originalGCS.call(window, el)
        return {
          ...base,
          position: 'relative',
          left: '0px',
          top: '0px',
          zIndex: 'auto',
          rotate: 'none',
          scale: 'none',
          display: 'block',
          visibility: 'visible',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          rowGap: '0px',
          columnGap: '0px',
          flexWrap: 'nowrap',
          gridTemplateColumns: 'none',
          gridTemplateRows: 'none',
          gridAutoFlow: 'row',
          justifyItems: 'stretch',
          width: 'auto',
          height: 'auto',
          minWidth: '0px',
          maxWidth: 'none',
          minHeight: '0px',
          maxHeight: 'none',
          overflow: 'visible',
          boxSizing: 'content-box',
          getPropertyValue: (p: string) => (base as any).getPropertyValue?.(p) ?? '',
        } as unknown as CSSStyleDeclaration
      }
      return originalGCS.call(window, el, pseudo)
    }) as typeof window.getComputedStyle

    const overrideManager = makeOverrideManager()
    const { root, cleanup } = renderInShadow(
      <Panel
        element={target}
        overrideManager={overrideManager as any}
        onClose={() => {}}
        onSelectElement={() => {}}
        {...panelPositionProps}
        staleSources={new Set(['src/Hero.tsx:14:5'])}
        staleOverrideCount={1}
      />,
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    window.getComputedStyle = originalGCS

    // A stale NumericInput must carry the recovery tooltip
    const staleInput = root.querySelector('.cortex-numeric-input--stale')
    expect(staleInput).not.toBeNull()
    expect(staleInput!.getAttribute('data-tooltip')).toBe(
      "Edit saved but HMR didn't apply — refresh to verify",
    )

    cleanup()
    target.remove()
  })
})
