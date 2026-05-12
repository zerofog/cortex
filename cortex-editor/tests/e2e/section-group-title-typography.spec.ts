/**
 * SectionGroup title typography token contract — real CSSOM coverage (ZF0-1565).
 *
 * Business purpose: `.cortex-section-group__title`
 * (cortex-editor/src/browser/styles.css:1340-1345) binds to three
 * design-system tokens — `font-size: var(--cx-text-lg)`,
 * `font-weight: var(--cx-weight-heading)`, and `color: var(--cx-ink)`.
 * Happy-dom cannot resolve CSS custom properties to meaningful computed
 * values, so the Layer-2 unit test
 * (tests/browser/components/SectionGroup.test.tsx, removed in this PR —
 * see git history) was a permanently-skipped placeholder.
 *
 * Assertion strategy is two-layered to defeat tautology:
 *
 *   1. Token-existence guard — read each token's value off `:host` via
 *      `getComputedStyle(host).getPropertyValue('--cx-text-lg')` etc. and
 *      assert it is non-empty. Without this, deleting `--cx-text-lg` from
 *      `:host` makes both probe and title fall back to inherit → UA default
 *      16px, and the equality check below would tautologically pass on a
 *      broken cascade.
 *
 *   2. Probe-vs-title equality — build a `<span>` probe in the same shadow
 *      root with the SAME `var(--…)` bindings the rule should use, then
 *      assert `getComputedStyle(title)` matches `getComputedStyle(probe)`
 *      for each property. Token-driven rather than literal-pixel: if
 *      DESIGN.md retunes `--cx-text-lg` (e.g. 13px → 14px), probe and
 *      title shift together. Only a TOKEN SWAP (binding the title to a
 *      different token) breaks the test.
 *
 * Iterates ALL section-group titles (not just the first). The title class
 * is the contract surface, but a per-group override
 * (`.cortex-section-group[data-group="typography"] .cortex-section-group__title { … }`)
 * could silently regress one group while siblings stay intact. The loop
 * surfaces which `data-group` failed via Playwright's `expect(value, message)`
 * label.
 *
 * Known coverage boundary: this Layer-4 spec asserts the resolved-CSSOM
 * contract, not the source-level token-name binding. A developer who
 * hardcodes `font-size: 13px` directly (skipping the token) still passes
 * because the pixel value matches. The existing source-level lint
 * (`tests/styles/css-compliance.test.ts`, ZF0-1495) covers hex colors,
 * gradients, and glow shadows but not hardcoded typography pixels — so
 * source-level token-binding for this rule is currently only enforced by
 * code review. A follow-up could extend the lint with a typography-binding
 * check; out of scope for this ticket.
 *
 * Falsifiability proof (load-bearing — referenced by test NAME, not line):
 *
 *   Mutation A — swap `var(--cx-text-lg)` → `var(--cx-text-md)` on
 *   `styles.css:1341`, rebuild with `npm run build:test`:
 *     Test fails with `expected "13px" to be "12px"` on the font-size
 *     loop iteration (group identifier included in the assertion message).
 *
 *   Mutation B — swap `var(--cx-weight-heading)` → `var(--cx-weight-value)`
 *   on `styles.css:1342`, rebuild:
 *     Test fails with `expected "600" to be "500"`. Mutation A's font-size
 *     loop still passes — independence confirmed.
 *
 *   Mutation C — swap `color: var(--cx-ink)` → `var(--cx-ink-secondary)` on
 *   `styles.css:1343`, rebuild:
 *     Test fails on the color loop iteration with the ink-secondary rgb
 *     value vs the ink rgb value. Font-size and font-weight loops still pass.
 *
 *   Mutation D — delete the `--cx-text-lg: 13px` declaration from `:host`
 *   in `styles.css:113`, rebuild:
 *     Token-existence guard fails first with
 *     `expected "" not to be "" (--cx-text-lg defined on :host)`. Probe-vs-
 *     title equality is never reached — the guard halts the test loudly
 *     instead of letting the broken cascade tautologically pass.
 *
 *   Each mutation produces a SPECIFIC value mismatch (not a timeout). A
 *   timeout would mean the spec exercises a different code path. All four
 *   mutations were applied, verified, and reverted byte-for-byte before
 *   commit. See `thoughts/shared/ship-task/checkpoints/ZF0-1565-checkpoint.md`
 *   Step 4 for the full reproduction log.
 */
import { test, expect } from '@playwright/test'
import { bootFixture } from './helpers/boot.js'
import { FIXTURE_SEED_SELECTOR } from './helpers/fixture-server.js'
import { waitForElementStatePanel } from './helpers/panel.js'

