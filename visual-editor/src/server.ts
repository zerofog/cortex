import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

import express, { type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { WebSocketServer, WebSocket } from 'ws';
import { createConnection, type Socket } from 'node:net';

import { injectScripts } from './inject.js';
import { StateManager, StateConflictError, isFinalizePayload, isCompletionReport } from './state.js';

// Works from both src/ (tsx) and dist/ (built)
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 3100;
const DEFAULT_HOST = 'localhost';
const MAX_INJECT_SIZE = 5 * 1024 * 1024; // 5MB safety valve
const HEARTBEAT_INTERVAL_MS = 30_000;
// '[::1]' matches raw Host header; '::1' matches URL.hostname (WHATWG URL strips brackets)
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Extract hostname from a Host header, handling IPv6 brackets and port suffix. */
function hostnameFromHostHeader(host: string): string {
  // Bracketed IPv6: "[::1]:3000" → "::1"
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(1, close);
  }
  // IPv4 or hostname: "localhost:3000" → "localhost"
  // Bare IPv6 without brackets (e.g. "::1") — only strip if single colon + digits
  const lastColon = host.lastIndexOf(':');
  if (lastColon === -1) return host;
  if (host.indexOf(':') === lastColon && /^\d+$/.test(host.slice(lastColon + 1))) {
    return host.slice(0, lastColon);
  }
  return host;
}

function isLoopbackOrigin(origin: string): boolean {
  try { return LOOPBACK_HOSTS.has(new URL(origin).hostname); }
  catch { return false; }
}

/** Check if a Host header value resolves to a loopback address. */
function isAllowedHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(hostnameFromHostHeader(host));
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

// Security tradeoff: CSP rewriting weakens the target app's CSP (adds nonce + 'self'
// to script-src, strips frame-ancestors). Acceptable because this is a dev-only tool
// bound to loopback — never deployed to production. See M6 in phase5-review.md.
//
// H3: Handles nonce, strict-dynamic, script-src-elem, require-trusted-types-for.
function rewriteScriptDirective(parts: string[], nonce: string): string[] {
  // Remove tokens that conflict with our injection: 'none', 'strict-dynamic'
  // strict-dynamic makes 'self' and nonce-based sources ignored for non-inline scripts
  const filtered = parts.filter(p =>
    p !== "'none'" && p !== "'strict-dynamic'"
  );
  if (!filtered.includes("'self'")) filtered.push("'self'");
  filtered.push(`'nonce-${nonce}'`);
  return filtered;
}

export function rewriteCsp(csp: string, nonce: string): string {
  const directives = csp.split(';').map(d => d.trim()).filter(Boolean);
  const result: string[] = [];
  let hasScriptSrc = false;
  let hasScriptSrcElem = false;

  for (const directive of directives) {
    const parts = directive.split(/\s+/);
    const name = parts[0]!.toLowerCase();

    if (name === 'frame-ancestors') continue;
    if (name === 'require-trusted-types-for') continue;  // blocks textContent injection

    if (name === 'script-src') {
      hasScriptSrc = true;
      result.push(rewriteScriptDirective(parts, nonce).join(' '));
      continue;
    }

    if (name === 'script-src-elem') {
      hasScriptSrcElem = true;
      result.push(rewriteScriptDirective(parts, nonce).join(' '));
      continue;
    }

    result.push(directive);
  }

  // If default-src exists but no script-src, browsers fall back to default-src
  // for scripts. Add explicit script-src derived from default-src + 'self' + nonce.
  if (!hasScriptSrc) {
    const defaultSrc = directives.find(d =>
      d.split(/\s+/)[0]!.toLowerCase() === 'default-src'
    );
    if (defaultSrc) {
      const values = new Set(
        defaultSrc.split(/\s+/).slice(1).filter(v => v !== "'none'" && v !== "'strict-dynamic'")
      );
      values.add("'self'");
      values.add(`'nonce-${nonce}'`);
      result.push(`script-src ${[...values].join(' ')}`);
    }
  }

  // If script-src-elem wasn't present but script-src was, browsers use script-src
  // for <script> elements. But if another part of the app adds script-src-elem later,
  // our injected scripts need coverage. Only add if script-src is present.
  if (hasScriptSrc && !hasScriptSrcElem) {
    result.push(`script-src-elem 'self' 'nonce-${nonce}'`);
  }

  return result.join('; ');
}

// ─── Types ───────────────────────────────────────────────────────

export interface ServerOptions {
  targetPort: number;
  port?: number;
  host?: string;
  /** Override heartbeat interval for testing. Default: 30000ms */
  heartbeatIntervalMs?: number;
}

