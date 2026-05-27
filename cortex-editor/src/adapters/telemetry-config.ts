/**
 * Options for {@link resolveTelemetryEnabled}. Injectable for testing — env-var
 * parsing is a pure function without any file I/O, matching the style of
 * {@link resolveAnnotationsFilePath}.
 */
export interface ResolveTelemetryEnabledOptions {
  /** Environment-variable source. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv
}

/**
 * Options for {@link resolveTelemetryEndpoint}. Injectable for testing.
 */
export interface ResolveTelemetryEndpointOptions {
  /** Environment-variable source. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv
}

/**
 * Returns `true` when the `CORTEX_TELEMETRY` environment variable is
 * exactly `'true'` (trimmed + lower-cased).
 *
 * Strict opt-in: `'1'`, `'yes'`, `'on'` and any other truthy-ish values are
 * treated as disabled. Boolean env-var conventions vary widely across tools;
 * a single canonical accepted value prevents silent surprises (the same
 * rationale used by `CORTEX_PERSIST_ANNOTATIONS`).
 *
 * Default = fully inert: when unset (or any non-`'true'` value), no
 * `.cortex/usage.json` is written and no network request is made.
 */
export function resolveTelemetryEnabled(
  options: ResolveTelemetryEnabledOptions,
): boolean {
  const { env = process.env } = options
  return (env.CORTEX_TELEMETRY ?? '').trim().toLowerCase() === 'true'
}

/**
 * Returns the telemetry POST endpoint URL when `CORTEX_TELEMETRY_ENDPOINT`
 * is set to a valid `http:` or `https:` URL; otherwise `undefined`.
 *
 * Protocol validation uses `new URL()` — only `http:` and `https:` are
 * accepted. `file:`, `ftp:`, `javascript:`, and other schemes are rejected
 * and silently produce `undefined` (telemetry remains local-only).
 */
export function resolveTelemetryEndpoint(
  options: ResolveTelemetryEndpointOptions,
): string | undefined {
  const { env = process.env } = options
  const raw = env.CORTEX_TELEMETRY_ENDPOINT
  if (!raw) return undefined

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }
    return raw
  } catch {
    return undefined
  }
}
