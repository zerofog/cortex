import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { WebSocketServer, WebSocket } from 'ws';
import type { Socket } from 'node:net';

import { injectScripts } from './inject.js';

// Works from both src/ (tsx) and dist/ (built)
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 3100;
const DEFAULT_HOST = 'localhost';
const MAX_INJECT_SIZE = 5 * 1024 * 1024; // 5MB safety valve
// '[::1]' matches raw Host header; '::1' matches URL.hostname (WHATWG URL strips brackets)
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackOrigin(origin: string): boolean {
  try { return LOOPBACK_HOSTS.has(new URL(origin).hostname); }
  catch { return false; }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function checkPidFile(pidPath: string): 'none' | 'stale' | 'alive' {
  let content: string;
  try { content = readFileSync(pidPath, 'utf-8'); }
  catch { return 'none'; }

  const pid = parseInt(content.trim(), 10);
  if (isNaN(pid) || pid <= 0) return 'stale';

  try {
    process.kill(pid, 0);  // signal 0 = existence check
    return 'alive';
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'ESRCH') return 'stale';  // no such process
    return 'alive';  // EPERM = exists but can't signal
  }
}

function rewriteCsp(csp: string): string {
  const directives = csp.split(';').map(d => d.trim()).filter(Boolean);
  const result: string[] = [];
  let hasScriptSrc = false;

  for (const directive of directives) {
    const parts = directive.split(/\s+/);
    const name = parts[0]!.toLowerCase();

    if (name === 'frame-ancestors') continue;  // must allow iframing

    if (name === 'script-src') {
      hasScriptSrc = true;
      if (!parts.includes("'self'")) parts.push("'self'");
      result.push(parts.join(' '));
      continue;
    }

    result.push(directive);
  }

  // If default-src exists but no script-src, browsers fall back to default-src
  // for scripts. Add explicit script-src derived from default-src + 'self'.
  if (!hasScriptSrc) {
    const defaultSrc = directives.find(d =>
      d.split(/\s+/)[0]!.toLowerCase() === 'default-src'
    );
    if (defaultSrc) {
      const values = new Set(defaultSrc.split(/\s+/).slice(1));
      values.add("'self'");
      result.push(`script-src ${[...values].join(' ')}`);
    }
  }

  return result.join('; ');
}

// ─── Types ───────────────────────────────────────────────────────

export interface ServerOptions {
  targetPort: number;
  port?: number;
  host?: string;
}

export interface AppContext {
  app: express.Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HPM generic types don't align with Express 5
  proxy: any;
  editorWss: WebSocketServer;
  sessionId: string;
  startedAt: number;
  setShutdownHandler: (cb: () => void) => void;
  triggerShutdown: () => void;
}

export interface ServerContext extends AppContext {
  server: Server;
  close: () => Promise<void>;
}

// ─── createApp ───────────────────────────────────────────────────

