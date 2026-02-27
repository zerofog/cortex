import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { WebSocketServer, WebSocket } from 'ws';
import type { Socket } from 'node:net';

import { injectScripts } from './inject.js';

// Works from both src/ (tsx) and dist/ (built)
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 3100;
const DEFAULT_HOST = 'localhost';
const MAX_INJECT_SIZE = 5 * 1024 * 1024; // 5MB safety valve
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackOrigin(origin: string): boolean {
  try { return LOOPBACK_HOSTS.has(new URL(origin).hostname); }
  catch { return false; }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      proxyRes: responseInterceptor(async (buffer, proxyRes, _req, res) => {
        const contentType = String(proxyRes.headers['content-type'] ?? '');
        const isHtml = contentType.includes('text/html');

        if (isHtml) {
          // Strip framing/CSP headers on HTML responses
          res.removeHeader('content-security-policy');
          res.removeHeader('content-security-policy-report-only');
          res.removeHeader('x-frame-options');

          if (buffer.length <= MAX_INJECT_SIZE) {
            return injectScripts(buffer.toString('utf-8'));
          }
        }

        return buffer;
      }) as any,
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

  editorWss.on('connection', (ws: WebSocket) => {
    let authenticated = false;

    ws.send(JSON.stringify({ type: 'hello' }));

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (!authenticated) {
          if (msg.type === 'auth' && msg.sessionId === sessionId) {
            authenticated = true;
            ws.send(JSON.stringify({ type: 'session', authenticated: true }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'auth failed' }));
            ws.close(4001, 'Authentication failed');
          }
          return;
        }

        ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
      } catch {
        if (!authenticated) {
          ws.close(4001, 'Authentication failed');
          return;
        }
      }
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
  const context = createApp(options);
  const server = createServer(context.app);

  attachUpgradeHandler(server, context);

  const pidDir = join(process.cwd(), '.cortex');
  const pidPath = join(pidDir, 'sidecar.pid');

  let closing = false;

  const close = (): Promise<void> => {
    if (closing) return Promise.resolve();
    closing = true;
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);

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
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

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
