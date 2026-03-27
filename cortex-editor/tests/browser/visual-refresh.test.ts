import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stylesPath = resolve(__dirname, '../../src/browser/styles.css')
const styles = readFileSync(stylesPath, 'utf8')

describe('Visual Refresh: Token Migration', () => {
  it('has no --cortex-* token references', () => {
    const matches = styles.match(/--cortex-\w+/g)
    expect(matches).toBeNull()
  })

  it('defines all domain-named tokens in :host', () => {
    const hostBlock = styles.match(/:host\s*\{([^}]+)\}/s)?.[1] ?? ''

    const required = [
      '--ink', '--ink-secondary', '--ink-tertiary', '--ink-ghost', '--ink-faint',
      '--paper', '--vellum', '--well', '--well-hover', '--well-active', '--well-shadow',
      '--rule', '--rule-soft',
      '--select', '--select-hover', '--select-muted',
      '--destructive', '--destructive-surface',
      '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5',
      '--radius-sm', '--radius-md', '--radius-lg', '--radius-lg-inner',
      '--text-sm', '--text-md', '--text-lg',
      '--weight-label', '--weight-value', '--weight-title',
      '--mono',
    ]

    for (const token of required) {
      expect(hostBlock, `Missing token: ${token}`).toContain(token + ':')
    }
  })

  it('uses no hardcoded interaction colors outside :host', () => {
    const withoutHost = styles.replace(/:host\s*\{[^}]+\}/s, '')
    expect(withoutHost).not.toContain('#efefef')
    expect(withoutHost).not.toContain('#ebebeb')
    expect(withoutHost).not.toContain('#c9cdd3')
  })
})

describe('Visual Refresh: Tooltip System', () => {
  it('tooltip uses animated entrance (opacity + transform transition)', () => {
    expect(styles).toContain('[data-tooltip]::after')
    expect(styles).toContain('opacity: 0')
    expect(styles).toContain('transition: opacity 150ms ease-out, transform 150ms ease-out')
  })

  it('panel header tooltips appear below (directional)', () => {
    expect(styles).toContain('.cortex-panel-header [data-tooltip]::after')
  })

  it('hides tooltip on disabled buttons', () => {
    expect(styles).toContain('[data-tooltip]:disabled::after')
  })
})

describe('Visual Refresh: Override Indicator', () => {
  it('numeric input override turns value blue', () => {
    expect(styles).toContain('.cortex-numeric-input--overridden')
    expect(styles).toContain('var(--select-hover)')
  })

  it('dropdown override turns value blue', () => {
    expect(styles).toContain('.cortex-dropdown--overridden')
  })

  it('color input override turns hex blue', () => {
    expect(styles).toContain('.cortex-color-input--overridden')
  })
})

describe('Visual Refresh: Scrub Affordance', () => {
  it('numeric input has scrub hint pseudo-element', () => {
    expect(styles).toContain('.cortex-numeric-input::before')
  })

  it('scrub hint fades in on hover', () => {
    expect(styles).toContain('.cortex-numeric-input:hover::before')
    expect(styles).toContain('var(--ink-ghost)')
  })
})

describe('Visual Refresh: Entry Animation', () => {
  it('panel entrance uses opacity + translateY', () => {
    expect(styles).toContain('cortex-slide-in')
    expect(styles).toContain('transform: translateY(6px)')
  })

  it('section groups have stagger animation', () => {
    expect(styles).toContain('cortex-group-enter')
    expect(styles).toContain('animation-delay')
  })

  it('toolbar uses scale entrance', () => {
    expect(styles).toContain('transform: scale(0.95)')
  })
})

describe('Visual Refresh: Interaction Layer', () => {
  it('focus-visible rings use --select-muted', () => {
    expect(styles).toContain(':focus-visible')
    expect(styles).toContain('outline-color: var(--select-muted)')
  })

  it('prefers-reduced-motion kills all animations', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation-duration: 0.01ms !important')
    expect(styles).toContain('transition-duration: 0.01ms !important')
  })
})

describe('Visual Refresh: Toolbar Structure', () => {
  it('toolbar CSS has mode switcher classes', () => {
    expect(styles).toContain('.cortex-toolbar__modes')
    expect(styles).toContain('.cortex-toolbar__modes-indicator')
    expect(styles).toContain('.cortex-toolbar__mode')
    expect(styles).toContain('.cortex-toolbar__divider')
  })

  it('toolbar buttons are 36x36', () => {
    const btnRule = styles.match(/\.cortex-toolbar__btn\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(btnRule).toContain('width: 36px')
    expect(btnRule).toContain('height: 36px')
  })

  it('badge uses well background pill', () => {
    const badgeRule = styles.match(/\.cortex-toolbar__badge\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(badgeRule).toContain('background: var(--well)')
    expect(badgeRule).toContain('font-family: var(--mono)')
  })
})

describe('Visual Refresh: Panel Chrome', () => {
  it('panel uses --radius-lg (8px corners)', () => {
    const panelRule = styles.match(/\.cortex-panel\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(panelRule).toContain('border-radius: var(--radius-lg)')
  })

  it('panel header uses --vellum background', () => {
    const headerRule = styles.match(/\.cortex-panel-header\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(headerRule).toContain('background: var(--vellum)')
  })
})
