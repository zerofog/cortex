import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractThemeProperties, themePropertiesToResolved, parseV4Theme } from '../../src/core/tailwind-v4-parser.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

describe('extractThemeProperties', () => {
  it('extracts CSS custom properties from @theme block', () => {
    const css = `@theme { --color-brand: #1a73e8; --spacing: 0.25rem; }`
    const props = extractThemeProperties(css)
    expect(props.get('--color-brand')).toBe('#1a73e8')
    expect(props.get('--spacing')).toBe('0.25rem')
  })

  it('handles multiple @theme blocks in order', () => {
    const css = `
      @theme default { --color-red-500: oklch(63.7% 0.237 25.33); }
      @theme { --color-red-500: #custom; }
    `
    const props = extractThemeProperties(css)
    expect(props.get('--color-red-500')).toBe('#custom')
  })

  it('handles --*: initial (clear all)', () => {
    const css = `
      @theme default { --color-red-500: #ef4444; --spacing: 0.25rem; }
      @theme { --*: initial; --color-brand: #1a73e8; }
    `
    const props = extractThemeProperties(css)
    expect(props.has('--color-red-500')).toBe(false)
    expect(props.has('--spacing')).toBe(false)
    expect(props.get('--color-brand')).toBe('#1a73e8')
  })

  it('handles --color-*: initial (clear namespace)', () => {
    const css = `
      @theme default { --color-red-500: #ef4444; --spacing: 0.25rem; }
      @theme { --color-*: initial; --color-brand: #1a73e8; }
    `
    const props = extractThemeProperties(css)
    expect(props.has('--color-red-500')).toBe(false)
    expect(props.get('--spacing')).toBe('0.25rem')
    expect(props.get('--color-brand')).toBe('#1a73e8')
  })

  it('ignores non-custom-property declarations', () => {
    const css = `@theme { color: red; --spacing: 0.25rem; }`
    const props = extractThemeProperties(css)
    expect(props.size).toBe(1)
    expect(props.get('--spacing')).toBe('0.25rem')
  })

  it('ignores declarations outside @theme', () => {
    const css = `:root { --spacing: 1rem; } @theme { --spacing: 0.25rem; }`
    const props = extractThemeProperties(css)
    expect(props.get('--spacing')).toBe('0.25rem')
    expect(props.size).toBe(1)
  })
})

