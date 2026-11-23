import * as v from 'valibot';
import type { RulesConfig } from '@wwd/engine';
import { parse, type ParseResult } from './messages.js';

export const GRACE_CHOICES_MINUTES = [5, 10, 30] as const;

export interface CreateRoomRequest {
  config: RulesConfig;
  grace_minutes: (typeof GRACE_CHOICES_MINUTES)[number];
  test?: { grace_ms?: number; seed?: string };
}

export interface CreateRoomResponse {
  code: string;
}

export interface HealthResponse {
  ok: true;
  protocol_version: number;
  engine_version: string;
}

const seat = v.picklist(['p0', 'p1']);

const rulesConfig = v.strictObject({
  tiebreak: v.picklist(['hourglasses_then_badge', 'badge_only']),
  min_targets: v.picklist([0, 1]),
  badge_start: v.union([v.literal('random'), v.strictObject({ seat })]),
});

const createRoomSchema = v.strictObject({
  config: rulesConfig,
  grace_minutes: v.picklist(GRACE_CHOICES_MINUTES),
  test: v.optional(
    v.strictObject({
      grace_ms: v.optional(
        v.pipe(v.number(), v.safeInteger(), v.minValue(1000), v.maxValue(3_600_000)),
      ),
      seed: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))),
    }),
  ),
});

/** Parses a `POST /rooms` body, applying the same size cap as protocol messages. */
export function parseCreateRoomRequest(raw: string): ParseResult<CreateRoomRequest> {
  return parse<CreateRoomRequest>(createRoomSchema, raw, true);
}
