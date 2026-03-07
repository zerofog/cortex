import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { startServer } from './server.js';

export function parseTargetPort(raw: string): number {
  // Strip protocol prefix if provided (e.g. "http://localhost:3000")
  let cleaned = raw.replace(/^https?:\/\//, '');
  // Extract port from "host:port" or bare port
  const colonIdx = cleaned.lastIndexOf(':');
  if (colonIdx !== -1 && /^\d+$/.test(cleaned.slice(colonIdx + 1))) {
    cleaned = cleaned.slice(colonIdx + 1);
  }
  const port = parseInt(cleaned, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${raw}". Expected a number (1-65535), e.g. --target 3000`);
  }
  // Reject trailing garbage (e.g. "3000abc")
  if (String(port) !== cleaned.trim()) {
    throw new Error(`Invalid port "${raw}". Expected a number (1-65535), e.g. --target 3000`);
  }
  return port;
}

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'linux' ? 'xdg-open' : null;
  if (!cmd) return;
  execFile(cmd, [url], (err) => {
    if (err) console.warn('[cortex] Could not open browser:', err.message);
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', default: '3000' },
      port: { type: 'string', default: '3100' },
      help: { type: 'boolean', short: 'h', default: false },
      'no-open': { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`Usage: cortex-editor [options]

Options:
  --target <port>   Dev server port to proxy (default: 3000)
  --port <port>     Sidecar listen port (default: 3100)
  --no-open         Don't open browser on start
  -h, --help        Show this help message`);
    process.exit(0);
  }

  const targetPort = parseTargetPort(String(values.target));
  const port = parseTargetPort(String(values.port));

  // Self-proxy guard
  if (targetPort === port) {
    throw new Error('--target and --port cannot be the same (self-proxy loop)');
  }

  const ctx = await startServer({ targetPort, port });
  const url = `http://localhost:${port}`;
  // TODO: future config file support — ServerOptions is the right abstraction point
  const isTTY = process.stdout.isTTY;
  const green = isTTY ? '\x1b[32m' : '';
  const reset = isTTY ? '\x1b[0m' : '';
  console.log(`${green}[cortex]${reset} Visual editor running at ${url}`);
  console.log(`${green}[cortex]${reset} Proxying target on port ${targetPort}`);
  console.log(`${green}[cortex]${reset} Session ID: ${ctx.sessionId}`);

  if (!values['no-open']) {
    openBrowser(url);
  }
}

// H5: Robust direct-run detection — handles symlinks, npx, Windows paths
function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const argFile = resolve(process.argv[1]);
    // realpathSync resolves symlinks (npm global installs, npx binstubs)
    return realpathSync(thisFile) === realpathSync(argFile);
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  main().catch((err) => {
    console.error('[cortex]', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
