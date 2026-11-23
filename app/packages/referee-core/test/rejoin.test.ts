import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { PROTOCOL_VERSION, encode, type ErrorCode, type ServerMessage } from '@wwd/protocol';
import {
  PIN_LOCK_MS,
  PIN_MAX_FAILURES,
  REJOIN_APPROVAL_TIMEOUT_MS,
  Room,
  generatePin,
  type Outbound,
  type RoomSnapshot,
} from '../src/index.js';
import { FakeClock, FakeRandom, ROOM_CODE, command, deps, hello, to } from './harness.js';

beforeAll(loadEngineForNode);

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function track(room: Room): Room {
  rooms.push(room);
  return room;
}

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

function welcomeOf(out: Outbound[], conn: string): Welcome {
  const welcome = to(out, conn).find((m) => m.type === 'welcome');
  if (welcome?.type !== 'welcome') throw new Error('no welcome');
  return welcome;
}

function rejoin(seat: Seat, pin?: string, lastSeq?: number): string {
  return encode({
    type: 'rejoin',
    protocol_version: PROTOCOL_VERSION,
    room: ROOM_CODE,
    seat,
    ...(pin === undefined ? {} : { pin }),
    ...(lastSeq === undefined ? {} : { last_seq: lastSeq }),
  });
}

function approve(yes: boolean): string {
  return encode({ type: 'approve_rejoin', approve: yes });
}

function errorTo(conn: string, code: ErrorCode, close = false): Outbound {
  const out: Outbound = { conn, msg: { type: 'error', code } };
  return close ? { ...out, close: true } : out;
}

/** A PIN that differs from `pin` in every digit. */
function wrongPin(pin: string): string {
  return [...pin].map((d) => String((Number(d) + 1) % 10)).join('');
}

interface Seated {
  room: Room;
  clock: FakeClock;
  tokens: Record<Seat, string>;
  pins: Record<Seat, string>;
}

/** Seats Ada on `a` and Bo on `b`, starting the game. */
function startedRoom(): Seated {
  const d = deps();
  const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
  const w0 = welcomeOf(room.handle('a', hello({ name: 'Ada' })), 'a');
  d.clock.advance(1000);
  const w1 = welcomeOf(room.handle('b', hello({ name: 'Bo' })), 'b');
  d.clock.advance(1000);
  return {
    room,
    clock: d.clock,
    tokens: { p0: w0.seat_token, p1: w1.seat_token },
    pins: { p0: w0.pin, p1: w1.pin },
  };
}

/** Sends `count` wrong PINs for p0 from `c`, a second apart, and returns the last reply. */
function failPins(s: Seated, count: number): Outbound[] {
  let out: Outbound[] = [];
  for (let n = 0; n < count; n++) {
    s.clock.advance(1000);
    out = s.room.handle('c', rejoin('p0', wrongPin(s.pins.p0)));
  }
  return out;
}

