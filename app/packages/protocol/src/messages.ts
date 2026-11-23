import * as v from 'valibot';
import type { Command, Event, Pending, Replay, RulesConfig, Seat, View } from '@wwd/engine';
import { FIXED_ERROR_CODES, MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type ErrorCode } from './codes.js';

export type ClientMessage =
  | {
      type: 'hello';
      protocol_version: number;
      room: string;
      seat_token?: string;
      last_seq?: number;
      name?: string;
    }
  | {
      type: 'rejoin';
      protocol_version: number;
      room: string;
      seat: Seat;
      pin?: string;
      last_seq?: number;
    }
  | { type: 'approve_rejoin'; approve: boolean }
  | { type: 'claim_win' }
  | { type: 'command'; cmd: Command }
  | { type: 'ping' };

export type ServerMessage =
  | {
      type: 'welcome';
      seat: Seat;
      seat_token: string;
      room: string;
      config: RulesConfig;
      pin: string;
    }
  | { type: 'waiting' }
  | { type: 'rejoin_pending' }
  /**
   * Asks the approver to let a device without the PIN take the opponent's seat. It stays open
   * until `deadline` by the referee's clock, `remaining_ms` from when it was sent; clients time it
   * from `remaining_ms`.
   */
  | { type: 'rejoin_request'; deadline: number; remaining_ms: number }
  /** Tells the approver that the request it was shown is no longer open. */
  | { type: 'rejoin_withdrawn' }
  | {
      type: 'events';
      from_seq: number;
      events: Array<[number, Event]>;
      view: View;
      legal: Command[];
      pending: Pending;
    }
  | {
      type: 'opponent_status';
      connected: boolean;
      name?: string;
      grace_deadline?: number;
      /** How long remains until `grace_deadline` by the referee's clock, so clients need not share it. */
      grace_remaining_ms?: number;
      can_claim_win?: boolean;
      pin_attempt_failed?: boolean;
    }
  | { type: 'game_over'; replay: Replay }
  | { type: 'error'; code: ErrorCode }
  | { type: 'pong' };

export type ParseResult<T> = { ok: true; msg: T } | { ok: false; code: ErrorCode };

const room = v.pipe(v.string(), v.regex(/^[0-9A-HJKMNP-TV-Z]{6}$/));
const seatToken = v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/));
const seat = v.picklist(['p0', 'p1']);
const pin = v.pipe(v.string(), v.regex(/^[0-9]{4}$/));
const seq = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const name = v.pipe(
  v.string(),
  v.trim(),
  v.check((s) => {
    const length = [...s].length;
    return length >= 1 && length <= 24;
  }),
  v.regex(/^[^\p{Cc}\p{Cf}\u2028\u2029]*$/u),
);
// A custom guard keeps the original value; looseObject would rewrite arrays into objects.
const anyObject = v.custom<Record<string, unknown>>(
  (x) => typeof x === 'object' && x !== null && !Array.isArray(x),
);

// Structural only: the engine validates the payload fields.
const command = v.union([
  v.literal('next_round'),
  v.literal('resign'),
  v.strictObject({ submit_plan: anyObject }),
  v.strictObject({ place_hourglasses: anyObject }),
  v.strictObject({ choose_potion_target: anyObject }),
  v.strictObject({ hunter_spend_cross: anyObject }),
]);

const clientSchema = v.variant('type', [
  v.object({
    type: v.literal('hello'),
    protocol_version: v.pipe(v.number(), v.safeInteger()),
    room,
    seat_token: v.optional(seatToken),
    last_seq: v.optional(seq),
    name: v.optional(name),
  }),
  v.object({
    type: v.literal('rejoin'),
    protocol_version: v.pipe(v.number(), v.safeInteger()),
    room,
    seat,
    pin: v.optional(pin),
    last_seq: v.optional(seq),
  }),
  v.object({ type: v.literal('approve_rejoin'), approve: v.boolean() }),
  v.object({ type: v.literal('claim_win') }),
  v.object({ type: v.literal('command'), cmd: command }),
  v.object({ type: v.literal('ping') }),
]);

const errorCode = v.union([
  v.picklist(FIXED_ERROR_CODES),
  v.pipe(v.string(), v.startsWith('error-')),
]);

// The server is trusted, so nested engine payloads are only checked for shape.
const serverSchema = v.variant('type', [
  v.object({
    type: v.literal('welcome'),
    seat,
    seat_token: seatToken,
    room,
    config: anyObject,
    pin,
  }),
  v.object({ type: v.literal('waiting') }),
  v.object({ type: v.literal('rejoin_pending') }),
  v.object({ type: v.literal('rejoin_request'), deadline: seq, remaining_ms: seq }),
  v.object({ type: v.literal('rejoin_withdrawn') }),
  v.object({
    type: v.literal('events'),
    from_seq: seq,
    events: v.array(v.tuple([seq, anyObject])),
    view: anyObject,
    legal: v.array(command),
    pending: anyObject,
  }),
  v.object({
    type: v.literal('opponent_status'),
    connected: v.boolean(),
    name: v.optional(v.string()),
    grace_deadline: v.optional(seq),
    grace_remaining_ms: v.optional(seq),
    can_claim_win: v.optional(v.boolean()),
    pin_attempt_failed: v.optional(v.boolean()),
  }),
  v.object({ type: v.literal('game_over'), replay: anyObject }),
  v.object({ type: v.literal('error'), code: errorCode }),
  v.object({ type: v.literal('pong') }),
]);

/** True when `raw` is longer than the message size limit in UTF-8 bytes. */
function oversized(raw: string): boolean {
  // A UTF-16 length never exceeds the UTF-8 byte length, so this skips encoding long input.
  if (raw.length > MAX_MESSAGE_BYTES) return true;
  return new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES;
}

/** True for a hello or rejoin whose numeric protocol version is not the one this build speaks. */
function isForeignHello(json: unknown): boolean {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
  const { type, protocol_version } = json as Record<string, unknown>;
  return (
    (type === 'hello' || type === 'rejoin') &&
    typeof protocol_version === 'number' &&
    protocol_version !== PROTOCOL_VERSION
  );
}

export function parse<T>(schema: v.GenericSchema, raw: string, capped: boolean): ParseResult<T> {
  if (capped && oversized(raw)) return { ok: false, code: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'invalid_message' };
  }
  if (capped && isForeignHello(json)) return { ok: false, code: 'protocol_version' };
  const result = v.safeParse(schema, json);
  if (!result.success) return { ok: false, code: 'invalid_message' };
  return { ok: true, msg: result.output as T };
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parse<ClientMessage>(clientSchema, raw, true);
}

export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parse<ServerMessage>(serverSchema, raw, false);
}

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
