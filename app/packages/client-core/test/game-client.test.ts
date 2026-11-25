import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Game, defaultRulesConfig, type Command, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  PROTOCOL_VERSION,
  encode,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@wwd/protocol';
import { BroadcastChannelHost, MemoryReferee } from '@wwd/referee-memory';
import { BroadcastChannelTransport, createInMemoryPair, type Transport } from '@wwd/transport';
import { GameClient, type ClientStatus, type GameClientOptions } from '../src/index.js';
import { Xorshift, finishedGame, flush, playOut, step, until } from './helpers.js';

beforeAll(loadEngineForNode);

const SEED_A = '0a'.repeat(32);
const SEED_B = '0b'.repeat(32);
const TOKEN = 'a'.repeat(32);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function newReferee(seed: number): MemoryReferee {
  // An advancing clock keeps long games clear of the per-connection rate limit.
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

/** Records what a client sends and which events messages it receives. */
function recording(
  inner: Transport,
  sent: string[],
  eventMessages: Array<Extract<ServerMessage, { type: 'events' }>>,
): Transport {
  return {
    send: (text) => {
      sent.push(text);
      inner.send(text);
    },
    onMessage: (cb) =>
      inner.onMessage((text) => {
        const parsed = parseServerMessage(text);
        if (parsed.ok && parsed.msg.type === 'events') eventMessages.push(parsed.msg);
        cb(text);
      }),
    onClose: (cb) => inner.onClose(cb),
    close: () => inner.close(),
    get open() {
      return inner.open;
    },
  };
}

/** A client wired to a hand-driven server end. */
function scripted(): { client: GameClient; server: Transport } {
  const client = new GameClient({ room: 'ABCDEF' });
  const [clientEnd, server] = createInMemoryPair();
  client.attach(clientEnd);
  cleanups.push(() => client.dispose());
  return { client, server };
}

function send(server: Transport, msg: ServerMessage): void {
  server.send(encode(msg));
}

function welcome(server: Transport, seat: Seat = 'p0'): void {
  send(server, {
    type: 'welcome',
    seat,
    seat_token: TOKEN,
    room: 'ABCDEF',
    config: defaultRulesConfig(),
    pin: '1234',
    game: 0,
  });
}

function sendEvents(server: Transport, game: Game, from = 0, seat: Seat = 'p0'): void {
  send(server, {
    type: 'events',
    game: 0,
    from_seq: from,
    events: game.eventsSince(from, { seat }),
    view: game.view({ seat }),
    legal: [],
    pending: game.pending(),
  });
}

describe('GameClient', () => {
  it('plays a full game and verifies the replay', async () => {
    const referee = newReferee(1);
    const room = referee.createRoom(defaultRulesConfig());
    const p0 = join(referee, room);
    await flush();
    const p1 = join(referee, room);
    await flush();
    expect([p0.current.seat, p1.current.seat]).toEqual(['p0', 'p1']);
    expect(p0.current.status).toBe('playing');

    await playOut([p0, p1], new Xorshift(7));

    for (const client of [p0, p1]) {
      expect(client.current.status).toBe('game_over');
      expect(client.current.replayVerified).toBe(true);
      expect(client.current.legal).toEqual([]);
      expect(client.current.lastError).toBeNull();
    }
  });

  describe('replay verification', () => {
    it('accepts a replay that matches what the client saw', async () => {
      const game = finishedGame(SEED_A, new Xorshift(3));
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, game);
      send(server, { type: 'game_over', replay: game.replay() });
      await flush();
      expect(client.current.replayVerified).toBe(true);
      expect(client.current.lastError).toBeNull();
    });

    it('rejects a forged commitment', async () => {
      const announced = Game.create(SEED_A, defaultRulesConfig());
      const forged = finishedGame(SEED_B, new Xorshift(3));
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, announced);
      send(server, { type: 'game_over', replay: forged.replay() });
      await flush();
      expect(client.current.status).toBe('game_over');
      expect(client.current.replayVerified).toBe(false);
      expect(client.current.lastError).toBe('commitment_mismatch');
    });

    it('fails when no game start was received', async () => {
      const forged = finishedGame(SEED_B, new Xorshift(3));
      const { client, server } = scripted();
      send(server, { type: 'game_over', replay: forged.replay() });
      await flush();
      expect(client.current.replayVerified).toBe(false);
      expect(client.current.lastError).toBe('commitment_mismatch');
    });

    it('ignores a second game start and flags it', async () => {
      const first = Game.create(SEED_A, defaultRulesConfig());
      const second = finishedGame(SEED_B, new Xorshift(3));
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, first);
      await flush();
      const eventCount = client.current.events.length;
      const [, secondStart] = second.eventsSince(0, { seat: 'p0' })[0] ?? [];
      if (secondStart === undefined) throw new Error('expected a game start');
      send(server, {
        type: 'events',
        game: 0,
        from_seq: 50,
        events: [[50, secondStart]],
        view: second.view({ seat: 'p0' }),
        legal: [],
        pending: second.pending(),
      });
      await flush();
      expect(client.current.lastError).toBe('protocol_violation');
      expect(client.current.events).toHaveLength(eventCount);
      send(server, { type: 'game_over', replay: second.replay() });
      await flush();
      expect(client.current.replayVerified).toBe(false);
    });

    it('rejects a replay with the true seed but different play', async () => {
      const seen = finishedGame(SEED_A, new Xorshift(3));
      const altered = finishedGame(SEED_A, new Xorshift(4));
      expect(altered.eventsSince(0, { seat: 'p0' })).not.toEqual(
        seen.eventsSince(0, { seat: 'p0' }),
      );
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, seen);
      send(server, { type: 'game_over', replay: altered.replay() });
      await flush();
      expect(client.current.replayVerified).toBe(false);
      expect(client.current.lastError).toBe('replay_mismatch');
    });

    it('rejects a replay with a different config', async () => {
      const seen = finishedGame(SEED_A, new Xorshift(3));
      const other = finishedGame(SEED_A, new Xorshift(3), {
        ...defaultRulesConfig(),
        badge_start: { seat: 'p0' },
      });
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, seen);
      send(server, { type: 'game_over', replay: other.replay() });
      await flush();
      expect(client.current.replayVerified).toBe(false);
      expect(client.current.lastError).toBe('replay_mismatch');
    });
  });

  it('throws for a command that is not legal', async () => {
    const referee = newReferee(2);
    const room = referee.createRoom(defaultRulesConfig());
    const p0 = join(referee, room);
    const p1 = join(referee, room);
    await flush();
    const illegal: Command = { place_hourglasses: { n: 99 } };
    expect(() => p0.command(illegal)).toThrow('not currently legal');
    expect(() => p1.command('next_round')).toThrow(Error);
    const legal = p0.current.legal[0];
    if (legal === undefined) throw new Error('expected a legal command');
    expect(() => p0.command(legal)).not.toThrow();
  });

  describe('status', () => {
    it('moves from connecting to waiting to playing', async () => {
      const referee = newReferee(2);
      const room = referee.createRoom(defaultRulesConfig());
      const p0 = new GameClient({ room });
      const statuses: ClientStatus[] = [];
      p0.state.subscribe((s) => {
        if (statuses.at(-1) !== s.status) statuses.push(s.status);
      });
      const [clientEnd, serverEnd] = createInMemoryPair();
      referee.accept(serverEnd);
      p0.attach(clientEnd);
      cleanups.push(() => p0.dispose());
      await flush();
      join(referee, room);
      await flush();
      expect(statuses).toEqual(['connecting', 'waiting', 'playing']);
    });

    it('never leaves game over', async () => {
      const game = finishedGame(SEED_A, new Xorshift(3));
      const { client, server } = scripted();
      welcome(server);
      sendEvents(server, game);
      send(server, { type: 'game_over', replay: game.replay() });
      await flush();
      expect(client.current.status).toBe('game_over');
      welcome(server);
      send(server, { type: 'waiting' });
      sendEvents(server, game);
      await flush();
      expect(client.current.status).toBe('game_over');
      expect(client.current.legal).toEqual([]);
    });

    it('never leaves rejected', async () => {
      const game = Game.create(SEED_A, defaultRulesConfig());
      const { client, server } = scripted();
      send(server, { type: 'error', code: 'room_full' });
      await flush();
      expect(client.current.status).toBe('rejected');
      welcome(server);
      send(server, { type: 'waiting' });
      sendEvents(server, game);
      await flush();
      expect(client.current.status).toBe('rejected');
    });

    it('is rejected from an unknown room', async () => {
      const referee = newReferee(7);
      const client = join(referee, 'ZZZZZZ');
      await flush();
      expect(client.current.status).toBe('rejected');
      expect(client.current.lastError).toBe('unknown_room');
    });

    it('is rejected and forgets its seat token on unknown_seat', async () => {
      const client = new GameClient({ room: 'ABCDEF', seatToken: TOKEN });
      const [clientEnd, server] = createInMemoryPair();
      client.attach(clientEnd);
      cleanups.push(() => client.dispose());
      send(server, { type: 'error', code: 'unknown_seat' });
      server.close();
      await flush();
      expect(client.current.status).toBe('rejected');
      expect(client.current.lastError).toBe('unknown_seat');
      expect(client.current.seatToken).toBeNull();
    });

    it('is disconnected once disposed', async () => {
      const referee = newReferee(2);
      const room = referee.createRoom(defaultRulesConfig());
      const p0 = join(referee, room);
      await flush();
      p0.dispose();
      expect(p0.current.status).toBe('disconnected');
      expect(p0.current.legal).toEqual([]);
    });
  });

  it('reconnect resumes from lastSeq', async () => {
    const referee = newReferee(4);
    const room = referee.createRoom(defaultRulesConfig());
    const rng = new Xorshift(11);
    const p0 = join(referee, room);
    const p1 = join(referee, room);
    await flush();
    for (let i = 0; i < 6; i++) expect(await step([p0, p1], rng)).toBe(true);

    const seenBefore = p0.current.lastSeq;
    const token = p0.current.seatToken;
    expect(seenBefore).toBeGreaterThan(0);
    expect(token).not.toBeNull();
    expect(p0.current.status).toBe('playing');

    // Drop p0's connection, let the opponent carry on, then reconnect.
    const [lostEnd, lostServer] = createInMemoryPair();
    referee.accept(lostServer);
    p0.attach(lostEnd);
    lostEnd.close();
    await flush();
    expect(p0.current.status).toBe('disconnected');
    expect(p0.current.legal).toEqual([]);
    expect(await step([p1], rng)).toBe(true);
    expect(p1.current.lastSeq).toBeGreaterThan(seenBefore);

    const sent: string[] = [];
    const received: Array<Extract<ServerMessage, { type: 'events' }>> = [];
    const statuses: ClientStatus[] = [];
    p0.state.subscribe((s) => {
      if (statuses.at(-1) !== s.status) statuses.push(s.status);
    });
    const [clientEnd, serverEnd] = createInMemoryPair();
    referee.accept(serverEnd);
    p0.attach(recording(clientEnd, sent, received));
    expect(p0.current.legal).toEqual([]);
    expect(p0.current.pending).toBeNull();
    await flush();

    const hello = parseClientMessage(sent[0] ?? '');
    if (!hello.ok || hello.msg.type !== 'hello') throw new Error('expected a hello');
    expect(hello.msg.seat_token).toBe(token);
    expect(hello.msg.last_seq).toBe(seenBefore);
    expect(hello.msg.protocol_version).toBe(PROTOCOL_VERSION);

    // Only events newer than lastSeq come back, and no waiting state shows.
    expect(received.length).toBeGreaterThan(0);
    for (const msg of received) {
      expect(msg.from_seq).toBe(seenBefore);
      expect(msg.events.length).toBeGreaterThan(0);
      for (const [seq] of msg.events) expect(seq).toBeGreaterThanOrEqual(seenBefore);
    }
    expect(statuses).toEqual(['disconnected', 'connecting', 'playing']);

    const seqs = p0.current.events.map(([seq]) => seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(p0.current.seatToken).toBe(token);
    expect(p0.current.lastSeq).toBe(p1.current.lastSeq);

    await playOut([p0, p1], rng);
    expect(p0.current.replayVerified).toBe(true);
    expect(p1.current.replayVerified).toBe(true);
  });

  it('guest sees disconnected when host closes', async () => {
    const referee = newReferee(5);
    const room = referee.createRoom(defaultRulesConfig());
    const host = new BroadcastChannelHost(referee, 'wwd-client-core-test');
    cleanups.push(() => host.close());
    const transport = new BroadcastChannelTransport('wwd-client-core-test');
    cleanups.push(() => transport.close());
    const client = new GameClient({ room });
    client.attach(transport);
    await until(() => client.current.status === 'waiting');
    host.close();
    await until(() => client.current.status === 'disconnected');
    expect(client.current.legal).toEqual([]);
  });

  it('broadcast guest sees disconnected when the referee closes', async () => {
    const referee = newReferee(6);
    const room = referee.createRoom(defaultRulesConfig());
    const host = new BroadcastChannelHost(referee, 'wwd-client-core-test-2');
    cleanups.push(() => host.close());
    const transport = new BroadcastChannelTransport('wwd-client-core-test-2');
    cleanups.push(() => transport.close());
    const client = new GameClient({ room });
    client.attach(transport);
    await until(() => client.current.status === 'waiting');
    referee.close();
    await until(() => client.current.status === 'disconnected');
  });
});

