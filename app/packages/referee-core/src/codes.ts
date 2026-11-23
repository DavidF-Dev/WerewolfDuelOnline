import { isClosingErrorCode, type ErrorCode } from '@wwd/protocol';
import type { ConnId, Outbound, Random } from './deps.js';

const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const JOIN_CODE_LENGTH = 6;
const PIN_ALPHABET = '0123456789';
const PIN_LENGTH = 4;

/** Draws `length` characters uniformly from an alphabet of at most 256 characters. */
function drawUniform(random: Random, alphabet: string, length: number): string {
  // The largest multiple of the alphabet size that fits in a byte; bytes at or above it are redrawn.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const byte of random.bytes(length - out.length)) {
      if (byte < limit) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

/** Draws a join code of Crockford base32 characters with no modulo bias. */
export function generateJoinCode(random: Random): string {
  return drawUniform(random, JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH);
}

/** Draws a seat PIN of decimal digits with no modulo bias. */
export function generatePin(random: Random): string {
  return drawUniform(random, PIN_ALPHABET, PIN_LENGTH);
}

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Compares two strings in time that depends only on their length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True for an error after which the connection is of no further use and should be closed. */
export function closesConnection(code: ErrorCode): boolean {
  return isClosingErrorCode(code);
}

/** An error for `conn`, closing it when the error is a closing one. */
export function errorTo(conn: ConnId, code: ErrorCode): Outbound {
  const msg = { type: 'error', code } as const;
  return closesConnection(code) ? { conn, msg, close: true } : { conn, msg };
}
