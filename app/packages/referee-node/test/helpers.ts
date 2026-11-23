import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import WebSocket from 'ws';
import { defaultRulesConfig, type Command, type View } from '@wwd/engine';
import { PROTOCOL_VERSION, encode, parseServerMessage, type ServerMessage } from '@wwd/protocol';
import type { Clock } from '@wwd/referee-core';
import { startReferee, type NodeRefereeOptions } from '../src/index.js';

export const ORIGIN = 'https://play.example.com';
export const MAX_ROUNDS = 200;
/** A room seed, honoured by a server started with test overrides, that fixes the game dealt. */
export const SEED = 'a1'.repeat(32);
/** A per-test timeout for tests that play a whole game. */
export const FULL_GAME_TIMEOUT_MS = 30_000;

type Events = Extract<ServerMessage, { type: 'events' }>;

/** A deterministic xorshift generator. */
export class Xorshift {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    this.state >>>= 0;
    return this.state;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.next() % items.length];
    if (item === undefined) throw new Error('nothing to pick from');
    return item;
  }
}

/** A clock that advances a second per reading, keeping long games clear of message rate limits. */
export function advancingClock(start = Date.now()): Clock {
  let time = start;
  return { now: () => (time += 1000) };
}

export async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export interface TestServer {
  url: string;
  dataDir: string;
  close(): Promise<void>;
}

const dirs: string[] = [];

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wwd-referee-'));
  dirs.push(dir);
  return dir;
}

export async function removeTempDirs(): Promise<void> {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
}

export async function start(
  opts: Partial<NodeRefereeOptions> = {},
  dataDir?: string,
): Promise<TestServer> {
  const dir = dataDir ?? (await tempDir());
  const server = await startReferee({
    port: 0,
    host: '127.0.0.1',
    dataDir: dir,
    allowedOrigins: [ORIGIN],
    logger: silentLogger,
    ...opts,
  });
  return { ...server, dataDir: dir };
}

export const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

export async function createRoom(server: TestServer, extra: object = {}): Promise<string> {
  const res = await fetch(`${server.url}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ config: defaultRulesConfig(), grace_minutes: 10, ...extra }),
  });
  if (res.status !== 201) throw new Error(`room creation failed: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export function wsUrl(server: TestServer, code: string): string {
  return `${server.url.replace(/^http/, 'ws')}/rooms/${code}/ws`;
}

/** A WebSocket client that records every server message. */
export class Client {
  readonly received: ServerMessage[] = [];
  closeCode: number | undefined;
  readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      const parsed = parseServerMessage(data.toString());
      if (!parsed.ok) throw new Error(`bad server message: ${data.toString()}`);
      this.received.push(parsed.msg);
    });
    socket.on('close', (code) => {
      this.closeCode = code;
    });
  }

  static async open(url: string): Promise<Client> {
    const socket = new WebSocket(url, { origin: ORIGIN });
    const client = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return client;
  }

  get closed(): boolean {
    return this.closeCode !== undefined;
  }

  send(raw: string): void {
    this.socket.send(raw);
  }

  hello(room: string, token?: string, lastSeq?: number): void {
    this.send(
      encode({
        type: 'hello',
        protocol_version: PROTOCOL_VERSION,
        room,
        ...(token === undefined ? {} : { seat_token: token }),
        ...(lastSeq === undefined ? {} : { last_seq: lastSeq }),
      }),
    );
  }

  command(cmd: Command): void {
    this.send(encode({ type: 'command', cmd }));
  }

  ofType<T extends ServerMessage['type']>(type: T): Array<Extract<ServerMessage, { type: T }>> {
    return this.received.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  latest(): Events | undefined {
    return this.ofType('events').at(-1);
  }

  /** One past the highest event sequence number received, as sent in `last_seq`. */
  nextSeq(): number {
    let next = 0;
    for (const e of this.ofType('events')) {
      for (const [seq] of e.events) next = Math.max(next, seq + 1);
    }
    return next;
  }

  token(): string {
    const welcome = this.ofType('welcome')[0];
    if (welcome === undefined) throw new Error('not welcomed');
    return welcome.seat_token;
  }

  close(): void {
    this.socket.close();
  }

  async closedNow(): Promise<number> {
    await until(() => this.closed);
    return this.closeCode!;
  }
}

