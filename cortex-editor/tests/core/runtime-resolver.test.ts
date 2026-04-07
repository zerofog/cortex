import { describe, it, expect } from 'vitest'
import { RuntimeCSSResolver } from '../../src/core/rewriter/runtime-resolver.js'

function mockReadFile(content: string) {
  return async (_path: string) => content
}

describe('RuntimeCSSResolver', () => {
  it('resolves default import: styles.hero → .hero', async () => {
    const source = `
import styles from './Hero.module.css'

export function Hero() {
  return <div className={styles.hero}>Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:4:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.hero',
    })
    resolver.dispose()
  })

  it('resolves named default import: import { default as s }', async () => {
    const source = `
import { default as s } from './Hero.module.css'

export function Hero() {
  return <div className={s.hero}>Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:4:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.hero',
    })
    resolver.dispose()
  })

  it('returns null when no CSS module import exists', async () => {
    const source = `
import React from 'react'

export function Hero() {
  return <div className="hero">Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:4:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toBeNull()
    resolver.dispose()
  })

  it('returns selector "*" for dynamic computed access styles[variant]', async () => {
    const source = `
import styles from './Hero.module.css'

export function Hero({ variant }) {
  return <div className={styles[variant]}>Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:4:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '*',
    })
    resolver.dispose()
  })

  it('resolves bracket access with string literal styles["hero"]', async () => {
    const source = `
import styles from './Hero.module.css'

export function Hero() {
  return <div className={styles['hero']}>Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:4:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.hero',
    })
    resolver.dispose()
  })

  it('resolves the correct binding with multiple CSS module imports', async () => {
    const source = `
import base from './Base.module.css'
import hero from './Hero.module.css'

export function Hero() {
  return <div className={hero.wrapper}>Hello</div>
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:5:10',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.wrapper',
    })
    resolver.dispose()
  })

  it('returns null for non-JSX file content', async () => {
    const source = `
const x = 42
console.log(x)
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/util.ts:2:1',
      '/project',
      mockReadFile(source),
    )

    expect(result).toBeNull()
    resolver.dispose()
  })

  it('resolves the right element at specific line:col', async () => {
    const source = `
import styles from './Hero.module.css'

export function Hero() {
  return (
    <div className={styles.outer}>
      <span className={styles.inner}>Hello</span>
    </div>
  )
}
`.trim()

    const resolver = new RuntimeCSSResolver()
    const result = await resolver.resolve(
      '/project/src/Hero.tsx:6:7',
      '/project',
      mockReadFile(source),
    )

    expect(result).toEqual({
      cssFilePath: '/project/src/Hero.module.css',
      selector: '.inner',
    })
    resolver.dispose()
  })

  it('dispose() does not throw on double-dispose', () => {
    const resolver = new RuntimeCSSResolver()
    resolver.dispose()
    expect(() => resolver.dispose()).not.toThrow()
  })
})
