import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  createTestSidecar,
  createEditorWs,
  waitForWsMessage,
  authenticateWs,
  apiGet,
  apiPost,
  type TestSidecar,
} from '../helpers/server-helpers.js';

// ─── Local mock target (integration serves static HTML fixture) ──

interface MockTarget {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

const fixtureDir = fileURLToPath(new URL('../../test-fixtures', import.meta.url));

function createMockTarget(): Promise<MockTarget> {
  return new Promise((resolve) => {
    const html = readFileSync(join(fixtureDir, 'test-app.html'), 'utf-8');
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// ─── Integration test: full sidecar lifecycle ────────────────────

describe('integration: full sidecar lifecycle', () => {
  let target: MockTarget;
  let sidecar: TestSidecar;
  let tmpDir: string;
  let originalCwd: string;
  let ws: WebSocket;

  // beforeAll/afterAll scope is intentional — this test verifies the full sequential
  // lifecycle (connect → finalize → claim → complete → shutdown) on a single instance.
  beforeAll(async () => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-integration-'));
    process.chdir(tmpDir);

    target = await createMockTarget();
    sidecar = await createTestSidecar(target.port);
  });

  afterAll(async () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    await sidecar.close();
    await target.close();
    process.chdir(originalCwd);
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  // Step 3: Sec-Fetch-Dest: document → 302 redirect
  it('step 3: document request redirects to shell', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: {
        Host: `127.0.0.1:${sidecar.port}`,
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/__zerofog/shell');
  });

  // Step 4: Normal GET / → proxied HTML with injection
  it('step 4: proxied HTML contains test app and injection marker', async () => {
    const res = await fetch(sidecar.url + '/', {
      headers: { Host: `127.0.0.1:${sidecar.port}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Cortex Test App');
    expect(html).toContain('__zerofog_injected__');
  });

  // Step 5: WS connect + authenticate
  it('step 5: WebSocket handshake completes', async () => {
    ws = createEditorWs(sidecar.port);
    await authenticateWs(ws, sidecar.context.sessionId);
    // If we get here without throwing, handshake succeeded
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  // Step 6: GET /api/health
  it('step 6: health check returns ok', async () => {
    const res = await apiGet(sidecar, '/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ status: 'ok' });
  });

  // Step 7: GET /api/status → idle
  it('step 7: status shows idle pipeline', async () => {
    const res = await apiGet(sidecar, '/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pipelineState).toBe('idle');
  });

  // Step 8: WS finalize message → finalize-result
  it('step 8: finalize via WS returns ok with changeCount', async () => {
    ws.send(JSON.stringify({
      type: 'finalize',
      id: 'integ-fin-1',
      payload: {
        elementId: 1,
        testId: 'dashboard-card',
        componentChain: ['Card', 'Dashboard'],
        elementType: 'div',
        changes: [{
          property: 'padding',
          token: 'xl',
          previousToken: 'lg',
          previousCssValue: '20px',
          cssProperty: 'padding',
          cssValue: '24px',
          styleOrigin: { origin: 'mantine-prop', propName: 'p' },
        }],
      },
    }));

    const result = await waitForWsMessage(ws, 'finalize-result');
    expect(result.ok).toBe(true);
    expect(result.changeCount).toBe(1);
  });

  // Step 9: WAL file exists
  it('step 9: WAL file was written to disk', () => {
    expect(existsSync(join(tmpDir, '.cortex', 'wal', 'pending-diff.json'))).toBe(true);
  });

  // Step 10: POST /api/claim → diff with claimToken, status → processing
  // Phase 6: Explicit initialization prevents silent undefined propagation to step 11
  let claimToken = '';
  it('step 10: claim returns diff with claimToken and transitions to processing', async () => {
    const res = await apiPost(sidecar, '/claim');
    expect(res.status).toBe(200);
    const diff = await res.json();
    expect(diff.version).toBe(1);
    expect(diff.elements).toHaveLength(1);
    expect(diff.elements[0].elementSelector).toBe('[data-testid="dashboard-card"]');
    expect(typeof diff.claimToken).toBe('string');
    claimToken = diff.claimToken;

    // Verify state is processing
    const statusRes = await apiGet(sidecar, '/status');
    const status = await statusRes.json();
    expect(status.pipelineState).toBe('processing');
  });

  // Step 11: POST /api/complete → idle, WAL deleted
  it('step 11: complete resets to idle and deletes WAL', async () => {
    // Listen for broadcast before completing
    const broadcastPromise = waitForWsMessage(ws, 'edit-complete');

    const res = await apiPost(sidecar, '/complete', { applied: [0], failed: [], claimToken });
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.applied).toEqual([0]);

    // Verify broadcast received
    const broadcast = await broadcastPromise;
    expect(broadcast.type).toBe('edit-complete');

    // Verify state is idle
    const statusRes = await apiGet(sidecar, '/status');
    const status = await statusRes.json();
    expect(status.pipelineState).toBe('idle');

    // Verify WAL deleted
    expect(existsSync(join(tmpDir, '.cortex', 'wal', 'pending-diff.json'))).toBe(false);
  });

  // Step 12: POST /api/shutdown → 202 + handler fires
  it('step 12: shutdown triggers callback without closing server', async () => {
    let shutdownFired = false;
    sidecar.context.setShutdownHandler(() => { shutdownFired = true; });

    const res = await apiPost(sidecar, '/shutdown');
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.status).toBe('shutting down');
    expect(shutdownFired).toBe(true);
  });
});
