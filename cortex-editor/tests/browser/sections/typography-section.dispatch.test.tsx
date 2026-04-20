import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'preact'
import { TypographySection } from '../../../src/browser/components/sections/TypographySection.js'
import type { TypographyValues, TypographyChange } from '../../../src/browser/components/sections/TypographySection.js'
import type { TextComponent } from '../../../src/core/text-components.js'
import type { ColorChip } from '../../../src/browser/token-detector.js'

/**
 * Narrow dispatch-contract tests for the Task 17 naming fix.
 *
 * Invariant under test: every classOp-bearing change the section emits
 * carries a `text-`-prefixed class name on `removeClass`. Reintroducing
 * the bare bundle-name form (Bug 2) was the single change most likely to
 * regress because three callsites compute the prefix by string concat.
 * The template-literal type on `TypographyChange.removeClass` catches this
 * at compile time, but a runtime test provides a second line of defense
 * AND documents the contract for future rewrites (e.g. Task 18).
 *
 * Scope: only the dispatch path. Rendering quality, pill appearance, and
 * picker interaction are Task 18's responsibility.
 */

vi.mock('@floating-ui/dom', () => ({
  computePosition: vi.fn().mockResolvedValue({ x: 0, y: 30 }),
  flip: vi.fn().mockReturnValue({}),
  shift: vi.fn().mockReturnValue({}),
}))

const BUNDLES: readonly TextComponent[] = [
  { name: 'body-md', fontSize: '14px', lineHeight: '21px', letterSpacing: '0px', fontWeight: '400' },
  { name: 'heading-1', fontSize: '32px', lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '700' },
]

const CHIPS: readonly ColorChip[] = [
  { name: 'brand-500', hex: '#3b82f6' },
  { name: 'gray-500', hex: '#6b7280' },
]

const DEFAULT_VALUES: TypographyValues = {
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: '400',
  lineHeight: 1.5,
  letterSpacing: 0,
  textAlign: 'left',
  verticalAlign: '',
  color: 'rgb(107, 114, 128)',
}

let container: HTMLDivElement

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
  }
})

const flushEffects = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

async function mountSection(className: string, onChange: (c: TypographyChange) => void): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <TypographySection
      values={DEFAULT_VALUES}
      availableWeights={['400', '500', '700']}
      className={className}
      onChange={onChange}
      textComponents={[...BUNDLES]}
      colorChips={[...CHIPS]}
    />,
    container,
  )
  await flushEffects()
  return container
}

describe('TypographySection — dispatch contract (Bug 2 regression guard)', () => {
  it('handleTypographyPick when linked → emits removeClass with text- prefix', async () => {
    const onChange = vi.fn()
    const root = await mountSection('text-body-md', onChange)

    // The pill is rendered because the element is linked to body-md.
    // Click the pill body to open the picker.
    const pill = root.querySelector('.cortex-token-chip__body, button[aria-label*="Swap"]') as HTMLElement
    expect(pill).toBeTruthy()
    pill.click()
    await flushEffects()

    // Pick heading-1 from the picker.
    const options = root.querySelectorAll('.cortex-text-component-picker__option')
    const headingOpt = Array.from(options).find((o) => o.textContent?.includes('heading-1')) as HTMLElement
    expect(headingOpt).toBeTruthy()
    headingOpt.click()
    await flushEffects()

    const calls = onChange.mock.calls.map(([c]) => c as TypographyChange)
    const link = calls.find((c) => 'kind' in c && c.kind === 'link-text-component') as
      | { kind: 'link-text-component'; component: TextComponent; removeClass?: string }
      | undefined
    expect(link).toBeDefined()
    expect(link?.component.name).toBe('heading-1')
    // THE assertion: removeClass is the text- prefixed form, NOT bare name.
    expect(link?.removeClass).toBe('text-body-md')
  })

  it('handleTypographyPick when NOT linked (no bundle class) → emits removeClass undefined', async () => {
    const onChange = vi.fn()
    const root = await mountSection('', onChange) // no bundle class

    // Unlinked state renders the T button. Find and click it to open picker.
    const tButton = root.querySelector('button[aria-label="Link to text component"]') as HTMLElement
    expect(tButton).toBeTruthy()
    tButton.click()
    await flushEffects()

    const options = root.querySelectorAll('.cortex-text-component-picker__option')
    const bodyOpt = Array.from(options).find((o) => o.textContent?.includes('body-md')) as HTMLElement
    expect(bodyOpt).toBeTruthy()
    bodyOpt.click()
    await flushEffects()

    const calls = onChange.mock.calls.map(([c]) => c as TypographyChange)
    const link = calls.find((c) => 'kind' in c && c.kind === 'link-text-component') as
      | { kind: 'link-text-component'; component: TextComponent; removeClass?: string }
      | undefined
    expect(link).toBeDefined()
    // No prior bundle → removeClass is undefined (nothing to remove).
    expect(link?.removeClass).toBeUndefined()
  })

  it('handleTypographyUnlink → emits removeClass with text- prefix + full inline array (C2 compound shape)', async () => {
    const onChange = vi.fn()
    const root = await mountSection('text-heading-1', onChange)

    // Pill's unlink (detach) button — TokenChip renders aria-label="Detach token".
    const unlinkButton = root.querySelector('button[aria-label="Detach token"]') as HTMLElement
    expect(unlinkButton).toBeTruthy()
    unlinkButton.click()
    await flushEffects()

    const calls = onChange.mock.calls.map(([c]) => c as TypographyChange)
    const unlink = calls.find((c) => 'kind' in c && c.kind === 'unlink-text-component') as
      | { kind: 'unlink-text-component'; removeClass: string; inline: Array<{ property: string; value: string }> }
      | undefined
    expect(unlink).toBeDefined()
    expect(unlink?.removeClass).toBe('text-heading-1')

    // C2 compound shape: the `inline` array carries the 5 preservation
    // properties in a form Panel can pass directly to applyClassChange's
    // `inlineSets`. Panel.handleTypographyChange maps
    // change.inline → applyClassChange({inlineSets: change.inline}).
    // If this shape regresses (e.g., empty values, missing props, wrong
    // property names), the server-side compound edit will reject via
    // validateInlineOps with reason_code: 'invalid_class_token'.
    expect(unlink?.inline).toHaveLength(5)
    const propertyNames = unlink?.inline.map((e) => e.property).sort()
    expect(propertyNames).toEqual([
      'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height',
    ])
    // Every value must be non-empty — empty-value inline edits were the
    // bug commit 11066da removed, and the compound protocol inherits
    // that invariant (validateInlineOps rejects empty-string sets).
    for (const entry of unlink?.inline ?? []) {
      expect(entry.value).not.toBe('')
      expect(typeof entry.value).toBe('string')
    }
  })
})
