import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, type ServerMessage } from '@wwd/protocol';
import { MemoryReferee } from '@wwd/referee-memory';
import { createInMemoryPair, type Transport } from '@wwd/transport';
import { GameClient } from '../src/index.js';
import {
  Xorshift,
  finishedGame,
  flush,
  joinReferee,
  playOut,
  playUntil,
  testReferee,
} from './helpers.js';

beforeAll(loadEngineForNode);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

const TOKEN = 'a'.repeat(32);
const send = (server: Transport, msg: ServerMessage): void => server.send(encode(msg));

function welcome(game: number): ServerMessage {
  return {
    type: 'welcome',
    seat: 'p0',
    seat_token: TOKEN,
    room: 'ABCDEF',
    config: defaultRulesConfig(),
    pin: '1234',
    game,
  };
}

async function finishedRoom(): Promise<{ referee: MemoryReferee; clients: GameClient[] }> {
  const referee = testReferee(4, cleanups);
  const room = referee.createRoom(defaultRulesConfig());
  const p0 = joinReferee(referee, room, cleanups);
  await flush();
  const p1 = joinReferee(referee, room, cleanups);
  await flush();
  await playOut([p0, p1], new Xorshift(13));
  return { referee, clients: [p0, p1] };
}

describe('rematch', () => {
  it('game change resets the log', async () => {
    const { clients } = await finishedRoom();
    const [p0, p1] = clients as [GameClient, GameClient];
    expect(p0.current.game).toBe(0);
    const firstLog = p0.current.events;

    p0.requestRematch();
    await flush();
    expect(p1.current.rematchReady).toEqual(['p0']);
    expect(p0.current.rematchReady).toEqual(['p0']);
    expect(p1.current.status).toBe('game_over');

    p1.requestRematch();
    await flush();
    for (const client of clients) {
      expect(client.current.game).toBe(1);
      expect(client.current.status).toBe('playing');
      expect(client.current.rematchReady).toEqual([]);
      expect(client.current.replay).toBeNull();
      expect(client.current.replayVerified).toBeNull();
      expect(client.current.events[0]?.[0]).toBe(0);
      expect('game_started' in (client.current.events[0]?.[1].kind ?? {})).toBe(true);
      expect(client.current.lastError).toBeNull();
    }
    expect(p0.current.events).not.toEqual(firstLog);

    await playOut(clients, new Xorshift(14));
    for (const client of clients) {
      expect(client.current.game).toBe(1);
      expect(client.current.replayVerified).toBe(true);
    }
  });

  it('a reload in a paused and resumed rematch game still verifies its replay', async () => {
    const { referee, clients } = await finishedRoom();
    const [p0, p1] = clients as [GameClient, GameClient];
    p0.requestRematch();
    p1.requestRematch();
    await flush();
    expect(p0.current.game).toBe(1);
    const rng = new Xorshift(21);

    p0.requestPause();
    await flush();
    p1.acceptPause();
    await flush();
    await playUntil(clients, rng, () => clients.every((c) => c.current.pause.paused));
    p0.requestResume();
    p1.requestResume();
    await flush();
    expect(p1.current.pause.paused).toBe(false);

    const token = p1.current.seatToken!;
    const room = p1.current.room;
    p1.dispose();
    const reloaded = new GameClient({ room, seatToken: token });
    const [clientEnd, serverEnd] = createInMemoryPair();
    referee.accept(serverEnd);
    reloaded.attach(clientEnd);
    cleanups.push(() => reloaded.dispose());
    await flush();
    expect('segment_started' in (reloaded.current.events[0]?.[1].kind ?? {})).toBe(true);

    await playOut([p0, reloaded], rng);
    for (const client of [p0, reloaded]) {
      expect(client.current.lastError).toBeNull();
      expect(client.current.replayVerified).toBe(true);
    }
  });

  it('a welcome to a later game drops the old one', async () => {
    const game = finishedGame('0a'.repeat(32), new Xorshift(3));
    const client = new GameClient({ room: 'ABCDEF' });
    const [clientEnd, server] = createInMemoryPair();
    client.attach(clientEnd);
    cleanups.push(() => client.dispose());
    send(server, welcome(0));
    send(server, {
      type: 'events',
      game: 0,
      from_seq: 0,
      events: game.eventsSince(0, { seat: 'p0' }),
      view: game.view({ seat: 'p0' }),
      legal: [],
      pending: game.pending(),
    });
    send(server, { type: 'game_over', replay: game.replay() });
    send(server, { type: 'rematch_status', ready: ['p1'] });
    await flush();
    expect(client.current.status).toBe('game_over');
    expect(client.current.rematchReady).toEqual(['p1']);

    const [clientEnd2, server2] = createInMemoryPair();
    client.attach(clientEnd2);
    expect(client.current.rematchReady, 'readiness belongs to a connection').toEqual([]);
    send(server2, welcome(1));
    await flush();
    expect(client.current.game).toBe(1);
    expect(client.current.events).toEqual([]);
    expect(client.current.view).toBeNull();
    expect(client.current.status).toBe('connecting');
    expect(client.current.lastSeq).toBe(0);
    expect(client.current.replay).toBeNull();
    expect(client.current.replayVerified).toBeNull();
    expect(client.current.status).not.toBe('game_over');
  });

  it('sends a rematch request only while connected', async () => {
    const client = new GameClient({ room: 'ABCDEF' });
    expect(() => client.requestRematch()).toThrow('not connected');
  });
});
