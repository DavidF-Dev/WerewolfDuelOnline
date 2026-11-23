import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig, verifyReplay, type Event, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode, saveHash, type SaveFile, type ServerMessage } from '@wwd/protocol';
import { Room, type Outbound, type RoomSnapshot, type RoomSnapshotV2 } from '../src/index.js';
import { NOT_PAUSED, applied, bothReady, ready, request, unready } from '../src/pause.js';
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

const GRACE_MS = 600_000;
const PAUSE_REQUEST = encode({ type: 'pause_request' });
const PAUSE_ACCEPT = encode({ type: 'pause_accept' });
const PAUSE_CANCEL = encode({ type: 'pause_cancel' });
const RESUME_REQUEST = encode({ type: 'resume_request' });
const CLAIM_WIN = encode({ type: 'claim_win' });

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function track(room: Room): Room {
  rooms.push(room);
  return room;
}

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type Paused = Extract<ServerMessage, { type: 'paused' }>;

interface Table {
  driver: Driver;
  clock: FakeClock;
  tokens: Record<Seat, string>;
}

/** Seats Ada on `a` and Bo on `b`, starting the game. */
function startedTable(): Table {
  const d = deps();
  const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
  const driver = new Driver(room, d.clock, 'a', 'b');
  const welcome = (out: Outbound[], conn: string): Welcome => {
    const msg = to(out, conn).find((m) => m.type === 'welcome');
    if (msg?.type !== 'welcome') throw new Error('no welcome');
    return msg;
  };
  const w0 = welcome(driver.send('a', hello({ name: 'Ada' })), 'a');
  const w1 = welcome(driver.send('b', hello({ name: 'Bo' })), 'b');
  return { driver, clock: d.clock, tokens: { p0: w0.seat_token, p1: w1.seat_token } };
}

function atRoundOver(driver: Driver): void {
  driver.playUntil(() => driver.view('p0').phase === 'round_over');
}

function pauseStatus(requested_by: Seat | null, agreed: boolean): ServerMessage {
  return { type: 'pause_status', requested_by, agreed };
}

function bothGet(out: Outbound[], msg: ServerMessage): void {
  expect(to(out, 'a')).toContainEqual(msg);
  expect(to(out, 'b')).toContainEqual(msg);
}

function pausedOf(out: Outbound[], conn: string): Paused | undefined {
  return to(out, conn).find((m): m is Paused => m.type === 'paused');
}

/** Agrees a pause at the current round over; returns the save both seats were sent. */
function pauseNow(table: Table): SaveFile {
  atRoundOver(table.driver);
  table.driver.send('a', PAUSE_REQUEST);
  const out = table.driver.send('b', PAUSE_ACCEPT);
  const save = pausedOf(out, 'a')?.save;
  if (save === undefined) throw new Error('no pause');
  expect(pausedOf(out, 'b')?.save).toEqual(save);
  return save;
}

function kinds(events: EventsMessage): string[] {
  return events.events.map(([, ev]) => Object.keys(ev.kind)[0]!);
}

function eventsOf(out: Outbound[], conn: string): EventsMessage {
  const events = to(out, conn).find((m): m is EventsMessage => m.type === 'events');
  if (events === undefined) throw new Error('no events');
  return events;
}

function singleError(out: Outbound[], conn: string, code: string): void {
  expect(out).toEqual([{ conn, msg: { type: 'error', code } }]);
}

