import { describe, it, expect, beforeEach } from 'vitest'
import { AnnotationStore } from '../../src/core/annotations.js'

describe('AnnotationStore', () => {
  let store: AnnotationStore

  beforeEach(() => {
    store = new AnnotationStore()
  })

  it('creates an annotation with pending status', () => {
    const ann = store.create({
      elementSource: 'App.tsx:10:5',
      text: 'Make this bigger',
    })
    expect(ann.id).toBeTruthy()
    expect(ann.status).toBe('pending')
    expect(ann.elementSource).toBe('App.tsx:10:5')
    expect(ann.text).toBe('Make this bigger')
    expect(ann.thread).toEqual([])
    expect(ann.createdAt).toBeGreaterThan(0)
    expect(ann.updatedAt).toBeGreaterThan(0)
  })

  it('getPending returns only pending annotations', () => {
    const a1 = store.create({ elementSource: 'App.tsx:1:1', text: 'first' })
    const a2 = store.create({ elementSource: 'App.tsx:2:1', text: 'second' })
    store.acknowledge(a2.id)

    const pending = store.getPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.id).toBe(a1.id)
  })

  it('getById returns annotation or null', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    expect(store.getById(ann.id)).toMatchObject({ id: ann.id })
    expect(store.getById('nonexistent')).toBeNull()
  })

  it('acknowledge transitions pending → acknowledged', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const updated = store.acknowledge(ann.id)
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('acknowledged')
    expect(store.getById(ann.id)!.status).toBe('acknowledged')
  })

  it('resolve transitions acknowledged → resolved', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    const resolved = store.resolve(ann.id, 'Increased padding to lg')
    expect(resolved).not.toBeNull()
    expect(resolved!.status).toBe('resolved')
    expect(resolved!.resolution).toEqual({
      summary: 'Increased padding to lg',
    })
  })

  it('dismiss transitions pending → dismissed', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const dismissed = store.dismiss(ann.id, 'not applicable')
    expect(dismissed).not.toBeNull()
    expect(dismissed!.status).toBe('dismissed')
    expect(dismissed!.dismissReason).toBe('not applicable')
  })

  it('dismiss transitions acknowledged → dismissed', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    const dismissed = store.dismiss(ann.id)
    expect(dismissed).not.toBeNull()
    expect(dismissed!.status).toBe('dismissed')
  })

  it('rejects pending → resolved (must acknowledge first)', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const result = store.resolve(ann.id, 'summary')
    expect(result).toBeNull()
    expect(store.getById(ann.id)!.status).toBe('pending')
  })

  it('rejects transitions from terminal states', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')

    expect(store.acknowledge(ann.id)).toBeNull()
    expect(store.resolve(ann.id, 'again')).toBeNull()
    expect(store.dismiss(ann.id)).toBeNull()

    const ann2 = store.create({ elementSource: 'App.tsx:2:1', text: 'test2' })
    store.dismiss(ann2.id)
    expect(store.acknowledge(ann2.id)).toBeNull()
    expect(store.resolve(ann2.id, 'nope')).toBeNull()
    expect(store.dismiss(ann2.id)).toBeNull()
  })

  it('rejects repeated transition to same state', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    // acknowledge again (already acknowledged, not pending)
    expect(store.acknowledge(ann.id)).toBeNull()
  })

  it('addMessage adds to thread in non-terminal state', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    const updated = store.addMessage(ann.id, {
      from: 'user',
      text: 'Can you fix this?',
    })
    expect(updated).not.toBeNull()
    expect(updated!.thread).toHaveLength(1)
    expect(updated!.thread[0]!.from).toBe('user')
    expect(updated!.thread[0]!.text).toBe('Can you fix this?')
    expect(updated!.thread[0]!.id).toBeTruthy()
    expect(updated!.thread[0]!.timestamp).toBeGreaterThan(0)
  })

  it('addMessage rejects for terminal states', () => {
    const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
    store.acknowledge(ann.id)
    store.resolve(ann.id, 'done')
    expect(
      store.addMessage(ann.id, { from: 'agent', text: 'too late' }),
    ).toBeNull()

    const ann2 = store.create({ elementSource: 'App.tsx:2:1', text: 'test2' })
    store.dismiss(ann2.id)
    expect(
      store.addMessage(ann2.id, { from: 'user', text: 'too late' }),
    ).toBeNull()
  })

  it('creates annotation with pinPosition', () => {
    const ann = store.create({
      elementSource: 'App.tsx:5:3',
      text: 'move this',
      pinPosition: { x: 0.5, y: 0.3 },
    })
    expect(ann.pinPosition).toEqual({ x: 0.5, y: 0.3 })
  })

  it('getAll returns all annotations', () => {
    store.create({ elementSource: 'App.tsx:1:1', text: 'a' })
    store.create({ elementSource: 'App.tsx:2:1', text: 'b' })
    store.create({ elementSource: 'App.tsx:3:1', text: 'c' })
    expect(store.getAll()).toHaveLength(3)
  })

  describe('eviction policy (count cap)', () => {
    it('evicts oldest terminal entry when terminal count exceeds maxTerminal', () => {
      const store = new AnnotationStore({ maxTerminal: 3 })
      const ids: string[] = []
      for (let i = 0; i < 4; i++) {
        const ann = store.create({
          elementSource: `App.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(ann.id)
        store.resolve(ann.id, `summary ${i}`)
        ids.push(ann.id)
      }

      expect(store.getById(ids[0]!)).toBeNull()
      expect(store.getById(ids[1]!)).not.toBeNull()
      expect(store.getById(ids[2]!)).not.toBeNull()
      expect(store.getById(ids[3]!)).not.toBeNull()
      expect(store.getAll()).toHaveLength(3)
    })

    it('never evicts pending or acknowledged entries regardless of cap', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      // Three pending entries — none have flipped terminal.
      const p1 = store.create({ elementSource: 'A.tsx:1:1', text: 'p1' })
      const p2 = store.create({ elementSource: 'A.tsx:2:1', text: 'p2' })
      const p3 = store.create({ elementSource: 'A.tsx:3:1', text: 'p3' })

      // Two acknowledged — still in flight.
      const a1 = store.create({ elementSource: 'A.tsx:4:1', text: 'a1' })
      const a2 = store.create({ elementSource: 'A.tsx:5:1', text: 'a2' })
      store.acknowledge(a1.id)
      store.acknowledge(a2.id)

      // Drive THREE separate entries through to resolved — terminalOrder push
      // count is 3 > maxTerminal=2 → oldest terminal evicts. Pending/ack must
      // be untouched.
      for (let i = 0; i < 3; i++) {
        const t = store.create({
          elementSource: `T.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(t.id)
        store.resolve(t.id, `s${i}`)
      }

      expect(store.getById(p1.id)).not.toBeNull()
      expect(store.getById(p2.id)).not.toBeNull()
      expect(store.getById(p3.id)).not.toBeNull()
      expect(store.getById(a1.id)).not.toBeNull()
      expect(store.getById(a2.id)).not.toBeNull()
      // 5 in-flight + 2 surviving terminal = 7.
      expect(store.getAll()).toHaveLength(7)
    })

    it('evicts terminal entries in FIFO order (oldest terminal flip evicts first)', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      // Create three annotations, but resolve them OUT OF CREATION ORDER:
      // - a1 created first, but resolved LAST.
      // - a3 created last, but resolved FIRST.
      const a1 = store.create({
        elementSource: 'A.tsx:1:1',
        text: 'first created',
      })
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'middle' })
      const a3 = store.create({
        elementSource: 'A.tsx:3:1',
        text: 'last created',
      })

      store.acknowledge(a3.id)
      store.resolve(a3.id, 'a3 done') // terminal #1
      store.acknowledge(a2.id)
      store.resolve(a2.id, 'a2 done') // terminal #2
      store.acknowledge(a1.id)
      store.resolve(a1.id, 'a1 done') // terminal #3 → evicts a3

      expect(store.getById(a3.id)).toBeNull() // first terminal-flipped → first evicted
      expect(store.getById(a2.id)).not.toBeNull()
      expect(store.getById(a1.id)).not.toBeNull()
    })

    it('dismiss participates in the same FIFO queue as resolve', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      const a1 = store.create({ elementSource: 'A.tsx:1:1', text: 'one' })
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'two' })
      const a3 = store.create({ elementSource: 'A.tsx:3:1', text: 'three' })

      store.dismiss(a1.id) // terminal #1 (dismiss)
      store.acknowledge(a2.id)
      store.resolve(a2.id, 's') // terminal #2 (resolve)
      store.dismiss(a3.id) // terminal #3 → evicts a1

      expect(store.getById(a1.id)).toBeNull()
      expect(store.getById(a2.id)).not.toBeNull()
      expect(store.getById(a3.id)).not.toBeNull()
    })

    it('rejects non-positive maxTerminal at construction', () => {
      expect(() => new AnnotationStore({ maxTerminal: 0 })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: -1 })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: 1.5 })).toThrow(
        /positive integer/,
      )
      // Number.isInteger also rejects NaN and Infinity; lock those in so a
      // future refactor to `max <= 0 || !Number.isInteger(max)` keeps coverage.
      expect(() => new AnnotationStore({ maxTerminal: NaN })).toThrow(
        /positive integer/,
      )
      expect(() => new AnnotationStore({ maxTerminal: Infinity })).toThrow(
        /positive integer/,
      )
    })

    it('snapshot captured before eviction retains its payload after the entry is evicted', () => {
      const store = new AnnotationStore({ maxTerminal: 2 })

      const a1 = store.create({ elementSource: 'A.tsx:1:1', text: 'first' })
      store.acknowledge(a1.id)
      const snap1 = store.resolve(a1.id, 'first done')!
      const a2 = store.create({ elementSource: 'A.tsx:2:1', text: 'second' })
      store.acknowledge(a2.id)
      store.resolve(a2.id, 'second done')

      // Cause an eviction of a1.
      const a3 = store.create({ elementSource: 'A.tsx:3:1', text: 'third' })
      store.acknowledge(a3.id)
      store.resolve(a3.id, 'third done')

      // What this test actually proves: a snapshot captured at terminal-flip time
      // continues to carry its full payload AFTER the underlying entry is evicted
      // from the store. (Note: this does NOT prove `snapshot()` returns a copy vs
      // a live reference — terminal entries are immutable through the public API,
      // so the copy-vs-reference distinction is unobservable post-resolve.)
      expect(snap1.id).toBe(a1.id)
      expect(snap1.status).toBe('resolved')
      expect(snap1.resolution).toEqual({ summary: 'first done' })
      expect(snap1.thread).toEqual([])

      // The store no longer holds a1.
      expect(store.getById(a1.id)).toBeNull()
    })

    it('default maxTerminal is 100 (regression guard)', () => {
      const store = new AnnotationStore()
      // Create 101 terminal entries; entry #1 must be evicted.
      const ids: string[] = []
      for (let i = 0; i < 101; i++) {
        const ann = store.create({
          elementSource: `App.tsx:${i}:1`,
          text: `t${i}`,
        })
        store.acknowledge(ann.id)
        store.resolve(ann.id, `s${i}`)
        ids.push(ann.id)
      }
      expect(store.getById(ids[0]!)).toBeNull()
      expect(store.getById(ids[1]!)).not.toBeNull()
      expect(store.getAll()).toHaveLength(100)
    })
  })

  describe('getActive', () => {
    it.each([
      ['pending', true],
      ['acknowledged', true],
      ['resolved', false],
      ['dismissed', false],
    ] as const)('status=%s: included=%s', (status, shouldBeIncluded) => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      if (status === 'acknowledged') {
        store.acknowledge(ann.id)
      } else if (status === 'resolved') {
        store.acknowledge(ann.id)
        store.resolve(ann.id, 'done')
      } else if (status === 'dismissed') {
        store.dismiss(ann.id)
      }
      // pending requires no transition

      const active = store.getActive()
      if (shouldBeIncluded) {
        expect(active).toHaveLength(1)
        expect(active[0]!.id).toBe(ann.id)
      } else {
        expect(active).toHaveLength(0)
      }
    })

    it('returns pending + acknowledged together, excludes terminal states', () => {
      const pending = store.create({ elementSource: 'App.tsx:1:1', text: 'pending' })
      const acknowledged = store.create({ elementSource: 'App.tsx:2:1', text: 'acknowledged' })
      const resolved = store.create({ elementSource: 'App.tsx:3:1', text: 'resolved' })
      const dismissed = store.create({ elementSource: 'App.tsx:4:1', text: 'dismissed' })

      store.acknowledge(acknowledged.id)
      store.acknowledge(resolved.id)
      store.resolve(resolved.id, 'done')
      store.dismiss(dismissed.id)

      const active = store.getActive()
      expect(active).toHaveLength(2)
      const ids = active.map(a => a.id)
      expect(ids).toContain(pending.id)
      expect(ids).toContain(acknowledged.id)
      expect(ids).not.toContain(resolved.id)
      expect(ids).not.toContain(dismissed.id)
    })

    it('returns defensive snapshots (mutating returned annotation does not affect store)', () => {
      const ann = store.create({ elementSource: 'App.tsx:1:1', text: 'test' })
      const active = store.getActive()
      expect(active).toHaveLength(1)

      // mutate the returned snapshot
      active[0]!.text = 'mutated'

      // store must be unaffected
      const activeAgain = store.getActive()
      expect(activeAgain[0]!.text).toBe('test')
    })
  })
})
