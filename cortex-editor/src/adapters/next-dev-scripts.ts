import fs from 'fs'
import path from 'path'
import { createElement, type ReactElement } from 'react'
// cortex-lock is dependency-light (node:fs/path/crypto only), so importing it
// here keeps this module's leaf status (3F) intact.
import { inspectCortexLock } from '../core/cortex-lock.js'
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
  lockNonce?: unknown
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
function warnOnce(reason: string, setupHint = false, dedupKey: string = reason): null {
  // Dedup on dedupKey, not the message — reasons that embed variable data (a
  // torn-read's differing port pair) must key on a STABLE string, or a long-lived
  // dev-server process facing repeated restarts across ephemeral ports would
  // accumulate an unbounded set of distinct entries.
  if (!warnedReasons.has(dedupKey)) {
    warnedReasons.add(dedupKey)
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
  try {
    // injection.json is read FIRST and then re-read as the LAST validation
    // step (after every other gate, including the lock-liveness check below)
    // so a bridge restart ANYWHERE in this render's read window is detected —
    // each restart mints a fresh sessionId, so the two snapshots differ. (3J)
    injectionRaw = fs.readFileSync(path.join(cortexDir, 'injection.json'), 'utf8')
    token = fs.readFileSync(path.join(cortexDir, 'token'), 'utf8').trim()
    port = Number(fs.readFileSync(path.join(cortexDir, 'port'), 'utf8').trim())
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

  // 65535 upper bound (cubic P3): a corrupt port file above the TCP range must
  // take the inactive-warning path, not render a bootstrap pointing at an
  // endpoint that cannot exist.
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || token.length === 0) {
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
      false,
      `port-disagree:${cortexDir}`, // stable key — the message embeds variable ports
    )
  }
  const sessionId = typeof injection.sessionId === 'string' ? injection.sessionId : null
  if (!sessionId) {
    return warnOnce(`injection.json in ${cortexDir} is missing a session id`)
  }

  // Owner-liveness gate: discovery-file PRESENCE alone is not proof of a
  // running bridge. A hard-killed dev server leaves port/token/injection.json
  // behind (dispose never ran), and injecting them would hand the browser a
  // dead — or worse, since-reassigned — port plus a stale token. The bridge
  // acquires `.cortex/.lock` BEFORE writing discovery files and releases it on
  // dispose/exit, so a live lock owner is the freshness signal. Fail closed:
  // 'missing' also refuses, which covers the exit-handler path that releases
  // the lock but leaves discovery files, at the cost of the rare degraded
  // lock-less mode (read-only-root bridges already warn loudly there).
  const lock = inspectCortexLock(cortexDir)
  if (lock.liveness !== 'live') {
    return warnOnce(
      `discovery files in ${cortexDir} have no live bridge owning them ` +
      `(lock ${lock.liveness}) — refusing to inject. If no dev server crash explains ` +
      `this, delete ${cortexDir} and restart \`next dev\``,
      false,
      `stale-lock:${cortexDir}`, // stable key — the message embeds the liveness variant
    )
  }
  // Owner binding (cubic P2): a live lock alone doesn't prove the values read
  // above were written by ITS owner — a successor acquires the lock BEFORE
  // publishing files, and in that window the on-disk injection.json is still
  // the predecessor's (stable, so the freshness re-read below can't see it).
  // The bridge stamps its lock nonce into injection.json; a mismatch means a
  // different owner generation. Older bridges omit the field (compat: skip).
  if (typeof injection.lockNonce === 'string' && lock.holderNonce !== null && injection.lockNonce !== lock.holderNonce) {
    return warnOnce(
      `discovery files in ${cortexDir} were written by a different bridge generation ` +
      `than the live lock owner (handoff in progress) — retrying next render`,
      false,
      `owner-mismatch:${cortexDir}`, // stable key
    )
  }

  // Freshness snapshot LAST — after the lock check, not before it (codex P2):
  // liveness only proves SOME process owns the lock now, not that it wrote the
  // values read above. A bridge swap between those reads and the lock check
  // would pair the OLD port/token with the NEW owner's live lock; since every
  // restart mints a fresh sessionId, re-reading injection.json as the final
  // gate closes that window. (3J)
  let injectionRawAfter: string
  try {
    injectionRawAfter = fs.readFileSync(path.join(cortexDir, 'injection.json'), 'utf8')
  } catch {
    return warnOnce(`could not read discovery files in ${cortexDir}`, true)
  }
  if (injectionRaw !== injectionRawAfter) {
    return warnOnce(
      `discovery files in ${cortexDir} changed mid-read (bridge restart) — retrying next render`,
    )
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
