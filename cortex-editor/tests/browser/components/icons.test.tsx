import { describe, it, expect, afterEach } from 'vitest'
import { render, h } from 'preact'
import type { FunctionComponent } from 'preact'
import * as icons from '../../../src/browser/components/icons.js'

/**
 * Task 4 (ZF0-1182) snapshot lock for the icons.tsx inventory.
 *
 * Every exported PascalCase component in icons.tsx is rendered through
 * Preact into a fresh container and its innerHTML is asserted against an
 * inline snapshot. On the first test run Vitest writes the snapshot into
 * this file; on every subsequent run the snapshot is the contract. If a
 * lucide upstream path changes under us — or if someone hand-edits a
 * shape element — exactly ONE snapshot diffs and the failure message
 * names the icon that drifted.
 *
 * Falsifiability check (ran once during implementation): introducing a
 * single-character mutation in any icon's path data fails this test with
 * a clear diff naming the icon. See the Task 4 COMMIT body for details.
 */

type IconEntry = [name: string, component: FunctionComponent<Record<string, unknown>>]

const ICON_EXPORTS: IconEntry[] = Object.entries(icons)
  .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
  .map(([name, value]) => [name, value as FunctionComponent<Record<string, unknown>>])
  .sort((a, b) => a[0].localeCompare(b[0]))

describe('icons.tsx — lucide.dev snapshot inventory', () => {
  let container: HTMLDivElement

  afterEach(() => {
    if (container) {
      render(null, container)
      container.remove()
    }
  })

  it('exports the expected number of icons (4 Task 3 + 39 Task 4 = 43)', () => {
    // Task 4 ticket prompt estimated "~38" but the canonical inventory
    // enumerates: Position (5) + Self-align (6) + Transforms (3) +
    // Flex-dir (4) + Spacing (2) + Corners (4) + Token+common (7) +
    // Grid (3) + Text-align (4) + Misc (1) = 39 new, giving 43 total.
    expect(ICON_EXPORTS.length).toBe(43)
  })

  it.each(ICON_EXPORTS)('<%s /> renders the lucide.dev SVG verbatim', (name, Component) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(h(Component, {}), container)
    // The snapshot key is prefixed with the icon name so failures point at
    // the drifted icon unambiguously even when vitest truncates long diffs.
    expect({ icon: name, html: container.innerHTML }).toMatchSnapshot()
  })
})
