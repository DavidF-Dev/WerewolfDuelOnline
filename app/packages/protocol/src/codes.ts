export const PROTOCOL_VERSION = 3;
export const SAVE_FORMAT_VERSION = 1;
export const MAX_MESSAGE_BYTES = 8192;
/** The longest display name, in characters. */
export const MAX_NAME_LENGTH = 24;
/** The body cap for `POST /rooms` with a save; other bodies keep `MAX_MESSAGE_BYTES`. */
export const MAX_SAVE_BYTES = 262_144;
/** The most replay segments a save may have; each pause adds one. */
export const MAX_SAVE_SEGMENTS = 32;

export const FIXED_ERROR_CODES = [
  'invalid_message',
  'too_large',
  'protocol_version',
  'not_joined',
  'room_full',
  'unknown_room',
  'superseded',
  'rate_limited',
  'internal_error',
  'unknown_seat',
  'wrong_pin',
  'pin_locked',
  'not_expired',
  'rejoin_declined',
  'rejoin_unavailable',
  'room_closed',
  'paused',
  'not_pausable',
] as const;

/** Engine error ids pass through with their `error-` prefix. */
export type ErrorCode = (typeof FIXED_ERROR_CODES)[number] | `error-${string}`;

const CLOSING_ERROR_CODE_LIST = [
  'protocol_version',
  'room_full',
  'unknown_room',
  'unknown_seat',
  'superseded',
  'rejoin_declined',
  'rejoin_unavailable',
] as const satisfies readonly ErrorCode[];

/** An error code after which the referee closes the connection that received it. */
export type ClosingErrorCode = (typeof CLOSING_ERROR_CODE_LIST)[number];

/** The error codes after which the referee closes the connection; the same hello cannot succeed. */
export const CLOSING_ERROR_CODES: ReadonlySet<ClosingErrorCode> = new Set(CLOSING_ERROR_CODE_LIST);

/** True when `code` is one of `CLOSING_ERROR_CODES`. */
export function isClosingErrorCode(code: string | null | undefined): code is ClosingErrorCode {
  return typeof code === 'string' && (CLOSING_ERROR_CODES as ReadonlySet<string>).has(code);
}
