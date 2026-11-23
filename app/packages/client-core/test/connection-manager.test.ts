import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  encode,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@wwd/protocol';
import { MemoryReferee } from '@wwd/referee-memory';
import { LIMITS } from '@wwd/referee-service';
import { createInMemoryPair, type Transport } from '@wwd/transport';
import {
  CONNECT_TIMEOUT_MS,
  ConnectionManager,
  GameClient,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  TIMER_JUMP_MS,
  type ConnectionState,
  type Lifecycle,
  type Readable,
} from '../src/index.js';
import { Xorshift, flush, playOut, step } from './helpers.js';

beforeAll(loadEngineForNode);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** Deterministic timers: nothing fires until the test moves the clock. */
class FakeTimers {
  time = 1_000_000;
  private nextId = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();

  readonly now = (): number => this.time;

  readonly setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++;
    this.pending.set(id, { at: this.time + ms, fn });
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };

  get count(): number {
    return this.pending.size;
  }

  /** Moves the clock forward, firing each timer at its due time. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      const due = this.earliest(end);
      if (due === undefined) break;
      this.time = due[1].at;
      this.pending.delete(due[0]);
      due[1].fn();
      await flush();
    }
    this.time = end;
    await flush();
  }

  /** Moves the clock forward with nothing firing, as on a suspended device, then fires what is overdue. */
  async sleep(ms: number): Promise<void> {
    this.time += ms;
    for (;;) {
      const due = this.earliest(this.time);
      if (due === undefined) break;
      this.pending.delete(due[0]);
      due[1].fn();
      await flush();
    }
    await flush();
  }

  private earliest(limit: number): [number, { at: number; fn: () => void }] | undefined {
    let best: [number, { at: number; fn: () => void }] | undefined;
    for (const entry of this.pending) {
      if (entry[1].at > limit) continue;
      if (best === undefined || entry[1].at < best[1].at) best = entry;
    }
    return best;
  }
}

class FakeLifecycle implements Lifecycle {
  private readonly visibility = new Set<(visible: boolean) => void>();
  private readonly pageShows = new Set<(persisted: boolean) => void>();
  private readonly onlines = new Set<() => void>();

  constructor(public visible = true) {}

  isVisible(): boolean {
    return this.visible;
  }

  onVisibilityChange(cb: (visible: boolean) => void): () => void {
    this.visibility.add(cb);
    return () => this.visibility.delete(cb);
  }

  onPageShow(cb: (persisted: boolean) => void): () => void {
    this.pageShows.add(cb);
    return () => this.pageShows.delete(cb);
  }

  onOnline(cb: () => void): () => void {
    this.onlines.add(cb);
    return () => this.onlines.delete(cb);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const cb of [...this.visibility]) cb(visible);
  }

  pageShow(persisted: boolean): void {
    for (const cb of [...this.pageShows]) cb(persisted);
  }

  goOnline(): void {
    for (const cb of [...this.onlines]) cb();
  }

  get listeners(): number {
    return this.visibility.size + this.pageShows.size + this.onlines.size;
  }
}

/** Wraps a transport so that it opens only when the test says so, holding sends until then. */
class ManualOpen implements Transport {
  private opened = false;
  private readonly queue: string[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly inner: Transport) {}

  get open(): boolean {
    return this.inner.open;
  }

  send(text: string): void {
    if (this.opened) this.inner.send(text);
    else if (this.inner.open) this.queue.push(text);
  }

  onMessage(cb: (text: string) => void): () => void {
    return this.inner.onMessage(cb);
  }

  onClose(cb: () => void): () => void {
    return this.inner.onClose(cb);
  }

  onOpen(cb: () => void): () => void {
    if (this.opened) {
      cb();
      return () => {};
    }
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.inner.close();
  }

  openNow(): void {
    if (this.opened || !this.inner.open) return;
    this.opened = true;
    for (const text of this.queue.splice(0)) this.inner.send(text);
    for (const cb of [...this.listeners]) cb();
  }
}

/** One transport handed out by `connect`, with the server end and everything the client sent. */
interface Link {
  client: Transport;
  server: Transport;
  sent: ClientMessage[];
  /** Opens a transport made with `manualOpen`. */
  openNow?: () => void;
  events: Array<Extract<ServerMessage, { type: 'events' }>>;
}

function read<T>(store: Readable<T>): T {
  let value: T | undefined;
  store.subscribe((v) => (value = v))();
  return value as T;
}

function newReferee(seed: number): MemoryReferee {
  let time = 0;
  const referee = new MemoryReferee({
    clock: { now: () => (time += 1000) },
    random: new Xorshift(seed).asRandom(),
  });
  cleanups.push(() => referee.close());
  return referee;
}

