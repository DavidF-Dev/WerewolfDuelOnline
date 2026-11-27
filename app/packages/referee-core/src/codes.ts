import { isClosingErrorCode, type ErrorCode } from '@wwd/protocol';
import type { ConnId, Outbound, Random } from './deps.js';

const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const JOIN_CODE_LENGTH = 6;
const PIN_ALPHABET = '0123456789';
const PIN_LENGTH = 4;
const SEED_PATTERN = /^[0-9a-f]{64}$/;

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

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * A deterministic, non-cryptographic byte source (xoshiro128**) seeded from 64 hex characters.
 * For test overrides and scripted games only; never use it where secrecy matters.
 */
export function seededRandom(seedHex: string): Random {
  if (!SEED_PATTERN.test(seedHex)) throw new Error('seed must be 64 lowercase hex characters');
  const words: number[] = [];
  for (let i = 0; i < 8; i++) words.push(parseInt(seedHex.slice(i * 8, i * 8 + 8), 16) >>> 0);
  const s: number[] = [0, 1, 2, 3].map((i) => (words[i]! ^ rotl(words[i + 4]!, 13)) >>> 0);
  if (!s.some((w) => w !== 0)) s[0] = 1;

  const next = (): number => {
    const result = Math.imul(rotl(Math.imul(s[1]!, 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1]! << 9) >>> 0;
    s[2] = (s[2]! ^ s[0]!) >>> 0;
    s[3] = (s[3]! ^ s[1]!) >>> 0;
    s[1] = (s[1]! ^ s[2]!) >>> 0;
    s[0] = (s[0]! ^ s[3]!) >>> 0;
    s[2] = (s[2]! ^ t) >>> 0;
    s[3] = rotl(s[3]!, 11);
    return result;
  };

  return {
    bytes(n: number): Uint8Array {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 4) {
        const w = next();
        for (let j = 0; j < 4 && i + j < n; j++) out[i + j] = (w >>> (8 * j)) & 0xff;
      }
      return out;
    },
  };
}
