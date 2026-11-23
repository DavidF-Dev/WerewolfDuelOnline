import type { CreateRoomRequest } from '@wwd/protocol';
import { Room, type RoomDeps } from '@wwd/referee-core';
import { seededRandom } from './codes.js';

/** WebSocket close codes the referees use. */
export const CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
  TRY_AGAIN_LATER: 1013,
} as const;

const MINUTE_MS = 60_000;

/** A JSON `{ error }` response that is never cached. */
export function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
  });
}

/** The message of a caught error, for logging. */
export function errorReason(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Creates the room a `POST /rooms` request asks for: a new game, or the continuation of a save.
 * A new game's `test` options, a seeded random source and a grace period in milliseconds, apply
 * only when `testOverrides` is true; otherwise the room uses `deps.random` and the requested
 * grace in minutes. Throws as `Room.create` and `Room.fromSave` do, so an unverified save
 * throws `InvalidSaveError`.
 */
export function createRequestedRoom(
  code: string,
  req: CreateRoomRequest,
  deps: RoomDeps,
  testOverrides: boolean,
): Room {
  if ('save' in req) {
    return Room.fromSave(code, req.save, req.seat, deps, {
      graceMs: req.grace_minutes * MINUTE_MS,
    });
  }
  const test = testOverrides ? req.test : undefined;
  const random = test?.seed === undefined ? deps.random : seededRandom(test.seed);
  const graceMs = test?.grace_ms ?? req.grace_minutes * MINUTE_MS;
  return Room.create(code, req.config, { clock: deps.clock, random }, { graceMs });
}
