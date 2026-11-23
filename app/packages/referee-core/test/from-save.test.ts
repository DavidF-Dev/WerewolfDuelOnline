import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Game, defaultRulesConfig, verifyReplay, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  MAX_SAVE_SEGMENTS,
  encode,
  saveHash,
  type SaveFile,
  type ServerMessage,
} from '@wwd/protocol';
import { InvalidSaveError, Room, type Outbound, type RoomSnapshot } from '../src/index.js';
import {
  Driver,
  ROOM_CODE,
  command,
  deps,
  hello,
  isGameOver,
  to,
  type EventsMessage,
} from './harness.js';

beforeAll(loadEngineForNode);

const PAUSE_REQUEST = encode({ type: 'pause_request' });
const PAUSE_ACCEPT = encode({ type: 'pause_accept' });
const RESUME_REQUEST = encode({ type: 'resume_request' });
const GRACE_MS = 300_000;

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function track(room: Room): Room {
  rooms.push(room);
  return room;
}

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type GameOver = Extract<ServerMessage, { type: 'game_over' }>;

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

function errorOf(out: Outbound[]): Outbound[] {
  return out.filter((o) => o.msg.type === 'error');
}

/** Agrees a pause at the next round over and returns the save both seats were sent. */
function pauseAtRoundOver(driver: Driver): SaveFile {
  driver.playUntil(() => driver.view('p0').phase === 'round_over');
  driver.send('a', PAUSE_REQUEST);
  const out = driver.send('b', PAUSE_ACCEPT);
  const paused = to(out, 'a').find((m) => m.type === 'paused');
  if (paused?.type !== 'paused') throw new Error('no pause');
  return paused.save;
}

/** A save of a game paused twice, so its replay has two closed segments. */
function twoSegmentSave(): { save: SaveFile; segmentBase: number } {
  const d = deps();
  const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
  const driver = new Driver(room, d.clock, 'a', 'b');
  driver.send('a', hello());
  driver.send('b', hello());
  pauseAtRoundOver(driver);
  driver.send('a', RESUME_REQUEST);
  driver.send('b', RESUME_REQUEST);
  const save = pauseAtRoundOver(driver);
  expect(save.replay.segments).toHaveLength(2);
  return { save, segmentBase: room.snapshot().segment_base };
}

function fromSave(save: SaveFile, seat: Seat = 'p1'): { room: Room; driver: Driver } {
  const d = deps(5);
  const room = track(Room.fromSave(ROOM_CODE, save, seat, d, { graceMs: GRACE_MS }));
  return { room, driver: new Driver(room, d.clock, 'c', 'd') };
}

/** `save` with `edit` applied to a copy, and its hash made to match again. */
function resealed(save: SaveFile, edit: (copy: SaveFile) => void): SaveFile {
  const copy = JSON.parse(JSON.stringify(save)) as SaveFile;
  edit(copy);
  return { ...copy, hash: saveHash(copy) };
}

