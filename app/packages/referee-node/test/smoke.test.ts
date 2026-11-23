import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { removeTempDirs, start, type TestServer } from './helpers.js';

const SMOKE_SCRIPT = fileURLToPath(new URL('../../../../scripts/smoke.mjs', import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the smoke script with `args` in a separate Node process. */
function smoke(...args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SMOKE_SCRIPT, ...args],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

const servers: TestServer[] = [];
const silent: Server[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const s of silent.splice(0)) {
    s.closeAllConnections();
    await new Promise((resolve) => s.close(resolve));
  }
  await removeTempDirs();
});

async function listen(server: Server, port = 0): Promise<string> {
  silent.push(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A port that nothing listens on, for now. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * A fake referee that answers the HTTP API and accepts WebSocket upgrades, then never sends a
 * frame or answers a close.
 */
async function silentSockets(): Promise<string> {
  const sockets: Socket[] = [];
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, protocol_version: 1, engine_version: 'test' }));
    } else {
      res.statusCode = 201;
      res.end(JSON.stringify({ code: 'ABCDEF' }));
    }
  });
  server.on('upgrade', (req, socket: Socket) => {
    sockets.push(socket);
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.on('error', () => {});
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  server.on('close', () => sockets.forEach((s) => s.destroy()));
  return listen(server);
}

/** An HTTP server that accepts requests and never answers them. */
async function unresponsive(): Promise<string> {
  return listen(createServer(() => {}));
}

describe('smoke script', () => {
  it('passes against a running referee', async () => {
    const s = await start();
    servers.push(s);

    const run = await smoke(s.url);

    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/smoke test passed/i);
    expect(run.stdout).toMatch(/the first player resigned/i);
    // The script created exactly one room on the referee, and left it finished.
    await s.close();
    servers.length = 0;
    const rooms = (await readdir(s.dataDir)).filter((f) => /^[0-9A-Z]{6}\.json$/.test(f));
    expect(rooms).toHaveLength(1);
    const saved = JSON.parse(await readFile(join(s.dataDir, rooms[0]!), 'utf8'));
    expect(saved.finished_at).not.toBeNull();
  });

  it('accepts a referee url with a trailing slash', async () => {
    const s = await start();
    servers.push(s);

    expect((await smoke(`${s.url}/`)).code).toBe(0);
  });

  it('fails clearly when the referee is unreachable', async () => {
    const s = await start();
    const url = s.url;
    await s.close();

    const run = await smoke(url, '--retry-delay', '50');

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/smoke test failed/i);
    expect(run.stderr).toMatch(/health/i);
    expect(run.stderr).toMatch(/after 4 attempts/i);
  });

  it('retries the health check while a fresh deploy comes up', async () => {
    const port = await freePort();
    const running = smoke(`http://127.0.0.1:${port}`, '--retry-delay', '400');
    await new Promise((resolve) => setTimeout(resolve, 200));
    servers.push(await start({ port }));

    const run = await running;

    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/health check failed, retrying/i);
  });

  it('does not wait for ever on a socket close the referee never completes', async () => {
    const startedAt = Date.now();
    const run = await smoke(await silentSockets(), '--timeout', '500');

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/timed out after 500 ms/i);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it('fails when the referee does not answer in time', async () => {
    const run = await smoke(await unresponsive(), '--timeout', '500');

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/timed out after 500 ms/i);
  });

  it('prints usage and exits 2 without a referee url', async () => {
    const run = await smoke();

    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/usage: node scripts\/smoke\.mjs <referee-url>/i);
  });
});
