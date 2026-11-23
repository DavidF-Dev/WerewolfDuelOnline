import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig, verifyReplay, type Seat, type View } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, type ServerMessage } from '@wwd/protocol';
import { Room, type Outbound, type RoomSnapshot, type RoomSnapshotV2 } from '../src/index.js';
import { bothReady, forget, loserOf, request } from '../src/rematch.js';
import {
  Driver,
  FakeClock,
  ROOM_CODE,
  command,
  deps,
  hello,
  isGameOver,
  to,
  type EventsMessage,
} from './harness.js';

beforeAll(loadEngineForNode);

const REMATCH = encode({ type: 'rematch_request' });

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function track(room: Room): Room {
  rooms.push(room);
  return room;
}

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

interface Table {
  driver: Driver;
  clock: FakeClock;
  welcomes: Record<Seat, Welcome>;
}

function welcomeOf(out: Outbound[], conn: string): Welcome {
  const msg = to(out, conn).find((m) => m.type === 'welcome');
  if (msg?.type !== 'welcome') throw new Error('no welcome');
  return msg;
}

function eventsOf(out: Outbound[], conn: string): EventsMessage {
  const events = to(out, conn).find((m): m is EventsMessage => m.type === 'events');
  if (events === undefined) throw new Error('no events');
  return events;
}

/** Seats Ada on `a` and Bo on `b`, then plays their game to the end. */
function finishedTable(): Table {
  const d = deps();
  const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
  const driver = new Driver(room, d.clock, 'a', 'b');
  const w0 = welcomeOf(driver.send('a', hello({ name: 'Ada' })), 'a');
  const w1 = welcomeOf(driver.send('b', hello({ name: 'Bo' })), 'b');
  driver.playUntil(() => false);
  return { driver, clock: d.clock, welcomes: { p0: w0, p1: w1 } };
}

function winnerOf(view: View): Seat {
  const phase = view.phase;
  if (typeof phase !== 'object' || !('game_over' in phase)) throw new Error('not over');
  return phase.game_over.winner;
}

function rematched(table: Table): Outbound[] {
  table.driver.send('a', REMATCH);
  return table.driver.send('b', REMATCH);
}