describe('a room from a save', () => {
  it('room from save resumes the game', () => {
    const { save, segmentBase } = twoSegmentSave();
    const { room, driver } = fromSave(save);
    expect(room.snapshot()).toMatchObject({
      seats: [null, null],
      grace_ms: GRACE_MS,
      segment_base: segmentBase,
      pause: { paused: true, paused_at: save.saved_at },
      from_save: { reserved_seat: 'p1' },
    });

    // The uploader names the seat it played; the welcome follows the paused order.
    const first = driver.send('c', hello({ seat: 'p1', name: 'Bo' }));
    expect(welcomeOf(first, 'c')).toMatchObject({ seat: 'p1', game: 0 });
    expect(to(first, 'c').map((m) => m.type)).toEqual([
      'welcome',
      'events',
      'pause_status',
      'paused',
      'resume_status',
      'opponent_status',
    ]);
    expect(eventsOf(first, 'c').from_seq).toBe(segmentBase);
    expect(to(first, 'c').at(-1)).toEqual({ type: 'opponent_status', connected: false });
    const resent = to(first, 'c').find((m) => m.type === 'paused');
    expect(resent?.type === 'paused' && resent.save.replay).toEqual(save.replay);

    const second = driver.send('d', hello({ name: 'Ada' }));
    expect(welcomeOf(second, 'd').seat).toBe('p0');
    expect(to(second, 'c')).toEqual([{ type: 'opponent_status', connected: true, name: 'Ada' }]);
    expect(room.snapshot().from_save).toBeNull();
    expect(errorOf(driver.send('e', hello()))).toEqual([
      { conn: 'e', msg: { type: 'error', code: 'room_full' }, close: true },
    ]);

    // Resuming works as for any paused room: a new segment with a fresh seed.
    driver.send('c', RESUME_REQUEST);
    const resumed = driver.send('d', RESUME_REQUEST);
    expect(eventsOf(resumed, 'd').events[0]![1].kind).toHaveProperty('segment_started');
    driver.playUntil(() => false);
    const over = to(driver.log, 'c').find((m): m is GameOver => m.type === 'game_over');
    const replay = over!.replay;
    expect(() => verifyReplay(replay)).not.toThrow();
    expect(replay.segments).toHaveLength(3);
    expect(replay.segments.slice(0, 2)).toEqual(save.replay.segments);
    expect(isGameOver(driver.view('p0'))).toBe(true);
  });

  it('a save taken during a rematch resumes from file', () => {
    const d = deps(3);
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    const first = new Driver(room, d.clock, 'a', 'b', 3);
    first.send('a', hello());
    first.send('b', hello());
    first.playUntil(() => false);
    first.send('a', encode({ type: 'rematch_request' }));
    first.send('b', encode({ type: 'rematch_request' }));
    const save = pauseAtRoundOver(first);
    expect(save.config.badge_start).not.toBe('random');
    expect(save.config).toEqual(save.replay.config);

    const { driver } = fromSave(save, 'p0');
    driver.send('c', hello({ seat: 'p0' }));
    driver.send('d', hello());
    driver.send('c', RESUME_REQUEST);
    driver.send('d', RESUME_REQUEST);
    driver.playUntil(() => false);
    const over = to(driver.log, 'c').find((m): m is GameOver => m.type === 'game_over');
    expect(over?.replay.config).toEqual(save.config);
    expect(() => verifyReplay(over!.replay)).not.toThrow();
  });

  it('a plain hello takes the seat that is not reserved', () => {
    const { save } = twoSegmentSave();
    const { room, driver } = fromSave(save, 'p0');
    expect(welcomeOf(driver.send('d', hello()), 'd').seat).toBe('p1');
    expect(errorOf(driver.send('e', hello({ seat: 'p1' })))).toEqual([
      { conn: 'e', msg: { type: 'error', code: 'room_full' }, close: true },
    ]);
    expect(welcomeOf(driver.send('c', hello({ seat: 'p0' })), 'c').seat).toBe('p0');
    expect(room.snapshot().seats.every((s) => s !== null)).toBe(true);
  });

  it('seat claims survive restore', () => {
    const { save } = twoSegmentSave();
    const { driver } = fromSave(save);
    const welcome = welcomeOf(driver.send('c', hello({ seat: 'p1' })), 'c');
    const snapshot = JSON.parse(JSON.stringify(driver.room.snapshot())) as RoomSnapshot;
    expect(snapshot.from_save).toEqual({ reserved_seat: 'p1' });

    const restored = track(Room.restore(snapshot, deps(9)));
    expect(
      welcomeOf(restored.handle('c', hello({ seat_token: welcome.seat_token })), 'c').seat,
    ).toBe('p1');
    expect(welcomeOf(restored.handle('d', hello()), 'd').seat).toBe('p0');
    restored.handle('c', RESUME_REQUEST);
    expect(eventsOf(restored.handle('d', RESUME_REQUEST), 'c').game).toBe(0);
    expect(() => restored.handle('c', command('next_round'))).not.toThrow();
  });

  it('room from save rejects tampered saves', () => {
    const { save } = twoSegmentSave();
    const d = deps();
    // Each save is broken in one way, with its hash made to match unless the hash is the point.
    const tampered: Array<[string, RegExp, SaveFile]> = [
      ['edited hash', /hash mismatch/, { ...save, hash: '0'.repeat(64) }],
      [
        'edited field under the old hash',
        /hash mismatch/,
        { ...save, saved_at: save.saved_at + 1 },
      ],
      [
        'edited command',
        /does not verify/,
        resealed(save, (copy) => {
          const entry = copy.replay.segments[0]!.entries[0]!;
          if (!('command' in entry)) throw new Error('no command');
          entry.command.seat = entry.command.seat === 'p0' ? 'p1' : 'p0';
        }),
      ],
      [
        'tainted replay',
        /tainted/,
        resealed(save, (copy) => {
          copy.replay.tainted = true;
        }),
      ],
      [
        'mismatched boundary',
        /boundary mismatch/,
        resealed(save, (copy) => {
          copy.boundary.players[0].health -= 1;
        }),
      ],
      [
        'mismatched config',
        /config mismatch/,
        resealed(save, (copy) => {
          copy.config = { ...copy.config, min_targets: copy.config.min_targets === 0 ? 1 : 0 };
        }),
      ],
      [
        'wrong format_version',
        /format version/,
        resealed(save, (copy) => {
          (copy as { format_version: number }).format_version = 2;
        }),
      ],
      ['not a save', /not a save/, { ...save, kind: 'wwd-backup' } as unknown as SaveFile],
      [
        'garbled replay',
        /malformed replay/,
        resealed(save, (copy) => {
          (copy as { replay: unknown }).replay = { ...copy.replay, segments: 'nope' };
        }),
      ],
    ];
    for (const [name, reason, bad] of tampered) {
      expect(() => Room.fromSave(ROOM_CODE, bad, 'p0', d), name).toThrow(InvalidSaveError);
      expect(() => Room.fromSave(ROOM_CODE, bad, 'p0', d), name).toThrow(reason);
    }
    expect(() => track(Room.fromSave(ROOM_CODE, save, 'p0', d))).not.toThrow();
  });
});