describe('pause requests', () => {
  it('pause waits for the round boundary', () => {
    const table = startedTable();
    const { driver } = table;
    bothGet(driver.send('a', PAUSE_REQUEST), pauseStatus('p0', false));
    const agreed = driver.send('b', PAUSE_ACCEPT);
    bothGet(agreed, pauseStatus('p0', true));
    expect(pausedOf(agreed, 'a')).toBeUndefined();

    const before = driver.log.length;
    atRoundOver(driver);
    const played = driver.log.slice(before);
    const pauses = played.filter((o) => o.msg.type === 'paused');
    expect(pauses.map((o) => o.conn).sort()).toEqual(['a', 'b']);
    // The round finished normally and nothing was dealt for the next one.
    const dealt = played.flatMap((o) =>
      o.msg.type === 'events' ? o.msg.events.map(([, ev]) => ev) : [],
    );
    expect(dealt.some((ev) => 'round_ended' in ev.kind)).toBe(true);
    expect(dealt.some((ev) => 'hand_dealt' in ev.kind || 'round_started' in ev.kind)).toBe(false);
    singleError(driver.send('a', command('next_round')), 'a', 'paused');
    const applied = pauses[0]!.msg;
    expect(driver.room.snapshot().pause).toEqual({
      requested_by: 'p0',
      agreed: true,
      paused: true,
      paused_at: applied.type === 'paused' ? applied.save.saved_at : null,
      resume_ready: [],
    });
  });

  it('a pause agreed after a seat chose the next round applies at the next round end', () => {
    const { driver } = startedTable();
    atRoundOver(driver);
    const round = driver.view('p0').round;
    driver.send('a', command('next_round'));
    driver.send('b', PAUSE_REQUEST);
    expect(pausedOf(driver.send('a', PAUSE_ACCEPT), 'a')).toBeUndefined();
    const dealt = driver.send('b', command('next_round'));
    expect(kinds(eventsOf(dealt, 'b'))).toContain('round_started');
    expect(pausedOf(dealt, 'b')).toBeUndefined();

    const before = driver.log.length;
    atRoundOver(driver);
    expect(driver.view('p0').round).toBe(round + 1);
    expect(driver.log.slice(before).filter((o) => o.msg.type === 'paused')).toHaveLength(2);
  });

  it('pause applies at once in round over', () => {
    const { driver } = startedTable();
    atRoundOver(driver);
    driver.send('b', PAUSE_REQUEST);
    const out = driver.send('a', PAUSE_ACCEPT);
    for (const conn of ['a', 'b']) {
      expect(to(out, conn).map((m) => m.type)).toEqual(['pause_status', 'paused']);
    }
    bothGet(out, pauseStatus('p1', true));
    expect(driver.room.snapshot().pause.paused).toBe(true);
  });

  it('a request from both seats agrees the pause', () => {
    const { driver } = startedTable();
    atRoundOver(driver);
    driver.send('a', PAUSE_REQUEST);
    expect(driver.send('a', PAUSE_REQUEST)).toEqual([]);
    const out = driver.send('b', PAUSE_REQUEST);
    bothGet(out, pauseStatus('p0', true));
    expect(pausedOf(out, 'b')).toBeDefined();
  });

  it('either seat can cancel', () => {
    const { driver } = startedTable();
    for (const canceller of ['a', 'b']) {
      driver.send('a', PAUSE_REQUEST);
      bothGet(driver.send(canceller, PAUSE_CANCEL), pauseStatus(null, false));
    }
    expect(driver.send('a', PAUSE_CANCEL)).toEqual([]);
  });

  it('cancel after agreement withdraws it', () => {
    const { driver } = startedTable();
    driver.send('a', PAUSE_REQUEST);
    driver.send('b', PAUSE_ACCEPT);
    bothGet(driver.send('b', PAUSE_CANCEL), pauseStatus(null, false));
    const before = driver.log.length;
    atRoundOver(driver);
    expect(driver.log.slice(before).some((o) => o.msg.type === 'paused')).toBe(false);
    expect(driver.send('a', command('next_round')).some((o) => o.msg.type === 'error')).toBe(false);
  });

  it('a pause needs a game in progress and an opponent request to accept', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    room.handle('a', hello());
    singleError(room.handle('a', PAUSE_REQUEST), 'a', 'not_pausable');
    singleError(room.handle('z', PAUSE_REQUEST), 'z', 'not_joined');

    const { driver } = startedTable();
    singleError(driver.send('a', PAUSE_ACCEPT), 'a', 'invalid_message');
    driver.send('a', PAUSE_REQUEST);
    singleError(driver.send('a', PAUSE_ACCEPT), 'a', 'invalid_message');
    singleError(driver.send('a', RESUME_REQUEST), 'a', 'invalid_message');
    const over = driver.send('b', command('resign'));
    bothGet(over, pauseStatus(null, false));
    singleError(driver.send('a', PAUSE_REQUEST), 'a', 'not_pausable');
  });

  it('every welcome carries the pause status', () => {
    const { driver, tokens } = startedTable();
    driver.send('a', PAUSE_REQUEST);
    const out = driver.send('c', hello({ seat_token: tokens.p1 }));
    expect(to(out, 'c').slice(0, 3)).toEqual([
      expect.objectContaining({ type: 'welcome' }),
      expect.objectContaining({ type: 'events' }),
      pauseStatus('p0', false),
    ]);
  });
});

