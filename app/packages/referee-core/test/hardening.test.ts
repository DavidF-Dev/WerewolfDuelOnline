import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EngineFault, Game, defaultRulesConfig, type Command, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import type { ServerMessage } from '@wwd/protocol';
import { Room, type Outbound } from '../src/index.js';
import {
  Driver,
  FakeClock,
  ROOM_CODE,
  command,
  deps,
  hello,
  to,
  type EventsMessage,
} from './harness.js';

beforeAll(loadEngineForNode);

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function newRoom(): { room: Room; clock: FakeClock } {
  const d = deps();
  const room = Room.create(ROOM_CODE, defaultRulesConfig(), d);
  rooms.push(room);
  return { room, clock: d.clock };
}

function startedRoom(): { driver: Driver; tokens: Record<Seat, string> } {
  const { room, clock } = newRoom();
  const driver = new Driver(room, clock, 'a', 'b');
  const welcome = (out: Outbound[], conn: string): string => {
    const w = to(out, conn).find((m) => m.type === 'welcome');
    if (w?.type !== 'welcome') throw new Error('no welcome');
    return w.seat_token;
  };
  const t0 = welcome(driver.send('a', hello()), 'a');
  const t1 = welcome(driver.send('b', hello()), 'b');
  return { driver, tokens: { p0: t0, p1: t1 } };
}

function singleError(out: Outbound[], conn: string, code: string): void {
  expect(out).toEqual([{ conn, msg: { type: 'error', code } }]);
}

