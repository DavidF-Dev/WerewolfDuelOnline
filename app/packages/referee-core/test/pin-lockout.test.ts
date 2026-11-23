import { describe, expect, it } from 'vitest';
import {
  PIN_LOCK_MS,
  PIN_MAX_FAILURES,
  UNLOCKED,
  clearFailures,
  expire,
  isLocked,
  recordFailure,
  unlocksAt,
  type PinLockout,
} from '../src/pin-lockout.js';

function failTimes(times: number[]): PinLockout {
  return times.reduce((lockout, at) => recordFailure(lockout, at), UNLOCKED);
}

describe('PIN lockout', () => {
  it('locks on the failure after PIN_MAX_FAILURES within the window', () => {
    const times = Array.from({ length: PIN_MAX_FAILURES }, (_, n) => 1000 + n);
    const almost = failTimes(times);
    expect(isLocked(almost, 2000)).toBe(false);
    expect(unlocksAt(almost)).toBeNull();

    const locked = recordFailure(almost, 2000);
    expect(isLocked(locked, 2000)).toBe(true);
    expect(unlocksAt(locked)).toBe(2000 + PIN_LOCK_MS);
    expect(locked.failures).toHaveLength(PIN_MAX_FAILURES + 1);
  });

  it('failures outside the window do not count', () => {
    const old = failTimes(Array.from({ length: PIN_MAX_FAILURES }, () => 1000));
    const fresh = recordFailure(old, 1000 + PIN_LOCK_MS);
    expect(isLocked(fresh, 1000 + PIN_LOCK_MS)).toBe(false);
    expect(fresh.failures).toEqual([1000 + PIN_LOCK_MS]);
  });

  it('expire lifts a lock at its unlock time and prunes old failures', () => {
    const locked = failTimes(Array.from({ length: PIN_MAX_FAILURES + 1 }, () => 1000));
    const until = unlocksAt(locked)!;
    expect(expire(locked, until - 1)).toBe(locked);
    expect(isLocked(locked, until - 1)).toBe(true);
    expect(isLocked(locked, until)).toBe(false);
    expect(expire(locked, until)).toEqual(UNLOCKED);
  });

  it('clearFailures keeps the lock', () => {
    const locked = failTimes(Array.from({ length: PIN_MAX_FAILURES + 1 }, () => 1000));
    expect(clearFailures(locked)).toEqual({ failures: [], lockedUntil: unlocksAt(locked) });
    expect(clearFailures(UNLOCKED)).toBe(UNLOCKED);
  });

  it('never mutates its input', () => {
    const lockout: PinLockout = Object.freeze({
      failures: Object.freeze([1000]),
      lockedUntil: null,
    });
    expect(() => recordFailure(lockout, 2000)).not.toThrow();
    expect(lockout.failures).toEqual([1000]);
  });
});