describe('PIN rejoin', () => {
  it('right pin rejoins and supersedes old connection', () => {
    const { room, tokens, pins } = startedRoom();
    const out = room.handle('c', rejoin('p0', pins.p0));

    expect(to(out, 'a')).toEqual([{ type: 'error', code: 'superseded' }]);
    expect(out.find((o) => o.conn === 'a')?.close).toBe(true);

    const mine = to(out, 'c');
    expect(mine.map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    const welcome = welcomeOf(out, 'c');
    expect(welcome.seat).toBe('p0');
    expect(welcome.pin).toBe(pins.p0);
    expect(welcome.seat_token).not.toBe(tokens.p0);
    expect(welcome.seat_token).toMatch(/^[0-9a-f]{32}$/);
    const events = mine[1];
    expect(events?.type === 'events' && events.from_seq).toBe(0);
    expect(out.every((o) => o.conn !== 'c' || o.close === undefined)).toBe(true);

    expect(to(out, 'b')).toEqual([{ type: 'opponent_status', connected: true, name: 'Ada' }]);
    expect(room.snapshot().pins).toEqual([pins.p0, pins.p1]);
    expect(room.handle('c', command('resign'))[0]?.msg.type).not.toBe('error');
  });

  it('old token invalid after rejoin', () => {
    const { room, tokens, pins } = startedRoom();
    const fresh = welcomeOf(room.handle('c', rejoin('p0', pins.p0)), 'c').seat_token;
    room.disconnect('a');

    expect(room.handle('d', hello({ seat_token: tokens.p0 }))).toEqual([
      errorTo('d', 'unknown_seat', true),
    ]);
    expect(welcomeOf(room.handle('e', hello({ seat_token: fresh })), 'e').seat).toBe('p0');
  });

  it('honours last_seq on a rejoin', () => {
    const { room, pins } = startedRoom();
    const out = room.handle('c', rejoin('p0', pins.p0, 1));
    const events = to(out, 'c').find((m) => m.type === 'events');
    expect(events?.type === 'events' && events.from_seq).toBe(1);
  });

  it('wrong pin counts and notifies opponent', () => {
    const s = startedRoom();
    const now = s.clock.now();
    const out = s.room.handle('c', rejoin('p0', wrongPin(s.pins.p0)));

    expect(out).toEqual([
      errorTo('c', 'wrong_pin'),
      {
        conn: 'b',
        msg: { type: 'opponent_status', connected: true, name: 'Ada', pin_attempt_failed: true },
      },
    ]);
    expect(s.room.snapshot().pin_failures).toEqual([[now], []]);

    s.clock.advance(1000);
    expect(welcomeOf(s.room.handle('c', rejoin('p0', s.pins.p0)), 'c').seat).toBe('p0');
    expect(s.room.snapshot().pin_failures).toEqual([[], []]);
  });

  it('pin lockout survives restore', () => {
    const s = startedRoom();
    for (let n = 0; n < PIN_MAX_FAILURES; n++) {
      expect(failPins(s, 1)[0]).toEqual(errorTo('c', 'wrong_pin'));
    }
    const locking = failPins(s, 1);
    const lockedAt = s.clock.now();
    expect(locking[0]).toEqual(errorTo('c', 'pin_locked'));
    expect(to(locking, 'b')).toEqual([
      { type: 'opponent_status', connected: true, name: 'Ada', pin_attempt_failed: true },
    ]);
    expect(s.room.snapshot().pin_locked_until).toEqual([lockedAt + PIN_LOCK_MS, null]);

    expect(s.room.handle('c', rejoin('p0', s.pins.p0))).toEqual([errorTo('c', 'pin_locked')]);

    const snapshot = JSON.parse(JSON.stringify(s.room.snapshot())) as RoomSnapshot;
    const d = { clock: new FakeClock(s.clock.now() + 1000), random: new FakeRandom(3) };
    const restored = track(Room.restore(snapshot, d));
    expect(restored.handle('c', rejoin('p0', s.pins.p0))).toEqual([errorTo('c', 'pin_locked')]);
    expect(restored.snapshot().pin_locked_until).toEqual([lockedAt + PIN_LOCK_MS, null]);
  });

  it('lock expires after PIN_LOCK_MS via tick', () => {
    const s = startedRoom();
    const activity = s.room.lastActivityAt;
    failPins(s, PIN_MAX_FAILURES + 1);
    expect(s.room.lastActivityAt).toBe(activity);
    const unlockAt = s.clock.now() + PIN_LOCK_MS;
    expect(s.room.nextDeadline()).toBe(unlockAt);

    s.clock.time = unlockAt - 1;
    expect(s.room.tick()).toEqual([]);
    expect(s.room.snapshot().pin_locked_until).toEqual([unlockAt, null]);

    s.clock.time = unlockAt;
    expect(s.room.tick()).toEqual([]);
    expect(s.room.snapshot().pin_locked_until).toEqual([null, null]);
    expect(s.room.snapshot().pin_failures).toEqual([[], []]);
    expect(s.room.lastActivityAt).toBe(activity);
    expect(s.room.nextDeadline()).toBeNull();
    expect(welcomeOf(s.room.handle('c', rejoin('p0', s.pins.p0)), 'c').seat).toBe('p0');
  });

  it('failures older than the window do not count towards the lock', () => {
    const s = startedRoom();
    failPins(s, PIN_MAX_FAILURES);
    s.clock.advance(PIN_LOCK_MS);
    expect(failPins(s, 1)[0]).toEqual(errorTo('c', 'wrong_pin'));
    expect(s.room.snapshot().pin_failures[0]).toHaveLength(1);
    expect(s.room.snapshot().pin_locked_until).toEqual([null, null]);
  });

  it('rejoins a claimed seat before the game starts', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    const pin = welcomeOf(room.handle('a', hello()), 'a').pin;
    const out = room.handle('c', rejoin('p0', pin));
    expect(to(out, 'a')).toEqual([{ type: 'error', code: 'superseded' }]);
    expect(to(out, 'c').map((m) => m.type)).toEqual(['welcome', 'waiting']);
  });

  it('a rejoin for an unclaimed seat is unavailable', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    room.handle('a', hello());
    expect(room.handle('c', rejoin('p1', '1234'))).toEqual([
      errorTo('c', 'rejoin_unavailable', true),
    ]);
  });

  it('a connection holding a seat cannot rejoin', () => {
    const { room, pins } = startedRoom();
    expect(room.handle('b', rejoin('p0', pins.p0))).toEqual([errorTo('b', 'invalid_message')]);
  });

  it('checks the room code of a rejoin', () => {
    const { room, pins } = startedRoom();
    const raw = encode({
      type: 'rejoin',
      protocol_version: PROTOCOL_VERSION,
      room: 'ZZZZZZ',
      seat: 'p0',
      pin: pins.p0,
    });
    expect(room.handle('c', raw)).toEqual([errorTo('c', 'unknown_room', true)]);
  });

  it('the rate limit applies to rejoin attempts', () => {
    const { room, pins } = startedRoom();
    for (let n = 0; n < 30; n++) room.handle('c', rejoin('p0', wrongPin(pins.p0)));
    expect(room.handle('c', rejoin('p0', pins.p0))).toEqual([errorTo('c', 'rate_limited')]);
  });
});

