import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Game, defaultRulesConfig, verifyReplay, visibleTo, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import type { ServerMessage } from '@wwd/protocol';
import { Room, generateJoinCode, type Random, type RoomSnapshot } from '../src/index.js';
import {
  Driver,
  FakeClock,
  FakeRandom,
  ROOM_CODE,
  command,
  deps,
  hello,
  isGameOver,
  to,
  type EventsMessage,
  type GameOverMessage,
} from './harness.js';

beforeAll(loadEngineForNode);

const rooms: Room[] = [];

/** Registers a room for disposal after the current test. */
function track(room: Room): Room {
  rooms.push(room);
  return room;
}

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function newRoom(random?: Random): { room: Room; clock: FakeClock } {
  const d = deps();
  const room = Room.create(ROOM_CODE, defaultRulesConfig(), {
    clock: d.clock,
    random: random ?? d.random,
  });
  return { room: track(room), clock: d.clock };
}

/** A `Random` that can be told to return short seed draws, which the engine rejects. */
class ShortSeedRandom extends FakeRandom {
  shortSeeds = false;
  override bytes(n: number): Uint8Array {
    const bytes = super.bytes(n);
    return this.shortSeeds && n === 32 ? bytes.subarray(1) : bytes;
  }
}

function welcomeOf(msgs: ServerMessage[]): Extract<ServerMessage, { type: 'welcome' }> {
  const welcome = msgs.find((m) => m.type === 'welcome');
  if (welcome?.type !== 'welcome') throw new Error('no welcome');
  return welcome;
}

/** Seats two connections and returns their tokens along with a driver. */
function startedRoom(): { driver: Driver; tokens: Record<Seat, string> } {
  const { room, clock } = newRoom();
  const driver = new Driver(room, clock, 'a', 'b');
  const t0 = welcomeOf(to(driver.send('a', hello({ name: 'Ada' })), 'a')).seat_token;
  const t1 = welcomeOf(to(driver.send('b', hello({ name: 'Bo' })), 'b')).seat_token;
  return { driver, tokens: { p0: t0, p1: t1 } };
}

function gameOvers(driver: Driver, conn: string): GameOverMessage[] {
  return to(driver.log, conn).filter((m): m is GameOverMessage => m.type === 'game_over');
}