describe('problems', () => {
  it('counts every error, even a repeated code', async () => {
    const { client, server } = scripted();
    welcome(server);
    send(server, { type: 'error', code: 'rate_limited' });
    send(server, { type: 'error', code: 'rate_limited' });
    await flush();
    expect(client.current.lastError).toBe('rate_limited');
    expect(client.current.errorCount).toBe(2);
    expect(client.current.status).not.toBe('rejected');
  });

  it('clears the last problem when the next events arrive', async () => {
    const game = Game.create(SEED_A, defaultRulesConfig());
    cleanups.push(() => game.dispose());
    const { client, server } = scripted();
    welcome(server);
    sendEvents(server, game);
    send(server, { type: 'error', code: 'error-target-not-allowed' });
    await flush();
    expect(client.current.lastError).toBe('error-target-not-allowed');
    const legal = game.legalActions('p0');
    const cmd = legal[0];
    if (cmd === undefined) throw new Error('no legal command');
    game.apply('p0', cmd);
    sendEvents(server, game);
    await flush();
    expect(client.current.lastError).toBeNull();
    expect(client.current.errorCount).toBe(1);
  });
});

describe('keepalive', () => {
  it('sends ping when attached and records when the pong arrived', async () => {
    let time = 5000;
    const client = new GameClient({ room: 'ABCDEF', now: () => time });
    cleanups.push(() => client.dispose());
    expect(client.current.lastPongAt).toBeNull();
    expect(() => client.ping()).not.toThrow();

    const [clientEnd, server] = createInMemoryPair();
    const received: string[] = [];
    server.onMessage((text) => received.push(text));
    client.attach(clientEnd);
    client.ping();
    await flush();
    expect(received.map((text) => parseClientMessage(text))).toEqual([
      expect.objectContaining({ ok: true, msg: expect.objectContaining({ type: 'hello' }) }),
      { ok: true, msg: { type: 'ping' } },
    ]);

    time = 7500;
    send(server, { type: 'pong' });
    await flush();
    expect(client.current.lastPongAt).toBe(7500);
    expect(client.current.pongCount).toBe(1);
    send(server, { type: 'pong' });
    await flush();
    expect(client.current.lastPongAt).toBe(7500);
    expect(client.current.pongCount).toBe(2);
  });
});

