import fs from 'fs'
import path from 'path'
import { createElement, type ReactElement } from 'react'
import {
  CORTEX_BROWSER_PATH,
  DEFAULT_TOGGLE_SHORTCUT,
  createManualInjectionScriptBody,
} from './webpack.js'

export interface CortexDevScriptsProps {
  /** Absolute project root containing the `.cortex/` directory. Defaults to
   *  process.cwd() — correct when `next dev` runs from the app root. */
  projectRoot?: string
}

interface InjectionFile {
  sessionId?: unknown
  toggleShortcut?: unknown
}

// Once-per-process warning so a missing bridge doesn't spam every render.
let warnedMissingBridge = false

function warnOnce(reason: string): null {
  if (!warnedMissingBridge) {
    warnedMissingBridge = true
    console.warn(
      `[cortex] <CortexDevScripts/> is inactive: ${reason}. ` +
      'Is withCortex() wrapping next.config, and is this `next dev` (not build/start)?'
    )
  }
  return null
}

/** Test-only reset for the once-per-process warning. @internal */
export function _resetDevScriptsWarningForTesting(): void {
  warnedMissingBridge = false
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
  try {
    port = Number(fs.readFileSync(path.join(cortexDir, 'port'), 'utf8').trim())
    token = fs.readFileSync(path.join(cortexDir, 'token'), 'utf8').trim()
    injection = JSON.parse(fs.readFileSync(path.join(cortexDir, 'injection.json'), 'utf8')) as InjectionFile
  } catch {
    return warnOnce(`could not read discovery files in ${cortexDir}`)
  }

  if (!Number.isInteger(port) || port <= 0 || token.length === 0) {
    return warnOnce(`discovery files in ${cortexDir} are malformed`)
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
