import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig, verifyReplay, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, type ServerMessage } from '@wwd/protocol';
import {
  Room,
  generatePin,
  type Outbound,
  type Random,
  type RoomOptions,
  type RoomSnapshot,
  type RoomSnapshotV1,
} from '../src/index.js';
import {
  FakeClock,
  FakeRandom,
  ROOM_CODE,
  command,
  deps,
  hello,
  to,
  type EventsMessage,
  type GameOverMessage,
} from './harness.js';

beforeAll(loadEngineForNode);

const GRACE_MS = 600_000;
const CLAIM_WIN = encode({ type: 'claim_win' });

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function track(room: Room): Room {
  rooms.push(room);
  return room;
}

function newRoom(options?: Partial<RoomOptions>): { room: Room; clock: FakeClock } {
  const d = deps();
  return { room: track(Room.create(ROOM_CODE, defaultRulesConfig(), d, options)), clock: d.clock };
}

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

function welcomeOf(out: Outbound[], conn: string): Welcome {
  const welcome = to(out, conn).find((m) => m.type === 'welcome');
  if (welcome?.type !== 'welcome') throw new Error('no welcome');
  return welcome;
}

/** Seats Ada on `a` and Bo on `b`, starting the game. */
function startedRoom(options?: Partial<RoomOptions>): {
  room: Room;
  clock: FakeClock;
  tokens: Record<Seat, string>;
  pins: Record<Seat, string>;
} {
  const { room, clock } = newRoom(options);
  const w0 = welcomeOf(room.handle('a', hello({ name: 'Ada' })), 'a');
  clock.advance(1000);
  const w1 = welcomeOf(room.handle('b', hello({ name: 'Bo' })), 'b');
  clock.advance(1000);
  return {
    room,
    clock,
    tokens: { p0: w0.seat_token, p1: w1.seat_token },
    pins: { p0: w0.pin, p1: w1.pin },
  };
}

function singleError(out: Outbound[], conn: string, code: string): void {
  expect(out).toEqual([{ conn, msg: { type: 'error', code } }]);
}

function gameOverOf(out: Outbound[], conn: string): GameOverMessage {
  const over = to(out, conn).find((m) => m.type === 'game_over');
  if (over?.type !== 'game_over') throw new Error('no game_over');
  return over;
}

function eventsOf(out: Outbound[], conn: string): EventsMessage {
  const events = to(out, conn).find((m) => m.type === 'events');
  if (events?.type !== 'events') throw new Error('no events');
  return events;
}

/** Checks that `conn` was told its opponent resigned and that it has won. */
function expectResignation(out: Outbound[], conn: string, resigned: Seat): void {
  const winner: Seat = resigned === 'p0' ? 'p1' : 'p0';
  const kinds = eventsOf(out, conn).events.map(([, ev]) => ev.kind);
  expect(kinds).toContainEqual({ resigned: { seat: resigned } });
  expect(kinds).toContainEqual({ game_over: { winner, reason: 'resignation' } });
  expect(() => verifyReplay(gameOverOf(out, conn).replay)).not.toThrow();
}

/** A `Random` that replays a fixed byte sequence. */
class ScriptedRandom implements Random {
  private next = 0;
  constructor(private readonly script: number[]) {}
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.script[this.next++]!;
    return out;
  }
}