describe('rejoin by opponent approval', () => {
  function requested(): Seated & { deadline: number } {
    const s = startedRoom();
    s.room.disconnect('a');
    const deadline = s.clock.now() + REJOIN_APPROVAL_TIMEOUT_MS;
    const out = s.room.handle('c', rejoin('p0'));
    expect(out).toEqual([
      { conn: 'c', msg: { type: 'rejoin_pending' } },
      {
        conn: 'b',
        msg: { type: 'rejoin_request', deadline, remaining_ms: REJOIN_APPROVAL_TIMEOUT_MS },
      },
    ]);
    return { ...s, deadline };
  }

  it('approval flow grants seat', () => {
    const { room, clock, tokens, pins, deadline } = requested();
    expect(room.nextDeadline()).toBe(deadline);
    expect(room.handle('c', command('resign'))).toEqual([errorTo('c', 'not_joined')]);
    expect(room.handle('c', '{"type":"ping"}')).toEqual([{ conn: 'c', msg: { type: 'pong' } }]);
    expect(room.snapshot().pending_rejoin).toEqual({ conn: 'c', seat: 'p0', deadline });

    clock.advance(1000);
    const out = room.handle('b', approve(true));
    expect(to(out, 'c').map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);
    const welcome = welcomeOf(out, 'c');
    expect(welcome.seat).toBe('p0');
    expect(welcome.pin).toBe(pins.p0);
    expect(welcome.seat_token).not.toBe(tokens.p0);
    expect(to(out, 'b')).toEqual([{ type: 'opponent_status', connected: true, name: 'Ada' }]);
    expect(room.snapshot().disconnected_at).toEqual([null, null]);
    expect(room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
  });

  it('a request for a connected seat is refused', () => {
    const { room } = startedRoom();
    expect(room.handle('c', rejoin('p0'))).toEqual([errorTo('c', 'rejoin_unavailable', true)]);
    expect(room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
    expect(room.handle('a', '{"type":"ping"}')).toEqual([{ conn: 'a', msg: { type: 'pong' } }]);
  });

  it('a player cannot take over the connected opponent seat by approving itself', () => {
    const { room } = startedRoom();
    // Seat p1 on `b` asks for the live seat p0 from a second connection, then approves it.
    const asked = room.handle('b2', rejoin('p0'));
    expect(asked).toEqual([errorTo('b2', 'rejoin_unavailable', true)]);
    const answered = room.handle('b', approve(true));
    expect(answered).toEqual([errorTo('b', 'invalid_message')]);
    expect([...asked, ...answered].some((o) => o.conn === 'a')).toBe(false);
    expect(room.handle('b2', command('resign'))).toEqual([errorTo('b2', 'not_joined')]);
  });

  it('the seat being rejoined cannot approve its own replacement', () => {
    const { room, tokens } = requested();
    const back = room.handle('a2', hello({ seat_token: tokens.p0 }));
    expect(back[0]).toEqual(errorTo('c', 'rejoin_unavailable', true));
    expect(room.handle('a2', approve(true))).toEqual([errorTo('a2', 'invalid_message')]);
  });

  it('reclaiming the seat by token withdraws the request', () => {
    const { room, tokens } = requested();
    const out = room.handle('a2', hello({ seat_token: tokens.p0 }));
    expect(to(out, 'c')).toEqual([{ type: 'error', code: 'rejoin_unavailable' }]);
    expect(to(out, 'b')).toContainEqual({ type: 'rejoin_withdrawn' });
    expect(welcomeOf(out, 'a2').seat).toBe('p0');
    expect(room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
    expect(room.nextDeadline()).toBeNull();
  });

  it('reclaiming the seat by PIN withdraws the request', () => {
    const { room, pins } = requested();
    const out = room.handle('d', rejoin('p0', pins.p0));
    expect(out[0]).toEqual(errorTo('c', 'rejoin_unavailable', true));
    expect(to(out, 'b')).toContainEqual({ type: 'rejoin_withdrawn' });
    expect(welcomeOf(out, 'd').seat).toBe('p0');
    expect(room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
  });

  it('decline and timeout close the rejoiner', () => {
    const declined = requested();
    expect(declined.room.handle('b', approve(false))).toEqual([
      errorTo('c', 'rejoin_declined', true),
    ]);
    expect(declined.room.nextDeadline()).not.toBe(declined.deadline);
    expect(declined.room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);

    const timed = requested();
    const activity = timed.room.lastActivityAt;
    timed.clock.time = timed.deadline - 1;
    expect(timed.room.tick()).toEqual([]);
    timed.clock.time = timed.deadline;
    expect(timed.room.tick()).toEqual([
      errorTo('c', 'rejoin_declined', true),
      { conn: 'b', msg: { type: 'rejoin_withdrawn' } },
    ]);
    expect(timed.room.lastActivityAt).toBe(activity);
    expect(timed.room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
  });

  it('an approval after the deadline declines', () => {
    const { room, clock, deadline } = requested();
    clock.time = deadline;
    expect(room.handle('b', approve(true))).toEqual([errorTo('c', 'rejoin_declined', true)]);
  });

  it('no opponent means rejoin_unavailable', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    room.handle('a', hello());
    room.disconnect('a');
    expect(room.handle('c', rejoin('p0'))).toEqual([errorTo('c', 'rejoin_unavailable', true)]);

    const s = startedRoom();
    s.room.disconnect('a');
    s.room.disconnect('b');
    expect(s.room.handle('c', rejoin('p0'))).toEqual([errorTo('c', 'rejoin_unavailable', true)]);
  });

  it('only one request may be pending', () => {
    const { room } = requested();
    expect(room.handle('d', rejoin('p0'))).toEqual([errorTo('d', 'rejoin_unavailable', true)]);
    expect(welcomeOf(room.handle('b', approve(true)), 'c').seat).toBe('p0');
  });

  it('the opponent leaving makes the request unavailable', () => {
    const { room } = requested();
    const out = room.disconnect('b');
    expect(out).toEqual([errorTo('c', 'rejoin_unavailable', true)]);
    expect(room.handle('c', command('resign'))[0]).toEqual(errorTo('c', 'not_joined'));
  });

  it('the rejoiner leaving clears the request', () => {
    const { room } = requested();
    const activity = room.lastActivityAt;
    expect(room.disconnect('c')).toEqual([{ conn: 'b', msg: { type: 'rejoin_withdrawn' } }]);
    expect(room.lastActivityAt).toBe(activity);
    expect(room.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
    expect(room.handle('d', rejoin('p0'))[0]).toEqual({
      conn: 'd',
      msg: { type: 'rejoin_pending' },
    });
  });

  it('an approver that continues on a new connection is asked again there', () => {
    const { room, clock, tokens, deadline } = requested();
    clock.advance(30_000);
    const out = room.handle('b2', hello({ seat_token: tokens.p1 }));
    expect(to(out, 'b')).toEqual([{ type: 'error', code: 'superseded' }]);
    expect(to(out, 'b2')).toContainEqual({
      type: 'rejoin_request',
      deadline,
      remaining_ms: REJOIN_APPROVAL_TIMEOUT_MS - 30_000,
    });
    expect(to(out, 'c')).toEqual([]);
    expect(welcomeOf(room.handle('b2', approve(true)), 'c').seat).toBe('p0');
  });

  it('an approver rebound to a new connection is asked again there', () => {
    const { room, deadline } = requested();
    const out = room.rebind('b2', 'p1');
    expect(to(out, 'b2')).toEqual([
      { type: 'rejoin_request', deadline, remaining_ms: REJOIN_APPROVAL_TIMEOUT_MS },
    ]);
    expect(welcomeOf(room.handle('b2', approve(true)), 'c').seat).toBe('p0');
  });

  it('only the seated opponent may answer', () => {
    const { room } = requested();
    expect(room.handle('z', approve(true))).toEqual([errorTo('z', 'not_joined')]);
    expect(welcomeOf(room.handle('b', approve(true)), 'c').seat).toBe('p0');
  });

  it('a request does not count as room activity', () => {
    const s = startedRoom();
    s.room.disconnect('a');
    const activity = s.room.lastActivityAt;
    s.clock.advance(1000);
    s.room.handle('c', rejoin('p0'));
    expect(s.room.lastActivityAt).toBe(activity);
  });

  it('a pending request does not survive restore', () => {
    const { room, deadline } = requested();
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;
    expect(snapshot.pending_rejoin).toEqual({ conn: 'c', seat: 'p0', deadline });
    const d = { clock: new FakeClock(deadline - 10_000), random: new FakeRandom(5) };
    const restored = track(Room.restore(snapshot, d));
    expect(restored.nextDeadline()).not.toBe(deadline);
    restored.rebind('b', 'p1');
    expect(restored.handle('b', approve(true))).toEqual([errorTo('b', 'invalid_message')]);
    expect(restored.handle('c', rejoin('p0'))[0]).toEqual({
      conn: 'c',
      msg: { type: 'rejoin_pending' },
    });
  });

  it('a pending request survives a waking restore', () => {
    const { room, deadline } = requested();
    const revision = room.revision;
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as RoomSnapshot;
    expect(revision).toBeGreaterThan(0);
    const d = { clock: new FakeClock(deadline - 10_000), random: new FakeRandom(5) };
    const restored = track(Room.restore(snapshot, d, { wake: true }));
    expect(restored.nextDeadline()).toBe(deadline);
    restored.rebind('b', 'p1');
    expect(welcomeOf(restored.handle('b', approve(true)), 'c').seat).toBe('p0');
    expect(restored.snapshot().pending_rejoin).toBeUndefined();
  });

  it('a woken request past its deadline is declined by tick', () => {
    const { room, deadline } = requested();
    const snapshot = room.snapshot();
    const d = { clock: new FakeClock(deadline + 1), random: new FakeRandom(5) };
    const restored = track(Room.restore(snapshot, d, { wake: true }));
    restored.rebind('b', 'p1');
    expect(restored.tick()).toContainEqual(errorTo('c', 'rejoin_declined', true));
  });

  it('creating and answering a request changes the revision', () => {
    const { room } = requested();
    const asked = room.revision;
    room.handle('b', approve(false));
    expect(room.revision).toBeGreaterThan(asked);
  });
});

describe('seat PINs', () => {
  it('pins are 4 digits and uniform enough', () => {
    const random = new FakeRandom(0x1234567);
    const samples = 10_000;
    const counts = Array.from({ length: 4 }, () => new Array<number>(10).fill(0));
    for (let n = 0; n < samples; n++) {
      const pin = generatePin(random);
      expect(pin).toMatch(/^[0-9]{4}$/);
      for (let p = 0; p < 4; p++) counts[p]![Number(pin[p])]!++;
    }
    const expected = samples / 10;
    for (const position of counts) {
      for (const count of position) {
        expect(Math.abs(count - expected)).toBeLessThanOrEqual(expected * 0.15);
      }
    }
  });
});
