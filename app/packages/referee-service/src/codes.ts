import type { Random } from '@wwd/referee-core';

const SEED_PATTERN = /^[0-9a-f]{64}$/;

/** Matches a normalised room join code. */
export const JOIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * A deterministic, non-cryptographic byte source (xoshiro128**) seeded from 64 hex characters.
 * For test overrides only; never use it where secrecy matters.
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