describe('grace windows', () => {
  it('disconnect starts grace and notifies opponent', () => {
    const { room, clock } = startedRoom();
    const now = clock.now();
    expect(room.disconnect('a')).toEqual([
      {
        conn: 'b',
        msg: {
          type: 'opponent_status',
          connected: false,
          name: 'Ada',
          grace_deadline: now + GRACE_MS,
          grace_remaining_ms: GRACE_MS,
        },
      },
    ]);
    expect(room.snapshot().disconnected_at).toEqual([now, null]);
    expect(room.lastActivityAt).toBe(now);
  });

  it('a disconnect before the game starts has no grace', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    expect(room.disconnect('a')).toEqual([]);
    expect(room.snapshot().disconnected_at).toEqual([null, null]);
    expect(room.nextDeadline()).toBeNull();
  });

  it('a game that starts without one seat connected starts its grace', () => {
    const { room, clock } = newRoom();
    room.handle('a', hello());
    room.disconnect('a');
    clock.advance(1000);
    const out = room.handle('b', hello());
    expect(to(out, 'b').at(-1)).toEqual({
      type: 'opponent_status',
      connected: false,
      grace_deadline: clock.now() + GRACE_MS,
      grace_remaining_ms: GRACE_MS,
    });
    expect(room.nextDeadline()).toBe(clock.now() + GRACE_MS);
  });

  it('tick after deadline offers claim', () => {
    const { room, clock } = startedRoom();
    room.disconnect('a');
    clock.advance(GRACE_MS - 1);
    expect(room.tick()).toEqual([]);
    clock.advance(1);
    expect(room.tick()).toEqual([
      {
        conn: 'b',
        msg: { type: 'opponent_status', connected: false, name: 'Ada', can_claim_win: true },
      },
    ]);
    expect(room.lastActivityAt).toBe(clock.now());
    expect(room.tick()).toEqual([]);
    expect(room.nextDeadline()).toBeNull();
  });

  it('reconnect cancels grace', () => {
    const { room, clock, tokens } = startedRoom();
    room.disconnect('a');
    clock.advance(GRACE_MS / 2);
    const out = room.handle('c', hello({ seat_token: tokens.p0 }));
    expect(to(out, 'b')).toEqual([{ type: 'opponent_status', connected: true, name: 'Ada' }]);
    expect(room.snapshot().disconnected_at).toEqual([null, null]);
    expect(room.nextDeadline()).toBeNull();
    clock.advance(GRACE_MS);
    expect(room.tick()).toEqual([]);
    singleError(room.handle('b', CLAIM_WIN), 'b', 'not_expired');
  });

  it('a seat that resumes during its opponent grace sees the deadline', () => {
    const { room, clock, tokens } = startedRoom();
    const deadline = clock.now() + GRACE_MS;
    room.disconnect('a');
    room.disconnect('b');
    clock.advance(1000);
    const out = room.handle('d', hello({ seat_token: tokens.p1 }));
    expect(to(out, 'd').at(-1)).toEqual({
      type: 'opponent_status',
      connected: false,
      name: 'Ada',
      grace_deadline: deadline,
      grace_remaining_ms: deadline - clock.now(),
    });
    clock.advance(GRACE_MS);
    const late = room.handle('e', hello({ seat_token: tokens.p1 }));
    expect(to(late, 'e').at(-1)).toEqual({
      type: 'opponent_status',
      connected: false,
      name: 'Ada',
      can_claim_win: true,
    });
  });

  it('nextDeadline reflects grace', () => {
    const { room, clock, tokens } = startedRoom();
    expect(room.nextDeadline()).toBeNull();
    const first = clock.now();
    room.disconnect('a');
    expect(room.nextDeadline()).toBe(first + GRACE_MS);
    clock.advance(1000);
    room.disconnect('b');
    expect(room.nextDeadline()).toBe(first + GRACE_MS);
    clock.advance(GRACE_MS - 1000);
    room.tick();
    expect(room.nextDeadline()).toBe(first + 1000 + GRACE_MS);
    room.handle('d', hello({ seat_token: tokens.p1 }));
    expect(room.nextDeadline()).toBeNull();
  });

  it('a custom grace period is used', () => {
    const { room, clock } = startedRoom({ graceMs: 5000 });
    room.disconnect('a');
    expect(room.nextDeadline()).toBe(clock.now() + 5000);
    expect(room.snapshot().grace_ms).toBe(5000);
    expect(() => Room.create(ROOM_CODE, defaultRulesConfig(), deps(), { graceMs: -1 })).toThrow();
  });
});

