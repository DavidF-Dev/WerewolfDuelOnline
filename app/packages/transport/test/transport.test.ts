import { afterEach, describe, expect, it } from 'vitest';
import {
  BroadcastChannelTransport,
  createInMemoryPair,
  parseEnvelope,
  type Envelope,
} from '../src/index.js';

async function flush(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

const settle = (ms = 50): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('in-memory pair', () => {
  it('stops delivering to an unsubscribed message listener', async () => {
    const [a, b] = createInMemoryPair();
    const got: string[] = [];
    const off = b.onMessage((t) => got.push(t));
    a.send('one');
    await flush();
    off();
    a.send('two');
    await flush();
    expect(got).toEqual(['one']);
  });

  it('stops notifying an unsubscribed close listener', async () => {
    const [a, b] = createInMemoryPair();
    let closed = 0;
    const off = b.onClose(() => closed++);
    off();
    a.close();
    await flush();
    expect(closed).toBe(0);
  });

  it('delivers nothing after close', async () => {
    const [a, b] = createInMemoryPair();
    const got: string[] = [];
    b.onMessage((t) => got.push(t));
    a.send('late');
    b.close();
    await flush();
    expect(got).toEqual([]);
  });

  it('ignores send after close', async () => {
    const [a, b] = createInMemoryPair();
    const got: string[] = [];
    b.onMessage((t) => got.push(t));
    a.close();
    a.send('never');
    await flush();
    expect(got).toEqual([]);
  });

  it('signals open on the next microtask, and at once to later listeners', async () => {
    const [a] = createInMemoryPair();
    const opens: string[] = [];
    a.onOpen?.((): void => void opens.push('early'));
    expect(opens).toEqual([]);
    await flush();
    a.onOpen?.((): void => void opens.push('late'));
    expect(opens).toEqual(['early', 'late']);
  });

  it('never signals open once closed', async () => {
    const [a] = createInMemoryPair();
    let opened = 0;
    a.onOpen?.(() => opened++);
    a.close();
    await flush();
    a.onOpen?.(() => opened++);
    expect(opened).toBe(0);
  });

  it('closes idempotently', async () => {
    const [a, b] = createInMemoryPair();
    let aClosed = 0;
    let bClosed = 0;
    a.onClose(() => aClosed++);
    b.onClose(() => bClosed++);
    a.close();
    a.close();
    await flush();
    b.close();
    expect([aClosed, bClosed]).toEqual([1, 1]);
  });

  it('passes a normal-closure info to close listeners on both ends', async () => {
    const [a, b] = createInMemoryPair();
    const infos: unknown[] = [];
    a.onClose((info) => infos.push(info));
    b.onClose((info) => infos.push(info));
    a.close();
    await flush();
    expect(infos).toEqual([
      { code: 1000, reason: '' },
      { code: 1000, reason: '' },
    ]);
  });
});

describe('parseEnvelope', () => {
  it('accepts well-formed envelopes', () => {
    expect(parseEnvelope({ conn: 'a', dir: 'c2s', text: 'x' })).toEqual({
      conn: 'a',
      dir: 'c2s',
      text: 'x',
    });
    expect(parseEnvelope({ conn: 'a', dir: 'close' })).toEqual({ conn: 'a', dir: 'close' });
  });

  it('rejects an empty conn', () => {
    expect(parseEnvelope({ conn: '', dir: 'c2s', text: 'x' })).toBeUndefined();
  });

  it('rejects a non-string text', () => {
    expect(parseEnvelope({ conn: 'a', dir: 'c2s', text: 5 })).toBeUndefined();
  });

  it('rejects non-objects and unknown directions', () => {
    expect(parseEnvelope('junk')).toBeUndefined();
    expect(parseEnvelope(null)).toBeUndefined();
    expect(parseEnvelope({ conn: 'a', dir: 'sideways' })).toBeUndefined();
    expect(parseEnvelope({ conn: 5, dir: 'c2s' })).toBeUndefined();
  });
});

describe('BroadcastChannelTransport', () => {
  const channelName = 'wwd-transport-test';
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  function guest(connId: string): BroadcastChannelTransport {
    const transport = new BroadcastChannelTransport(channelName, connId);
    cleanups.push(() => transport.close());
    return transport;
  }

  function raw(): BroadcastChannel {
    const channel = new BroadcastChannel(channelName);
    cleanups.push(() => channel.close());
    return channel;
  }

  it('signals open on the next microtask, and at once to later listeners', async () => {
    const g = guest('g');
    const opens: string[] = [];
    g.onOpen((): void => void opens.push('early'));
    expect(opens).toEqual([]);
    await flush();
    g.onOpen((): void => void opens.push('late'));
    expect(opens).toEqual(['early', 'late']);
  });

  it('delivers server messages for its own conn only', async () => {
    const g = guest('g');
    const got: string[] = [];
    g.onMessage((t) => got.push(t));
    const server = raw();
    server.postMessage({ conn: 'other', dir: 's2c', text: 'no' } satisfies Envelope);
    server.postMessage({ conn: 'g', dir: 's2c', text: 'yes' } satisfies Envelope);
    await settle();
    expect(got).toEqual(['yes']);
  });

  it('stops delivering to an unsubscribed listener', async () => {
    const g = guest('g');
    const got: string[] = [];
    const off = g.onMessage((t) => got.push(t));
    const server = raw();
    server.postMessage({ conn: 'g', dir: 's2c', text: 'one' } satisfies Envelope);
    await settle();
    off();
    server.postMessage({ conn: 'g', dir: 's2c', text: 'two' } satisfies Envelope);
    await settle();
    expect(got).toEqual(['one']);
  });

  it('ignores a close addressed to another conn', async () => {
    const g = guest('g');
    let closed = 0;
    g.onClose(() => closed++);
    const server = raw();
    server.postMessage({ conn: 'other', dir: 'close' } satisfies Envelope);
    await settle();
    expect(g.open).toBe(true);
    expect(closed).toBe(0);
    server.postMessage({ conn: 'g', dir: 'close' } satisfies Envelope);
    await settle();
    expect(g.open).toBe(false);
    expect(closed).toBe(1);
  });

  it('passes a normal-closure info to close listeners, locally or remotely closed', async () => {
    const local = guest('local');
    const remote = guest('remote');
    const infos: unknown[] = [];
    local.onClose((info) => infos.push(info));
    remote.onClose((info) => infos.push(info));
    local.close();
    raw().postMessage({ conn: 'remote', dir: 'close' } satisfies Envelope);
    await settle();
    expect(infos).toEqual([
      { code: 1000, reason: '' },
      { code: 1000, reason: '' },
    ]);
  });

  it('stops notifying an unsubscribed close listener', async () => {
    const g = guest('g');
    let closed = 0;
    const off = g.onClose(() => closed++);
    off();
    g.close();
    expect(closed).toBe(0);
  });

  it('delivers nothing and sends nothing after close', async () => {
    const g = guest('g');
    const got: string[] = [];
    g.onMessage((t) => got.push(t));
    const server = raw();
    const seen: Envelope[] = [];
    server.onmessage = (event: MessageEvent) => {
      const envelope = parseEnvelope(event.data);
      if (envelope !== undefined) seen.push(envelope);
    };
    g.close();
    server.postMessage({ conn: 'g', dir: 's2c', text: 'late' } satisfies Envelope);
    g.send('ignored');
    await settle();
    expect(got).toEqual([]);
    expect(seen.map((e) => e.dir)).toEqual(['close']);
  });

  it('closes idempotently', async () => {
    const g = guest('g');
    let closed = 0;
    g.onClose(() => closed++);
    const server = raw();
    const seen: Envelope[] = [];
    server.onmessage = (event: MessageEvent) => {
      const envelope = parseEnvelope(event.data);
      if (envelope !== undefined) seen.push(envelope);
    };
    g.close();
    g.close();
    await settle();
    expect(closed).toBe(1);
    expect(seen.filter((e) => e.dir === 'close')).toHaveLength(1);
  });
});
