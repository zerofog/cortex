import { describe, it, expect } from 'vitest'
import { parseCortexSource, getLabel, getSelectionLabel, encodeFilePath, isLibraryComponent, findUserAncestor } from '../../src/browser/label.js'

describe('parseCortexSource', () => {
  function makeEl(source: string): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', source)
    return el
  }

  it('parses Unix-style path with line and column', () => {
    const info = parseCortexSource(makeEl('src/Hero.tsx:14:5'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '14',
      filePath: 'src/Hero.tsx',
    })
  })

  it('parses Windows drive letter path (C:\\...)', () => {
    const info = parseCortexSource(makeEl('C:\\src\\Hero.tsx:14:5'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '14',
      filePath: 'C:\\src\\Hero.tsx',
    })
  })

  it('parses Windows path with forward slashes', () => {
    const info = parseCortexSource(makeEl('C:/src/Hero.tsx:14:5'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '14',
      filePath: 'C:/src/Hero.tsx',
    })
  })

  it('handles path with no line/column', () => {
    const info = parseCortexSource(makeEl('src/Hero.tsx'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '',
      filePath: 'src/Hero.tsx',
    })
  })

  it('handles path with only line (no column)', () => {
    const info = parseCortexSource(makeEl('src/Hero.tsx:14'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '14',
      filePath: 'src/Hero.tsx',
    })
  })

  it('returns null when no data-cortex-source attribute', () => {
    const el = document.createElement('div')
    expect(parseCortexSource(el)).toBeNull()
  })

  it('sets componentName to null for lowercase filenames', () => {
    const info = parseCortexSource(makeEl('src/utils.ts:10:1'))
    expect(info?.componentName).toBeNull()
    expect(info?.fileName).toBe('utils.ts')
  })

  it('handles backslash-only Windows paths', () => {
    const info = parseCortexSource(makeEl('D:\\projects\\app\\Nav.tsx:42:8'))
    expect(info).toEqual({
      componentName: 'Nav',
      fileName: 'Nav.tsx',
      line: '42',
      filePath: 'D:\\projects\\app\\Nav.tsx',
    })
  })

  it('handles Windows path with line only (no column)', () => {
    const info = parseCortexSource(makeEl('C:\\src\\Hero.tsx:14'))
    expect(info).toEqual({
      componentName: 'Hero',
      fileName: 'Hero.tsx',
      line: '14',
      filePath: 'C:\\src\\Hero.tsx',
    })
  })

  it('handles non-numeric trailing segment as no line/col', () => {
    const info = parseCortexSource(makeEl('src/my:component.tsx'))
    expect(info).toEqual({
      componentName: null,
      fileName: 'my:component.tsx',
      line: '',
      filePath: 'src/my:component.tsx',
    })
  })
})

describe('getLabel', () => {
  it('returns component name when available', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    expect(getLabel(el)).toBe('Hero')
  })

  it('falls back to tag.class when no component name', () => {
    const el = document.createElement('div')
    el.className = 'my-class other-class'
    expect(getLabel(el)).toBe('div.my-class')
  })

  it('falls back to tag when no class or source', () => {
    const el = document.createElement('section')
    expect(getLabel(el)).toBe('section')
  })
})

describe('encodeFilePath', () => {
  it('preserves forward slashes', () => {
    expect(encodeFilePath('src/components/Hero.tsx')).toBe('src/components/Hero.tsx')
  })

  it('preserves backslashes', () => {
    expect(encodeFilePath('src\\components\\Hero.tsx')).toBe('src\\components\\Hero.tsx')
  })

  it('encodes # in path segments', () => {
    expect(encodeFilePath('src/C#/Component.tsx')).toBe('src/C%23/Component.tsx')
  })

  it('encodes ? in path segments', () => {
    expect(encodeFilePath('src/foo?bar/Hero.tsx')).toBe('src/foo%3Fbar/Hero.tsx')
  })

  it('encodes spaces in path segments', () => {
    expect(encodeFilePath('src/My Component/Hero.tsx')).toBe('src/My%20Component/Hero.tsx')
  })

  it('preserves Windows drive letter colon', () => {
    expect(encodeFilePath('C:\\src\\Hero.tsx')).toBe('C:\\src\\Hero.tsx')
  })

  it('preserves drive letter with forward slashes', () => {
    expect(encodeFilePath('C:/src/Hero.tsx')).toBe('C:/src/Hero.tsx')
  })
})

describe('getSelectionLabel', () => {
  it('returns "ComponentName — file:line" when all info present', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx:14:5')
    expect(getSelectionLabel(el)).toBe('Hero — Hero.tsx:14')
  })

  it('returns "ComponentName — file" when no line', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'src/Hero.tsx')
    expect(getSelectionLabel(el)).toBe('Hero — Hero.tsx')
  })

  it('falls back to tag.class when no source info', () => {
    const el = document.createElement('div')
    el.className = 'wrapper'
    expect(getSelectionLabel(el)).toBe('div.wrapper')
  })
})

describe('isLibraryComponent', () => {
  it('returns false for elements without data-cortex-source', () => {
    const el = document.createElement('div')
    expect(isLibraryComponent(el)).toBe(false)
  })

  it('returns true when source path contains /node_modules/', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/app/node_modules/@radix-ui/button/dist/index.js:10:5')
    expect(isLibraryComponent(el)).toBe(true)
  })

  it('returns false for user-space source paths', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', '/app/src/components/Button.tsx:15:3')
    expect(isLibraryComponent(el)).toBe(false)
  })

  it('uses segment-based matching (not bare substring)', () => {
    const el = document.createElement('div')
    // Path that contains "node_modules" but NOT as a segment
    el.setAttribute('data-cortex-source', '/app/src/not_node_modules/thing.tsx:1:1')
    expect(isLibraryComponent(el)).toBe(false)
  })

  it('detects library component with relative path (no leading slash)', () => {
    const el = document.createElement('div')
    el.setAttribute('data-cortex-source', 'node_modules/@test-lib/card/index.tsx:3:5')
    expect(isLibraryComponent(el)).toBe(true)
  })
})

describe('findUserAncestor', () => {
  it('returns null for element with no ancestors having data-cortex-source', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    expect(findUserAncestor(el)).toBe(null)
    el.remove()
  })

  it('finds the nearest user-space ancestor', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', '/app/src/Login.tsx:42:5')
    const child = document.createElement('button')
    child.setAttribute('data-cortex-source', '/app/node_modules/@ui/Button.tsx:10:3')
    parent.appendChild(child)
    document.body.appendChild(parent)

    const result = findUserAncestor(child)
    expect(result).not.toBe(null)
    expect(result!.source.fileName).toBe('Login.tsx')
    expect(result!.element).toBe(parent)

    parent.remove()
  })

  it('skips ancestors whose source is also in node_modules', () => {
    const grandparent = document.createElement('div')
    grandparent.setAttribute('data-cortex-source', '/app/src/App.tsx:5:1')
    const parent = document.createElement('div')
    parent.setAttribute('data-cortex-source', '/app/node_modules/@ui/Card.tsx:20:3')
    const child = document.createElement('span')
    child.setAttribute('data-cortex-source', '/app/node_modules/@ui/Icon.tsx:8:2')
    grandparent.appendChild(parent)
    parent.appendChild(child)
    document.body.appendChild(grandparent)

    const result = findUserAncestor(child)
    expect(result!.source.fileName).toBe('App.tsx')
    expect(result!.element).toBe(grandparent)

    grandparent.remove()
  })
})
