import { afterEach, describe, expect, it } from 'vitest'
import { collectPageColorNames, markPageColorChips } from '../../src/browser/page-color-chips.js'
import type { ColorChip } from '../../src/browser/token-detector.js'

const CHIPS: readonly ColorChip[] = [
  { name: 'surface', hex: '#ffffff', aliases: ['white'] },
  { name: 'border-muted', hex: '#e2e8f0', aliases: ['slate-200'] },
  { name: 'amber-50', hex: '#fffbeb' },
  { name: 'amber-300', hex: '#ffd237' },
  { name: 'blue-900', hex: '#1c398e' },
  { name: 'red-500', hex: '#fb2c36' },
]

afterEach(() => {
  document.documentElement.className = ''
  document.body.innerHTML = ''
})

describe('markPageColorChips', () => {
  it('marks chips from the rendered page DOM and preserves alias matches', () => {
    document.body.innerHTML = `
      <main>
        <section class="bg-white border-slate-200 text-amber-50 hover:bg-amber-300 dark:bg-blue-900">
          demo
        </section>
      </main>
    `

    expect([...collectPageColorNames(document)]).toEqual(['white', 'slate-200', 'amber-50'])
    expect(markPageColorChips(CHIPS, document)).toEqual([
      { name: 'surface', hex: '#ffffff', aliases: ['white'], source: 'page' },
      { name: 'border-muted', hex: '#e2e8f0', aliases: ['slate-200'], source: 'page' },
      { name: 'amber-50', hex: '#fffbeb', source: 'page' },
      { name: 'amber-300', hex: '#ffd237', source: 'theme' },
      { name: 'blue-900', hex: '#1c398e', source: 'theme' },
      { name: 'red-500', hex: '#fb2c36', source: 'theme' },
    ])
  })

  it('includes dark variant utilities only when the page is currently dark', () => {
    document.documentElement.className = 'dark'
    document.body.innerHTML = '<section class="bg-white dark:bg-blue-900">demo</section>'

    expect([...collectPageColorNames(document)]).toEqual(['white', 'blue-900'])
    expect(markPageColorChips(CHIPS, document).filter((chip) => chip.source === 'page').map((chip) => chip.name)).toEqual([
      'surface',
      'blue-900',
    ])
  })

  it('ignores Cortex UI classes when scanning the host page', () => {
    document.body.innerHTML = `
      <main class="bg-white">demo</main>
      <div data-cortex-host>
        <div class="bg-red-500">editor chrome</div>
      </div>
    `

    expect([...collectPageColorNames(document)]).toEqual(['white'])
    expect(markPageColorChips(CHIPS, document).filter((chip) => chip.source === 'page').map((chip) => chip.name)).toEqual([
      'surface',
    ])
  })
})