describe('themePropertiesToResolved', () => {
  it('generates spacing scale from base value', () => {
    const props = new Map([['--spacing', '0.25rem']])
    const theme = themePropertiesToResolved(props)
    expect(theme.spacing?.['0']).toBe('0px')
    expect(theme.spacing?.['px']).toBe('1px')
    expect(theme.spacing?.['1']).toBe('0.25rem')
    expect(theme.spacing?.['2']).toBe('0.5rem')
    expect(theme.spacing?.['4']).toBe('1rem')
    expect(theme.spacing?.['8']).toBe('2rem')
    expect(theme.spacing?.['0.5']).toBe('0.125rem')
  })

  it('extracts color families from --color-* properties', () => {
    const props = new Map([
      ['--color-red-50', '#fef2f2'],
      ['--color-red-500', '#ef4444'],
      ['--color-black', '#000000'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.colors).toEqual({
      red: { '50': '#fef2f2', '500': '#ef4444' },
      black: '#000000',
    })
  })

  it('converts OKLCH color values to hex', () => {
    const props = new Map([
      ['--color-red-50', 'oklch(97.1% 0.013 17.38)'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.colors?.red).toEqual({ '50': '#fef2f2' })
  })

  it('skips var() references in colors', () => {
    const props = new Map([
      ['--color-primary', 'var(--primary)'],
      ['--color-black', '#000000'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.colors).toEqual({ black: '#000000' })
  })

  it('extracts font sizes from --text-*', () => {
    const props = new Map([
      ['--text-xs', '0.75rem'],
      ['--text-base', '1rem'],
      ['--text-xs--line-height', '1rem'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.fontSize).toEqual({ xs: '0.75rem', base: '1rem' })
  })

  it('skips --text-shadow-* when extracting font sizes', () => {
    const props = new Map([
      ['--text-xs', '0.75rem'],
      ['--text-shadow-sm', '0 1px 2px rgb(0 0 0 / 5%)'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.fontSize).toEqual({ xs: '0.75rem' })
  })

  it('extracts font weights from --font-weight-*', () => {
    const props = new Map([
      ['--font-weight-bold', '700'],
      ['--font-weight-normal', '400'],
      ['--font-sans', 'ui-sans-serif'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.fontWeight).toEqual({ bold: '700', normal: '400' })
  })

  it('extracts border radius with DEFAULT from --radius', () => {
    const props = new Map([
      ['--radius', '0.25rem'],
      ['--radius-sm', '0.125rem'],
      ['--radius-lg', '0.5rem'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.borderRadius).toEqual({
      DEFAULT: '0.25rem', sm: '0.125rem', lg: '0.5rem',
    })
  })

  it('extracts box shadows from --shadow-*', () => {
    const props = new Map([
      ['--shadow', '0 1px 3px 0 rgb(0 0 0 / 0.1)'],
      ['--shadow-lg', '0 10px 15px -3px rgb(0 0 0 / 0.1)'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.boxShadow?.DEFAULT).toBe('0 1px 3px 0 rgb(0 0 0 / 0.1)')
    expect(theme.boxShadow?.lg).toBe('0 10px 15px -3px rgb(0 0 0 / 0.1)')
  })

  it('extracts blur from --blur-*', () => {
    const props = new Map([
      ['--blur', '8px'],
      ['--blur-sm', '4px'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.blur).toEqual({ DEFAULT: '8px', sm: '4px' })
  })

  it('extracts line heights from --leading-*', () => {
    const props = new Map([
      ['--leading-tight', '1.25'],
      ['--leading-loose', '2'],
    ])
    const theme = themePropertiesToResolved(props)
    expect(theme.lineHeight).toEqual({ tight: '1.25', loose: '2' })
  })

  it('adds static borderWidth defaults', () => {
    const props = new Map<string, string>()
    const theme = themePropertiesToResolved(props)
    expect(theme.borderWidth).toEqual({
      DEFAULT: '1px', '0': '0px', '2': '2px', '4': '4px', '8': '8px',
    })
  })
})

// Filesystem integration tests
let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-v4-parser-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFixture(relativePath: string, content: string): void {
  const full = path.join(tmpDir, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('parseV4Theme', () => {
  it('returns null when no v4 CSS entry found', async () => {
    writeFixture('package.json', '{}')
    const theme = await parseV4Theme(tmpDir)
    expect(theme).toBeNull()
  })

  it('parses user @theme from CSS with @import "tailwindcss"', async () => {
    writeFixture('src/app.css', `
      @import "tailwindcss";
      @theme { --spacing: 0.5rem; --color-brand: #1a73e8; }
    `)
    const theme = await parseV4Theme(tmpDir)
    expect(theme).not.toBeNull()
    expect(theme!.spacing?.['4']).toBe('2rem')
    expect(theme!.colors).toEqual({ brand: '#1a73e8' })
  })

  it('merges defaults when tailwindcss package is available', async () => {
    writeFixture('node_modules/tailwindcss/package.json', '{"name":"tailwindcss"}')
    writeFixture('node_modules/tailwindcss/theme.css', `
      @theme default { --radius: 0.25rem; --radius-sm: 0.125rem; }
    `)
    writeFixture('src/app.css', `
      @import "tailwindcss";
      @theme { --radius-lg: 0.5rem; }
    `)
    const theme = await parseV4Theme(tmpDir)
    expect(theme).not.toBeNull()
    expect(theme!.borderRadius?.DEFAULT).toBe('0.25rem')
    expect(theme!.borderRadius?.sm).toBe('0.125rem')
    expect(theme!.borderRadius?.lg).toBe('0.5rem')
  })

  it('user @theme --radius-*: initial clears default radii', async () => {
    writeFixture('node_modules/tailwindcss/package.json', '{"name":"tailwindcss"}')
    writeFixture('node_modules/tailwindcss/theme.css', `
      @theme default { --radius: 0.25rem; --radius-sm: 0.125rem; --spacing: 0.25rem; }
    `)
    writeFixture('src/app.css', `
      @import "tailwindcss";
      @theme { --radius-*: initial; --radius-pill: 9999px; }
    `)
    const theme = await parseV4Theme(tmpDir)
    expect(theme).not.toBeNull()
    expect(theme!.borderRadius).toEqual({ pill: '9999px' })
    expect(theme!.spacing?.['1']).toBe('0.25rem')
  })
})