describe('a paused room', () => {
  it('paused room rejects commands and claim_win', () => {
    const table = startedTable();
    const { driver, clock } = table;
    pauseNow(table);
    singleError(driver.send('a', command('next_round')), 'a', 'paused');
    singleError(driver.send('b', command('resign')), 'b', 'paused');
    for (const msg of [PAUSE_REQUEST, PAUSE_ACCEPT, PAUSE_CANCEL]) {
      singleError(driver.send('a', msg), 'a', 'paused');
    }
    driver.room.disconnect('a');
    clock.advance(GRACE_MS * 2);
    singleError(driver.send('b', CLAIM_WIN), 'b', 'paused');
  });

  it('no grace runs while paused', () => {
    const table = startedTable();
    const { driver, clock } = table;
    pauseNow(table);
    expect(driver.room.disconnect('a')).toEqual([
      { conn: 'b', msg: { type: 'opponent_status', connected: false, name: 'Ada' } },
    ]);
    expect(driver.room.snapshot().disconnected_at).toEqual([null, null]);
    expect(driver.room.nextDeadline()).toBeNull();
    clock.advance(GRACE_MS * 2);
    expect(driver.room.tick()).toEqual([]);
  });

  it('save holds no live secrets', () => {
    const table = startedTable();
    const { driver, clock } = table;
    const save = pauseNow(table);
    const { hash, ...fields } = save;
    expect(fields).toMatchObject({
      format_version: 1,
      kind: 'wwd-save',
      room: ROOM_CODE,
      config: defaultRulesConfig(),
      saved_at: clock.now(),
    });
    expect(hash).toBe(saveHash(fields));
    expect(() => verifyReplay(save.replay)).not.toThrow();
    expect(save.boundary.round).toBe(driver.view('p0').round);

    // The last segment is closed: it ends on the round's checkpoint, and its seed is the one just used.
    const live = driver.room.snapshot().replay!;
    const last = save.replay.segments.at(-1)!;
    expect(last.seed).toBe(live.segments.at(-1)!.seed);
    expect(last.checkpoints.at(-1)?.index).toBe(last.entries.length - 1);
    const text = JSON.stringify(save);
    expect(text).not.toMatch(/hand_dealt|"hand"|"visibility"/);

    driver.send('a', RESUME_REQUEST);
    driver.send('b', RESUME_REQUEST);
    const next = driver.room.snapshot().replay!.segments.at(-1)!;
    expect(next.seed).not.toBe(last.seed);
    expect(text).not.toContain(next.seed);
    expect(text).not.toContain(next.seed_commitment);
  });
});