describe('rematch', () => {
  it('rematch needs both seats', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    const early = new Driver(room, d.clock, 'a', 'b');
    expect(early.send('x', REMATCH)).toEqual([
      { conn: 'x', msg: { type: 'error', code: 'not_joined' } },
    ]);
    early.send('a', hello());
    early.send('b', hello());
    expect(early.send('a', REMATCH)).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'invalid_message' } },
    ]);

    const table = finishedTable();
    const { driver } = table;
    const first = driver.send('a', REMATCH);
    for (const conn of ['a', 'b']) {
      expect(to(first, conn)).toEqual([{ type: 'rematch_status', ready: ['p0'] }]);
    }
    expect(driver.send('a', REMATCH)).toEqual([]);

    // A seat that leaves is no longer ready, and connecting again does not make it so.
    expect(driver.room.disconnect('a')).toEqual([
      { conn: 'b', msg: { type: 'rematch_status', ready: [] } },
      { conn: 'b', msg: { type: 'opponent_status', connected: false, name: 'Ada' } },
    ]);
    const back = driver.send('c', hello({ seat_token: table.welcomes.p0.seat_token }));
    expect(to(back, 'c').map((m) => m.type)).toEqual([
      'welcome',
      'events',
      'game_over',
      'pause_status',
      'rematch_status',
      'opponent_status',
    ]);
    expect(to(back, 'c')).toContainEqual({ type: 'rematch_status', ready: [] });
    const half = driver.send('b', REMATCH);
    expect(half.some((o) => o.msg.type === 'events')).toBe(false);
    expect(to(half, 'c')).toEqual([{ type: 'rematch_status', ready: ['p1'] }]);

    const started = driver.send('c', REMATCH);
    for (const conn of ['b', 'c']) {
      expect(to(started, conn).map((m) => m.type)).toEqual(['events']);
    }
    expect(driver.room.finishedAt).toBeNull();
    expect(driver.room.snapshot()).toMatchObject({ game: 1, rematch_ready: [], finished_at: null });
  });

  it('rematch gives the badge to the loser', () => {
    for (const seed of [1, 2, 3, 4]) {
      const d = deps(seed);
      const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
      const driver = new Driver(room, d.clock, 'a', 'b', seed);
      driver.send('a', hello());
      driver.send('b', hello());
      driver.playUntil(() => false);
      const winner = winnerOf(driver.view('p0'));
      const loser: Seat = winner === 'p0' ? 'p1' : 'p0';
      const seedBefore = room.snapshot().replay!.segments[0]!.seed;

      driver.send('b', REMATCH);
      const out = driver.send('a', REMATCH);
      expect(eventsOf(out, 'a').view.badge).toBe(loser);
      expect(eventsOf(out, 'b').view.badge).toBe(loser);
      const replay = room.snapshot().replay!;
      expect(replay.config).toEqual({ ...defaultRulesConfig(), badge_start: { seat: loser } });
      expect(replay.segments).toHaveLength(1);
      expect(replay.segments[0]!.seed).not.toBe(seedBefore);
      // The room keeps its own rules; only the new game's Badge start differs.
      expect(room.snapshot().config).toEqual(defaultRulesConfig());
    }
  });

  it('rematch restarts seq at zero with the next game index', () => {
    const table = finishedTable();
    const { driver, welcomes } = table;
    const firstGame = to(driver.log, 'a').filter((m): m is EventsMessage => m.type === 'events');
    expect(firstGame.every((m) => m.game === 0)).toBe(true);
    expect(welcomes.p0.game).toBe(0);
    const lastSeq = Math.max(...firstGame.flatMap((m) => m.events.map(([seq]) => seq)));

    const out = rematched(table);
    for (const conn of ['a', 'b']) {
      const events = eventsOf(out, conn);
      expect(events.game).toBe(1);
      expect(events.from_seq).toBe(0);
      expect(events.events[0]![0]).toBe(0);
      expect(isGameOver(events.view)).toBe(false);
    }

    // The new game is played on with the same seats.
    expect(driver.step()).toBe(true);
    expect(driver.step()).toBe(true);

    // A reconnect keeps the token and PIN, and a last_seq from the old game gets a full resend.
    for (const lastSeqSent of [lastSeq, 1]) {
      const back = driver.room.handle(
        'c',
        hello({ seat_token: welcomes.p0.seat_token, last_seq: lastSeqSent }),
      );
      const welcome = welcomeOf(back, 'c');
      expect(welcome).toMatchObject({
        game: 1,
        seat_token: welcomes.p0.seat_token,
        pin: welcomes.p0.pin,
      });
      const resent = eventsOf(back, 'c');
      expect(resent).toMatchObject({ game: 1, from_seq: 0 });
      expect(resent.events[0]![0]).toBe(0);
      // The finished game's replay is no longer offered.
      expect(to(back, 'c').some((m) => m.type === 'game_over')).toBe(false);
      expect(to(back, 'c').some((m) => m.type === 'rematch_status')).toBe(false);
    }
  });

  it("welcome sends the current game's config after a rematch", () => {
    const table = finishedTable();
    const { driver, welcomes } = table;
    rematched(table);
    const gameConfig = driver.room.snapshot().replay!.config;
    expect(gameConfig.badge_start).not.toBe('random');

    const back = driver.room.handle('c', hello({ seat_token: welcomes.p0.seat_token }));
    expect(welcomeOf(back, 'c').config).toEqual(gameConfig);

    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot.config).toEqual(defaultRulesConfig());
    const plain = track(Room.restore(snapshot, deps(9)));
    const fromPlain = plain.handle('d', hello({ seat_token: welcomes.p1.seat_token }));
    expect(welcomeOf(fromPlain, 'd').config).toEqual(gameConfig);
    const woken = track(Room.restore(snapshot, deps(9), { wake: true }));
    const fromWoken = woken.handle('e', hello({ seat_token: welcomes.p1.seat_token }));
    expect(welcomeOf(fromWoken, 'e').config).toEqual(gameConfig);
  });

  it('rematch survives restore', () => {
    const table = finishedTable();
    const { driver, welcomes } = table;
    rematched(table);
    driver.step();
    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot).toMatchObject({ game: 1, segment_base: 0, finished_at: null });

    const d = deps(9);
    const restored = track(Room.restore(snapshot, d));
    const back = restored.handle('c', hello({ seat_token: welcomes.p1.seat_token }));
    expect(welcomeOf(back, 'c').game).toBe(1);
    expect(eventsOf(back, 'c')).toMatchObject({ game: 1, from_seq: 0 });

    // A second rematch, after a restore, counts on from the restored index.
    const replay = restored.snapshot().replay!;
    expect(() => verifyReplay(replay)).not.toThrow();
    restored.handle('e', hello({ seat_token: welcomes.p0.seat_token }));
    restored.handle('e', command('resign'));
    restored.handle('e', REMATCH);
    const again = restored.handle('c', REMATCH);
    expect(eventsOf(again, 'c')).toMatchObject({ game: 2, from_seq: 0 });
  });

  it('rematch readiness survives only a waking restore', () => {
    const table = finishedTable();
    table.driver.send('a', REMATCH);
    const snapshot = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot.rematch_ready).toEqual(['p0']);

    const plain = track(Room.restore(snapshot, deps(9)));
    expect(plain.snapshot().rematch_ready).toEqual([]);

    const woken = track(Room.restore(snapshot, deps(9), { wake: true }));
    woken.rebind('a', 'p0');
    woken.rebind('b', 'p1');
    expect(eventsOf(woken.handle('b', REMATCH), 'a').game).toBe(1);
  });

  it('v2 snapshot upgrades with the first game and no rematch', () => {
    const table = finishedTable();
    const {
      pause: _pause,
      game: _game,
      rematch_ready: _ready,
      from_save: _fromSave,
      ...rest
    } = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;
    const v2: RoomSnapshotV2 = { ...rest, version: 2 };
    const restored = track(Room.restore(v2, deps(9)));
    expect(restored.snapshot()).toMatchObject({
      version: 3,
      game: 0,
      rematch_ready: [],
      from_save: null,
    });
  });
});

