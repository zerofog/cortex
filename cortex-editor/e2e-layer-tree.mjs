/**
 * E2E verification: layer tree renders, selection highlighting, node click updates.
 * Uses route interception to serve a self-contained HTML page (no dev server needed).
 * Run: node e2e-layer-tree.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, 'dist/browser/index.js')

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Cortex Layer Tree E2E</title></head>
<body style="margin:0; background:#fff; color:#000; font-family:sans-serif">
  <div data-cortex-source="src/App.tsx:1:1" style="padding:40px">
    <h1 data-cortex-source="src/App.tsx:3:5">Layer Tree Test</h1>
    <div data-cortex-source="src/App.tsx:5:5" class="card" style="width:300px;height:200px;background:#e74c3c;margin:20px;border-radius:8px;display:flex;align-items:center;justify-content:center">
      <span data-cortex-source="src/App.tsx:7:7" style="font-size:18px;font-weight:bold;color:#fff">TARGET</span>
    </div>
    <p data-cortex-source="src/App.tsx:9:5" style="margin:20px">Sibling paragraph</p>
  </div>
  <script>window.__cortex_send__ = function() {};</script>
  <script src="/cortex.js"></script>
</body>
</html>`

let passed = 0
let failed = 0
function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS: ${name}`)
    passed++
  } else {
    console.log(`  FAIL: ${name} ${detail}`)
    failed++
  }
}

async function runTests() {
  console.log(`\n${'='.repeat(50)}`)
  console.log('  LAYER TREE E2E — CHROMIUM')
  console.log(`${'='.repeat(50)}`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  // Intercept attachShadow to capture closed shadow root reference for testing.
  // This runs before any page scripts, so cortex's closed shadow root is captured.
  await page.addInitScript(() => {
    const _attachShadow = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (init) {
      const shadow = _attachShadow.call(this, init)
      if (this.hasAttribute('data-cortex-host') || init.mode === 'closed') {
        window.__cortex_test_shadow__ = shadow
      }
      return shadow
    }
  })

  // Serve test page and cortex bundle via route interception
  await page.route('http://test.local/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') {
      route.fulfill({ body: html, contentType: 'text/html' })
    } else if (url.pathname === '/cortex.js') {
      route.fulfill({
        body: fs.readFileSync(distPath),
        contentType: 'application/javascript',
      })
    } else {
      route.fulfill({ status: 404 })
    }
  })

  await page.goto('http://test.local/')
  await page.waitForSelector('[data-cortex-host]', { timeout: 5000 })
  console.log('  Cortex bootstrapped.')

  // Activate cortex via the channel (simulates server sending activation message)
  await page.evaluate(() => {
    window.__cortex_channel__?.handleServerMessage({ type: 'cortex' })
  })
  await page.waitForTimeout(300)

  // Click the red card to select it
  const cardBox = await page.locator('.card').boundingBox()
  if (!cardBox) throw new Error('Could not find .card element')
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.waitForTimeout(500)

  // ─── Test 1: Layer tree renders ─────────────────────────────────
  console.log('\n  Test 1: Layer tree renders')
  const layerTree = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return { found: false, reason: 'no shadow root' }
    const tree = shadow.querySelector('.cortex-layer-tree')
    if (!tree) return { found: false, reason: 'no .cortex-layer-tree element' }
    const nodes = shadow.querySelectorAll('.cortex-layer-node')
    return { found: true, nodeCount: nodes.length }
  })
  assert('Layer tree element exists', layerTree.found, layerTree.reason || '')
  assert('Layer tree has multiple nodes', layerTree.nodeCount >= 2,
    `got ${layerTree.nodeCount} nodes`)

  // ─── Test 2: Selected node highlighted ──────────────────────────
  console.log('\n  Test 2: Selected node highlighted')
  const selectedNode = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return { found: false }
    const sel = shadow.querySelector('.cortex-layer-node--selected')
    if (!sel) return { found: false }
    return { found: true, label: sel.textContent?.trim() || '' }
  })
  assert('Selected node has --selected class', selectedNode.found)
  if (selectedNode.found) {
    console.log(`    Selected node label: "${selectedNode.label}"`)
  }

  // ─── Test 3: Click tree node updates selection ──────────────────
  console.log('\n  Test 3: Click tree node updates selection')

  // Get the current panel header tag before clicking a different tree node
  const headerBefore = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return null
    const tag = shadow.querySelector('.cortex-panel-header__tag')
    return tag?.textContent?.trim() || null
  })
  console.log(`    Header before: "${headerBefore}"`)

  // Find a non-selected tree node and click it
  const clickedDifferent = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return { clicked: false, reason: 'no shadow' }
    const nodes = Array.from(shadow.querySelectorAll('.cortex-layer-node'))
    const other = nodes.find(n => !n.classList.contains('cortex-layer-node--selected'))
    if (!other) return { clicked: false, reason: 'no non-selected node found' }
    other.click()
    return { clicked: true, label: other.textContent?.trim() || '' }
  })
  assert('Clicked a different tree node', clickedDifferent.clicked,
    clickedDifferent.reason || '')
  if (clickedDifferent.clicked) {
    console.log(`    Clicked node: "${clickedDifferent.label}"`)
  }

  await page.waitForTimeout(300)

  // Check that the panel header changed
  const headerAfter = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return null
    const tag = shadow.querySelector('.cortex-panel-header__tag')
    return tag?.textContent?.trim() || null
  })
  console.log(`    Header after: "${headerAfter}"`)
  assert('Panel header changed after tree node click',
    headerAfter !== null && headerBefore !== null && headerAfter !== headerBefore,
    `before="${headerBefore}" after="${headerAfter}"`)

  // ─── Test 4: Resize handle exists ──────────────────────────────
  console.log('\n  Test 4: Resize handle exists')
  const resizeHandle = await page.evaluate(() => {
    const shadow = window.__cortex_test_shadow__
    if (!shadow) return false
    return !!shadow.querySelector('.cortex-layer-resize')
  })
  assert('Resize handle element exists', resizeHandle)

  // ─── No page errors ────────────────────────────────────────────
  console.log('\n  Page errors check')
  if (errors.length > 0) {
    console.log('  Page errors detected:')
    errors.forEach(e => console.log(`    ${e}`))
  }
  assert('No page errors', errors.length === 0, errors.join('; '))

  await browser.close()
}

async function main() {
  await runTests()

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log(`${'='.repeat(50)}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
