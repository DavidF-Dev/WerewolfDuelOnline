import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateRoomRequest, NewRoomRequest, SaveFile } from '@wwd/protocol';
import { Room, type Clock, type Random, type RoomDeps } from '@wwd/referee-core';
import {
  CLOSE,
  LIMITS,
  createRequestedRoom,
  errorReason,
  errorResponse,
  expiresAt,
  isExpired,
  seededRandom,
} from '../src/index.js';

const SEED = 'c'.repeat(64);
const CODE = 'K7Q2MX';
const clock: Clock = { now: () => 1000 };
const random: Random = { bytes: (n) => new Uint8Array(n).fill(7) };

function request(extra: Partial<NewRoomRequest> = {}): NewRoomRequest {
  return {
    config: { tiebreak: 'badge_only', min_targets: 1, badge_start: 'random' },
    grace_minutes: 5,
    ...extra,
  };
}

/** Captures the arguments `Room.create` is called with, without starting the engine. */
function spyOnCreate(): { calls: () => Parameters<typeof Room.create>[] } {
  const room = {} as Room;
  const spy = vi.spyOn(Room, 'create').mockImplementation(() => room);
  return { calls: () => spy.mock.calls };
}

function bytesOf(deps: RoomDeps): number[] {
  return [...deps.random.bytes(8)];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRequestedRoom', () => {
  it('uses the requested grace and the adapter random without test options', () => {
    const { calls } = spyOnCreate();
    createRequestedRoom(CODE, request(), { clock, random }, true);
    const [code, config, deps, options] = calls()[0]!;
    expect(code).toBe(CODE);
    expect(config).toEqual(request().config);
    expect(deps.clock).toBe(clock);
    expect(deps.random).toBe(random);
    expect(options).toEqual({ graceMs: 5 * 60_000 });
  });

  it('honours test options when test overrides are enabled', () => {
    const { calls } = spyOnCreate();
    createRequestedRoom(
      CODE,
      request({ test: { seed: SEED, grace_ms: 1500 } }),
      { clock, random },
      true,
    );
    const [, , deps, options] = calls()[0]!;
    expect(bytesOf(deps)).toEqual([...seededRandom(SEED).bytes(8)]);
    expect(options).toEqual({ graceMs: 1500 });
  });

  it('ignores test options when test overrides are disabled', () => {
    const { calls } = spyOnCreate();
    createRequestedRoom(
      CODE,
      request({ test: { seed: SEED, grace_ms: 1500 } }),
      { clock, random },
      false,
    );
    const [, , deps, options] = calls()[0]!;
    expect(deps.random).toBe(random);
    expect(options).toEqual({ graceMs: 5 * 60_000 });
  });
});

describe('expiresAt', () => {
  it('is the idle expiry for an unfinished room', () => {
    expect(expiresAt({ lastActivityAt: 1000, finishedAt: null })).toBe(
      1000 + LIMITS.IDLE_ROOM_TTL_MS,
    );
  });

  it('is the sooner of the idle and finished expiries for a finished room', () => {
    expect(expiresAt({ lastActivityAt: 1000, finishedAt: 5000 })).toBe(
      5000 + LIMITS.FINISHED_ROOM_TTL_MS,
    );
    const late = LIMITS.IDLE_ROOM_TTL_MS;
    expect(expiresAt({ lastActivityAt: 1000, finishedAt: late })).toBe(
      1000 + LIMITS.IDLE_ROOM_TTL_MS,
    );
  });

  it('is exactly when isExpired turns true', () => {
    for (const room of [
      { lastActivityAt: 1000, finishedAt: null },
      { lastActivityAt: 1000, finishedAt: 5000 },
      { lastActivityAt: 1000, finishedAt: LIMITS.IDLE_ROOM_TTL_MS },
    ]) {
      const at = expiresAt(room);
      expect(isExpired(room, at - 1)).toBe(false);
      expect(isExpired(room, at)).toBe(true);
    }
  });
});

describe('adapter helpers', () => {
  it('errorResponse is an uncached JSON error', async () => {
    const res = errorResponse(503, 'too_many_connections');
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'too_many_connections' });
  });

  it('errorReason gives the message of an error and the text of anything else', () => {
    expect(errorReason(new Error('boom'))).toBe('boom');
    expect(errorReason('plain')).toBe('plain');
  });

  it('CLOSE names the WebSocket close codes the referees use', () => {
    expect(CLOSE).toEqual({
      NORMAL: 1000,
      GOING_AWAY: 1001,
      POLICY_VIOLATION: 1008,
      MESSAGE_TOO_BIG: 1009,
      INTERNAL_ERROR: 1011,
      TRY_AGAIN_LATER: 1013,
    });
  });
});

describe('createRequestedRoom with a save', () => {
  it('creates the room from the save for the uploader seat', () => {
    const room = {} as Room;
    const spy = vi.spyOn(Room, 'fromSave').mockImplementation(() => room);
    const save = { format_version: 1 } as unknown as SaveFile;
    const req: CreateRoomRequest = { save, seat: 'p1', grace_minutes: 30 };
    expect(createRequestedRoom(CODE, req, { clock, random }, true)).toBe(room);
    const [code, given, seat, deps, options] = spy.mock.calls[0]!;
    expect(code).toBe(CODE);
    expect(given).toBe(save);
    expect(seat).toBe('p1');
    expect(deps).toEqual({ clock, random });
    expect(options).toEqual({ graceMs: 30 * 60_000 });
  });
});