export interface AppContext {
  app: express.Express;
  /** Opaque proxy middleware — HPM types don't align cleanly with Express 5. */
  proxy: { upgrade?: (req: IncomingMessage, socket: Socket, head: Buffer) => void };
  editorWss: WebSocketServer;
  stateManager: StateManager;
  sessionId: string;
  startedAt: number;
  setShutdownHandler: (cb: () => void) => void;
  triggerShutdown: () => void;
}

export interface ServerContext extends AppContext {
  server: Server;
  close: () => Promise<void>;
}

// ─── createApiRouter ─────────────────────────────────────────────

interface ApiRouterDeps {
  sessionId: string;
  targetPort: number;
  startedAt: number;
  stateManager: StateManager;
  broadcastWs: (payload: Record<string, unknown>) => void;
  triggerShutdown: () => void;
}

function createApiRouter(deps: ApiRouterDeps): express.Router {
  const { sessionId, targetPort, startedAt, stateManager, broadcastWs, triggerShutdown } = deps;
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

  api.get('/health', async (_req: Request, res: Response) => {
    const targetReachable = await checkTargetReachable(targetPort);
    res.status(200).json({ status: 'ok', targetReachable });
  });

  api.get('/status', (_req: Request, res: Response) => {
    res.status(200).json({
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      targetPort,
      pipelineState: stateManager.getState(),
    });
  });

  // H9: Read-only diff inspection — does not advance state machine
  api.get('/diff', (_req: Request, res: Response) => {
    const diff = stateManager.getDiff();
    if (!diff) {
      res.status(404).json({ error: 'No pending diff' });
      return;
    }
    res.status(200).json(diff);
  });

  function handleStateError(err: unknown, res: Response, label: string): void {
    if (err instanceof StateConflictError) {
      const status = err.attemptedTransition.includes('token mismatch') ? 403 : 409;
      res.status(status).json({ error: status === 403 ? 'forbidden' : 'conflict', state: err.currentState });
      return;
    }
    if (err instanceof RangeError) {
      res.status(400).json({ error: 'index out of bounds', message: err.message });
      return;
    }
    console.error(`[cortex] Unexpected ${label} error:`, err);
    res.status(500).json({ error: 'internal' });
  }

  api.post('/claim', (req: Request, res: Response) => {
    try {
      const { diff, claimToken } = stateManager.claimDiff();
      res.status(200).json({ ...diff, claimToken });
    } catch (err) {
      handleStateError(err, res, 'claim');
    }
  });

  api.post('/complete', express.json({ limit: '100kb', type: 'application/json' }), (req: Request, res: Response) => {
    if (!isCompletionReport(req.body)) {
      res.status(400).json({ error: 'Invalid completion report' });
      return;
    }
    const { claimToken } = req.body as { claimToken?: unknown };
    if (typeof claimToken !== 'string' || !claimToken) {
      res.status(400).json({ error: 'Missing claimToken' });
      return;
    }
    try {
      const report = stateManager.complete(req.body, claimToken);
      broadcastWs({ type: 'edit-complete', payload: report });
      res.status(200).json(report);
    } catch (err) {
      handleStateError(err, res, 'complete');
    }
  });

  api.post('/shutdown', (_req: Request, res: Response) => {
    res.status(202).json({ status: 'shutting down' });
    triggerShutdown();
  });

  return api;
}

// ─── setupWsHandler ──────────────────────────────────────────────

interface WsHandlerDeps {
  sessionId: string;
  editorWss: WebSocketServer;
  authenticatedClients: Set<WebSocket>;
  stateManager: StateManager;
  heartbeatMs: number;
}

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

function setupWsHandler(deps: WsHandlerDeps): void {
  const { sessionId, editorWss, authenticatedClients, stateManager, heartbeatMs } = deps;

  editorWss.on('connection', (ws: WebSocket) => {
    let authenticated = false;

    ws.send(JSON.stringify({ type: 'hello' }));

    // Heartbeat: detect dead connections via ping/pong (RFC 6455).
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });
    const heartbeatTimer = setInterval(() => {
      if (!isAlive) { clearInterval(heartbeatTimer); ws.terminate(); return; }
      isAlive = false;
      try { ws.ping(); } catch { clearInterval(heartbeatTimer); }
    }, heartbeatMs);
    ws.on('close', () => {
      clearInterval(heartbeatTimer);
      authenticatedClients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[cortex] ws client error:', err.message);
    });

    ws.on('message', async (data: Buffer) => {
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); }
      catch {
        if (!authenticated) {
          ws.close(4001, 'Authentication failed');
        }
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
          authenticatedClients.add(ws);
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

      // Dispatch finalize messages to state machine
      if (parsed.type === 'finalize') {
        const reply = (result: Record<string, unknown>) =>
          ws.send(JSON.stringify({ type: 'finalize-result', id: parsed.id, ...result }));

        if (!isFinalizePayload(parsed.payload)) {
          reply({ ok: false, error: 'invalid payload' });
          return;
        }
        try {
          const diff = await stateManager.receiveDiff(parsed.payload);
          const changeCount = diff.elements.reduce((sum, el) => sum + el.changes.length, 0);
          reply({ ok: true, changeCount });
          console.log(`[cortex] Diff received (${changeCount} changes)`);
        } catch (err) {
          if (err instanceof StateConflictError) {
            reply({ ok: false, error: 'conflict' });
            return;
          }
          console.error('[cortex] Unexpected finalize error:', err);
          reply({ ok: false, error: 'internal' });
        }
        return;
      }

      ws.send(JSON.stringify({ type: 'ack', id: parsed.id }));
    });
  });
}

