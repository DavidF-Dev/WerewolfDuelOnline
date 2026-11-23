import * as v from 'valibot';
import type { RulesConfig, Seat } from '@wwd/engine';
import { MAX_MESSAGE_BYTES, MAX_SAVE_BYTES } from './codes.js';
import { anyObject, oversized, seat, type ParseResult, type SaveFile } from './messages.js';

export const GRACE_CHOICES_MINUTES = [5, 10, 30] as const;

export type GraceMinutes = (typeof GRACE_CHOICES_MINUTES)[number];

/** A `POST /rooms` body for a room with a new game. */
export interface NewRoomRequest {
  config: RulesConfig;
  grace_minutes: GraceMinutes;
  test?: { grace_ms?: number; seed?: string };
}

/**
 * A `POST /rooms` body for a room that continues a saved game, with `seat` kept for the
 * uploader. Only its shape is checked when parsed; the referee verifies the save itself.
 */
export interface RoomFromSaveRequest {
  save: SaveFile;
  seat: Seat;
  grace_minutes: GraceMinutes;
}

export type CreateRoomRequest = NewRoomRequest | RoomFromSaveRequest;

export interface CreateRoomResponse {
  code: string;
}

export interface HealthResponse {
  ok: true;
  protocol_version: number;
  engine_version: string;
}

const rulesConfig = v.strictObject({
  tiebreak: v.picklist(['hourglasses_then_badge', 'badge_only']),
  min_targets: v.picklist([0, 1]),
  badge_start: v.union([v.literal('random'), v.strictObject({ seat })]),
});

const graceMinutes = v.picklist(GRACE_CHOICES_MINUTES);

const newRoomSchema = v.strictObject({
  config: rulesConfig,
  grace_minutes: graceMinutes,
  test: v.optional(
    v.strictObject({
      grace_ms: v.optional(
        v.pipe(v.number(), v.safeInteger(), v.minValue(1000), v.maxValue(3_600_000)),
      ),
      seed: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))),
    }),
  ),
});

const roomFromSaveSchema = v.strictObject({
  save: anyObject,
  seat,
  grace_minutes: graceMinutes,
});

function carriesSave(json: unknown): boolean {
  return typeof json === 'object' && json !== null && !Array.isArray(json) && 'save' in json;
}

/**
 * Parses a `POST /rooms` body. A body carrying a save may be up to `MAX_SAVE_BYTES`; any other
 * body has the same size cap as protocol messages.
 */
export function parseCreateRoomRequest(raw: string): ParseResult<CreateRoomRequest> {
  if (oversized(raw, MAX_SAVE_BYTES)) return { ok: false, code: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  const withSave = carriesSave(json);
  if (!withSave && oversized(raw, MAX_MESSAGE_BYTES)) return { ok: false, code: 'too_large' };
  const result = v.safeParse(withSave ? roomFromSaveSchema : newRoomSchema, json);
  if (!result.success) return { ok: false, code: 'invalid_message' };
  return { ok: true, msg: result.output as CreateRoomRequest };
}
