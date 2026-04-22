/**
 * @vitest-environment jsdom
 *
 * ZF0-1293: real-CSSOM test suite.
 *
 * The primary unit tests for the shorthand-clobber guard live in
 * `tests/core/rewriter/inline-style.test.ts` and
 * `tests/core/rewriter/jsx-transaction.test.ts`. Those tests assert the
 * AST-level *source ordering* the rewriter produces — because they run in
 * `happy-dom` or `node`, neither of which fully implements CSSOM shorthand
 * expansion. That leaves a PREMISE verification gap: "is the shorthand-
 * clobber behavior we're guarding against actually real?"
 *
 * This suite exercises that premise directly in `jsdom`, which DOES expand
 * CSS shorthands into longhands per the spec. If CSSOM ever changed such
 * that `el.style.padding = '30px'` stopped overwriting `el.style.paddingBottom`,
 * these tests would fail — and we'd know to revisit the guard's rationale.
 * Until then, they document WHY the guard exists with executable evidence.
 *
 * This file lives in `tests/cssom/` so vitest routes it to the `cssom`
 * project (see `vitest.config.ts`); the `browser` project runs in happy-dom
 * where these tests would produce different results.
 */
import { describe, it, expect } from 'vitest'

describe('CSSOM shorthand-clobber premise (ZF0-1293)', () => {
  it('padding shorthand set AFTER paddingBottom clobbers the longhand', () => {
    // This is the core bug class the rewriter's guard prevents at the
    // AST level: when React applies a style object in key-insertion order,
    // `el.style.paddingBottom = '16px'` followed by `el.style.padding = '30px'`
    // expands padding into all four longhands, overwriting paddingBottom.
    const div = document.createElement('div')
    document.body.appendChild(div)
    try {
      div.style.paddingBottom = '16px'
      div.style.padding = '30px'
      expect(div.style.paddingBottom).toBe('30px')
    } finally {
      div.remove()
    }
  })

  it('padding shorthand set BEFORE paddingBottom preserves the longhand (guard-safe order)', () => {
    // The inverse: when the shorthand comes first and the longhand last,
    // the longhand wins for that specific edge. This is the order the
    // rewriter's guard produces via `needsShorthandReorder`.
    const div = document.createElement('div')
    document.body.appendChild(div)
    try {
      div.style.padding = '30px'
      div.style.paddingBottom = '16px'
      expect(div.style.paddingBottom).toBe('16px')
    } finally {
      div.remove()
    }
  })

  it('margin shorthand has identical clobber behavior', () => {
    // Guard's generality check: the same rule applies to every shorthand
    // family in `SHORTHAND_LONGHANDS`. Margin is the other most-common case.
    const div = document.createElement('div')
    document.body.appendChild(div)
    try {
      div.style.marginBottom = '8px'
      div.style.margin = '24px'
      expect(div.style.marginBottom).toBe('24px')
    } finally {
      div.remove()
    }
  })

  // NOTE: we previously also tested `borderRadius` shorthand→longhand
  // clobber here, but jsdom does NOT expand `border-radius` into individual
  // corners (unlike real browsers). Keeping a version that matches jsdom's
  // behavior would document a bug rather than the spec, and a version that
  // matches spec would fail. The rewriter's guard at `inline-style.ts`
  // relies on the `SHORTHAND_LONGHANDS` table in `jsx-utils.ts:108–116`
  // which IS generic — once jsdom adds border-radius expansion, a test
  // here should exercise it. Skipping rather than testing the wrong
  // assertion is deliberate per CLAUDE.md "no happy-dom theatre".

  it('jsdom is the environment under test (sanity check)', () => {
    // If this file accidentally runs under happy-dom or node, the clobber
    // assertions above might behave differently and silently pass for the
    // wrong reason. Fail loud if we're not in jsdom.
    expect(navigator.userAgent).toMatch(/jsdom/i)
  })
})
