import { parseArgs } from 'node:util'
import { version } from '../version.js'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
})

if (values.version) {
  console.log(version)
  process.exit(0)
}

const command = positionals[0]

if (values.help || !command) {
  console.error(`cortex-editor v${version}

Usage: cortex <command> [options]

Commands:
  mcp     Start MCP stdio server (connects to Vite dev server)
  init    Set up Cortex in current project

Options:
  --port  Vite dev server port (overrides .cortex/port auto-discovery)
  -h, --help     Show this help message
  -v, --version  Show version`)
  process.exit(command ? 0 : 1)
}

if (command === 'mcp') {
  let port: number | undefined
  if (values.port) {
    port = Math.trunc(Number(values.port))
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${values.port}`)
      process.exit(1)
    }
  }
  try {
    const { startMCPServer } = await import('./mcp.js')
    const handle = await startMCPServer({ port })
    process.on('SIGINT', () => { handle.close(); process.exit(0) })
    process.on('SIGTERM', () => { handle.close(); process.exit(0) })
  } catch (err) {
    console.error(`[cortex] Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
} else if (command === 'init') {
  console.error('cortex init is not yet implemented. See ZF0-912.')
  process.exit(1)
} else {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}