describe('earlier v3 snapshots', () => {
  it('a v3 snapshot without game, rematch or save fields restores', () => {
    const table = finishedTable();
    const {
      game: _game,
      rematch_ready: _ready,
      from_save: _fromSave,
      ...earlier
    } = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;
    const restored = track(Room.restore(earlier as RoomSnapshot, deps(9)));
    expect(restored.snapshot()).toMatchObject({ game: 0, rematch_ready: [], from_save: null });
    const back = restored.handle('c', hello({ seat_token: table.welcomes.p0.seat_token }));
    expect(welcomeOf(back, 'c').game).toBe(0);
  });
});

describe('rematch bookkeeping', () => {
  it('readiness is kept in seat order and unchanged state is returned as is', () => {
    const one = request([], 'p1');
    expect(one).toEqual(['p1']);
    expect(request(one, 'p1')).toBe(one);
    const two = request(one, 'p0');
    expect(two).toEqual(['p0', 'p1']);
    expect(bothReady(two)).toBe(true);
    expect(bothReady(one)).toBe(false);
    expect(forget(two, 'p0')).toEqual(['p1']);
    expect(forget(one, 'p0')).toBe(one);
  });

  it('the loser is the seat that did not win', () => {
    expect(loserOf({ game_over: { winner: 'p0', reason: 'health' } })).toBe('p1');
    expect(loserOf({ game_over: { winner: 'p1', reason: 'resignation' } })).toBe('p0');
    expect(loserOf('round_over')).toBeNull();
  });
});