test.describe('SectionGroup title typography token contract (ZF0-1565) @fast-ci', () => {
  test('every section group title resolves to design-system typography tokens', async ({ page }) => {
    await bootFixture(page, {
      activateDesignMode: true,
      selectElement: FIXTURE_SEED_SELECTOR,
      collectDivergences: false,
    })
    await waitForElementStatePanel(page)

    const resolved = await page.evaluate(() => {
      const host = document.querySelector('[data-cortex-host]')
      if (!host) {
        throw new Error(
          '[ZF0-1565] [data-cortex-host] element missing from document — ' +
            'did bootFixture inject the panel?',
        )
      }
      const root = (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (!root) {
        throw new Error(
          '[ZF0-1565] [data-cortex-host] found but shadowRoot is null — ' +
            'closed shadow root or light-DOM regression? ' +
            'bootFixture should patch attachShadow to force open mode.',
        )
      }

      const titles = Array.from(root.querySelectorAll<HTMLElement>('.cortex-section-group__title'))
      if (titles.length === 0) {
        const groupCount = root.querySelectorAll('.cortex-section-group').length
        throw new Error(
          `[ZF0-1565] .cortex-section-group__title missing inside panel shadow root ` +
            `(${groupCount} .cortex-section-group present). ` +
            `Did selectElement commit? Is the panel showing the null-state branch?`,
        )
      }

      // Token-existence sanity — `getPropertyValue` returns '' when a custom
      // property is undefined on the resolved cascade. Catches the
      // token-deletion regression that probe-vs-title equality alone misses
      // (both probe and title would fall back to inherit / UA default and
      // tautologically agree on the broken value).
      const hostStyle = getComputedStyle(host as HTMLElement)
      const tokens = {
        textLg: hostStyle.getPropertyValue('--cx-text-lg').trim(),
        weightHeading: hostStyle.getPropertyValue('--cx-weight-heading').trim(),
        ink: hostStyle.getPropertyValue('--cx-ink').trim(),
      }

      // Probe bound to the SAME tokens the rule should use, in the SAME
      // shadow root so `:host` custom properties cascade identically. Token
      // SWAP in styles.css makes the title resolve differently from the
      // probe — `expect(...).toBe(...)` fails with a specific value mismatch,
      // not a timeout.
      const probe = document.createElement('span')
      probe.style.fontSize = 'var(--cx-text-lg)'
      probe.style.fontWeight = 'var(--cx-weight-heading)'
      probe.style.color = 'var(--cx-ink)'
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      root.appendChild(probe)

      try {
        const probeStyle = getComputedStyle(probe)
        return {
          tokens,
          probeFontSize: probeStyle.fontSize,
          probeFontWeight: probeStyle.fontWeight,
          probeColor: probeStyle.color,
          titles: titles.map((el) => {
            const ts = getComputedStyle(el)
            return {
              group: el.closest('.cortex-section-group')?.getAttribute('data-group') ?? '(unset)',
              fontSize: ts.fontSize,
              fontWeight: ts.fontWeight,
              color: ts.color,
            }
          }),
        }
      } finally {
        // try/finally guarantees probe cleanup even if a future addition
        // throws between probe attachment and return. Shadow-root pollution
        // across copy-paste of this pattern was the kind of drift Step 5
        // /simplify reviewers have flagged historically.
        probe.remove()
      }
    })

    // Token-existence sanity — `--cx-text-lg`, `--cx-weight-heading`, and
    // `--cx-ink` MUST be defined on `:host`. Failure here means the token
    // was deleted; probe-vs-title equality below would tautologically agree
    // on the broken inherited value if we skipped this guard.
    expect(resolved.tokens.textLg, '--cx-text-lg defined on :host').not.toBe('')
    expect(resolved.tokens.weightHeading, '--cx-weight-heading defined on :host').not.toBe('')
    expect(resolved.tokens.ink, '--cx-ink defined on :host').not.toBe('')

    // Real-CSSOM resolution sanity — probe resolved tokens to concrete
    // values. Falsifies the happy-dom failure mode where `var(…)` leaves
    // the literal string in computed style. Tightened regexes:
    //   font-size: requires `\d+(\.\d+)?px` — rejects 'var(--cx-text-lg)'
    //   font-weight: requires `[1-9]\d{2}` — rejects 'normal' / 'bold' / ''
    //   color: requires `rgba?(…)` — rejects '' / 'inherit'
    expect(resolved.probeFontSize).toMatch(/^\d+(\.\d+)?px$/)
    expect(resolved.probeFontWeight).toMatch(/^[1-9]\d{2}$/)
    expect(resolved.probeColor).toMatch(/^rgba?\(/)

    // Token contract — every section group title binds to
    // (--cx-text-lg, --cx-weight-heading, --cx-ink). Iterating prevents a
    // per-group override (e.g. `[data-group="typography"]
    // .cortex-section-group__title { font-size: var(--cx-text-md); }`) from
    // hiding behind a sibling whose contract is still intact. The
    // assertion message includes the failing group's `data-group` so triage
    // points at the specific section that drifted.
    expect(resolved.titles.length, 'at least one section group rendered').toBeGreaterThan(0)
    for (const title of resolved.titles) {
      expect(title.fontSize, `group="${title.group}" font-size token (--cx-text-lg)`).toBe(
        resolved.probeFontSize,
      )
      expect(title.fontWeight, `group="${title.group}" font-weight token (--cx-weight-heading)`).toBe(
        resolved.probeFontWeight,
      )
      expect(title.color, `group="${title.group}" color token (--cx-ink)`).toBe(resolved.probeColor)
    }
  })
})
