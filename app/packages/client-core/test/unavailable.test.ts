import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, parseClientMessage } from '@wwd/protocol';
import { createInMemoryPair, type Transport } from '@wwd/transport';
import {
  ConnectionManager,
  GameClient,
  SERVER_UNAVAILABLE_AFTER_MS,
  type ConnectionState,
} from '../src/index.js';
import { FakeLifecycle, FakeTimers } from './fakes.js';
import { flush } from './helpers.js';

beforeAll(loadEngineForNode);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** A manager whose referee stays silent until `answer` is set, with the device online while `online` is. */
function silentReferee() {
  const timers = new FakeTimers();
  const lifecycle = new FakeLifecycle();
  const control = { answer: false, online: true };
  const client = new GameClient({ room: 'ABCDEF', now: timers.now });
  const manager = new ConnectionManager({
    client,
    lifecycle,
    timers,
    random: () => 0.5,
    isOnline: () => control.online,
    connect: (): Transport => {
      const [clientEnd, server] = createInMemoryPair();
      server.onMessage((text) => {
        const parsed = parseClientMessage(text);
        if (!control.answer || !parsed.ok) return;
        if (parsed.msg.type === 'hello') {
          server.send(
            encode({
              type: 'welcome',
              seat: 'p0',
              seat_token: 'a'.repeat(32),
              room: 'ABCDEF',
              config: defaultRulesConfig(),
              pin: '1234',
              game: 0,
            }),
          );
        } else if (parsed.msg.type === 'ping') {
          server.send(encode({ type: 'pong' }));
        }
      });
      return clientEnd;
    },
  });
  cleanups.push(() => {
    manager.stop();
    client.dispose();
  });
  let state: ConnectionState | undefined;
  cleanups.push(manager.state.subscribe((s) => (state = s)));
  return { manager, timers, lifecycle, control, state: (): ConnectionState => state! };
}

describe('server unavailable', () => {
  it('server unavailable after three minutes online', async () => {
    expect(SERVER_UNAVAILABLE_AFTER_MS).toBe(180_000);
    const h = silentReferee();
    h.manager.start();
    await flush();
    expect(h.state().serverUnavailable).toBe(false);

    await h.timers.advance(SERVER_UNAVAILABLE_AFTER_MS - 10_000);
    expect(h.state().serverUnavailable).toBe(false);
    expect(h.state().phase).not.toBe('online');

    await h.timers.advance(30_000);
    expect(h.state().serverUnavailable).toBe(true);
    expect(h.state().stopReason, 'reconnecting goes on').toBeNull();

    h.control.answer = true;
    await h.timers.advance(20_000);
    expect(h.state().phase).toBe('online');
    expect(h.state().serverUnavailable).toBe(false);
  });

  it('not unavailable while offline', async () => {
    const h = silentReferee();
    h.control.online = false;
    h.manager.start();
    await flush();
    await h.timers.advance(10 * 60_000);
    expect(h.state().serverUnavailable).toBe(false);

    // Only failures while online count, so the clock starts when the device comes back.
    h.control.online = true;
    await h.timers.advance(SERVER_UNAVAILABLE_AFTER_MS - 20_000);
    expect(h.state().serverUnavailable).toBe(false);
    await h.timers.advance(40_000);
    expect(h.state().serverUnavailable).toBe(true);

    h.control.online = false;
    await h.timers.advance(20_000);
    expect(h.state().serverUnavailable).toBe(false);
  });
});