// ─── createApp ───────────────────────────────────────────────────

export function createApp(options: ServerOptions): AppContext {
  const { targetPort } = options;
  const port = options.port ?? DEFAULT_PORT;
  const heartbeatMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const host = options.host ?? DEFAULT_HOST;
  const sessionId = randomUUID();
  const startedAt = Date.now();

  const app = express();
  app.disable('x-powered-by');
  const editorWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  // M: Track authenticated WS clients — broadcast only to them
  const authenticatedClients = new Set<WebSocket>();

  function broadcastWs(payload: Record<string, unknown>): void {
    const msg = JSON.stringify(payload);
    for (const client of authenticatedClients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch (err) {
          console.warn('[cortex] WS send failed:', (err as Error).message);
        }
      }
    }
  }

  const walDir = join(process.cwd(), '.cortex', 'wal');
  const stateManager = new StateManager({
    sessionId,
    walDir,
    onTimeout: () => broadcastWs({ type: 'processing-timeout' }),
  });

  let shutdownCb: (() => void) | undefined;
  const setShutdownHandler = (cb: () => void): void => { shutdownCb = cb; };
  const triggerShutdown = (): void => { shutdownCb?.(); };

  // ── Host header validation ──────────────────────────────────

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedHost(req.headers.host ?? '')) {
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

  // Security note: sessionId is embedded in unauthenticated script responses.
  // This is acceptable because the server is loopback-only — only local browser
  // tabs can load these scripts. The sessionId acts as a CSRF token for WS auth
  // and mutating API calls. See M7 in phase5-review.md.
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

  app.use('/__zerofog/api', createApiRouter({
    sessionId, targetPort, startedAt, stateManager, broadcastWs, triggerShutdown,
  }));

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
    // Cache sidecar scripts: immutable within a session (embedded sessionId)
    res.set('Cache-Control', 'private, max-age=86400');
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
        // H3: Generate per-request nonce for CSP-compliant script injection
        const nonce = randomBytes(16).toString('base64');

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
          const rewrittenCsp = Array.isArray(existingCsp)
            ? existingCsp.map(policy => rewriteCsp(policy, nonce))
            : rewriteCsp(existingCsp, nonce);
          res.setHeader('content-security-policy', rewrittenCsp);
        }
        // CSP-report-only and X-Frame-Options already excluded by skipHeaders

        // Decompress if needed (normalize string[] to first value)
        const rawEncoding = proxyRes.headers['content-encoding'];
        const encoding = Array.isArray(rawEncoding) ? rawEncoding[0] : rawEncoding;
        let source: NodeJS.ReadableStream = proxyRes;
        if (encoding === 'gzip') source = proxyRes.pipe(createGunzip());
        else if (encoding === 'br') source = proxyRes.pipe(createBrotliDecompress());
        else if (encoding === 'deflate') source = proxyRes.pipe(createInflate());
        else if (encoding) {
          // Unsupported encoding — pass through without injection to avoid corruption
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res);
          return;
        }

        // Design tradeoff: buffering the full HTML response defeats streaming SSR.
        // Acceptable for a dev-only editing tool where injection correctness matters
        // more than TTFB. See M5 in phase5-review.md.
        //
        // H9: Track accumulated size during streaming. Once exceeded, stop buffering
        // and pipe the remainder directly to avoid unbounded memory usage.
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let oversize = false;

        source.on('data', (chunk: Buffer) => {
          if (oversize) { res.write(chunk); return; }
          totalSize += chunk.length;
          if (totalSize > MAX_INJECT_SIZE) {
            oversize = true;
            // Flush already-buffered chunks, then this chunk, directly to response
            for (const c of chunks) res.write(c);
            res.write(chunk);
            chunks.length = 0;
            return;
          }
          chunks.push(chunk);
        });
        source.on('end', () => {
          if (oversize) { res.end(); return; }
          const buffer = Buffer.concat(chunks);
          const body = Buffer.from(injectScripts(buffer.toString('utf-8'), nonce), 'utf-8');
          res.setHeader('content-length', Buffer.byteLength(body));
          res.end(body);
        });
        source.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
          }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express 5 / HPM type boundary
  app.use(proxy as any);

  // C2: Error handler AFTER proxy so it catches proxy errors too
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires 4-param signature
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message || 'Bad request' });
  });

  // ── Editor WebSocket ────────────────────────────────────────

  setupWsHandler({ sessionId, editorWss, authenticatedClients, stateManager, heartbeatMs });

  return { app, proxy, editorWss, stateManager, sessionId, startedAt, setShutdownHandler, triggerShutdown };
}

