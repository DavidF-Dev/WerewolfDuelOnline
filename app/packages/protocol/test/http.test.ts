import { beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { GRACE_CHOICES_MINUTES, MAX_MESSAGE_BYTES, parseCreateRoomRequest } from '../src/index.js';

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