function join(referee: MemoryReferee, room: string): GameClient {
  const client = new GameClient({ room });
  const [clientEnd, serverEnd] = createInMemoryPair();
  referee.accept(serverEnd);
  client.attach(clientEnd);
  cleanups.push(() => client.dispose());
  return client;
}

/**
 * A `GameClient` driven by a `ConnectionManager` with fake timers and lifecycle.
 * `serve` decides what stands behind each new connection.
 */
function managed(opts: {
  room?: string;
  serve: (server: Transport, index: number) => void;
  random?: () => number;
  visible?: boolean;
  /** Which connections open only when their link's `openNow` is called. */
  manualOpen?: (index: number) => boolean;
}) {
  const timers = new FakeTimers();
  const lifecycle = new FakeLifecycle(opts.visible ?? true);
  const links: Link[] = [];
  let overlaps = 0;
  const client = new GameClient({ room: opts.room ?? 'ABCDEF', now: timers.now });
  const manager = new ConnectionManager({
    client,
    lifecycle,
    timers,
    random: opts.random ?? (() => 0.5),
    connect: () => {
      if (links.some((link) => link.client.open)) overlaps++;
      const [clientEnd, server] = createInMemoryPair();
      const manual =
        opts.manualOpen?.(links.length) === true ? new ManualOpen(clientEnd) : undefined;
      const link: Link = { client: manual ?? clientEnd, server, sent: [], events: [] };
      if (manual !== undefined) link.openNow = () => manual.openNow();
      server.onMessage((text) => {
        const parsed = parseClientMessage(text);
        if (parsed.ok) link.sent.push(parsed.msg);
      });
      clientEnd.onMessage((text) => {
        const parsed = parseServerMessage(text);
        if (parsed.ok && parsed.msg.type === 'events') link.events.push(parsed.msg);
      });
      links.push(link);
      opts.serve(server, links.length - 1);
      return link.client;
    },
  });
  cleanups.push(() => {
    manager.stop();
    client.dispose();
  });
  return {
    client,
    manager,
    timers,
    lifecycle,
    links,
    overlaps: () => overlaps,
    state: (): ConnectionState => read(manager.state),
    pings: () => links.reduce((n, l) => n + l.sent.filter((m) => m.type === 'ping').length, 0),
  };
}

/** A hand-driven server that answers hello with welcome and every ping with pong. */
function answering(server: Transport): void {
  answeringWhile(server, () => true);
}

function answeringWhile(server: Transport, enabled: () => boolean): void {
  server.onMessage((text) => {
    if (!enabled()) return;
    const parsed = parseClientMessage(text);
    if (!parsed.ok) return;
    if (parsed.msg.type === 'hello') {
      server.send(
        encode({
          type: 'welcome',
          seat: 'p0',
          seat_token: 'a'.repeat(32),
          room: 'ABCDEF',
          config: defaultRulesConfig(),
          pin: '1234',
        }),
      );
      server.send(encode({ type: 'waiting' }));
    } else if (parsed.msg.type === 'ping') {
      server.send(encode({ type: 'pong' }));
    }
  });
}