// ─── attachUpgradeHandler ────────────────────────────────────────

export function attachUpgradeHandler(server: Server, context: AppContext): void {
  const { proxy, editorWss } = context;

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    // C1: Validate Host (shared helper with Express middleware)
    if (!isAllowedHost(req.headers.host ?? '')) { socket.destroy(); return; }

    const origin = req.headers.origin;
    const url = req.url ?? '';

    if (url.startsWith('/__zerofog')) {
      // H5: Defense-in-depth — editor WS requires Origin header.
      // The real auth boundary is sessionId (randomUUID()); Origin blocks
      // non-browser clients (curl/scripts) that omit it.
      if (!origin || !isLoopbackOrigin(origin)) { socket.destroy(); return; }
      editorWss.handleUpgrade(req, socket, head, (ws) => {
        editorWss.emit('connection', ws, req);
      });
    } else {
      // Proxy WS: validate Origin if present
      if (origin && !isLoopbackOrigin(origin)) { socket.destroy(); return; }
      if (typeof proxy.upgrade === 'function') {
        proxy.upgrade(req, socket, head);
      } else {
        socket.destroy();
      }
    }
  });
}

// ─── startServer ─────────────────────────────────────────────────

function checkTargetReachable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
    sock.once('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.once('error', () => { clearTimeout(timer); sock.destroy(); resolve(false); });
  });
}

export async function startServer(options: ServerOptions): Promise<ServerContext> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  const pidDir = join(process.cwd(), '.cortex');
  const pidPath = join(pidDir, 'sidecar.pid');

  // Check for existing PID before starting (with TOCTOU mitigation via O_EXCL)
  const pidStatus = checkPidFile(pidPath);
  if (pidStatus === 'alive') {
    throw new Error('Another sidecar is already running');
  }
  // Write PID atomically with O_EXCL to narrow the TOCTOU window
  try {
    mkdirSync(pidDir, { recursive: true });
    writeFileSync(pidPath, String(process.pid), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Race: another process wrote PID between our check and write
      const recheck = checkPidFile(pidPath);
      if (recheck === 'alive') {
        throw new Error('Another sidecar is already running');
      }
      // Still stale — force overwrite
      writeFileSync(pidPath, String(process.pid));
    }
    // Other errors: non-fatal, proceed without PID file
  }

  // H5: Non-fatal target reachability check
  const reachable = await checkTargetReachable(options.targetPort);
  if (!reachable) {
    console.warn(`[cortex] Warning: nothing is listening on port ${options.targetPort}. Start your dev server first.`);
  }

  const context = createApp(options);
  context.stateManager.recover();
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

      context.stateManager.dispose({ deleteWal: true });
      for (const client of context.editorWss.clients) {
        try { client.terminate(); } catch { /* ignore */ }
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

  function onSignal() {
    close().then(() => process.exit(0)).catch(() => process.exit(1));
  }
  function onFatalError(err: unknown) {
    console.error('[cortex] Fatal error:', err);
    close().catch(() => {}).finally(() => process.exit(1));
  }
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  process.on('uncaughtException', onFatalError);
  process.on('unhandledRejection', onFatalError);

  // H4: Wire shutdown callback — setImmediate ensures 202 response flushes before close()
  context.setShutdownHandler(() => {
    setImmediate(() => { close().catch(() => {}); });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve({ ...context, server, close });
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      // Clean up process-level handlers on startup failure
      process.removeListener('SIGTERM', onSignal);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('uncaughtException', onFatalError);
      process.removeListener('unhandledRejection', onFatalError);
      // H2: Clean up PID file if it's ours — prevents false "already running" on retry
      try {
        const pidContent = readFileSync(pidPath, 'utf-8').trim();
        if (pidContent === String(process.pid)) unlinkSync(pidPath);
      } catch { /* ignore — PID file may not exist */ }
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try --port ${port + 1}`));
      } else {
        reject(err);
      }
    });
  });
}