/** A seeded 32-bit xorshift generator so the fuzz test is deterministic. */
function xorshift(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

describe('input hardening', () => {
  it('room rejects malformed and oversized input without state change', () => {
    const waiting = newRoom().room;
    waiting.handle('a', hello());
    for (const room of [waiting, startedRoom().driver.room]) {
      rejectsWithoutChange(room);
    }
  });

  function rejectsWithoutChange(room: Room): void {
    const cases: [string, string][] = [
      ['{', 'invalid_message'],
      ['null', 'invalid_message'],
      ['{"type":"warp"}', 'invalid_message'],
      ['{"type":"hello","protocol_version":"1"}', 'invalid_message'],
      ['x'.repeat(9000), 'too_large'],
    ];
    for (const [raw, code] of cases) {
      const before = JSON.stringify(room.snapshot());
      singleError(room.handle('z', raw), 'z', code);
      expect(JSON.stringify(room.snapshot())).toBe(before);
    }
    const before = JSON.stringify(room.snapshot());
    singleError(room.handle('z', command('next_round')), 'z', 'not_joined');
    expect(JSON.stringify(room.snapshot())).toBe(before);
  }

  it('wrong protocol version is rejected', () => {
    const { room } = newRoom();
    const before = JSON.stringify(room.snapshot());
    expect(room.handle('a', hello({ protocol_version: 2 }))).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'protocol_version' }, close: true },
    ]);
    expect(JSON.stringify(room.snapshot())).toBe(before);
  });

  it('third connection cannot read a full room', () => {
    const { driver, tokens } = startedRoom();
    const before = driver.log.length;
    driver.record(driver.room.handle('c', hello()));
    driver.record(driver.room.handle('c', hello({ seat_token: 'ff'.repeat(16) })));
    expect(driver.log.slice(before)).toEqual([
      { conn: 'c', msg: { type: 'error', code: 'room_full' }, close: true },
      { conn: 'c', msg: { type: 'error', code: 'unknown_seat' }, close: true },
    ]);
    const mark = driver.log.length;
    for (let i = 0; i < 4; i++) driver.step();
    driver.send('a', hello({ seat_token: tokens.p0, last_seq: 0 }));
    driver.record(driver.room.disconnect('b'));
    driver.record(driver.room.disconnect('c'));
    expect(driver.log.length).toBeGreaterThan(mark);
    expect(driver.log.slice(mark).some((o) => o.conn === 'c')).toBe(false);
  });

  it('token reconnect supersedes the old connection', () => {
    const { driver, tokens } = startedRoom();
    const out = driver.send('c', hello({ seat_token: tokens.p0 }));
    expect(out.filter((o) => o.conn === 'a')).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'superseded' }, close: true },
    ]);
    expect(out.filter((o) => o.conn !== 'a').every((o) => o.close === undefined)).toBe(true);
    expect(to(out, 'c').map((m) => m.type)).toEqual(['welcome', 'events', 'opponent_status']);

    const after = driver.log.length;
    const played = driver.send('b', command(driver.latest.get('b')!.legal[0]!));
    expect(to(played, 'b').map((m) => m.type)).toContain('events');
    expect(to(played, 'c').map((m) => m.type)).toContain('events');
    expect(to(played, 'a')).toEqual([]);

    expect(driver.send('a', command('next_round'))).toEqual([
      { conn: 'a', msg: { type: 'error', code: 'not_joined' } },
    ]);
    // Disconnecting the superseded connection must neither notify nor unbind anyone.
    const stale = driver.room.disconnect('a');
    driver.record(stale);
    expect(stale).toEqual([]);
    const next = driver.send('c', command(driver.latest.get('c')!.legal[0] ?? 'next_round'));
    expect(next.some((o) => o.msg.type === 'error' && o.msg.code === 'not_joined')).toBe(false);
    const toOld = driver.log.slice(after).filter((o) => o.conn === 'a');
    expect(toOld).toEqual([{ conn: 'a', msg: { type: 'error', code: 'not_joined' } }]);
  });

  it('resume with odd last_seq resyncs', () => {
    const { driver, tokens } = startedRoom();
    for (let i = 0; i < 3; i++) driver.step();
    const resume = (conn: string, lastSeq: number): EventsMessage => {
      const out = driver.send(conn, hello({ seat_token: tokens.p0, last_seq: lastSeq }));
      return to(out, conn).find((m) => m.type === 'events') as EventsMessage;
    };
    const full = resume('c', 0);
    expect(full.events.length).toBeGreaterThan(0);

    const odd = resume('d', 1_000_000_000);
    expect(odd.from_seq).toBe(0);
    expect(odd.events).toEqual(full.events);

    const game = Game.fromReplay(driver.room.snapshot().replay!);
    const length = game.logLength();
    game.dispose();
    const caughtUp = resume('e', length);
    expect(caughtUp.from_seq).toBe(length);
    expect(caughtUp.events).toEqual([]);
    expect(caughtUp.view).toEqual(full.view);

    const lastOne = resume('f', length - 1);
    expect(lastOne.from_seq).toBe(length - 1);
    expect(lastOne.events).toEqual(full.events.filter(([seq]) => seq >= length - 1));

    const tooFar = resume('g', length + 1);
    expect(tooFar.from_seq).toBe(0);
    expect(tooFar.events).toEqual(full.events);
  });

  it('rule errors are relayed and leave the room unchanged', () => {
    const { driver } = startedRoom();
    // After both plans are in, only one seat may act; the other sends that same command.
    driver.step();
    driver.step();
    const [active, idle] = driver.latest.get('a')!.legal.length > 0 ? ['a', 'b'] : ['b', 'a'];
    const cmd = driver.latest.get(active!)!.legal[0]!;
    const sender = idle!;
    const before = JSON.stringify(driver.room.snapshot());
    singleError(driver.send(sender, command(cmd)), sender, 'error-not-your-turn');
    expect(JSON.stringify(driver.room.snapshot())).toBe(before);

    driver.playUntil(() => false);
    const over = JSON.stringify(driver.room.snapshot());
    const plan = { submit_plan: { character: 'seer', targets: [] } } as Command;
    for (const cmdAfter of ['next_round', plan] as Command[]) {
      singleError(driver.send('a', command(cmdAfter)), 'a', 'error-game-over');
      singleError(driver.send('b', command(cmdAfter)), 'b', 'error-game-over');
    }
    expect(JSON.stringify(driver.room.snapshot())).toBe(over);
  });

  it('rate limit', () => {
    const { room, clock } = newRoom();
    for (let i = 0; i < 30; i++) {
      expect(room.handle('a', '{"type":"ping"}')[0]?.msg.type).toBe('pong');
      clock.advance(10);
    }
    singleError(room.handle('a', '{"type":"ping"}'), 'a', 'rate_limited');
    clock.advance(10_000);
    expect(room.handle('a', '{"type":"ping"}')[0]?.msg.type).toBe('pong');
  });

  it('size limit is exact', () => {
    const { room, clock } = newRoom();
    const ping = '{"type":"ping"}';
    expect(room.handle('a', ping + ' '.repeat(8192 - ping.length))).toEqual([
      { conn: 'a', msg: { type: 'pong' } },
    ]);
    clock.advance(1000);
    singleError(room.handle('a', ping + ' '.repeat(8193 - ping.length)), 'a', 'too_large');
  });

  it('handle never throws', () => {
    const rand = xorshift(0xc0ffee);
    const keys = ['type', 'cmd', 'room', 'seat_token', 'last_seq', 'protocol_version', 'name'];
    const types = ['hello', 'command', 'ping', 'warp'];
    const randomValue = (depth: number): unknown => {
      const r = rand();
      if (depth > 2 || r < 0.3)
        return [null, true, false, 0, -1, 1e9, 'x', ''][Math.floor(rand() * 8)];
      if (r < 0.65)
        return Array.from({ length: Math.floor(rand() * 4) }, () => randomValue(depth + 1));
      const obj: Record<string, unknown> = {};
      for (let i = Math.floor(rand() * 4); i > 0; i--) {
        obj[keys[Math.floor(rand() * keys.length)]!] = randomValue(depth + 1);
      }
      return obj;
    };
    const randomInput = (i: number): string => {
      if (i % 3 === 0) {
        const length = Math.floor(rand() * 200);
        return String.fromCharCode(...Array.from({ length }, () => Math.floor(rand() * 256)));
      }
      if (i % 3 === 1) return JSON.stringify(randomValue(0));
      const obj: Record<string, unknown> = { type: types[Math.floor(rand() * types.length)] };
      for (let n = Math.floor(rand() * 4); n > 0; n--) {
        obj[keys[Math.floor(rand() * keys.length)]!] = randomValue(1);
      }
      return JSON.stringify(obj);
    };

    // Seated connections in a started room reach the command path; 'z' is unseated.
    const { driver } = startedRoom();
    const conns = ['a', 'b', 'z'];
    for (let i = 0; i < 500; i++) {
      const conn = conns[i % conns.length]!;
      const raw = randomInput(i);
      const before = JSON.stringify(driver.room.snapshot());
      let out: Outbound[] = [];
      expect(() => {
        out = driver.send(conn, raw);
      }).not.toThrow();
      const replies = to(out, conn);
      expect(replies.length).toBeGreaterThan(0);
      for (const m of replies) expect(['error', 'pong']).toContain(m.type);
      if (!out.some((o) => o.msg.type === 'events')) {
        expect(JSON.stringify(driver.room.snapshot())).toBe(before);
      }
    }
  });
});

