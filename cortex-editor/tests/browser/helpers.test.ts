import { describe, it, expect } from 'vitest'
import { createMockChannel } from './helpers.js'
import type { ConnectionState } from '../../src/adapters/types.js'

describe('createMockChannel', () => {
  it('_simulateConnectionChange calls registered handlers', () => {
    const channel = createMockChannel()
    const states: ConnectionState[] = []
    channel.onConnectionChange((state) => { states.push(state) })

    channel._simulateConnectionChange({ status: 'connected' })
    channel._simulateConnectionChange({ status: 'reconnecting', retryCount: 1, maxRetries: 5 })
    channel._simulateConnectionChange({ status: 'disconnected' })

    expect(states).toEqual([
      { status: 'connected' },
      { status: 'reconnecting', retryCount: 1, maxRetries: 5 },
      { status: 'disconnected' },
    ])
  })

  it('unsubscribe prevents further callbacks', () => {
    const channel = createMockChannel()
    const states: ConnectionState[] = []
    const unsub = channel.onConnectionChange((state) => { states.push(state) })

    channel._simulateConnectionChange({ status: 'connected' })
    unsub()
    channel._simulateConnectionChange({ status: 'disconnected' })

    expect(states).toEqual([{ status: 'connected' }])
  })
})
