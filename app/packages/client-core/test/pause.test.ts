import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Game, defaultRulesConfig, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, parseClientMessage, type ClientMessage, type ServerMessage } from '@wwd/protocol';
import { createInMemoryPair, type Transport } from '@wwd/transport';
import { GameClient } from '../src/index.js';
import { Xorshift, flush, joinReferee, playOut, playUntil, testReferee } from './helpers.js';

beforeAll(loadEngineForNode);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

const TOKEN = 'a'.repeat(32);

/** A client wired to a hand-driven server end that records what the client sends. */
function scripted(): { client: GameClient; server: Transport; sent: ClientMessage[] } {
  const client = new GameClient({ room: 'ABCDEF' });
  const [clientEnd, server] = createInMemoryPair();
  const sent: ClientMessage[] = [];
  server.onMessage((text) => {
    const parsed = parseClientMessage(text);
    if (parsed.ok) sent.push(parsed.msg);
  });
  client.attach(clientEnd);
  cleanups.push(() => client.dispose());
  return { client, server, sent };
}

const send = (server: Transport, msg: ServerMessage): void => server.send(encode(msg));

/** A game at its first round over, before either seat has asked for the next round. */
function atRoundOver(): Game {
  const game = Game.create('0a'.repeat(32), defaultRulesConfig());
  cleanups.push(() => game.dispose());
  const rng = new Xorshift(9);
  while (game.view({ seat: 'p0' }).phase !== 'round_over') {
    const seat = rng.pick(game.pending().seats);
    game.apply(seat, rng.pick(game.legalActions(seat).filter((c) => c !== 'resign')));
  }
  return game;
}

function events(game: Game, seat: Seat = 'p0'): ServerMessage {
  return {
    type: 'events',
    game: 0,
    from_seq: 0,
    events: game.eventsSince(0, { seat }),
    view: game.view({ seat }),
    legal: game.legalActions(seat),
    pending: game.pending(),
  };
}