describe('engine faults', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a fault marks the room faulted and every later message gets internal_error', () => {
    const { driver } = startedRoom();
    const seat = driver.latest.get('a')!.legal.length > 0 ? 'a' : 'b';
    const cmd = driver.latest.get(seat)!.legal[0]!;
    vi.spyOn(Game.prototype, 'apply').mockImplementation(() => {
      throw new EngineFault(new WebAssembly.RuntimeError('unreachable'));
    });
    expect(driver.room.faulted).toBe(false);
    singleError(driver.send(seat, command(cmd)), seat, 'internal_error');
    expect(driver.room.faulted).toBe(true);
    vi.restoreAllMocks();

    const view = vi.spyOn(Game.prototype, 'view');
    const logLength = vi.spyOn(Game.prototype, 'logLength');
    for (const raw of ['{"type":"ping"}', hello(), command(cmd), '{']) {
      expect(() => driver.send('a', raw)).not.toThrow();
      singleError(driver.room.handle('b', raw), 'b', 'internal_error');
    }
    expect(view).not.toHaveBeenCalled();
    expect(logLength).not.toHaveBeenCalled();
  });

  it('a fault while sending events is internal_error, not invalid_message', () => {
    const { room } = newRoom();
    room.handle('a', hello());
    vi.spyOn(Game.prototype, 'view').mockImplementation(() => {
      throw new EngineFault('trap');
    });
    singleError(room.handle('b', hello()), 'b', 'internal_error');
    expect(room.faulted).toBe(true);
  });
});