describe('hello naming a seat', () => {
  it('hello naming a seat is ignored for normal rooms', () => {
    const d = deps();
    const room = track(Room.create(ROOM_CODE, defaultRulesConfig(), d));
    expect(welcomeOf(room.handle('a', hello({ seat: 'p1' })), 'a').seat).toBe('p0');
    expect(welcomeOf(room.handle('b', hello({ seat: 'p0' })), 'b').seat).toBe('p1');
    expect(room.snapshot().from_save).toBeNull();
  });
});

/** `save` continued with empty segments at its boundary until its replay has `total` segments. */
function withSegments(save: SaveFile, total: number): SaveFile {
  let game = Game.fromReplay(save.replay);
  for (let n = save.replay.segments.length; n < total; n++) {
    const next = Game.resume(save.boundary, game.replay(), (n + 1).toString(16).padStart(64, '0'));
    game.dispose();
    game = next;
  }
  const replay = game.replay();
  game.dispose();
  return resealed(save, (copy) => {
    copy.replay = replay;
  });
}

describe('save segment cap', () => {
  it('room from save rejects too many segments', () => {
    const { save } = twoSegmentSave();
    const tooMany = withSegments(save, MAX_SAVE_SEGMENTS + 1);
    expect(tooMany.replay.segments).toHaveLength(33);
    expect(() => Room.fromSave(ROOM_CODE, tooMany, 'p0', deps())).toThrow(InvalidSaveError);
    expect(() => Room.fromSave(ROOM_CODE, tooMany, 'p0', deps())).toThrow(/too many segments/);
  });

  it('a save with the most segments allowed is created in bounded time', () => {
    const { save } = twoSegmentSave();
    const most = withSegments(save, MAX_SAVE_SEGMENTS);
    const started = Date.now();
    const room = track(Room.fromSave(ROOM_CODE, most, 'p0', deps()));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(room.snapshot().replay!.segments).toHaveLength(MAX_SAVE_SEGMENTS);
  });
});
