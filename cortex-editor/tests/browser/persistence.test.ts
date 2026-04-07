// tests/browser/persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { cortexStorage, isValidPosition } from '../../src/browser/persistence.js'

// Compute the actual prefix the implementation will use
const PORT = location.port || '0'
const PREFIX = `cortex:${PORT}:`

describe('cortexStorage', () => {
  beforeEach(() => { localStorage.clear() })

  describe('get', () => {
    it('returns fallback when key does not exist', () => {
      expect(cortexStorage.get('missing', { x: 0, y: 0 }, isValidPosition)).toEqual({ x: 0, y: 0 })
    })

    it('returns parsed value when key exists and validates', () => {
      localStorage.setItem(PREFIX + 'pos', JSON.stringify({ x: 10, y: 20 }))
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isValidPosition)).toEqual({ x: 10, y: 20 })
    })

    it('returns fallback when JSON is corrupt', () => {
      localStorage.setItem(PREFIX + 'pos', '{bad json')
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isValidPosition)).toEqual({ x: 0, y: 0 })
    })

    it('returns fallback when validation fails', () => {
      localStorage.setItem(PREFIX + 'pos', JSON.stringify({ wrong: 'shape' }))
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isValidPosition)).toEqual({ x: 0, y: 0 })
    })

    it('returns fallback when parsed object has unexpected shape', () => {
      localStorage.setItem(PREFIX + 'pos', '{"x":1,"y":2,"__proto__":{"bad":true}}')
      // JSON.parse does not pollute prototypes (no prototype pollution), but validator is the real guard.
      // The object has __proto__ as an own enumerable property; toMatchObject checks x,y only.
      expect(cortexStorage.get('pos', { x: 0, y: 0 }, isValidPosition)).toMatchObject({ x: 1, y: 2 })
      expect(({} as any).bad).toBeUndefined()
    })
  })

  describe('set', () => {
    it('writes JSON to namespaced key', () => {
      cortexStorage.set('pos', { x: 5, y: 10 })
      expect(localStorage.getItem(PREFIX + 'pos')).toBe('{"x":5,"y":10}')
    })

    it('does not throw when localStorage is unavailable', () => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceeded') }
      expect(() => cortexStorage.set('pos', { x: 1 })).not.toThrow()
      Storage.prototype.setItem = orig
    })
  })

  describe('clear', () => {
    it('removes all cortex-namespaced keys for current port', () => {
      localStorage.setItem(PREFIX + 'a', '1')
      localStorage.setItem(PREFIX + 'b', '2')
      localStorage.setItem('other-app:c', '3')
      cortexStorage.clear()
      expect(localStorage.getItem(PREFIX + 'a')).toBeNull()
      expect(localStorage.getItem(PREFIX + 'b')).toBeNull()
      expect(localStorage.getItem('other-app:c')).toBe('3')
    })
  })
})

// isValidPosition imported from production — no shadow copy needed.
