import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig, type View } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { PROTOCOL_VERSION, encode, parseServerMessage, type ServerMessage } from '@wwd/protocol';
import { BroadcastChannelTransport, createInMemoryPair, type Transport } from '@wwd/transport';
import type { Random } from '@wwd/referee-core';
import { BroadcastChannelHost, MemoryReferee } from '../src/index.js';

beforeAll(loadEngineForNode);

type Events = Extract<ServerMessage, { type: 'events' }>;

/** Awaits enough microtask turns for chained in-memory deliveries to settle. */
async function flush(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

async function until(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

class TestClient {
  readonly received: ServerMessage[] = [];
  closed = false;

  constructor(readonly transport: Transport) {
    transport.onMessage((text) => {
      const parsed = parseServerMessage(text);
      if (!parsed.ok) throw new Error(`bad server message: ${text}`);
      this.received.push(parsed.msg);
    });
    transport.onClose(() => {
      this.closed = true;
    });
  }

  hello(room: string, seatToken?: string): void {
    this.transport.send(
      encode({
        type: 'hello',
        protocol_version: PROTOCOL_VERSION,
        room,
        ...(seatToken === undefined ? {} : { seat_token: seatToken }),
      }),
    );
  }

  ofType<T extends ServerMessage['type']>(type: T): Array<Extract<ServerMessage, { type: T }>> {
    return this.received.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  latest(): Events | undefined {
    return this.ofType('events').at(-1);
  }
}

function isOver(view: View): boolean {
  return typeof view.phase === 'object' && 'game_over' in view.phase;
}

/** A deterministic xorshift generator so games are reproducible. */
// The always-first-legal-command policy only terminates for some seeds.
const SEED = 1;

function seededRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  return {
    bytes(n: number): Uint8Array {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        out[i] = state & 0xff;
      }
      return out;
    },
  };
}

let referee: MemoryReferee | undefined;
const cleanups: Array<() => void> = [];

function newReferee(): MemoryReferee {
  // An advancing clock keeps long games clear of the per-connection rate limit.
  let time = 0;
  referee = new MemoryReferee({ clock: { now: () => (time += 1000) }, random: seededRandom(SEED) });
  return referee;
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  referee?.close();
  referee = undefined;
});

function connect(ref: MemoryReferee): TestClient {
  const [clientEnd, serverEnd] = createInMemoryPair();
  ref.accept(serverEnd);
  return new TestClient(clientEnd);
}

describe('in-memory transport', () => {
  it('delivers asynchronously and propagates close', async () => {
    const [a, b] = createInMemoryPair();
    const got: string[] = [];
    let bClosed = false;
    b.onMessage((t) => got.push(t));
    b.onClose(() => {
      bClosed = true;
    });
    a.send('x');
    expect(got).toEqual([]);
    await flush();
    expect(got).toEqual(['x']);
    a.close();
    expect(a.open).toBe(false);
    await flush();
    expect(bClosed).toBe(true);
    expect(b.open).toBe(false);
  });
});

