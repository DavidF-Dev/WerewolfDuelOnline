import { SELF, env } from 'cloudflare:test';
import { expect } from 'vitest';
import { defaultRulesConfig, type Command, type View } from '@wwd/engine';
import { PROTOCOL_VERSION, encode, parseServerMessage, type ServerMessage } from '@wwd/protocol';

export const BASE = 'https://referee.test';
export const ORIGIN = 'https://play.example.com';
export const MAX_ROUNDS = 200;
export const SEED = 'a1'.repeat(32);

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

export async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export function roomStub(code: string): DurableObjectStub {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

let creations = 0;

/** A distinct client address per call, so room creation never meets the rate limit. */
function nextAddress(): string {
  creations += 1;
  return `10.0.${creations >> 8}.${creations & 0xff}`;
}

export async function createRoom(extra: object = {}): Promise<string> {
  const res = await SELF.fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'cf-connecting-ip': nextAddress(),
    },
    body: JSON.stringify({ config: defaultRulesConfig(), grace_minutes: 10, ...extra }),
  });
  if (res.status !== 201) throw new Error(`room creation failed: ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export function upgrade(code: string): Promise<Response> {
  return SELF.fetch(`${BASE}/rooms/${code}/ws`, {
    headers: { upgrade: 'websocket', origin: ORIGIN },
  });
}

/** A WebSocket client that records every server message. */
export class Client {
  readonly received: ServerMessage[] = [];
  closeCode: number | undefined;

  private constructor(readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const parsed = parseServerMessage(String(event.data));
      if (!parsed.ok) throw new Error(`bad server message: ${String(event.data)}`);
      this.received.push(parsed.msg);
    });
    socket.addEventListener('close', (event) => {
      this.closeCode = event.code;
    });
  }

  static async open(code: string): Promise<Client> {
    const res = await upgrade(code);
    if (res.status !== 101 || res.webSocket === null) {
      throw new Error(`upgrade refused: ${res.status}`);
    }
    res.webSocket.accept();
    return new Client(res.webSocket);
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

  token(): string {
    const welcome = this.ofType('welcome')[0];
    if (welcome === undefined) throw new Error('not welcomed');
    return welcome.seat_token;
  }

  close(): void {
    if (!this.closed) this.socket.close(1000);
  }

  async closedNow(): Promise<number> {
    await until(() => this.closed);
    return this.closeCode!;
  }
}

/** Opens a socket to `code` and checks it is told the room is unknown, then closed with 1008. */
export async function expectUnknownRoom(code: string): Promise<void> {
  const c = await Client.open(code);
  try {
    expect(await c.closedNow()).toBe(1008);
    expect(c.received).toEqual([{ type: 'error', code: 'unknown_room' }]);
  } finally {
    c.close();
  }
}

export function isOver(view: View | undefined): boolean {
  return view !== undefined && typeof view.phase === 'object' && 'game_over' in view.phase;
}

/** Joins two fresh clients to a room and waits for the game to start. */
export async function joinBoth(code: string): Promise<[Client, Client]> {
  const p0 = await Client.open(code);
  p0.hello(code);
  await until(() => p0.ofType('welcome').length > 0);
  const p1 = await Client.open(code);
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
