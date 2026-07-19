import fs from 'fs'
import path from 'path'
import { createElement, type ReactElement } from 'react'
import {
  CORTEX_BROWSER_PATH,
  DEFAULT_TOGGLE_SHORTCUT,
  createManualInjectionScriptBody,
} from './injection-snippet.js'

export interface CortexDevScriptsProps {
  /** Absolute project root containing the `.cortex/` directory. Defaults to
   *  process.cwd() — correct when `next dev` runs from the app root. */
  projectRoot?: string
}

interface InjectionFile {
  port?: unknown
  sessionId?: unknown
  toggleShortcut?: unknown
}

// Once-per-REASON warning so a missing bridge doesn't spam every render — but a
// transient first-render "could not read discovery files" must NOT permanently
// suppress a later, genuinely different diagnostic (malformed / torn read /
// missing session id). Keying on the reason string keeps each distinct cause
// visible exactly once.
const warnedReasons = new Set<string>()

/** Warn at most once per distinct reason. `setupHint` appends the
 *  "is withCortex() wrapping next.config" nudge — pass it ONLY for the
 *  bridge-might-not-be-running case (could-not-read). The other reasons
 *  (malformed / torn / parse-error / missing-session) prove the bridge IS
 *  running and just wrote a bad file, so the setup nudge would misdirect. */
function warnOnce(reason: string, setupHint = false): null {
  if (!warnedReasons.has(reason)) {
    warnedReasons.add(reason)
    console.warn(
      `[cortex] <CortexDevScripts/> is inactive: ${reason}.` +
      (setupHint ? ' Is withCortex() wrapping next.config, and is this `next dev` (not build/start)?' : '')
    )
  }
  return null
}

/** Test-only reset for the once-per-reason warnings. @internal */
export function _resetDevScriptsWarningForTesting(): void {
  warnedReasons.clear()
}

/**
 * Server component that bootstraps the cortex editor in Next.js dev.
 *
 * Next has no HTML-injection hook (no transformIndexHtml / HtmlWebpackPlugin
 * equivalent), so the injection snippet is delivered as a rendered <script>
 * element instead: this component runs on the server, reads the bridge's
 * `.cortex/` discovery files from disk (the same protocol the MCP CLI uses),
 * and inlines the bootstrap script with concrete port/token/session values.
 *
 * Renders null (and warns once) when the bridge isn't running — missing
 * discovery files must degrade silently at render time, loudly in the console.
 *
 * Security: the script body is our own template; every interpolated value is
 * escaped via safeJSONForScript inside createManualInjectionScriptBody, and
 * the inputs come from 0600-mode files the bridge itself wrote — there is no
 * untrusted content in the dangerouslySetInnerHTML payload. Dev-only by
 * double gate: NODE_ENV and discovery-file presence.
 */
export function CortexDevScripts(props: CortexDevScriptsProps = {}): ReactElement | null {
  if (process.env.NODE_ENV === 'production') return null

  const cortexDir = path.join(props.projectRoot ?? process.cwd(), '.cortex')

  let port: number
  let token: string
  let injection: InjectionFile
  let injectionRaw: string
  let injectionRawAfter: string
  try {
    // Read injection.json FIRST and AGAIN after the token/port so a bridge
    // restart that rewrites the discovery set mid-render is detected even when
    // the port is unchanged (the port cross-check below misses a same-port
    // restart). The two injection.json snapshots differ across the write
    // window because each restart mints a fresh sessionId. (3J)
    injectionRaw = fs.readFileSync(path.join(cortexDir, 'injection.json'), 'utf8')
    token = fs.readFileSync(path.join(cortexDir, 'token'), 'utf8').trim()
    port = Number(fs.readFileSync(path.join(cortexDir, 'port'), 'utf8').trim())
    injectionRawAfter = fs.readFileSync(path.join(cortexDir, 'injection.json'), 'utf8')
  } catch {
    // The bridge likely isn't running yet — this is the one reason that gets
    // the setup nudge, since withCortex/`next dev` really might be misconfigured.
    return warnOnce(`could not read discovery files in ${cortexDir}`, true)
  }

  // Parse in its OWN reason bucket: a malformed injection.json was READ fine but
  // failed to PARSE, and must not share the "could not read" reason (which the
  // common startup "file missing" case already latched) or it would be silently
  // suppressed — the exact diagnostic-masking class the per-reason design fixes.
  try {
    injection = JSON.parse(injectionRaw) as InjectionFile
  } catch {
    return warnOnce(`injection.json in ${cortexDir} is not valid JSON (partial write?) — retrying next render`)
  }

  if (injectionRaw !== injectionRawAfter) {
    return warnOnce(
      `discovery files in ${cortexDir} changed mid-read (bridge restart) — retrying next render`,
    )
  }

  if (!Number.isInteger(port) || port <= 0 || token.length === 0) {
    return warnOnce(`discovery files in ${cortexDir} are malformed`)
  }
  // Torn-generation guard: the three discovery files are read separately, so a
  // bridge restart mid-render can pair an old token with a new port/session —
  // every WS message would then fail the token check. writeDiscoveryFiles
  // stamps the port into injection.json alongside the sessionId the token
  // belongs to; if that disagrees with the standalone port file, the reads
  // straddle a write. Degrade to null (the next render gets a consistent set).
  // Older bridges that omit the port field skip this cross-check (backward-compat).
  if (typeof injection.port === 'number' && injection.port !== port) {
    return warnOnce(
      `discovery files in ${cortexDir} disagree on port ` +
      `(torn read: port file=${port}, injection.json=${injection.port})`,
    )
  }
  const sessionId = typeof injection.sessionId === 'string' ? injection.sessionId : null
  if (!sessionId) {
    return warnOnce(`injection.json in ${cortexDir} is missing a session id`)
  }

  const body = createManualInjectionScriptBody({
    port,
    token,
    sessionId,
    browserScriptUrl: `http://localhost:${port}${CORTEX_BROWSER_PATH}`,
    toggleShortcut: typeof injection.toggleShortcut === 'string' ? injection.toggleShortcut : DEFAULT_TOGGLE_SHORTCUT,
  })

  return createElement('script', { dangerouslySetInnerHTML: { __html: body } })
}