describe('MemoryReferee', () => {
  it('two in-memory clients play a full game', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const p0 = connect(ref);
    const p1 = connect(ref);
    p0.hello(code);
    await flush();
    p1.hello(code);
    await flush();
    expect(p0.ofType('welcome')[0]?.seat).toBe('p0');
    expect(p1.ofType('welcome')[0]?.seat).toBe('p1');

    let steps = 0;
    for (; steps < 5000; steps++) {
      const states = [p0, p1].map((c) => c.latest());
      if (states.some((s) => s !== undefined && isOver(s.view))) break;
      const mover = [p0, p1].find((c) => (c.latest()?.legal.length ?? 0) > 0);
      const cmd = mover?.latest()?.legal[0];
      if (mover === undefined || cmd === undefined) throw new Error('no legal command');
      const before = mover.received.length;
      mover.transport.send(encode({ type: 'command', cmd }));
      await flush();
      const errors = mover.received.slice(before).filter((m) => m.type === 'error');
      expect(errors).toEqual([]);
    }
    expect(steps).toBeLessThan(5000);
    await flush();
    expect(p0.ofType('game_over')).toHaveLength(1);
    expect(p1.ofType('game_over')).toHaveLength(1);
  });

  it('rejects a connection that has not named a known room', async () => {
    const ref = newReferee();
    const client = connect(ref);
    client.transport.send(encode({ type: 'ping' }));
    client.transport.send('not json');
    await flush();
    expect(client.closed).toBe(false);
    client.hello('ZZZZZZ');
    await flush();
    expect(client.received.map((m) => m.type === 'error' && m.code)).toEqual([
      'not_joined',
      'invalid_message',
      'unknown_room',
    ]);
    expect(client.closed).toBe(true);
  });

  it('closes a connection after a closing error', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const wrongVersion = connect(ref);
    wrongVersion.transport.send(
      encode({ type: 'hello', protocol_version: PROTOCOL_VERSION + 1, room: code }),
    );
    const p0 = connect(ref);
    const p1 = connect(ref);
    p0.hello(code);
    p1.hello(code);
    await flush();
    const third = connect(ref);
    third.hello(code);
    await flush();
    expect(wrongVersion.received).toEqual([{ type: 'error', code: 'protocol_version' }]);
    expect(wrongVersion.closed).toBe(true);
    expect(third.received).toEqual([{ type: 'error', code: 'room_full' }]);
    expect(third.closed).toBe(true);
    expect(p0.closed || p1.closed).toBe(false);
  });

  it('closes a superseded connection, which cannot reclaim its seat', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const p0 = connect(ref);
    const p1 = connect(ref);
    p0.hello(code);
    p1.hello(code);
    await flush();
    const token = p0.ofType('welcome')[0]!.seat_token;
    const statusesBefore = p1.ofType('opponent_status').length;

    const replacement = connect(ref);
    replacement.hello(code, token);
    await flush();
    expect(p0.received.at(-1)).toEqual({ type: 'error', code: 'superseded' });
    expect(p0.closed).toBe(true);
    expect(p0.transport.open).toBe(false);
    expect(replacement.ofType('welcome')[0]?.seat).toBe('p0');

    const seen = p0.received.length;
    p0.hello(code, token);
    await flush();
    expect(p0.received).toHaveLength(seen);
    expect(replacement.closed).toBe(false);
    const statuses = p1.ofType('opponent_status').slice(statusesBefore);
    expect(statuses.every((s) => s.connected)).toBe(true);

    const mover = [replacement, p1].find((c) => (c.latest()?.legal.length ?? 0) > 0)!;
    const before = mover.received.length;
    mover.transport.send(encode({ type: 'command', cmd: mover.latest()!.legal[0]! }));
    await flush();
    expect(mover.received.slice(before).map((m) => m.type)).toContain('events');
  });

  it('routes a rejoin sent as the first message', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const p0 = connect(ref);
    const p1 = connect(ref);
    p0.hello(code);
    p1.hello(code);
    await flush();
    const pin = p0.ofType('welcome')[0]!.pin;

    const other = connect(ref);
    other.transport.send(
      encode({ type: 'rejoin', protocol_version: PROTOCOL_VERSION, room: code, seat: 'p0', pin }),
    );
    await flush();
    expect(other.ofType('welcome')[0]?.seat).toBe('p0');
    expect(other.ofType('events')).toHaveLength(1);
    expect(p0.received.at(-1)).toEqual({ type: 'error', code: 'superseded' });
    expect(p0.closed).toBe(true);
  });

  it('closes every connection on close', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const client = connect(ref);
    client.hello(code);
    await flush();
    ref.close();
    await flush();
    expect(client.closed).toBe(true);
  });

  it('reports a disconnect to the opponent', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const p0 = connect(ref);
    const p1 = connect(ref);
    p0.hello(code);
    p1.hello(code);
    await flush();
    p1.transport.close();
    await flush();
    expect(p0.ofType('opponent_status').at(-1)?.connected).toBe(false);
  });
});

describe('BroadcastChannel transport', () => {
  const channelName = 'wwd-test';

  function host(ref: MemoryReferee): BroadcastChannelHost {
    const h = new BroadcastChannelHost(ref, channelName);
    cleanups.push(() => h.close());
    return h;
  }

  function guest(connId?: string): TestClient {
    const t = new BroadcastChannelTransport(channelName, connId);
    cleanups.push(() => t.close());
    return new TestClient(t);
  }

  it('broadcast guest joins host room', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    host(ref);
    const g = guest();
    g.hello(code);
    await until(() => g.ofType('welcome').length > 0);
    expect(g.ofType('welcome')[0]?.seat).toBe('p0');
  });

  it('guest only receives its own messages', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    host(ref);
    const a = guest('a');
    const b = guest('b');
    const c = guest('c');
    a.hello(code);
    await until(() => a.ofType('welcome').length > 0);
    b.hello(code);
    await until(() => b.ofType('welcome').length > 0);
    c.hello(code);
    await until(() => c.ofType('error').length > 0);
    expect(c.ofType('error')[0]?.code).toBe('room_full');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(c.received.map((m) => m.type)).toEqual(['error']);
    expect(a.ofType('events').length).toBeGreaterThan(0);
    expect(b.ofType('events').length).toBeGreaterThan(0);
  });

  it('host ignores malformed envelopes and guests ignore foreign ones', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    host(ref);
    const g = guest('g');
    const raw = new BroadcastChannel(channelName);
    cleanups.push(() => raw.close());
    raw.postMessage('junk');
    raw.postMessage({ conn: 5, dir: 'c2s', text: 'x' });
    raw.postMessage({ conn: 'x', dir: 'sideways' });
    raw.postMessage({ conn: 'g', dir: 'c2s', text: 5 });
    raw.postMessage({ conn: 'other', dir: 's2c', text: '{}' });
    g.hello(code);
    await until(() => g.ofType('welcome').length > 0);
    expect(g.received.map((m) => m.type)).toEqual(['welcome', 'waiting']);
  });

  it('referee close notifies broadcast guests', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    host(ref);
    const g = guest();
    g.hello(code);
    await until(() => g.ofType('welcome').length > 0);
    ref.close();
    await until(() => g.closed);
    expect(g.transport.open).toBe(false);
  });

  it('host close notifies guests', async () => {
    const ref = newReferee();
    const code = ref.createRoom(defaultRulesConfig());
    const h = host(ref);
    const g = guest();
    g.hello(code);
    await until(() => g.ofType('welcome').length > 0);
    h.close();
    await until(() => g.closed);
    expect(g.transport.open).toBe(false);
  });
});
