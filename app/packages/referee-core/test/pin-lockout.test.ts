import { describe, expect, it } from 'vitest';
import {
  PIN_LOCK_MAX_MS,
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
    expect(expire(locked, until)).toEqual({ ...UNLOCKED, lockouts: 1 });
  });

  it('clearFailures keeps the lock', () => {
    const locked = failTimes(Array.from({ length: PIN_MAX_FAILURES + 1 }, () => 1000));
    expect(clearFailures(locked)).toEqual({
      failures: [],
      lockedUntil: unlocksAt(locked),
      lockouts: 0,
    });
    expect(clearFailures(UNLOCKED)).toBe(UNLOCKED);
  });

  it('never mutates its input', () => {
    const lockout: PinLockout = Object.freeze({
      failures: Object.freeze([1000]),
      lockedUntil: null,
      lockouts: 0,
    });
    expect(() => recordFailure(lockout, 2000)).not.toThrow();
    expect(lockout.failures).toEqual([1000]);
  });
});

describe('escalating PIN lock', () => {
  function lockAt(lockout: PinLockout, now: number): PinLockout {
    let next = lockout;
    for (let n = 0; n <= PIN_MAX_FAILURES; n++) next = recordFailure(next, now);
    return next;
  }

  it('lockout doubles and caps', () => {
    let lockout = UNLOCKED;
    let now = 1000;
    const durations: number[] = [];
    for (let n = 0; n < 12; n++) {
      lockout = lockAt(lockout, now);
      durations.push(unlocksAt(lockout)! - now);
      now = unlocksAt(lockout)!;
      lockout = expire(lockout, now);
    }
    expect(durations.slice(0, 4)).toEqual([
      PIN_LOCK_MS,
      PIN_LOCK_MS * 2,
      PIN_LOCK_MS * 4,
      PIN_LOCK_MS * 8,
    ]);
    expect(durations.slice(-3)).toEqual([PIN_LOCK_MAX_MS, PIN_LOCK_MAX_MS, PIN_LOCK_MAX_MS]);
    expect(Math.max(...durations)).toBe(PIN_LOCK_MAX_MS);
    expect(lockout.lockouts).toBe(12);
  });

  it('the count survives a lock running out', () => {
    const locked = lockAt(UNLOCKED, 1000);
    expect(expire(locked, unlocksAt(locked)!).lockouts).toBe(1);
  });

  it('clearFailures resets the lockout count', () => {
    const locked = lockAt(UNLOCKED, 1000);
    expect(clearFailures(expire(locked, unlocksAt(locked)!)).lockouts).toBe(0);
  });
});