describe('resuming', () => {
  it('resume needs both seats ready', () => {
    const table = startedTable();
    const { driver, tokens } = table;
    pauseNow(table);
    const first = driver.send('a', RESUME_REQUEST);
    bothGet(first, { type: 'resume_status', ready: ['p0'] });
    expect(first.some((o) => o.msg.type === 'events')).toBe(false);
    expect(driver.send('a', RESUME_REQUEST)).toEqual([]);

    // A seat that leaves is no longer ready, and connecting again does not make it so.
    expect(driver.room.disconnect('a')).toContainEqual({
      conn: 'b',
      msg: { type: 'resume_status', ready: [] },
    });
    const back = driver.send('c', hello({ seat_token: tokens.p0 }));
    expect(to(back, 'c').map((m) => m.type)).toEqual([
      'welcome',
      'events',
      'pause_status',
      'paused',
      'resume_status',
      'opponent_status',
    ]);
    expect(back.some((o) => o.msg.type === 'events' && o.conn === 'b')).toBe(false);
    const half = driver.send('b', RESUME_REQUEST);
    expect(half.some((o) => o.msg.type === 'events')).toBe(false);
    expect(to(half, 'c')).toEqual([{ type: 'resume_status', ready: ['p1'] }]);

    const resumed = driver.send('c', RESUME_REQUEST);
    for (const conn of ['b', 'c']) {
      expect(to(resumed, conn).map((m) => m.type)).toEqual([
        'events',
        'pause_status',
        'resume_status',
      ]);
    }
    expect(to(resumed, 'c').slice(1)).toEqual([
      pauseStatus(null, false),
      { type: 'resume_status', ready: [] },
    ]);
  });

  it('resume deals with a new seed', () => {
    const table = startedTable();
    const { driver } = table;
    const started = to(driver.log, 'a').find((m): m is EventsMessage => m.type === 'events')!;
    const [, first] = started.events[0]!;
    const commitment = (first.kind as Extract<Event['kind'], { game_started: unknown }>)
      .game_started.seed_commitment;
    pauseNow(table);
    const lastSeq = Math.max(
      ...to(driver.log, 'a').flatMap((m) =>
        m.type === 'events' ? m.events.map(([seq]) => seq) : [],
      ),
    );
    const round = driver.view('p0').round;

    driver.send('b', RESUME_REQUEST);
    const out = driver.send('a', RESUME_REQUEST);
    for (const conn of ['a', 'b']) {
      const events = eventsOf(out, conn);
      expect(events.from_seq).toBe(lastSeq + 1);
      expect(events.events[0]).toEqual([
        lastSeq + 1,
        {
          visibility: 'public',
          kind: { segment_started: { round: round + 1, seed_commitment: expect.any(String) } },
        },
      ]);
      const kind = events.events[0]![1].kind as Extract<
        Event['kind'],
        { segment_started: unknown }
      >;
      expect(kind.segment_started.seed_commitment).not.toBe(commitment);
    }
    expect(driver.room.snapshot().segment_base).toBe(lastSeq + 1);

    driver.playUntil(() => isGameOver(driver.view('p0')));
    const over = to(driver.log, 'a').find((m) => m.type === 'game_over');
    if (over?.type !== 'game_over') throw new Error('no game_over');
    expect(over.replay.segments).toHaveLength(2);
    expect(() => verifyReplay(over.replay)).not.toThrow();
  });

  it('a reconnect after resuming continues the game-wide numbering', () => {
    const table = startedTable();
    const { driver, tokens } = table;
    pauseNow(table);
    driver.send('a', RESUME_REQUEST);
    const resumed = eventsOf(driver.send('b', RESUME_REQUEST), 'b');
    const out = driver.send('c', hello({ seat_token: tokens.p1, last_seq: resumed.from_seq + 1 }));
    const again = eventsOf(out, 'c');
    expect(again.from_seq).toBe(resumed.from_seq + 1);
    expect(again.events.map(([seq]) => seq)).toEqual(resumed.events.slice(1).map(([seq]) => seq));
  });
});