describe('pause', () => {
  it('pause state follows pause_status', async () => {
    const game = atRoundOver();
    const { client, server } = scripted();
    send(server, {
      type: 'welcome',
      seat: 'p0',
      seat_token: TOKEN,
      room: 'ABCDEF',
      config: defaultRulesConfig(),
      pin: '1234',
      game: 0,
    });
    send(server, events(game));
    await flush();
    expect(client.current.pause).toEqual({
      requestedBy: null,
      agreed: false,
      paused: false,
      resumeReady: [],
    });
    expect(client.current.legal).not.toEqual([]);

    send(server, { type: 'pause_status', requested_by: 'p1', agreed: false });
    await flush();
    expect(client.current.pause).toMatchObject({ requestedBy: 'p1', agreed: false, paused: false });

    send(server, { type: 'pause_status', requested_by: 'p1', agreed: true });
    await flush();
    expect(client.current.pause).toMatchObject({ requestedBy: 'p1', agreed: true, paused: false });

    const boundary = game.roundBoundary();
    if (boundary === null) throw new Error('expected a round boundary');
    const save = {
      format_version: 1 as const,
      kind: 'wwd-save' as const,
      room: 'ABCDEF',
      config: defaultRulesConfig(),
      boundary,
      replay: game.replay(),
      saved_at: 5,
      hash: 'f'.repeat(64),
    };
    send(server, { type: 'paused', save });
    await flush();
    expect(client.current.pause).toMatchObject({ paused: true, resumeReady: [] });
    expect(client.current.save).toEqual(save);
    expect(client.current.legal, 'a paused game offers nothing to play').toEqual([]);

    send(server, { type: 'resume_status', ready: ['p1'] });
    await flush();
    expect(client.current.pause.resumeReady).toEqual(['p1']);

    send(server, { type: 'pause_status', requested_by: null, agreed: false });
    await flush();
    expect(client.current.pause).toEqual({
      requestedBy: null,
      agreed: false,
      paused: false,
      resumeReady: [],
    });
    expect(client.current.save).toBeNull();
  });

  it('sends each pause message only while connected', async () => {
    const { client, sent } = scripted();
    await flush();
    client.requestPause();
    client.cancelPause();
    client.acceptPause();
    client.requestResume();
    await flush();
    expect(sent.slice(1).map((m) => m.type)).toEqual([
      'pause_request',
      'pause_cancel',
      'pause_accept',
      'resume_request',
    ]);
    client.dispose();
    expect(() => client.requestPause()).toThrow('not connected');
  });

  it('names the seat in a tokenless hello when asked to', async () => {
    const client = new GameClient({ room: 'ABCDEF', seat: 'p1' });
    const [clientEnd, server] = createInMemoryPair();
    const sent: ClientMessage[] = [];
    server.onMessage((text) => {
      const parsed = parseClientMessage(text);
      if (parsed.ok) sent.push(parsed.msg);
    });
    client.attach(clientEnd);
    cleanups.push(() => client.dispose());
    await flush();
    expect(sent[0]).toMatchObject({ type: 'hello', seat: 'p1' });
  });

  it('replay verifies across segments', async () => {
    const referee = testReferee(3, cleanups);
    const room = referee.createRoom(defaultRulesConfig());
    const p0 = joinReferee(referee, room, cleanups);
    await flush();
    const p1 = joinReferee(referee, room, cleanups);
    await flush();
    const clients = [p0, p1];
    const rng = new Xorshift(11);

    p0.requestPause();
    await flush();
    expect(p1.current.pause).toMatchObject({ requestedBy: 'p0', agreed: false });
    p1.acceptPause();
    await flush();
    expect(p0.current.pause.agreed).toBe(true);
    await playUntil(clients, rng, () => clients.every((c) => c.current.pause.paused));
    for (const client of clients) {
      expect(client.current.legal).toEqual([]);
      expect(client.current.save?.replay.segments).toHaveLength(1);
    }

    p0.requestResume();
    await flush();
    expect(p1.current.pause.resumeReady).toEqual(['p0']);
    expect(p1.current.pause.paused).toBe(true);
    p1.requestResume();
    await flush();
    for (const client of clients) {
      expect(client.current.pause).toEqual({
        requestedBy: null,
        agreed: false,
        paused: false,
        resumeReady: [],
      });
      expect(client.current.save).toBeNull();
      expect(client.current.legal).not.toEqual([]);
      expect(client.current.lastError).toBeNull();
    }

    await playOut(clients, rng);
    for (const client of clients) {
      expect(client.current.replay?.segments).toHaveLength(2);
      expect(client.current.lastError).toBeNull();
      expect(client.current.replayVerified).toBe(true);
    }
  });

  it('rejects a later segment whose commitment differs from its announcement', async () => {
    const referee = testReferee(3, cleanups);
    const room = referee.createRoom(defaultRulesConfig());
    const p0 = joinReferee(referee, room, cleanups);
    await flush();
    const p1 = joinReferee(referee, room, cleanups);
    await flush();
    const clients = [p0, p1];
    const rng = new Xorshift(11);
    p0.requestPause();
    p1.acceptPause();
    await flush();
    await playUntil(clients, rng, () => clients.every((c) => c.current.pause.paused));
    p0.requestResume();
    p1.requestResume();
    await flush();
    await playOut(clients, rng);
    const replay = p0.current.replay;
    if (replay === null) throw new Error('expected a replay');

    // The same replay, but its second segment swapped for one drawn from another seed.
    const boundary = replay.segments[1]?.start;
    if (boundary === undefined || boundary === 'setup') throw new Error('expected a resume');
    const swapped = Game.resume(
      boundary.round_boundary,
      { ...replay, segments: replay.segments.slice(0, 1) },
      '0c'.repeat(32),
    );
    cleanups.push(() => swapped.dispose());
    const { client, server } = scripted();
    send(server, {
      type: 'welcome',
      seat: 'p0',
      seat_token: TOKEN,
      room: 'ABCDEF',
      config: defaultRulesConfig(),
      pin: '1234',
      game: 0,
    });
    send(server, {
      type: 'events',
      game: 0,
      from_seq: 0,
      events: p0.current.events,
      view: p0.current.view!,
      legal: [],
      pending: p0.current.pending!,
    });
    send(server, { type: 'game_over', replay: { ...replay, segments: swapped.replay().segments } });
    await flush();
    expect(client.current.replayVerified).toBe(false);
    expect(client.current.lastError).toBe('commitment_mismatch');
  });
});