describe('claim win and resign', () => {
  it('claim win only after grace', () => {
    const { room, clock, tokens } = startedRoom();
    singleError(room.handle('b', CLAIM_WIN), 'b', 'not_expired');
    room.disconnect('a');
    singleError(room.handle('b', CLAIM_WIN), 'b', 'not_expired');
    clock.advance(GRACE_MS - 1);
    singleError(room.handle('b', CLAIM_WIN), 'b', 'not_expired');
    singleError(room.handle('z', CLAIM_WIN), 'z', 'not_joined');

    clock.advance(1);
    const out = room.handle('b', CLAIM_WIN);
    expect(to(out, 'b').map((m) => m.type)).toEqual(['events', 'game_over']);
    expectResignation(out, 'b', 'p0');
    expect(room.finishedAt).toBe(clock.now());
    expect(room.snapshot().finished_at).toBe(clock.now());
    expect(room.nextDeadline()).toBeNull();
    singleError(room.handle('b', CLAIM_WIN), 'b', 'error-game-over');

    clock.advance(1000);
    const back = room.handle('c', hello({ seat_token: tokens.p0, last_seq: 0 }));
    expect(to(back, 'c').map((m) => m.type)).toEqual([
      'welcome',
      'events',
      'game_over',
      'opponent_status',
    ]);
    expectResignation(back, 'c', 'p0');
    expect(room.finishedAt).toBe(clock.now() - 1000);
  });

  it('claim win before the game starts is not expired', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    singleError(room.handle('a', CLAIM_WIN), 'a', 'not_expired');
  });

  it('resign via command ends game and replay verifies', () => {
    const { room, clock } = startedRoom();
    expect(room.finishedAt).toBeNull();
    const out = room.handle('a', command('resign'));
    expectResignation(out, 'a', 'p0');
    expectResignation(out, 'b', 'p0');
    expect(eventsOf(out, 'b').legal).toEqual([]);
    expect(room.finishedAt).toBe(clock.now());
    singleError(room.handle('b', command('resign')), 'b', 'error-game-over');
  });

  it('resign is accepted though never offered as legal', () => {
    const { room, tokens } = startedRoom();
    for (const seat of ['p0', 'p1'] as const) {
      const out = room.handle(`r${seat}`, hello({ seat_token: tokens[seat] }));
      expect(eventsOf(out, `r${seat}`).legal).not.toContain('resign');
    }
    const resigned = room.handle('rp1', command('resign'));
    expectResignation(resigned, 'rp0', 'p1');
  });
});

describe('unknown tokens', () => {
  it('unknown token never claims a seat', () => {
    const unknown = hello({ seat_token: 'ff'.repeat(16) });
    const refusal = (conn: string): Outbound[] => [
      { conn, msg: { type: 'error', code: 'unknown_seat' }, close: true },
    ];
    const { room } = newRoom();
    for (const seated of [0, 1, 2]) {
      const before = JSON.stringify(room.snapshot());
      expect(room.handle('z', unknown)).toEqual(refusal('z'));
      expect(JSON.stringify(room.snapshot())).toBe(before);
      if (seated < 2) room.handle(`s${seated}`, hello());
    }
    expect(room.snapshot().seats.every((s) => s !== null)).toBe(true);
  });

  it('a hello without a token still claims a free seat after an unknown token', () => {
    const { room } = newRoom();
    room.handle('z', hello({ seat_token: 'ff'.repeat(16) }));
    expect(welcomeOf(room.handle('z', hello()), 'z').seat).toBe('p0');
  });
});

describe('seat PINs', () => {
  it('each seat gets a 4-digit PIN that every welcome repeats', () => {
    const { room, tokens, pins } = startedRoom();
    for (const seat of ['p0', 'p1'] as const) expect(pins[seat]).toMatch(/^[0-9]{4}$/);
    expect(room.snapshot().pins).toEqual([pins.p0, pins.p1]);
    expect(welcomeOf(room.handle('c', hello({ seat_token: tokens.p1 })), 'c').pin).toBe(pins.p1);
  });

  it('a PIN is drawn without modulo bias', () => {
    expect(generatePin(new ScriptedRandom([255, 7, 250, 1, 2, 249, 3]))).toBe('7129');
    const counts = new Array<number>(10).fill(0);
    const random = new FakeRandom(42);
    for (let i = 0; i < 5000; i++) {
      for (const digit of generatePin(random)) counts[Number(digit)]!++;
    }
    for (const count of counts) expect(count).toBeGreaterThan(1800);
  });
});