/** Opens a socket to `code` and checks it is told the room is unknown, then closed with 1008. */
export async function expectUnknownRoom(server: TestServer, code: string): Promise<void> {
  const c = await Client.open(wsUrl(server, code));
  try {
    expect(await c.closedNow()).toBe(1008);
    expect(c.received).toEqual([{ type: 'error', code: 'unknown_room' }]);
  } finally {
    c.close();
  }
}

/** A raw TCP client that completes a WebSocket upgrade by hand, for sending frames `ws` refuses. */
export class RawSocket {
  private ended = false;

  private constructor(readonly socket: Socket) {
    socket.on('close', () => {
      this.ended = true;
    });
    socket.on('error', () => {});
  }

  /** Upgrades to `/rooms/{code}/ws` and resolves once the `101` response has arrived. */
  static async upgrade(server: TestServer, code: string): Promise<RawSocket> {
    const { port } = new URL(server.url);
    const socket = connect(Number(port), '127.0.0.1');
    const raw = new RawSocket(socket);
    await new Promise<void>((resolve, reject) => {
      let head = '';
      const onData = (chunk: Buffer) => {
        head += chunk.toString('latin1');
        if (!head.includes('\r\n\r\n')) return;
        socket.off('data', onData);
        if (head.startsWith('HTTP/1.1 101')) resolve();
        else reject(new Error(`upgrade refused: ${head.split('\r\n')[0]}`));
      };
      socket.on('data', onData);
      socket.once('error', reject);
      socket.write(
        `GET /rooms/${code}/ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\n` +
          `Upgrade: websocket\r\nOrigin: ${ORIGIN}\r\nSec-WebSocket-Version: 13\r\n` +
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`,
      );
    });
    return raw;
  }

  /** Sends a one-byte text frame without the mask every client frame must carry. */
  sendUnmasked(): void {
    this.socket.write(Buffer.from([0x81, 0x01, 0x78]));
  }

  get closed(): boolean {
    return this.ended;
  }

  destroy(): void {
    this.socket.destroy();
  }
}

export function isOver(view: View | undefined): boolean {
  return view !== undefined && typeof view.phase === 'object' && 'game_over' in view.phase;
}

/** Joins two fresh clients to a room and waits for the game to start. */
export async function joinBoth(server: TestServer, code: string): Promise<[Client, Client]> {
  const p0 = await Client.open(wsUrl(server, code));
  p0.hello(code);
  await until(() => p0.ofType('welcome').length > 0);
  const p1 = await Client.open(wsUrl(server, code));
  p1.hello(code);
  await until(() => p0.latest() !== undefined && p1.latest() !== undefined);
  return [p0, p1];
}

/**
 * Plays seeded random legal commands until both clients see game over, or `maxSteps` commands
 * have been played; returns the number played.
 */
export async function play(
  clients: Client[],
  rng: Xorshift,
  maxSteps = Number.POSITIVE_INFINITY,
): Promise<number> {
  for (let steps = 0; steps < 20_000; steps++) {
    if (clients.every((c) => c.ofType('game_over').length > 0)) return steps;
    if (steps >= maxSteps) return steps;
    const movers = clients.filter((c) => (c.latest()?.legal.length ?? 0) > 0);
    if (movers.length === 0) throw new Error('no client has a legal command');
    const mover = rng.pick(movers);
    const before = mover.received.length;
    const eventsBefore = clients.map((c) => c.ofType('events').length);
    mover.command(rng.pick(mover.latest()!.legal));
    // Every seated client is sent events for each accepted command.
    await until(
      () =>
        mover.received.slice(before).some((m) => m.type === 'error') ||
        clients.every((c, i) => c.ofType('events').length > eventsBefore[i]!),
    );
    const error = mover.received.slice(before).find((m) => m.type === 'error');
    if (error !== undefined) throw new Error(`command refused: ${JSON.stringify(error)}`);
    if (clients.some((c) => c.latest() !== undefined && isOver(c.latest()!.view))) {
      await until(() => clients.every((c) => c.ofType('game_over').length > 0));
    }
    const round = Math.max(...clients.map((c) => c.latest()?.view.round ?? 0));
    if (round > MAX_ROUNDS) throw new Error(`game exceeded ${MAX_ROUNDS} rounds`);
  }
  throw new Error('game did not finish');
}
