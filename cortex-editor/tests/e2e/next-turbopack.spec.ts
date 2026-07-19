/**
 * Next 16 + Turbopack end-to-end acceptance (M1/M2, 2026-07-18 addendum).
 *
 * Unlike every other spec in this harness (synthetic origin, no server), this
 * one boots the REAL stack: `next dev` (Turbopack default — no --webpack) on
 * the dev-app-next fixture app, withCortex() providing turbopack.rules
 * instrumentation + the standalone bridge, and <CortexDevScripts/> delivering
 * the injection snippet. It then walks the full designer loop:
 *
 *   activate (keyboard) → click-to-select a 'use client' component →
 *   correct data-cortex-source attribution → stage an edit → apply via the
 *   real MCP server (stdio) → source file written → Turbopack HMR reflects it.
 *
 * Staging uses the CORTEX_TEST_BUILD debug bridge (stageEdit), which
 * `npm run test:e2e` compiles into the browser bundle; everything downstream
 * of staging is the production path.
 *
 * Skips when dev-app-next has no node_modules (fresh clone without the
 * fixture app installed). Not part of @fast-ci.
 */
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { expect, test } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { clickApplyButton, stageEdit } from './helpers/panel.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..', '..')
const appRoot = path.resolve(packageRoot, '..', 'dev-app-next')
const counterPath = path.join(appRoot, 'app', 'Counter.tsx')
const PORT = 3197
const BASE_URL = `http://localhost:${PORT}`

const appInstalled = fs.existsSync(path.join(appRoot, 'node_modules', 'next'))

let devServer: ChildProcess | null = null
let counterOriginal = ''

test.describe('Next 16 Turbopack integration', () => {
  test.skip(!appInstalled, 'dev-app-next is not installed (run npm install there first)')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    counterOriginal = fs.readFileSync(counterPath, 'utf8')
    fs.rmSync(path.join(appRoot, '.cortex'), { recursive: true, force: true })

    devServer = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
      cwd: appRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' },
    })
    let output = ''
    devServer.stdout!.on('data', (d: Buffer) => { output += d.toString() })
    devServer.stderr!.on('data', (d: Buffer) => { output += d.toString() })
    await expect
      .poll(() => output.includes('Ready'), { timeout: 120_000, message: `next dev never became ready:\n${output}` })
      .toBe(true)
  })

  test.afterAll(async () => {
    devServer?.kill('SIGTERM')
    // Restore the fixture source mutated by the apply test.
    if (counterOriginal) fs.writeFileSync(counterPath, counterOriginal)
  })

  test('activation, selection attribution, and MCP apply → source write → HMR', async ({ page }) => {
    test.setTimeout(120_000)

    // ── Instrumentation + injection reached the real page ─────────────────
    // Arm the second gate of the TEST-ONLY debug bridge and open the cortex
    // host's shadow root for panel helpers. Deliberately NOT setupDebugBridge:
    // that helper also stubs __cortex_send__ to a no-op (offline fixture),
    // which would sever the real WS channel this spec exists to exercise.
    await page.addInitScript(() => {
      ;(globalThis as unknown as { __CORTEX_DEBUG_OVERRIDES__?: boolean }).__CORTEX_DEBUG_OVERRIDES__ = true
      const original = Element.prototype.attachShadow
      Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
        if (this.hasAttribute?.('data-cortex-host')) {
          return original.call(this, { ...init, mode: 'open' })
        }
        return original.call(this, init)
      }
    })
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    const button = page.locator('button', { hasText: 'Count' })
    await expect(button).toHaveAttribute('data-cortex-source', /app\/Counter\.tsx:\d+:\d+/)

    // ── Activation via the injected keyboard handler ──────────────────────
    await page.keyboard.press('ControlOrMeta+Shift+Period')
    await expect(page.locator('[data-cortex-host]')).toBeAttached({ timeout: 15_000 })
    await expect(page.locator('html')).toHaveAttribute('data-cortex-active', '', { timeout: 15_000 })

    // ── Click-to-select the 'use client' component ────────────────────────
    const source = await button.getAttribute('data-cortex-source')
    await button.click()
    // Selection is editor state inside a closed shadow root; the falsifiable
    // signal is that the click selected instead of incrementing the counter.
    await expect(button).toHaveText('Count: 0')

    // ── Stage an edit against the clicked element's real source ───────────
    // The TEST-ONLY bridge installs when the Panel mounts post-selection.
    await expect
      .poll(
        () => page.evaluate(() => Boolean((globalThis as { __CORTEX_TEST__?: { stageEdit?: unknown } }).__CORTEX_TEST__?.stageEdit)),
        { timeout: 15_000 }
      )
      .toBe(true)
    const intentId = await stageEdit(page, source!, 'padding-top', '32px')
    expect(intentId).toBeTruthy()
    expect(await clickApplyButton(page)).toBe(true)

    // ── Apply over the real MCP stdio server ──────────────────────────────
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(packageRoot, 'dist', 'cli', 'index.js'), 'mcp'],
      cwd: appRoot,
    })
    const mcp = new Client({ name: 'e2e', version: '0.0.0' })
    await mcp.connect(transport)
    try {
      await expect
        .poll(async () => {
          const pending = await mcp.callTool({ name: 'cortex_get_pending_edits', arguments: {} })
          const text = (pending.content as Array<{ text: string }>)[0]!.text
          return text.includes(intentId!)
        }, { timeout: 20_000 })
        .toBe(true)

      const applied = await mcp.callTool({ name: 'cortex_apply_edits', arguments: { intentIds: [intentId] } })
      const appliedText = (applied.content as Array<{ text: string }>)[0]!.text
      expect(appliedText).toContain('applied')

      // ── Source file actually changed on disk ────────────────────────────
      await expect
        .poll(() => fs.readFileSync(counterPath, 'utf8'), { timeout: 10_000 })
        .toContain('32px')

      // ── Turbopack HMR delivers the new style to the live page ───────────
      await expect
        .poll(() => button.evaluate((el) => getComputedStyle(el).paddingTop), { timeout: 30_000 })
        .toBe('32px')
    } finally {
      await mcp.close()
    }
  })
})