describe('ConnectionManager', () => {
  it('keeps the ping interval well inside the server idle timeout', () => {
    expect(PING_INTERVAL_MS * 2).toBeLessThan(LIMITS.IDLE_TIMEOUT_MS);
    expect(PONG_TIMEOUT_MS).toBeLessThan(PING_INTERVAL_MS);
    expect(TIMER_JUMP_MS).toBeLessThan(PING_INTERVAL_MS);
  });

  it('lifecycle reconnects without duplicates', async () => {
    const referee = newReferee(1);
    const room = referee.createRoom(defaultRulesConfig());
    const rng = new Xorshift(21);
    const h = managed({ room, serve: (s) => referee.accept(s) });
    h.manager.start();
    const p1 = join(referee, room);
    await flush();
    expect(h.state().phase).toBe('online');
    for (let i = 0; i < 6 || p1.current.legal.length === 0; i++) {
      expect(await step([h.client, p1], rng)).toBe(true);
    }

    const seenBefore = h.client.current.lastSeq;
    const token = h.client.current.seatToken;
    expect(seenBefore).toBeGreaterThan(0);

    h.lifecycle.setVisible(false);
    await flush();
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.state().phase).toBe('hidden');
    expect(await step([p1], rng)).toBe(true);
    expect(p1.current.lastSeq).toBeGreaterThan(seenBefore);

    // A restored page can report visible, pageshow and online all at once.
    h.lifecycle.setVisible(true);
    h.lifecycle.pageShow(true);
    h.lifecycle.goOnline();
    await flush();
    expect(h.links).toHaveLength(2);
    expect(h.overlaps()).toBe(0);
    expect(h.state().phase).toBe('online');

    const hello = h.links[1]?.sent[0];
    expect(hello).toMatchObject({ type: 'hello', seat_token: token, last_seq: seenBefore });
    const resent = h.links[1]?.events ?? [];
    expect(resent.length).toBeGreaterThan(0);
    // `lastSeq` is one past the highest event seen, so only strictly newer events may come back.
    const highestSeen = seenBefore - 1;
    for (const msg of resent) {
      expect(msg.from_seq).toBe(seenBefore);
      for (const [seq] of msg.events) expect(seq).toBeGreaterThan(highestSeen);
    }
    const seqs = h.client.current.events.map(([seq]) => seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(h.client.current.lastSeq).toBe(p1.current.lastSeq);

    await playOut([h.client, p1], rng);
    expect(h.client.current.replayVerified).toBe(true);
    expect(h.overlaps()).toBe(0);
  });

  it('hidden closes and stops pings', async () => {
    const h = managed({ serve: answering });
    h.manager.start();
    await flush();
    await h.timers.advance(PING_INTERVAL_MS);
    expect(h.pings()).toBe(2);

    h.lifecycle.setVisible(false);
    await flush();
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.client.current.status).toBe('disconnected');
    expect(h.state()).toEqual({ phase: 'hidden', attempt: 0, nextRetryAt: null, stopReason: null });
    expect(h.timers.count).toBe(0);
    await h.timers.advance(10 * 60_000);
    expect(h.links).toHaveLength(1);
    expect(h.pings()).toBe(2);
  });

  it('starts hidden without connecting', async () => {
    const h = managed({ serve: answering, visible: false });
    h.manager.start();
    await h.timers.advance(5 * 60_000);
    expect(h.links).toHaveLength(0);
    expect(h.state().phase).toBe('hidden');
    h.lifecycle.setVisible(true);
    await flush();
    expect(h.links).toHaveLength(1);
    expect(h.state().phase).toBe('online');
  });

  it('pings every interval while visible', async () => {
    const h = managed({ serve: answering });
    h.manager.start();
    await flush();
    expect(h.pings()).toBe(1);
    await h.timers.advance(PING_INTERVAL_MS - 1);
    expect(h.pings()).toBe(1);
    await h.timers.advance(1);
    expect(h.pings()).toBe(2);
    await h.timers.advance(2 * PING_INTERVAL_MS);
    expect(h.pings()).toBe(4);
    expect(h.links).toHaveLength(1);
  });

  it('pong timeout reconnects', async () => {
    // The first connection swallows everything; later ones answer.
    const h = managed({ serve: (s, i) => (i === 0 ? undefined : answering(s)) });
    h.manager.start();
    await flush();
    expect(h.links[0]?.sent.map((m) => m.type)).toEqual(['hello', 'ping']);
    await h.timers.advance(PONG_TIMEOUT_MS - 1);
    expect(h.links[0]?.client.open).toBe(true);
    await h.timers.advance(1);
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.state()).toMatchObject({ phase: 'offline', attempt: 1 });
    await h.timers.advance(1000);
    expect(h.links).toHaveLength(2);
    expect(h.state()).toEqual({ phase: 'online', attempt: 0, nextRetryAt: null, stopReason: null });
    expect(h.overlaps()).toBe(0);
  });

  it('a slow open still connects', async () => {
    const h = managed({ serve: answering, manualOpen: () => true });
    h.manager.start();
    await h.timers.advance(5000);
    expect(h.state().phase).toBe('connecting');
    expect(h.links[0]?.sent).toEqual([]);
    h.links[0]?.openNow?.();
    await flush();
    expect(h.links[0]?.sent.map((m) => m.type)).toEqual(['hello', 'ping']);
    expect(h.state()).toEqual({ phase: 'online', attempt: 0, nextRetryAt: null, stopReason: null });
    await h.timers.advance(CONNECT_TIMEOUT_MS);
    expect(h.links).toHaveLength(1);
    expect(h.links[0]?.client.open).toBe(true);
  });

  it('no open within the connect timeout retries', async () => {
    const h = managed({ serve: answering, manualOpen: (i) => i === 0 });
    h.manager.start();
    await h.timers.advance(CONNECT_TIMEOUT_MS - 1);
    expect(h.links[0]?.client.open).toBe(true);
    await h.timers.advance(1);
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.state()).toMatchObject({ phase: 'offline', attempt: 1 });
    h.links[0]?.openNow?.();
    await h.timers.advance(1000);
    expect(h.links).toHaveLength(2);
    expect(h.state().phase).toBe('online');
    expect(h.overlaps()).toBe(0);
  });

  it('the resume pong deadline starts at open', async () => {
    const h = managed({ serve: () => undefined, manualOpen: () => true });
    h.manager.start();
    await h.timers.advance(5000);
    h.links[0]?.openNow?.();
    await flush();
    expect(h.links[0]?.sent.map((m) => m.type)).toEqual(['hello', 'ping']);
    await h.timers.advance(PONG_TIMEOUT_MS - 1);
    expect(h.links[0]?.client.open).toBe(true);
    await h.timers.advance(1);
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.state()).toMatchObject({ phase: 'offline', attempt: 1 });
  });

  it('reconnects when a periodic ping goes unanswered until the next one', async () => {
    let answer = true;
    const h = managed({
      serve: (s, i) => {
        answeringWhile(s, () => i > 0 || answer);
      },
    });
    h.manager.start();
    await flush();
    answer = false;
    await h.timers.advance(PING_INTERVAL_MS);
    expect(h.links[0]?.client.open).toBe(true);
    await h.timers.advance(PING_INTERVAL_MS);
    expect(h.links[0]?.client.open).toBe(false);
    await h.timers.advance(1000);
    expect(h.links).toHaveLength(2);
    expect(h.state().phase).toBe('online');
  });

  it('timer jump reconnects', async () => {
    const h = managed({ serve: answering });
    h.manager.start();
    await flush();

    // A late fire within the tolerance is an ordinary ping.
    await h.timers.sleep(PING_INTERVAL_MS + TIMER_JUMP_MS);
    expect(h.links).toHaveLength(1);
    expect(h.pings()).toBe(2);

    await h.timers.sleep(PING_INTERVAL_MS + TIMER_JUMP_MS + 1);
    expect(h.links).toHaveLength(2);
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.links[0]?.sent.filter((m) => m.type === 'ping')).toHaveLength(2);
    expect(h.links[1]?.sent[0]).toMatchObject({ type: 'hello', seat_token: 'a'.repeat(32) });
    expect(h.state().phase).toBe('online');
    expect(h.overlaps()).toBe(0);
  });

  it('backoff sequence with jitter bounds', async () => {
    const base = [500, 1000, 2000, 4000, 8000, 15_000, 15_000];
    const delays = async (random: () => number): Promise<number[]> => {
      const h = managed({ serve: (s) => s.close(), random });
      h.manager.start();
      await flush();
      const seen: number[] = [];
      for (let i = 0; i < base.length; i++) {
        const state = h.state();
        expect(state.phase).toBe('offline');
        expect(state.attempt).toBe(i + 1);
        if (state.nextRetryAt === null) throw new Error('no retry scheduled');
        const delay = state.nextRetryAt - h.timers.now();
        seen.push(delay);
        await h.timers.advance(delay - 1);
        expect(h.links).toHaveLength(i + 1);
        await h.timers.advance(1);
        expect(h.links).toHaveLength(i + 2);
      }
      expect(h.overlaps()).toBe(0);
      return seen;
    };
    expect(await delays(() => 0.5)).toEqual(base);
    expect(await delays(() => 0)).toEqual(base.map((ms) => ms * 0.8));
    const high = await delays(() => 0.999_999);
    high.forEach((ms, i) => {
      expect(ms).toBeLessThanOrEqual((base[i] ?? 0) * 1.2);
      expect(ms).toBeGreaterThan((base[i] ?? 0) * 1.19);
    });
  });

  it('keeps backing off from a server that welcomes and then closes', async () => {
    const h = managed({
      serve: (s) =>
        s.onMessage((text) => {
          const parsed = parseClientMessage(text);
          if (!parsed.ok || parsed.msg.type !== 'hello') return;
          s.send(
            encode({
              type: 'welcome',
              seat: 'p0',
              seat_token: 'a'.repeat(32),
              room: 'ABCDEF',
              config: defaultRulesConfig(),
              pin: '1234',
            }),
          );
          s.send(encode({ type: 'waiting' }));
          s.close();
        }),
    });
    h.manager.start();
    await flush();
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      const { nextRetryAt, attempt } = h.state();
      expect(attempt).toBe(i + 1);
      if (nextRetryAt === null) throw new Error('no retry scheduled');
      seen.push(nextRetryAt - h.timers.now());
      await h.timers.advance(nextRetryAt - h.timers.now());
    }
    expect(seen).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 15_000]);
  });

  it('start after stop clears the stop reason and joins afresh', async () => {
    const h = managed({ serve: (s, i) => (i === 0 ? undefined : answering(s)) });
    h.manager.start();
    await flush();
    h.links[0]?.server.send(encode({ type: 'error', code: 'unknown_seat' }));
    h.links[0]?.server.close();
    await flush();
    expect(h.state().stopReason).toBe('unknown_seat');
    expect(h.client.current.status).toBe('rejected');

    h.manager.stop();
    h.manager.start();
    await flush();
    expect(h.links).toHaveLength(2);
    expect(h.links[1]?.sent[0]).toMatchObject({ type: 'hello' });
    expect(h.links[1]?.sent[0]).not.toHaveProperty('seat_token');
    expect(h.state()).toEqual({ phase: 'online', attempt: 0, nextRetryAt: null, stopReason: null });
  });

  it('online reconnects at once while waiting to retry', async () => {
    const h = managed({ serve: (s, i) => (i === 0 ? s.close() : answering(s)) });
    h.manager.start();
    await flush();
    expect(h.state().phase).toBe('offline');
    h.lifecycle.goOnline();
    await flush();
    expect(h.links).toHaveLength(2);
    expect(h.state()).toEqual({ phase: 'online', attempt: 0, nextRetryAt: null, stopReason: null });
    await h.timers.advance(5000);
    expect(h.links).toHaveLength(2);
  });

  it('pageshow persisted reconnects', async () => {
    const h = managed({ serve: answering });
    h.manager.start();
    await flush();
    h.lifecycle.pageShow(false);
    await flush();
    expect(h.links).toHaveLength(1);

    h.lifecycle.pageShow(true);
    await flush();
    expect(h.links).toHaveLength(2);
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.links[1]?.sent[0]).toMatchObject({ type: 'hello', seat_token: 'a'.repeat(32) });
    expect(h.state().phase).toBe('online');
    expect(h.overlaps()).toBe(0);
  });

  it('stops after game over', async () => {
    const referee = newReferee(2);
    const room = referee.createRoom(defaultRulesConfig());
    const rng = new Xorshift(5);
    const h = managed({ room, serve: (s) => referee.accept(s) });
    h.manager.start();
    const p1 = join(referee, room);
    await flush();
    await playOut([h.client, p1], rng);
    expect(h.state().stopReason).toBe('game_over');

    h.links[0]?.server.close();
    await flush();
    await h.timers.advance(10 * 60_000);
    h.lifecycle.setVisible(false);
    h.lifecycle.setVisible(true);
    h.lifecycle.pageShow(true);
    h.lifecycle.goOnline();
    await h.timers.advance(60_000);
    expect(h.links).toHaveLength(1);
    expect(h.state()).toEqual({
      phase: 'offline',
      attempt: 0,
      nextRetryAt: null,
      stopReason: 'game_over',
    });
  });

  it.each<ErrorCode>([
    'unknown_seat',
    'room_full',
    'unknown_room',
    'rejoin_declined',
    'superseded',
  ])('stops after a closing %s error', async (code) => {
    const h = managed({ serve: () => undefined });
    h.manager.start();
    await flush();
    const server = h.links[0]?.server;
    server?.send(encode({ type: 'error', code }));
    server?.close();
    await flush();
    await h.timers.advance(10 * 60_000);
    h.lifecycle.goOnline();
    h.lifecycle.pageShow(true);
    await flush();
    expect(h.links).toHaveLength(1);
    expect(h.state()).toEqual({
      phase: 'offline',
      attempt: 0,
      nextRetryAt: null,
      stopReason: code,
    });
  });

  it('retries after a close preceded by an ordinary error', async () => {
    const h = managed({ serve: (s, i) => (i === 0 ? undefined : answering(s)) });
    h.manager.start();
    await flush();
    const server = h.links[0]?.server;
    server?.send(encode({ type: 'error', code: 'rate_limited' }));
    server?.close();
    await flush();
    expect(h.state()).toMatchObject({ phase: 'offline', attempt: 1, stopReason: null });
    await h.timers.advance(1000);
    expect(h.links).toHaveLength(2);
    expect(h.state().phase).toBe('online');
  });

  it('stop closes the connection and releases every listener and timer', async () => {
    const h = managed({ serve: answering });
    h.manager.start();
    await flush();
    h.manager.stop();
    await flush();
    expect(h.links[0]?.client.open).toBe(false);
    expect(h.lifecycle.listeners).toBe(0);
    expect(h.timers.count).toBe(0);
    expect(h.state().phase).toBe('offline');
    h.lifecycle.goOnline();
    await h.timers.advance(60_000);
    expect(h.links).toHaveLength(1);
  });
});
