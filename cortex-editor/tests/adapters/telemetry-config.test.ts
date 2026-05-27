import { describe, it, expect } from 'vitest'
import {
  resolveTelemetryEnabled,
  resolveTelemetryEndpoint,
} from '../../src/adapters/telemetry-config.js'

// ---------------------------------------------------------------------------
// resolveTelemetryEnabled
// ---------------------------------------------------------------------------
describe('resolveTelemetryEnabled', () => {
  describe('strict opt-in matrix — only exact "true" (case-insensitive, trimmed) enables', () => {
    it.each([
      ['true', 'exact lowercase'],
      ['TRUE', 'uppercase normalized via toLowerCase'],
      ['True', 'mixed case normalized'],
      [' true ', 'surrounding whitespace trimmed'],
      ['true\n', 'trailing newline trimmed'],
      ['\ttrue\t', 'tabs trimmed'],
    ])('enables telemetry when CORTEX_TELEMETRY=%j (%s)', (envVal, _why) => {
      expect(
        resolveTelemetryEnabled({ env: { CORTEX_TELEMETRY: envVal } }),
      ).toBe(true)
    })

    it.each([
      ['1', 'numeric truthy NOT accepted'],
      ['yes', 'yes NOT accepted'],
      ['on', 'on NOT accepted'],
      ['false', 'explicit false'],
      ['FALSE', 'uppercase false'],
      ['0', 'numeric falsy'],
      ['', 'empty string'],
      ['truthy', 'arbitrary string'],
    ])('disables telemetry when CORTEX_TELEMETRY=%j (%s)', (envVal, _why) => {
      expect(
        resolveTelemetryEnabled({ env: { CORTEX_TELEMETRY: envVal } }),
      ).toBe(false)
    })

    it('disables telemetry when CORTEX_TELEMETRY is unset', () => {
      expect(resolveTelemetryEnabled({ env: {} })).toBe(false)
    })

    it('disables telemetry when env is omitted (falls back to process.env without CORTEX_TELEMETRY)', () => {
      // process.env in test environment won't have CORTEX_TELEMETRY set (no env override)
      const saved = process.env.CORTEX_TELEMETRY
      delete process.env.CORTEX_TELEMETRY
      try {
        expect(resolveTelemetryEnabled({})).toBe(false)
      } finally {
        if (saved !== undefined) process.env.CORTEX_TELEMETRY = saved
      }
    })
  })
})

// ---------------------------------------------------------------------------
// resolveTelemetryEndpoint
// ---------------------------------------------------------------------------
describe('resolveTelemetryEndpoint', () => {
  describe('valid http/https URLs are returned as-is', () => {
    it.each([
      ['https://telemetry.example.com/events', 'https URL'],
      ['http://localhost:3000/collect', 'http URL'],
      ['https://example.com/path?q=1', 'https URL with query string'],
    ])('returns %j (%s)', (url, _why) => {
      expect(
        resolveTelemetryEndpoint({ env: { CORTEX_TELEMETRY_ENDPOINT: url } }),
      ).toBe(url)
    })
  })

  describe('invalid or non-http/https URLs return undefined', () => {
    it.each([
      ['file:///etc/passwd', 'file: protocol rejected'],
      ['ftp://example.com', 'ftp: protocol rejected'],
      ['not-a-url', 'garbage string'],
      ['javascript:alert(1)', 'javascript: protocol rejected'],
      ['', 'empty string'],
    ])('returns undefined for %j (%s)', (url, _why) => {
      expect(
        resolveTelemetryEndpoint({ env: { CORTEX_TELEMETRY_ENDPOINT: url } }),
      ).toBeUndefined()
    })

    it('returns undefined when CORTEX_TELEMETRY_ENDPOINT is unset', () => {
      expect(resolveTelemetryEndpoint({ env: {} })).toBeUndefined()
    })

    it('returns undefined when env is omitted and process.env has no endpoint', () => {
      const saved = process.env.CORTEX_TELEMETRY_ENDPOINT
      delete process.env.CORTEX_TELEMETRY_ENDPOINT
      try {
        expect(resolveTelemetryEndpoint({})).toBeUndefined()
      } finally {
        if (saved !== undefined) process.env.CORTEX_TELEMETRY_ENDPOINT = saved
      }
    })
  })
})
