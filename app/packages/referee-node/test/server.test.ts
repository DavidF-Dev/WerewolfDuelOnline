import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyReplay } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { PROTOCOL_VERSION, encode } from '@wwd/protocol';
import { Room } from '@wwd/referee-core';
import { LIMITS } from '@wwd/referee-service';
import {
  Client,
  FULL_GAME_TIMEOUT_MS,
  ORIGIN,
  RawSocket,
  SEED,
  Xorshift,
  advancingClock,
  createRoom,
  expectUnknownRoom,
  joinBoth,
  play,
  removeTempDirs,
  start,
  until,
  wsUrl,
  type TestServer,
} from './helpers.js';

beforeAll(loadEngineForNode);

const servers: TestServer[] = [];
const clients: Client[] = [];

async function server(opts: Parameters<typeof start>[0] = {}): Promise<TestServer> {
  const s = await start(opts);
  servers.push(s);
  return s;
}

async function open(s: TestServer, code: string): Promise<Client> {
  const c = await Client.open(wsUrl(s, code));
  clients.push(c);
  return c;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close();
  await removeTempDirs();
});

describe('referee-node server', () => {
  it('create and play a full game over ws', { timeout: FULL_GAME_TIMEOUT_MS }, async () => {
    const s = await server({ clock: advancingClock(), testOverrides: true });
    const code = await createRoom(s, { test: { seed: SEED } });
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);

    await play([p0, p1], new Xorshift(7));

    const replay = p0.ofType('game_over')[0]!.replay;
    expect(p1.ofType('game_over')[0]!.replay).toEqual(replay);
    expect(() => verifyReplay(replay)).not.toThrow();
    await s.close();
    servers.length = 0;
    const saved = JSON.parse(await readFile(join(s.dataDir, `${code}.json`), 'utf8'));
    expect(saved.code).toBe(code);
    expect(saved.finished_at).not.toBeNull();
    expect(saved.replay).toEqual(replay);
  });

  it('writes the first snapshot before answering room creation', async () => {
    const s = await server();
    const code = await createRoom(s);
    const saved = JSON.parse(await readFile(join(s.dataDir, `${code}.json`), 'utf8'));
    expect(saved).toMatchObject({ version: 2, code, seats: [null, null], replay: null });
  });

  it('tells an upgrade for an unknown room so, then closes it 1008', async () => {
    const s = await server();
    await expectUnknownRoom(s, 'ABCDEF');
  });

  it('refuses an upgrade for a malformed room code with 404', async () => {
    const s = await server();
    await expect(Client.open(wsUrl(s, 'ABC'))).rejects.toThrow(/404/);
  });

  it('a malformed frame on a turned-away socket leaves the server serving', async () => {
    const s = await server({ clock: advancingClock() });
    const raw = await RawSocket.upgrade(s, 'ABCDEF');
    raw.sendUnmasked();
    await until(() => raw.closed, 2000);
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
  });

  it('a malformed frame on a room socket closes only that socket', async () => {
    const s = await server();
    const code = await createRoom(s);
    const raw = await RawSocket.upgrade(s, code);
    raw.sendUnmasked();
    await until(() => raw.closed, 2000);
    await expect(open(s, code)).resolves.toBeInstanceOf(Client);
  });

  it('ends a turned-away socket promptly when the peer never answers the close', async () => {
    const s = await server();
    const raw = await RawSocket.upgrade(s, 'ABCDEF');
    try {
      await until(() => raw.closed, 2500);
    } finally {
      raw.destroy();
    }
  });

  it('unknown-room sockets never hold a connection slot', async () => {
    const s = await server();
    const code = await createRoom(s);
    const unknown = code === 'ABCDEF' ? 'ABCDEG' : 'ABCDEF';
    for (let i = 0; i <= LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) await expectUnknownRoom(s, unknown);
    for (let i = 0; i < LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) await open(s, code);
    await expect(Client.open(wsUrl(s, code))).rejects.toThrow(/503/);
    await expectUnknownRoom(s, unknown);
  });

  it('closes a connection whose hello names another room', async () => {
    const s = await server();
    const code = await createRoom(s);
    const other = code === 'ABCDEF' ? 'ABCDEG' : 'ABCDEF';
    const c = await open(s, code);
    c.hello(other);
    expect(await c.closedNow()).toBe(1000);
    expect(c.received).toEqual([{ type: 'error', code: 'unknown_room' }]);
  });

  it('oversized frame closes socket', async () => {
    const s = await server();
    const code = await createRoom(s);
    const c = await open(s, code);
    c.send('x'.repeat(LIMITS.MAX_FRAME_BYTES + 1));
    expect(await c.closedNow()).toBe(1009);
  });

  it('pre-hello timeout closes', async () => {
    const s = await server({ preHelloTimeoutMs: 100 });
    const code = await createRoom(s);
    const silent = await open(s, code);
    const greeted = await open(s, code);
    greeted.hello(code);
    await until(() => silent.closed, 2000);
    expect(silent.closeCode).toBe(1008);
    // Both deadlines were set together, so the greeted socket's has passed too.
    greeted.send(encode({ type: 'ping' }));
    await until(() => greeted.ofType('pong').length > 0);
    expect(greeted.closed).toBe(false);
  });

  it('close flag closes after delivery', async () => {
    const s = await server({ clock: advancingClock() });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    const third = await open(s, code);
    third.hello(code);
    expect(await third.closedNow()).toBe(1000);
    expect(third.received).toEqual([{ type: 'error', code: 'room_full' }]);
    expect(p0.closed).toBe(false);
  });

  it('a connection waiting for rejoin approval is answered pings and stays pending', async () => {
    const s = await server({ clock: advancingClock() });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    p0.close();
    await until(() => p1.ofType('opponent_status').some((m) => !m.connected));

    const asker = await open(s, code);
    asker.send(
      encode({ type: 'rejoin', protocol_version: PROTOCOL_VERSION, room: code, seat: 'p0' }),
    );
    await until(() => p1.ofType('rejoin_request').length > 0);
    asker.send(encode({ type: 'ping' }));
    await until(() => asker.ofType('pong').length > 0 || asker.ofType('error').length > 0);
    expect(asker.ofType('error')).toEqual([]);
    expect(p1.ofType('rejoin_withdrawn')).toEqual([]);

    p1.send(encode({ type: 'approve_rejoin', approve: true }));
    await until(() => asker.ofType('welcome').length > 0);
    expect(asker.ofType('welcome')[0]!.seat).toBe('p0');
    expect(asker.closed).toBe(false);
  });

  it('caps connections per room, counting those yet to say hello', async () => {
    const s = await server();
    const code = await createRoom(s);
    for (let i = 0; i < LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) await open(s, code);
    await expect(Client.open(wsUrl(s, code))).rejects.toThrow(/503/);
    const leaving = clients.pop()!;
    leaving.close();
    await leaving.closedNow();
    await expect(vi.waitFor(() => open(s, code))).resolves.toBeInstanceOf(Client);
  });

  it('aborted handshakes never hold a connection slot', async () => {
    const s = await server();
    const code = await createRoom(s);
    const { port } = new URL(s.url);
    for (let i = 0; i <= LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request({
          host: '127.0.0.1',
          port,
          path: `/rooms/${code}/ws`,
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            origin: ORIGIN,
            'sec-websocket-version': '13',
            'sec-websocket-key': 'not a valid key',
          },
        });
        req.on('response', (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(400);
    }
    await expect(open(s, code)).resolves.toBeInstanceOf(Client);
  });

  it('closes a socket that leaves too much output unread', async () => {
    const s = await server({ clock: advancingClock() });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    const raw = (p1.socket as unknown as { _socket: Socket })._socket;
    raw.pause();
    // Each hello without last_seq resends the whole event log, which p1 never reads.
    for (let i = 0; i < 20_000; i++) {
      if (p0.ofType('opponent_status').some((m) => !m.connected)) break;
      p1.hello(code, p1.token());
      if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    await until(() => p0.ofType('opponent_status').some((m) => !m.connected));
    raw.resume();
    expect(await p1.closedNow()).toBe(1013);
  });

  it('closes an idle socket, starting its grace', async () => {
    const s = await server({ idleTimeoutMs: 300 });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    const keepAlive = setInterval(() => p0.send(encode({ type: 'ping' })), 100);
    try {
      expect(await p1.closedNow()).toBe(1001);
      await until(() =>
        p0.ofType('opponent_status').some((m) => !m.connected && m.grace_deadline !== undefined),
      );
      expect(p0.closed).toBe(false);
    } finally {
      clearInterval(keepAlive);
    }
  });

  it('a handler failure closes only that socket', async () => {
    const s = await server();
    const code = await createRoom(s);
    const good = await open(s, code);
    good.hello(code);
    await until(() => good.ofType('welcome').length > 0);
    const bad = await open(s, code);
    vi.spyOn(Room.prototype, 'handle').mockImplementationOnce(() => {
      throw new Error('handler failure');
    });
    bad.send(encode({ type: 'ping' }));
    expect(await bad.closedNow()).toBe(1011);
    good.send(encode({ type: 'ping' }));
    await until(() => good.ofType('pong').length > 0);
    expect(good.closed).toBe(false);
  });

  it('cors and rate limit via http', async () => {
    const s = await server();
    const preflight = await fetch(`${s.url}/rooms`, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);

    const foreign = await fetch(`${s.url}/rooms`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const health = await fetch(`${s.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, protocol_version: PROTOCOL_VERSION });

    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) await createRoom(s);
    const limited = await fetch(`${s.url}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: '{}',
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('rate limits by the forwarded address only behind a trusted proxy', async () => {
    const post = (s: TestServer, ip: string) =>
      fetch(`${s.url}/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': ip },
        body: '{}',
      });
    const trusted = await server({ trustProxy: true });
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) {
      await post(trusted, `198.51.100.${i}, 10.0.0.1`);
    }
    // Only the hop the proxy appended counts; client-supplied earlier hops are ignored.
    expect((await post(trusted, '203.0.113.9, 10.0.0.1')).status).toBe(429);
    expect((await post(trusted, '10.0.0.2')).status).toBe(400);

    const direct = await server();
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) await post(direct, `10.0.1.${i}`);
    expect((await post(direct, '10.0.2.1')).status).toBe(429);
  });

  it('honours test overrides only when enabled', async () => {
    const off = await server();
    const refused = await fetch(`${off.url}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        config: { tiebreak: 'badge_only', min_targets: 1, badge_start: 'random' },
        grace_minutes: 10,
        test: { grace_ms: 1000 },
      }),
    });
    expect(refused.status).toBe(400);

    const on = await server({ testOverrides: true });
    const local = await fetch(`${on.url}/health`, { headers: { origin: 'http://localhost:5173' } });
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});
