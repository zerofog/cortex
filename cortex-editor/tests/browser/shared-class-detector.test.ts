import { describe, it, expect, afterEach } from 'vitest'
import { detectSharedClasses, parseCssMappingBrowser } from '../../src/browser/shared-class-detector.js'

describe('parseCssMappingBrowser', () => {
  it('parses standard CSS module annotation', () => {
    const result = parseCssMappingBrowser('src/Hero.module.css:.badge')
    expect(result).toEqual({ cssFilePath: 'src/Hero.module.css', selectors: ['.badge'] })
  })

  it('parses multiple selectors', () => {
    const result = parseCssMappingBrowser('src/Hero.module.css:.badge,.heroTitle')
    expect(result).toEqual({ cssFilePath: 'src/Hero.module.css', selectors: ['.badge', '.heroTitle'] })
  })

  it.each(['scss', 'less', 'sass'] as const)('handles %s extension', (ext) => {
    const result = parseCssMappingBrowser(`src/Card.module.${ext}:.card`)
    expect(result).toEqual({ cssFilePath: `src/Card.module.${ext}`, selectors: ['.card'] })
  })

  it('trims whitespace from selectors', () => {
    const result = parseCssMappingBrowser('src/Hero.module.css:.badge, .heroTitle')
    expect(result).toEqual({ cssFilePath: 'src/Hero.module.css', selectors: ['.badge', '.heroTitle'] })
  })

  it('returns null for non-module CSS path', () => {
    expect(parseCssMappingBrowser('src/global.css:.badge')).toBeNull()
  })

  it('returns null for missing colon delimiter', () => {
    expect(parseCssMappingBrowser('src/Hero.module.css')).toBeNull()
  })

  it('returns null for empty selector after colon', () => {
    expect(parseCssMappingBrowser('src/Hero.module.css:')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseCssMappingBrowser('')).toBeNull()
  })
})

describe('detectSharedClasses', () => {
  afterEach(() => {
    // Remove all test elements
    for (const child of Array.from(document.body.children)) {
      child.remove()
    }
  })

  function el(attr?: string): HTMLElement {
    const div = document.createElement('div')
    if (attr) div.setAttribute('data-cortex-css', attr)
    document.body.appendChild(div)
    return div
  }

  it('returns null for element without data-cortex-css', () => {
    const target = el()
    expect(detectSharedClasses(target)).toBeNull()
  })

  it('returns null when only 1 element has the selector', () => {
    const target = el('src/Hero.module.css:.badge')
    expect(detectSharedClasses(target)).toBeNull()
  })

  it('returns SharedClassInfo when 2 elements share a selector', () => {
    const a = el('src/Hero.module.css:.badge')
    const b = el('src/Hero.module.css:.badge')
    const result = detectSharedClasses(a)
    expect(result).not.toBeNull()
    expect(result!.selector).toBe('.badge')
    expect(result!.cssFilePath).toBe('src/Hero.module.css')
    expect(result!.count).toBe(2)
    expect(result!.elements).toContain(a)
    expect(result!.elements).toContain(b)
  })

  it('returns SharedClassInfo with count=3 when 3 elements share a selector', () => {
    const a = el('src/Hero.module.css:.badge')
    const b = el('src/Hero.module.css:.badge')
    const c = el('src/Hero.module.css:.badge')
    const result = detectSharedClasses(a)
    expect(result).not.toBeNull()
    expect(result!.count).toBe(3)
    expect(result!.elements).toEqual(expect.arrayContaining([a, b, c]))
    expect(result!.elements).toHaveLength(3)
  })

  it('returns the most-shared selector from a multi-selector annotation', () => {
    // .badge is on 2 elements, .heroTitle is only on 1
    const target = el('src/Hero.module.css:.badge,.heroTitle')
    el('src/Hero.module.css:.badge')
    const result = detectSharedClasses(target)
    expect(result).not.toBeNull()
    expect(result!.selector).toBe('.badge')
    expect(result!.count).toBe(2)
  })

  it('returns the higher-count selector when both are shared', () => {
    // .badge shared by 3, .heroTitle shared by 2
    const target = el('src/Hero.module.css:.badge,.heroTitle')
    el('src/Hero.module.css:.badge')
    el('src/Hero.module.css:.badge')
    el('src/Hero.module.css:.heroTitle')
    const result = detectSharedClasses(target)
    expect(result).not.toBeNull()
    expect(result!.selector).toBe('.badge')
    expect(result!.count).toBe(3)
  })

  it('returns null for invalid data-cortex-css format', () => {
    const target = el('not-a-module-path')
    expect(detectSharedClasses(target)).toBeNull()
  })

  it('distinguishes similar but non-matching selectors (.badge vs .badge-large)', () => {
    const target = el('src/Hero.module.css:.badge')
    el('src/Hero.module.css:.badge-large')
    // .badge is only on 1 element, .badge-large is only on 1 element
    expect(detectSharedClasses(target)).toBeNull()
  })

  it('does not match selectors across different CSS file paths', () => {
    // Same selector name in different files — CSS Modules scopes them independently.
    // Editing .badge in Hero.module.css would NOT affect Card.module.css:.badge.
    const target = el('src/Hero.module.css:.badge')
    el('src/Card.module.css:.badge')
    expect(detectSharedClasses(target)).toBeNull()
  })

  it('does not count the same element twice', () => {
    const target = el('src/Hero.module.css:.badge')
    el('src/Hero.module.css:.badge')
    const result = detectSharedClasses(target)
    expect(result).not.toBeNull()
    expect(result!.count).toBe(2)
    expect(result!.elements).toHaveLength(2)
  })
})
