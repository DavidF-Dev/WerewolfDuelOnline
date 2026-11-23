import { beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  GRACE_CHOICES_MINUTES,
  MAX_MESSAGE_BYTES,
  MAX_SAVE_BYTES,
  parseCreateRoomRequest,
} from '../src/index.js';

beforeAll(loadEngineForNode);

const body = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ config: defaultRulesConfig(), grace_minutes: 10, ...extra });

describe('parseCreateRoomRequest', () => {
  it('accepts the engine default config with each grace choice', () => {
    for (const grace_minutes of GRACE_CHOICES_MINUTES) {
      const r = parseCreateRoomRequest(body({ grace_minutes }));
      expect(r).toEqual({ ok: true, msg: { config: defaultRulesConfig(), grace_minutes } });
    }
  });

  it('accepts every valid config value and test overrides', () => {
    const configs = [
      { tiebreak: 'badge_only', min_targets: 0, badge_start: { seat: 'p1' } },
      { tiebreak: 'hourglasses_then_badge', min_targets: 1, badge_start: { seat: 'p0' } },
    ];
    for (const config of configs) expect(parseCreateRoomRequest(body({ config })).ok).toBe(true);
    const test = { grace_ms: 1000, seed: 'ab'.repeat(32) };
    expect(parseCreateRoomRequest(body({ test }))).toMatchObject({ ok: true, msg: { test } });
  });

  it('rejects a bad grace choice', () => {
    for (const grace_minutes of [7, '10', 0, null]) {
      expect(parseCreateRoomRequest(body({ grace_minutes }))).toEqual({
        ok: false,
        code: 'invalid_message',
      });
    }
  });

  it('rejects malformed configs', () => {
    const good = defaultRulesConfig();
    const bad: unknown[] = [
      { ...good, extra: 1 },
      { tiebreak: good.tiebreak, min_targets: good.min_targets },
      { ...good, tiebreak: 'nope' },
      { ...good, min_targets: 2 },
      { ...good, min_targets: '1' },
      { ...good, badge_start: 'p0' },
      { ...good, badge_start: { seat: 'p2' } },
      { ...good, badge_start: { seat: 'p0', extra: 1 } },
      [],
      null,
    ];
    for (const config of bad) {
      expect(parseCreateRoomRequest(body({ config })).ok).toBe(false);
    }
  });

  it('rejects bad test overrides', () => {
    const bad: unknown[] = [
      { seed: 'ab' },
      { seed: 'zz'.repeat(32) },
      { grace_ms: 999 },
      { grace_ms: 3_600_001 },
      { grace_ms: 1.5 },
      { other: 1 },
    ];
    for (const test of bad) expect(parseCreateRoomRequest(body({ test })).ok).toBe(false);
  });

  it('rejects invalid json, extra keys and oversized bodies', () => {
    expect(parseCreateRoomRequest('nope')).toEqual({ ok: false, code: 'invalid_message' });
    expect(parseCreateRoomRequest(body({ extra: 1 })).ok).toBe(false);
    const big = body({ test: { seed: 'a'.repeat(MAX_MESSAGE_BYTES) } });
    expect(parseCreateRoomRequest(big)).toEqual({ ok: false, code: 'too_large' });
  });
});

describe('parseCreateRoomRequest with a save', () => {
  // Only the request's shape is checked here; the referee verifies the save itself.
  const save = { format_version: 1, kind: 'wwd-save', hash: 'ab' };
  const fromSave = (extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ save, seat: 'p1', grace_minutes: 5, ...extra });

  it('accepts a save, a seat and a grace choice', () => {
    expect(parseCreateRoomRequest(fromSave())).toEqual({
      ok: true,
      msg: { save, seat: 'p1', grace_minutes: 5 },
    });
  });

  it('rejects a bad seat, a missing save, extra keys and test options', () => {
    for (const extra of [{ seat: 'p2' }, { save: [] }, { save: null }, { extra: 1 }]) {
      expect(parseCreateRoomRequest(fromSave(extra)).ok).toBe(false);
    }
    expect(parseCreateRoomRequest(fromSave({ test: { grace_ms: 1000 } })).ok).toBe(false);
    expect(parseCreateRoomRequest(fromSave({ config: defaultRulesConfig() })).ok).toBe(false);
  });

  it('allows a save body up to the save cap only', () => {
    expect(MAX_SAVE_BYTES).toBe(262_144);
    const padded = (bytes: number): string => {
      const raw = fromSave({ save: { ...save, pad: '' } });
      return fromSave({ save: { ...save, pad: 'x'.repeat(bytes - raw.length) } });
    };
    expect(padded(MAX_SAVE_BYTES).length).toBe(MAX_SAVE_BYTES);
    expect(parseCreateRoomRequest(padded(MAX_SAVE_BYTES)).ok).toBe(true);
    expect(parseCreateRoomRequest(padded(MAX_SAVE_BYTES + 1))).toEqual({
      ok: false,
      code: 'too_large',
    });
  });

  it('keeps the message cap for a body without a save', () => {
    const big = body({ pad: 'x'.repeat(MAX_MESSAGE_BYTES) });
    expect(parseCreateRoomRequest(big)).toEqual({ ok: false, code: 'too_large' });
    expect(parseCreateRoomRequest('x'.repeat(MAX_MESSAGE_BYTES + 1))).toEqual({
      ok: false,
      code: 'too_large',
    });
  });
});