export function createApp(options: ServerOptions): AppContext {
  const { targetPort } = options;
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const sessionId = randomUUID();
  const startedAt = Date.now();

  const app = express();
  const editorWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  let shutdownCb: (() => void) | undefined;
  const setShutdownHandler = (cb: () => void): void => { shutdownCb = cb; };
  const triggerShutdown = (): void => { shutdownCb?.(); };

  // ── Host header validation ──────────────────────────────────

  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostHeader = req.headers.host ?? '';
    // Strip port to get hostname (handles both "host:port" and bare "host")
    const hostname = hostHeader.replace(/:\d+$/, '');
    if (!LOOPBACK_HOSTS.has(hostname)) {
      res.status(403).send('Forbidden: invalid Host header');
      return;
    }
    next();
  });

  // ── Cache static files at startup ─────────────────────────

  let shellHtml: string;
  try {
    shellHtml = readFileSync(join(PACKAGE_ROOT, 'dist', 'client', 'shell.html'), 'utf-8');
  } catch {
    shellHtml = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'shell.html'), 'utf-8');
  }

  const clientScriptCache = new Map<string, string>();
  try {
    const clientDir = join(PACKAGE_ROOT, 'dist', 'client');
    for (const entry of readdirSync(clientDir)) {
      if (entry.endsWith('.js')) {
        let content = readFileSync(join(clientDir, entry), 'utf-8');
        content = content
          .replace(/__SESSION_ID__/g, sessionId)
          .replace(/__SIDECAR_ORIGIN__/g, `http://${host}:${port}`);
        clientScriptCache.set(entry, content);
      }
    }
  } catch { /* dist/client may not exist during tests via tsx */ }

  // ── API routes (before proxy) ───────────────────────────────

  const api = express.Router();

  // Session auth on mutating endpoints (CSRF defense via custom header)
  api.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      if (req.headers['x-session-id'] !== sessionId) {
        res.status(403).json({ error: 'Invalid or missing X-Session-Id header' });
        return;
      }
    }
    next();
  });

  api.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  api.get('/status', (_req: Request, res: Response) => {
    res.status(200).json({
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      targetPort,
    });
  });

  api.post('/diff', (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Not implemented — Phase 5' });
  });

  api.post('/complete', (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Not implemented — Phase 5' });
  });

  api.post('/shutdown', (_req: Request, res: Response) => {
    res.status(202).json({ status: 'shutting down' });
    triggerShutdown();
  });

  app.use('/__zerofog/api', api);

  // ── Shell serving ───────────────────────────────────────────

  app.get('/__zerofog/shell', (_req: Request, res: Response) => {
    res.type('html').send(shellHtml);
  });

  // ── Client script serving ──────────────────────────────────

  app.get('/__zerofog/client/:script', (req: Request, res: Response) => {
    const script = String(req.params.script);
    if (!/^[\w.-]+\.js$/.test(script)) {
      res.status(400).send('Invalid script name');
      return;
    }
    const content = clientScriptCache.get(script);
    if (!content) {
      res.status(404).send('Not found');
      return;
    }
    res.type('application/javascript').send(content);
  });

  // ── Sec-Fetch-Dest redirect ────────────────────────────────

  app.use((req: Request, res: Response, next: NextFunction) => {
    const dest = req.headers['sec-fetch-dest'];
    if (dest === 'document' && !req.path.startsWith('/__zerofog')) {
      const fullPath = req.originalUrl;
      const shellUrl = fullPath === '/'
        ? '/__zerofog/shell'
        : `/__zerofog/shell?path=${encodeURIComponent(fullPath)}`;
      res.redirect(302, shellUrl);
      return;
    }
    next();
  });

  // ── Reverse proxy ──────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express 5 / HPM type boundary
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${targetPort}`,
    selfHandleResponse: true,
    on: {
      proxyRes: (proxyRes, _req, _res) => {
        const res = _res as import('node:http').ServerResponse;
        const contentType = String(proxyRes.headers['content-type'] ?? '');
        const mimeType = contentType.split(';')[0]!.trim();
        const isHtml = mimeType === 'text/html';

        // --- Passthrough: non-HTML streams through without buffering ---
        if (!isHtml) {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res);
          return;
        }

        // --- Buffered: HTML needs CSP rewrite + script injection ---
        res.statusCode = proxyRes.statusCode ?? 200;

        // Copy headers, skipping ones we'll rewrite
        const skipHeaders = new Set([
          'content-encoding', 'transfer-encoding', 'content-length',
          'content-security-policy', 'content-security-policy-report-only',
          'x-frame-options',
        ]);
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (!skipHeaders.has(key) && value !== undefined) {
            res.setHeader(key, value);
          }
        }

        // CSP rewrite: preserve policy but allow our scripts + iframing
        const existingCsp = proxyRes.headers['content-security-policy'];
        if (existingCsp) {
          const cspValue = Array.isArray(existingCsp) ? existingCsp[0]! : existingCsp;
          res.setHeader('content-security-policy', rewriteCsp(cspValue));
        }
        // CSP-report-only and X-Frame-Options already excluded by skipHeaders

        // Decompress if needed
        const encoding = proxyRes.headers['content-encoding'];
        let source: NodeJS.ReadableStream = proxyRes;
        if (encoding === 'gzip') source = proxyRes.pipe(createGunzip());
        else if (encoding === 'br') source = proxyRes.pipe(createBrotliDecompress());
        else if (encoding === 'deflate') source = proxyRes.pipe(createInflate());

        // Buffer HTML, inject scripts, send
        const chunks: Buffer[] = [];
        source.on('data', (chunk: Buffer) => chunks.push(chunk));
        source.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let body: Buffer;
          if (buffer.length <= MAX_INJECT_SIZE) {
            body = Buffer.from(injectScripts(buffer.toString('utf-8')), 'utf-8');
          } else {
            body = buffer;
          }
          res.setHeader('content-length', Buffer.byteLength(body));
          res.end(body);
        });
        source.on('error', (err) => {
          res.statusCode = 502;
          res.end(`Error processing proxied response: ${escapeHtml(err.message)}`);
        });
      },
      error: (err: Error & { code?: string }, _req: IncomingMessage, res: unknown) => {
        // res may be a Socket for WS upgrades — only handle HTTP responses
        if (res && typeof res === 'object' && 'writeHead' in res) {
          const httpRes = res as import('node:http').ServerResponse;
          const isConnRefused = err.code === 'ECONNREFUSED';
          httpRes.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
          httpRes.end(isConnRefused
            ? '<html><body><h1>Dev server restarting...</h1><script>setTimeout(()=>location.reload(),2000)</script></body></html>'
            : `<html><body><h1>Proxy error</h1><pre>${escapeHtml(err.message)}</pre></body></html>`
          );
        }
      },
    },
  });

  app.use(proxy as any);

  // ── Editor WebSocket ────────────────────────────────────────

  interface WsMessage {
    type: string;
    id?: string;
    sessionId?: string;
    [key: string]: unknown;
  }

  function isValidWsMessage(data: unknown): data is WsMessage {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.type !== 'string') return false;
    if ('id' in obj && typeof obj.id !== 'string') return false;
    if ('sessionId' in obj && typeof obj.sessionId !== 'string') return false;
    return true;
  }

  editorWss.on('connection', (ws: WebSocket) => {
    let authenticated = false;

    ws.send(JSON.stringify({ type: 'hello' }));

    ws.on('message', (data: Buffer) => {
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); }
      catch {
        if (!authenticated) {
          ws.close(4001, 'Authentication failed');
        }
        // Silently ignore non-JSON after auth (matches existing behaviour)
        return;
      }

      if (!isValidWsMessage(parsed)) {
        if (!authenticated) {
          ws.close(4001, 'Authentication failed');
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'invalid message schema' }));
        }
        return;
      }

      if (!authenticated) {
        if (parsed.type === 'auth' && parsed.sessionId === sessionId) {
          authenticated = true;
          ws.send(JSON.stringify({ type: 'session', authenticated: true }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'auth failed' }));
          ws.close(4001, 'Authentication failed');
        }
        return;
      }

      // Post-auth: require message id
      if (!parsed.id) {
        ws.send(JSON.stringify({ type: 'error', message: 'missing message id' }));
        return;
      }

      ws.send(JSON.stringify({ type: 'ack', id: parsed.id }));
    });
  });

  return { app, proxy, editorWss, sessionId, startedAt, setShutdownHandler, triggerShutdown };
}

// ─── attachUpgradeHandler ────────────────────────────────────────

export function attachUpgradeHandler(server: Server, context: AppContext): void {
  const { proxy, editorWss } = context;

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    // C1: Validate Host (mirrors Express middleware)
    const reqHost = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!LOOPBACK_HOSTS.has(reqHost)) { socket.destroy(); return; }

    // C1: Validate Origin if present
    const origin = req.headers.origin;
    if (origin && !isLoopbackOrigin(origin)) { socket.destroy(); return; }

    const url = req.url ?? '';

    if (url.startsWith('/__zerofog')) {
      editorWss.handleUpgrade(req, socket, head, (ws) => {
        editorWss.emit('connection', ws, req);
      });
    } else {
      // H5: Runtime guard instead of non-null assertion
      if (typeof proxy.upgrade === 'function') {
        proxy.upgrade(req, socket, head);
      } else {
        socket.destroy();
      }
    }
  });
}

// ─── startServer ─────────────────────────────────────────────────

export function startServer(options: ServerOptions): Promise<ServerContext> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  const pidDir = join(process.cwd(), '.cortex');
  const pidPath = join(pidDir, 'sidecar.pid');

  // Check for existing PID before starting
  const pidStatus = checkPidFile(pidPath);
  if (pidStatus === 'alive') {
    return Promise.reject(new Error('Another sidecar is already running'));
  }
  if (pidStatus === 'stale') {
    try { unlinkSync(pidPath); } catch { /* ignore */ }
  }

  const context = createApp(options);
  const server = createServer(context.app);

  attachUpgradeHandler(server, context);

  let closing = false;

  const close = (): Promise<void> => {
    if (closing) return Promise.resolve();
    closing = true;
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('uncaughtException', onFatalError);
    process.removeListener('unhandledRejection', onFatalError);

    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        try { unlinkSync(pidPath); } catch { /* ignore */ }
        resolve();
      };

      for (const client of context.editorWss.clients) {
        client.close(1001, 'Server shutting down');
      }
      context.editorWss.close();

      const forceTimer = setTimeout(() => {
        server.closeAllConnections();
        finish();
      }, 5000);

      server.close(() => {
        clearTimeout(forceTimer);
        finish();
      });
    });
  };

  function onSignal() { close(); }
  function onFatalError() {
    try { unlinkSync(pidPath); } catch { /* ignore */ }
    process.exit(1);
  }
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  process.on('uncaughtException', onFatalError);
  process.on('unhandledRejection', onFatalError);

  // Wire shutdown callback
  context.setShutdownHandler(() => { close(); });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      try {
        mkdirSync(pidDir, { recursive: true });
        writeFileSync(pidPath, String(process.pid));
      } catch { /* ignore PID write failure */ }

      resolve({ ...context, server, close });
    });
    server.on('error', reject);
  });
}