describe('lost binding', () => {
  /** A client holding a seat token, with everything it sends recorded as parsed messages. */
  function seated(): { client: GameClient; server: Transport; sent: ClientMessage[] } {
    const { client, server } = scripted();
    const sent: ClientMessage[] = [];
    server.onMessage((text) => {
      const parsed = parseClientMessage(text);
      if (parsed.ok) sent.push(parsed.msg);
    });
    return { client, server, sent };
  }

  it('re-sends hello with its token once per not_joined streak, then recovers', async () => {
    const game = Game.create(SEED_A, defaultRulesConfig());
    cleanups.push(() => game.dispose());
    const { client, server, sent } = seated();
    welcome(server);
    sendEvents(server, game);
    await flush();
    const lastSeq = client.current.lastSeq;
    sent.length = 0;

    send(server, { type: 'error', code: 'not_joined' });
    send(server, { type: 'error', code: 'not_joined' });
    await flush();
    const rehello = {
      type: 'hello',
      protocol_version: PROTOCOL_VERSION,
      room: 'ABCDEF',
      seat_token: TOKEN,
      last_seq: lastSeq,
    };
    expect(sent).toEqual([rehello]);
    expect(client.current.lastError).toBe('not_joined');

    welcome(server);
    sendEvents(server, game, lastSeq);
    await flush();
    expect(client.current.status).toBe('playing');
    expect(client.current.lastError).toBeNull();

    send(server, { type: 'error', code: 'not_joined' });
    await flush();
    expect(sent).toEqual([rehello, rehello]);
  });

  it('does not re-send hello without a seat token', async () => {
    const { server, sent } = seated();
    await flush();
    sent.length = 0;
    send(server, { type: 'error', code: 'not_joined' });
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('online seat recovery', () => {
  /** A client with `opts`, wired to a hand-driven server end that records what it is sent. */
  function recorded(opts: Partial<GameClientOptions> = {}): {
    client: GameClient;
    server: Transport;
    sent: ClientMessage[];
  } {
    const client = new GameClient({ room: 'ABCDEF', ...opts });
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

  function reattach(client: GameClient, sent: ClientMessage[]): Transport {
    const [clientEnd, server] = createInMemoryPair();
    server.onMessage((text) => {
      const parsed = parseClientMessage(text);
      if (parsed.ok) sent.push(parsed.msg);
    });
    client.attach(clientEnd);
    return server;
  }

  it('keeps the seat PIN and the opponent grace status', async () => {
    const { client, server } = recorded();
    expect(client.current.pin).toBeNull();
    welcome(server);
    send(server, { type: 'opponent_status', connected: false, grace_deadline: 5000 });
    await flush();
    expect(client.current.pin).toBe('1234');
    expect(client.current.opponent).toEqual({ connected: false, grace_deadline: 5000 });
    send(server, { type: 'opponent_status', connected: false, can_claim_win: true });
    await flush();
    expect(client.current.opponent).toEqual({ connected: false, can_claim_win: true });
  });

  it('keeps the rules config from the welcome, including on a resumed seat', async () => {
    const { client, server } = recorded({ seatToken: TOKEN });
    expect(client.current.config).toBeNull();
    send(server, {
      type: 'welcome',
      seat: 'p1',
      seat_token: TOKEN,
      room: 'ABCDEF',
      config: { ...defaultRulesConfig(), tiebreak: 'badge_only' },
      pin: '1234',
      game: 0,
    });
    await flush();
    expect(client.current.config?.tiebreak).toBe('badge_only');
  });

  it('rejoins a seat by PIN when it holds no token, then resumes by token', async () => {
    const { client, server, sent } = recorded({ rejoin: { seat: 'p1', pin: '1234' } });
    await flush();
    expect(sent).toEqual([
      {
        type: 'rejoin',
        protocol_version: PROTOCOL_VERSION,
        room: 'ABCDEF',
        seat: 'p1',
        pin: '1234',
      },
    ]);
    welcome(server, 'p1');
    await flush();
    expect(client.current.seat).toBe('p1');
    expect(client.current.seatToken).toBe(TOKEN);
    sent.length = 0;
    reattach(client, sent);
    await flush();
    expect(sent.map((m) => m.type)).toEqual(['hello']);
  });

  it('waits for approval after a rejoin without a PIN', async () => {
    const { client, server, sent } = recorded({ rejoin: { seat: 'p0' } });
    await flush();
    expect(sent).toEqual([
      { type: 'rejoin', protocol_version: PROTOCOL_VERSION, room: 'ABCDEF', seat: 'p0' },
    ]);
    send(server, { type: 'rejoin_pending' });
    await flush();
    expect(client.current.rejoinPending).toBe(true);
    welcome(server);
    await flush();
    expect(client.current.rejoinPending).toBe(false);
  });

  it('a wrong PIN rejects the attempt and is not sent again', async () => {
    const { client, server, sent } = recorded({ rejoin: { seat: 'p1', pin: '0000' } });
    send(server, { type: 'error', code: 'wrong_pin' });
    await flush();
    expect(client.current.status).toBe('rejected');
    expect(client.current.lastError).toBe('wrong_pin');
    expect(sent).toHaveLength(1);
  });

  it('a fresh hello follows unknown_seat once the rejoin is cleared', async () => {
    const { client, server, sent } = recorded({ seatToken: TOKEN });
    send(server, { type: 'error', code: 'unknown_seat' });
    await flush();
    expect(client.current.status).toBe('rejected');
    expect(client.current.seatToken).toBeNull();
    sent.length = 0;
    client.setRejoin(null);
    reattach(client, sent);
    await flush();
    expect(sent).toEqual([{ type: 'hello', protocol_version: PROTOCOL_VERSION, room: 'ABCDEF' }]);
    expect(client.current.status).toBe('connecting');
  });

  it('answers a rejoin request from the opponent', async () => {
    // This device's clock is five minutes ahead of the referee's; only the remaining time counts.
    const time = 120_000 + 300_000;
    const { client, server, sent } = recorded({ now: () => time });
    welcome(server);
    send(server, { type: 'rejoin_request', deadline: 120_000, remaining_ms: 90_000 });
    await flush();
    expect(client.current.rejoinRequested).toBe(true);
    expect(client.current.rejoinDeadline).toBe(time + 90_000);
    sent.length = 0;
    client.approveRejoin(true);
    await flush();
    expect(sent).toEqual([{ type: 'approve_rejoin', approve: true }]);
    expect(client.current.rejoinRequested).toBe(false);
  });

  it('forgets a rejoin request the referee withdraws', async () => {
    const { client, server } = recorded();
    welcome(server);
    send(server, { type: 'rejoin_request', deadline: 120_000, remaining_ms: 120_000 });
    send(server, { type: 'rejoin_withdrawn' });
    await flush();
    expect(client.current.rejoinRequested).toBe(false);
    expect(client.current.rejoinDeadline).toBeNull();
  });

  it('forgets a rejoin request when the connection closes, as the referee does', async () => {
    const { client, server } = recorded();
    welcome(server);
    send(server, { type: 'rejoin_request', deadline: 120_000, remaining_ms: 120_000 });
    await flush();
    expect(client.current.rejoinRequested).toBe(true);
    server.close();
    await flush();
    expect(client.current.status).toBe('disconnected');
    expect(client.current.rejoinRequested).toBe(false);
    expect(client.current.rejoinDeadline).toBeNull();
  });

  it('times the opponent grace by its own clock from the remaining time', async () => {
    let time = 1_000;
    const { client, server } = recorded({ now: () => time });
    welcome(server);
    await flush();
    time = 50_000;
    // The referee's clock is far ahead; only the remaining time is trusted.
    send(server, {
      type: 'opponent_status',
      connected: false,
      grace_deadline: 9_000_000,
      grace_remaining_ms: 60_000,
    });
    await flush();
    expect(client.current.opponent).toEqual({ connected: false, grace_deadline: 110_000 });
  });

  it('forgets a rejoin request once the opponent seat is connected again', async () => {
    const { client, server } = recorded();
    welcome(server);
    send(server, { type: 'rejoin_request', deadline: 120_000, remaining_ms: 120_000 });
    send(server, { type: 'opponent_status', connected: true });
    await flush();
    expect(client.current.rejoinRequested).toBe(false);
  });

  it('claims the win only once it is offered', async () => {
    const { client, server, sent } = recorded();
    welcome(server);
    send(server, { type: 'opponent_status', connected: false, grace_deadline: 5000 });
    await flush();
    expect(() => client.claimWin()).toThrow();
    send(server, { type: 'opponent_status', connected: false, can_claim_win: true });
    await flush();
    sent.length = 0;
    client.claimWin();
    await flush();
    expect(sent).toEqual([{ type: 'claim_win' }]);
  });

  it('resigns only while the game is in progress', async () => {
    const game = Game.create(SEED_A, defaultRulesConfig());
    cleanups.push(() => game.dispose());
    const { client, server, sent } = recorded();
    welcome(server);
    await flush();
    expect(() => client.resign()).toThrow();
    sendEvents(server, game);
    await flush();
    sent.length = 0;
    client.resign();
    await flush();
    expect(sent).toEqual([{ type: 'command', cmd: 'resign' }]);
  });
});