describe('room snapshots v2', () => {
  function toV1(snapshot: RoomSnapshot): RoomSnapshotV1 {
    const { code, config, seats, replay, segment_base } = snapshot;
    return { version: 1, code, config, seats, replay, segment_base };
  }

  it('v1 snapshot migrates', () => {
    const { room, tokens } = startedRoom();
    const v1 = toV1(JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot);
    const d = deps(7);
    d.clock.time = 5_000_000;
    const restored = track(Room.restore(v1, d));
    expect(restored.snapshot()).toMatchObject({
      version: 2,
      grace_ms: GRACE_MS,
      disconnected_at: [5_000_000, 5_000_000],
      pins: [null, null],
      pin_failures: [[], []],
      pin_locked_until: [null, null],
      last_activity_at: 5_000_000,
      finished_at: null,
    });
    expect(restored.lastActivityAt).toBe(5_000_000);

    const pin = welcomeOf(restored.handle('c', hello({ seat_token: tokens.p0 })), 'c').pin;
    expect(pin).toMatch(/^[0-9]{4}$/);
    expect(restored.snapshot().pins).toEqual([pin, null]);
    expect(welcomeOf(restored.handle('e', hello({ seat_token: tokens.p0 })), 'e').pin).toBe(pin);
  });

  it('a finished v1 snapshot migrates as finished', () => {
    const { room } = startedRoom();
    room.handle('a', command('resign'));
    const d = deps(7);
    const restored = track(Room.restore(toV1(room.snapshot()), d));
    expect(restored.finishedAt).toBe(d.clock.now());
  });

  /** Restores `snapshot` at `at`, resumes Bo alone, and checks a claim only after a full window. */
  function claimsAfterRestore(
    snapshot: RoomSnapshot | RoomSnapshotV1,
    at: number,
    graceMs: number,
    p1Token: string,
  ): Room {
    const d = deps(7);
    d.clock.time = at;
    const restored = track(Room.restore(snapshot, d));
    expect(restored.snapshot().disconnected_at).toEqual([at, at]);
    expect(restored.nextDeadline()).toBe(at + graceMs);
    restored.handle('d', hello({ seat_token: p1Token }));
    expect(restored.snapshot().disconnected_at).toEqual([at, null]);
    singleError(restored.handle('d', CLAIM_WIN), 'd', 'not_expired');
    d.clock.time = at + graceMs - 1;
    singleError(restored.handle('d', CLAIM_WIN), 'd', 'not_expired');
    d.clock.time = at + graceMs;
    expectResignation(restored.handle('d', CLAIM_WIN), 'd', 'p0');
    return restored;
  }

  it('grace state survives snapshot/restore', () => {
    const { room, clock, pins, tokens } = startedRoom({ graceMs: 30_000 });
    room.disconnect('a');
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;
    expect(snapshot.version).toBe(2);
    expect(snapshot.disconnected_at).toEqual([clock.now(), null]);
    room.dispose();

    const restored = claimsAfterRestore(snapshot, clock.now() + 10_000, 30_000, tokens.p1);
    expect(restored.snapshot().grace_ms).toBe(30_000);
    expect(restored.snapshot().pins).toEqual([pins.p0, pins.p1]);
  });

  it('a restore with both seats connected starts grace for both', () => {
    const { room, clock, tokens } = startedRoom();
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;
    expect(snapshot.disconnected_at).toEqual([null, null]);
    claimsAfterRestore(snapshot, clock.now() + 5000, GRACE_MS, tokens.p1);
  });

  it('a restored v1 game starts grace for both seats', () => {
    const { room, clock, tokens } = startedRoom();
    claimsAfterRestore(toV1(room.snapshot()), clock.now() + 5000, GRACE_MS, tokens.p1);
  });

  it('a deadline that passed before restore gets a fresh window', () => {
    const { room, clock, tokens } = startedRoom();
    room.disconnect('a');
    const snapshot = room.snapshot();
    claimsAfterRestore(snapshot, clock.now() + 2 * GRACE_MS, GRACE_MS, tokens.p1);
  });

  it('a waking restore keeps grace deadlines', () => {
    const { room, clock } = startedRoom();
    room.disconnect('a');
    const at = clock.now();
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;
    const d = deps(7);
    d.clock.time = at + GRACE_MS + 5000;
    const woken = track(Room.restore(snapshot, d, { wake: true }));
    expect(woken.snapshot().disconnected_at[0]).toBe(at);
    expect(woken.nextDeadline()).toBe(at + GRACE_MS);
    woken.rebind('b', 'p1');
    expect(woken.snapshot().disconnected_at).toEqual([at, null]);
    const announced = to(woken.tick(), 'b').find((m) => m.type === 'opponent_status');
    expect(announced).toMatchObject({ can_claim_win: true });
    expect(woken.tick()).toEqual([]);
    expectResignation(woken.handle('b', CLAIM_WIN), 'b', 'p0');
  });

  it('a waking restore starts grace only for a seat stored as connected', () => {
    const { room, clock } = startedRoom();
    room.disconnect('a');
    const at = clock.now();
    const snapshot = room.snapshot();
    const d = deps(7);
    d.clock.time = at + 1000;
    const woken = track(Room.restore(snapshot, d, { wake: true }));
    expect(woken.snapshot().disconnected_at).toEqual([at, at + 1000]);
  });

  it('an announced grace is not announced again after a waking restore', () => {
    const { room, clock } = startedRoom();
    room.disconnect('a');
    clock.advance(GRACE_MS);
    expect(to(room.tick(), 'b').at(-1)).toMatchObject({ can_claim_win: true });
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;

    const wake = (s: RoomSnapshot): Room => {
      const d = deps(7);
      d.clock.time = clock.now() + 5000;
      const woken = track(Room.restore(s, d, { wake: true }));
      woken.rebind('b', 'p1');
      return woken;
    };
    const woken = wake(snapshot);
    const revision = woken.revision;
    const activity = woken.lastActivityAt;
    expect(woken.nextDeadline()).toBeNull();
    expect(woken.tick()).toEqual([]);
    expect(woken.revision).toBe(revision);
    expect(woken.lastActivityAt).toBe(activity);
    expect(woken.snapshot().grace_announced).toEqual([true, false]);

    // A snapshot without the field counts the grace as not yet announced.
    const { grace_announced: _announced, ...older } = snapshot;
    const announced = to(wake(older).tick(), 'b').find((m) => m.type === 'opponent_status');
    expect(announced).toMatchObject({ can_claim_win: true });
  });

  it('a default restore refreshes grace deadlines', () => {
    const { room, clock } = startedRoom();
    room.disconnect('a');
    const snapshot = room.snapshot();
    const d = deps(7);
    d.clock.time = clock.now() + 1000;
    const restored = track(Room.restore(snapshot, d));
    expect(restored.nextDeadline()).toBe(clock.now() + 1000 + GRACE_MS);
  });

  it('a restored finished game starts no grace', () => {
    const { room } = startedRoom();
    room.handle('a', command('resign'));
    const restored = track(Room.restore(room.snapshot(), deps(7)));
    expect(restored.snapshot().disconnected_at).toEqual([null, null]);
    expect(restored.nextDeadline()).toBeNull();
  });

  it('a status that offers the claim is not repeated by tick', () => {
    const { room, clock, tokens } = startedRoom();
    room.disconnect('a');
    room.disconnect('b');
    clock.advance(GRACE_MS);
    const out = room.handle('d', hello({ seat_token: tokens.p1 }));
    expect(to(out, 'd').at(-1)).toMatchObject({ can_claim_win: true });
    expect(room.tick()).toEqual([]);
  });

  it('restore rejects an unknown snapshot version', () => {
    const { room } = newRoom();
    const snapshot = { ...room.snapshot(), version: 3 } as unknown as RoomSnapshot;
    expect(() => Room.restore(snapshot, deps())).toThrow();
  });
});

describe('activity', () => {
  it('lastActivityAt moves only when room state changes', () => {
    const { room, clock } = newRoom();
    const created = clock.now();
    expect(room.lastActivityAt).toBe(created);
    expect(room.finishedAt).toBeNull();
    clock.advance(1000);
    room.handle('a', '{"type":"ping"}');
    room.handle('a', '{');
    expect(room.lastActivityAt).toBe(created);
    room.handle('a', hello());
    expect(room.lastActivityAt).toBe(clock.now());
    expect(room.snapshot().last_activity_at).toBe(clock.now());
  });
});
