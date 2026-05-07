import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ensureCliBuilt } from './helpers/cli-build.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '../..')
const CLI_DIST = resolve(REPO_ROOT, 'dist/cli/index.js')

describe('cortex CLI — built-process integration (Layer 5)', () => {
  let client: Client
  let transport: StdioClientTransport

  beforeAll(async () => {
    await ensureCliBuilt()
    transport = new StdioClientTransport({
      command: 'node',
      args: [CLI_DIST, 'mcp'],
      stderr: 'pipe',
    })
    client = new Client({ name: 'cortex-layer5-test', version: '0.0.0' }, { capabilities: {} })
    await client.connect(transport)
  }, 180_000)

  afterAll(async () => {
    if (client) await client.close()
    if (transport) await transport.close()
  })

  it('built CLI launches and accepts MCP handshake', async () => {
    // If beforeAll's connect() succeeded, the handshake (initialize → initialized)
    // completed over real stdio against the BUILT artifact. Assert we're talking
    // to the right server.
    //
    // Falsifiability: corrupt dist/cli/index.js (e.g., delete it after the build,
    // or write a syntax error) — the spawn fails and beforeAll's connect() rejects.
    const serverInfo = client.getServerVersion()
    expect(serverInfo).toBeTruthy()
    expect(serverInfo?.name).toBe('cortex')
  })
})