describe('room lifecycle', () => {
  it('first hello gets seat p0 and waiting', () => {
    const { room } = newRoom();
    const out = room.handle('a', hello());
    expect(out.map((o) => o.conn)).toEqual(['a', 'a']);
    const [welcome, waiting] = out.map((o) => o.msg);
    expect(welcome).toMatchObject({ type: 'welcome', seat: 'p0', room: ROOM_CODE });
    expect(welcome?.type === 'welcome' && /^[0-9a-f]{32}$/.test(welcome.seat_token)).toBe(true);
    expect(welcome?.type === 'welcome' && welcome.config).toEqual(defaultRulesConfig());
    expect(waiting).toEqual({ type: 'waiting' });
  });

  it('second hello starts the game and both get their own view', () => {
    const { room } = newRoom();
    room.handle('a', hello({ name: 'Ada' }));
    const out = room.handle('b', hello({ name: 'Bo' }));

    const toA = to(out, 'a');
    const toB = to(out, 'b');
    expect(toA.map((m) => m.type)).toEqual(['events', 'opponent_status']);
    expect(toB.map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    expect(toA[1]).toEqual({ type: 'opponent_status', connected: true, name: 'Bo' });
    expect(toB[2]).toEqual({ type: 'opponent_status', connected: true, name: 'Ada' });
    expect(welcomeOf(toB).seat).toBe('p1');

    const eventsA = toA[0] as EventsMessage;
    const eventsB = toB[1] as EventsMessage;
    expect(eventsA.from_seq).toBe(0);
    expect(eventsA.view.viewer).toEqual({ seat: 'p0' });
    expect(eventsA.view.players[0].hand).not.toBeNull();
    expect(eventsB.view.viewer).toEqual({ seat: 'p1' });
    expect(eventsB.view.players[0].hand).toBeNull();
    expect(eventsB.legal.length).toBeGreaterThan(0);
  });

  it('omits the opponent name when none was given', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    const out = room.handle('b', hello({ name: 'Bo' }));
    expect(to(out, 'b')).toContainEqual({ type: 'opponent_status', connected: true });
    expect(to(out, 'a')).toContainEqual({ type: 'opponent_status', connected: true, name: 'Bo' });
  });

  it('full game through the room', () => {
    const { driver } = startedRoom();
    driver.playUntil(() => false);
    for (const conn of ['a', 'b']) {
      const overs = gameOvers(driver, conn);
      expect(overs).toHaveLength(1);
      expect(() => verifyReplay(overs[0]!.replay)).not.toThrow();
      const msgs = to(driver.log, conn);
      expect(msgs.at(-1)?.type).toBe('game_over');
      const beforeLast = msgs.at(-2);
      expect(beforeLast?.type === 'events' && isGameOver(beforeLast.view)).toBe(true);
    }
  });

  it('every outbound event is visible to its recipient', () => {
    const { driver } = startedRoom();
    driver.playUntil(() => false);
    const seatOf: Record<string, Seat> = { a: 'p0', b: 'p1' };
    let checked = 0;
    for (const { conn, msg } of driver.log) {
      if (msg.type !== 'events') continue;
      const viewer = { seat: seatOf[conn]! };
      expect(msg.view.viewer).toEqual(viewer);
      for (const [, ev] of msg.events) {
        expect(visibleTo(ev, viewer)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('sequence numbers never go backwards for each seat', () => {
    const { driver } = startedRoom();
    driver.playUntil(() => false);
    for (const conn of ['a', 'b']) {
      let next = 0;
      for (const msg of to(driver.log, conn)) {
        if (msg.type !== 'events') continue;
        expect(msg.from_seq).toBeGreaterThanOrEqual(next);
        next = msg.from_seq;
        for (const [seq] of msg.events) {
          expect(seq).toBeGreaterThanOrEqual(next);
          next = seq + 1;
        }
      }
    }
  });

  it('snapshot and restore continue the game', () => {
    const { driver, tokens } = startedRoom();
    driver.playUntil(() => driver.view('p0').round >= 2 && driver.view('p0').phase === 'plan');
    expect(driver.view('p0').round).toBe(2);

    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot.version).toBe(2);
    expect(snapshot.segment_base).toBe(0);
    expect(snapshot.seats[0]).toEqual({ token: tokens.p0, name: 'Ada' });

    const restoredDeps = deps(7);
    const restored = track(Room.restore(snapshot, restoredDeps));
    const restoredAt = restoredDeps.clock.now();
    expect(JSON.parse(JSON.stringify(restored.snapshot()))).toEqual({
      ...snapshot,
      disconnected_at: [restoredAt, restoredAt],
    });
    driver.room.dispose();

    const next = new Driver(restored, restoredDeps.clock, 'c', 'd');
    const outC = next.send('c', hello({ seat_token: tokens.p0, last_seq: 0 }));
    expect(to(outC, 'c').map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    expect(welcomeOf(to(outC, 'c'))).toMatchObject({ seat: 'p0', seat_token: tokens.p0 });
    const outD = next.send('d', hello({ seat_token: tokens.p1, last_seq: 0 }));
    expect(to(outD, 'c')).toEqual([{ type: 'opponent_status', connected: true, name: 'Bo' }]);

    next.playUntil(() => false);
    const over = gameOvers(next, 'c')[0];
    expect(over).toBeDefined();
    expect(() => verifyReplay(over!.replay)).not.toThrow();
  });

  it('restore then rebind keeps open connections playing without a resend', () => {
    const { driver } = startedRoom();
    for (let i = 0; i < 3; i++) driver.step();
    const marks = {
      a: driver.latest.get('a')!,
      b: driver.latest.get('b')!,
    };
    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    const restoredDeps = deps(7);
    const restored = track(Room.restore(snapshot, restoredDeps));
    driver.room.dispose();

    expect(restored.rebind('a', 'p0')).toEqual([]);
    expect(restored.rebind('b', 'p1')).toEqual([
      { conn: 'b', msg: { type: 'opponent_status', connected: true, name: 'Ada' } },
      { conn: 'a', msg: { type: 'opponent_status', connected: true, name: 'Bo' } },
    ]);

    const next = new Driver(restored, restoredDeps.clock, 'a', 'b');
    next.latest.set('a', marks.a);
    next.latest.set('b', marks.b);
    const game = Game.fromReplay(snapshot.replay!);
    const length = game.logLength();
    game.dispose();
    next.step();
    for (const conn of ['a', 'b']) {
      expect(next.latest.get(conn)!.from_seq).toBe(length);
    }
    next.playUntil(() => false);
    expect(gameOvers(next, 'a')).toHaveLength(1);
    expect(gameOvers(next, 'b')).toHaveLength(1);
  });

  it('rebind refuses a seat with no record and never throws', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    const restored = track(Room.restore(room.snapshot(), deps(3)));
    expect(restored.rebind('b', 'p1')).toEqual([
      { conn: 'b', msg: { type: 'error', code: 'not_joined' } },
    ]);
    expect(restored.rebind('a', 'p0')).toEqual([]);
    expect(restored.handle('b', command('next_round'))).toEqual([
      { conn: 'b', msg: { type: 'error', code: 'not_joined' } },
    ]);
    expect(() => restored.rebind('a', 'bogus' as Seat)).not.toThrow();
  });

  it('restore rejects a tampered replay', () => {
    const { driver } = startedRoom();
    driver.playUntil(() => driver.view('p0').round >= 2);
    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    snapshot.replay!.segments[0]!.seed = '00'.repeat(32);
    expect(() => Room.restore(snapshot, deps())).toThrow();
  });

  it('restore rejects two seats without a game', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    const snapshot = room.snapshot();
    snapshot.seats[1] = { token: 'cd'.repeat(16) };
    expect(() => Room.restore(snapshot, deps())).toThrow();
  });

  it('snapshot after dispose throws', () => {
    const { driver } = startedRoom();
    driver.room.dispose();
    expect(() => driver.room.snapshot()).toThrow();
  });

  it('create rejects an invalid config', () => {
    const config = { ...defaultRulesConfig(), tiebreak: 'bogus' } as never;
    expect(() => Room.create(ROOM_CODE, config, deps())).toThrow();
  });

  it('a failed game start leaves the room joinable', () => {
    const random = new ShortSeedRandom();
    const { room } = newRoom(random);
    room.handle('a', hello());
    random.shortSeeds = true;
    const failed = room.handle('b', hello());
    expect(failed).toHaveLength(1);
    expect(failed[0]?.conn).toBe('b');
    expect(failed[0]?.msg.type === 'error' && failed[0].msg.code.startsWith('error-')).toBe(true);
    expect(room.snapshot().seats[1]).toBeNull();
    expect(room.snapshot().replay).toBeNull();

    random.shortSeeds = false;
    const out = room.handle('b', hello());
    expect(to(out, 'b').map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    expect(to(out, 'a').map((m) => m.type)).toEqual(['events', 'opponent_status']);
  });

  it('join code alphabet and length', () => {
    const random = new FakeRandom(12345);
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateJoinCode(random);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(990);
  });
});

describe('reconnection', () => {
  it('a token reconnect supersedes the old connection and replays from last_seq', () => {
    const { driver, tokens } = startedRoom();
    for (let i = 0; i < 3; i++) driver.step();
    const lastA = driver.latest.get('a')!;
    const lastSeq = lastA.events.at(-1)?.[0] ?? 0;

    const out = driver.send('c', hello({ seat_token: tokens.p0, last_seq: lastSeq + 1 }));
    expect(to(out, 'a')).toEqual([{ type: 'error', code: 'superseded' }]);
    const toC = to(out, 'c');
    expect(toC.map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    expect((toC[1] as EventsMessage).from_seq).toBe(lastSeq + 1);
    expect(to(out, 'b')).toEqual([{ type: 'opponent_status', connected: true, name: 'Ada' }]);

    expect(driver.send('a', command('next_round'))).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'not_joined' } },
    ]);
    expect(driver.room.disconnect('a')).toEqual([]);
  });

  it('disconnect tells the opponent', () => {
    const { driver } = startedRoom();
    const deadline = driver.room.snapshot().last_activity_at + 600_000;
    expect(driver.room.disconnect('a')).toEqual([
      {
        conn: 'b',
        msg: {
          type: 'opponent_status',
          connected: false,
          name: 'Ada',
          grace_deadline: deadline,
          grace_remaining_ms: 600_000,
        },
      },
    ]);
    expect(driver.room.disconnect('a')).toEqual([]);
  });

  it('a seat that joins while its opponent is offline sees it as disconnected', () => {
    const { room, clock } = newRoom();
    room.handle('a', hello());
    room.disconnect('a');
    const out = room.handle('b', hello());
    expect(to(out, 'a')).toEqual([]);
    expect(to(out, 'b').at(-1)).toEqual({
      type: 'opponent_status',
      connected: false,
      grace_deadline: clock.now() + 600_000,
      grace_remaining_ms: 600_000,
    });
  });

  it('a reconnect after game over gets events then game_over again', () => {
    const { driver, tokens } = startedRoom();
    driver.playUntil(() => false);
    const out = driver.send('c', hello({ seat_token: tokens.p1, last_seq: 0 }));
    const types = to(out, 'c').map((m) => m.type);
    expect(types).toEqual(['welcome', 'events', 'game_over', 'opponent_status']);
  });

  it('an out-of-range last_seq does not crash', () => {
    const { driver, tokens } = startedRoom();
    const out = driver.send('c', hello({ seat_token: tokens.p0, last_seq: 999_999 }));
    const events = to(out, 'c').find((m) => m.type === 'events') as EventsMessage;
    expect(events.from_seq).toBe(0);
  });

  it('a reconnect before the game starts gets waiting', () => {
    const { room } = newRoom();
    const token = welcomeOf(to(room.handle('a', hello()), 'a')).seat_token;
    room.disconnect('a');
    const out = room.handle('c', hello({ seat_token: token }));
    expect(to(out, 'c').map((m) => m.type)).toEqual(['welcome', 'waiting']);
  });
});

describe('rejections', () => {
  it('rejects a third player, a wrong room and a wrong version', () => {
    const { driver } = startedRoom();
    expect(driver.room.handle('c', hello())).toEqual([
      { conn: 'c', msg: { type: 'error', code: 'room_full' }, close: true },
    ]);
    expect(driver.room.handle('c', hello({ seat_token: 'ff'.repeat(16) }))).toEqual([
      { conn: 'c', msg: { type: 'error', code: 'unknown_seat' }, close: true },
    ]);
    expect(driver.room.handle('c', hello({ room: 'AAAAAA' }))).toEqual([
      { conn: 'c', msg: { type: 'error', code: 'unknown_room' }, close: true },
    ]);
    expect(driver.room.handle('c', hello({ protocol_version: 2 }))).toEqual([
      { conn: 'c', msg: { type: 'error', code: 'protocol_version' }, close: true },
    ]);
  });

  it('reports engine errors to the sender only', () => {
    const { driver } = startedRoom();
    const out = driver.send('a', command('next_round'));
    expect(out).toHaveLength(1);
    expect(out[0]?.conn).toBe('a');
    expect(out[0]?.msg.type === 'error' && out[0].msg.code.startsWith('error-')).toBe(true);
  });

  it('rejects commands from unknown connections and malformed input', () => {
    const { driver } = startedRoom();
    expect(driver.room.handle('z', command('next_round'))).toEqual([
      { conn: 'z', msg: { type: 'error', code: 'not_joined' } },
    ]);
    expect(driver.room.handle('z', '{"type":')).toEqual([
      { conn: 'z', msg: { type: 'error', code: 'invalid_message' } },
    ]);
    expect(driver.room.handle('z', 'x'.repeat(9000))).toEqual([
      { conn: 'z', msg: { type: 'error', code: 'too_large' } },
    ]);
  });

  it('answers ping with pong', () => {
    const { room } = newRoom();
    expect(room.handle('a', '{"type":"ping"}')).toEqual([{ conn: 'a', msg: { type: 'pong' } }]);
  });

  it('rate limits each connection over a rolling window', () => {
    const { room, clock } = newRoom();
    for (let i = 0; i < 30; i++) {
      expect(room.handle('a', '{"type":"ping"}')[0]?.msg.type).toBe('pong');
      clock.advance(100);
    }
    expect(room.handle('a', '{"type":"ping"}')).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'rate_limited' } },
    ]);
    expect(room.handle('b', '{"type":"ping"}')[0]?.msg.type).toBe('pong');
    clock.advance(10_000 - 3000 + 1);
    expect(room.handle('a', '{"type":"ping"}')[0]?.msg.type).toBe('pong');
  });
});