describe('pause snapshots', () => {
  function restoreAt(snapshot: RoomSnapshot | RoomSnapshotV2, wake: boolean): Room {
    const d = deps(7);
    d.clock.time = 50_000_000;
    return track(Room.restore(snapshot, d, { wake }));
  }

  it('pause survives restore', () => {
    const table = startedTable();
    const { driver, tokens } = table;
    const save = pauseNow(table);
    driver.send('a', RESUME_REQUEST);
    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot.version).toBe(3);
    expect(snapshot.pause).toEqual({
      requested_by: 'p0',
      agreed: true,
      paused: true,
      paused_at: save.saved_at,
      resume_ready: ['p0'],
    });

    // A plain restore keeps the pause but not readiness, since every connection is new.
    const plain = restoreAt(snapshot, false);
    expect(plain.snapshot().pause).toEqual({ ...snapshot.pause, resume_ready: [] });
    expect(plain.nextDeadline()).toBeNull();
    expect(plain.snapshot().disconnected_at).toEqual([null, null]);
    const c = plain.handle('c', hello({ seat_token: tokens.p0 }));
    const resent = pausedOf(c, 'c')!.save;
    expect(resent.boundary).toEqual(save.boundary);
    expect(resent.replay).toEqual(save.replay);
    expect(resent.hash).toBe(saveHash((({ hash: _hash, ...rest }) => rest)(resent)));
    singleError(plain.handle('c', command('next_round')), 'c', 'paused');
    plain.handle('d', hello({ seat_token: tokens.p1 }));
    plain.handle('c', RESUME_REQUEST);
    expect(eventsOf(plain.handle('d', RESUME_REQUEST), 'd').events[0]![1].kind).toHaveProperty(
      'segment_started',
    );

    // A waking restore keeps readiness, since the connections stayed open.
    const woken = restoreAt(snapshot, true);
    expect(woken.snapshot().pause).toEqual(snapshot.pause);
    expect(woken.nextDeadline()).toBeNull();
    woken.rebind('a', 'p0');
    woken.rebind('b', 'p1');
    expect(eventsOf(woken.handle('b', RESUME_REQUEST), 'a').events[0]![1].kind).toHaveProperty(
      'segment_started',
    );
  });

  it('resent save is identical after restore', () => {
    const table = startedTable();
    const { tokens } = table;
    const save = pauseNow(table);
    const original = JSON.stringify(save);
    table.clock.advance(60_000);
    const snapshot = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;

    const plain = restoreAt(snapshot, false);
    const resent = pausedOf(plain.handle('c', hello({ seat_token: tokens.p0 })), 'c')!.save;
    expect(JSON.stringify(resent)).toBe(original);

    const woken = restoreAt(snapshot, true);
    woken.rebind('b', 'p1');
    const again = pausedOf(woken.handle('d', hello({ seat_token: tokens.p0 })), 'd')!.save;
    expect(JSON.stringify(again)).toBe(original);
    expect(again.hash).toBe(save.hash);
  });

  it('restore rejects a paused snapshot with no pause time', () => {
    const table = startedTable();
    pauseNow(table);
    const snapshot = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;
    snapshot.pause.paused_at = null;
    expect(() => restoreAt(snapshot, false)).toThrow();
  });

  it('stale readiness after a wake restore is ignored', () => {
    const table = startedTable();
    pauseNow(table);
    table.driver.send('a', RESUME_REQUEST);
    const snapshot = JSON.parse(JSON.stringify(table.driver.room.snapshot())) as RoomSnapshot;
    const woken = restoreAt(snapshot, true);
    expect(woken.snapshot().pause.resume_ready).toEqual(['p0']);
    woken.rebind('b', 'p1');
    expect(woken.handle('b', RESUME_REQUEST)).toEqual([
      { conn: 'b', msg: { type: 'resume_status', ready: ['p1'] } },
    ]);
    expect(woken.snapshot().pause).toMatchObject({ paused: true, resume_ready: ['p1'] });
  });

  it('v2 snapshot upgrades to v3', () => {
    const { driver } = startedTable();
    const { pause: _pause, ...rest } = JSON.parse(
      JSON.stringify(driver.room.snapshot()),
    ) as RoomSnapshot;
    const v2: RoomSnapshotV2 = { ...rest, version: 2 };
    const restored = restoreAt(v2, false);
    expect(restored.snapshot()).toMatchObject({
      version: 3,
      pause: {
        requested_by: null,
        agreed: false,
        paused: false,
        paused_at: null,
        resume_ready: [],
      },
    });
    expect(restored.nextDeadline()).toBe(50_000_000 + GRACE_MS);
  });
});

describe('pause bookkeeping', () => {
  it('readiness is kept in seat order and unchanged state is returned as is', () => {
    const paused = applied({ ...NOT_PAUSED, requestedBy: 'p1', agreed: true }, 1000);
    expect(paused.pausedAt).toBe(1000);
    const one = ready(paused, 'p1');
    if (typeof one === 'string') throw new Error(one);
    expect(ready(one, 'p1')).toBe(one);
    const two = ready(one, 'p0');
    if (typeof two === 'string') throw new Error(two);
    expect(two.resumeReady).toEqual(['p0', 'p1']);
    expect(bothReady(two)).toBe(true);
    expect(unready(paused, 'p0')).toBe(paused);
    expect(unready(two, 'p0').resumeReady).toEqual(['p1']);
    expect(ready(NOT_PAUSED, 'p0')).toBe('invalid_message');
    expect(request(paused, 'p0')).toBe('paused');
  });
});
