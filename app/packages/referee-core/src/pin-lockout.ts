/** Wrong PIN attempts a seat may make within `PIN_LOCK_MS`; the next one locks its PIN. */
export const PIN_MAX_FAILURES = 5;
/** How long a wrong PIN attempt counts, and how long a locked PIN stays locked. */
export const PIN_LOCK_MS = 900_000;

/** The longest a PIN stays locked, however many times it has been locked. */
export const PIN_LOCK_MAX_MS = 86_400_000;

/** One seat's recent wrong PIN attempts, lock and lockout count; times are epoch milliseconds. */
export interface PinLockout {
  readonly failures: readonly number[];
  readonly lockedUntil: number | null;
  /** How many times the PIN has locked since its last successful use. */
  readonly lockouts: number;
}

export const UNLOCKED: PinLockout = { failures: [], lockedUntil: null, lockouts: 0 };

/** How long the `lockouts`th lock lasts: `PIN_LOCK_MS`, doubling each time up to `PIN_LOCK_MAX_MS`. */
export function lockDuration(lockouts: number): number {
  return Math.min(PIN_LOCK_MS * 2 ** (lockouts - 1), PIN_LOCK_MAX_MS);
}

/** Drops failures older than the window and a lock that has run out by `now`. */
export function expire(lockout: PinLockout, now: number): PinLockout {
  const failures = lockout.failures.filter((at) => at > now - PIN_LOCK_MS);
  const lockedUntil =
    lockout.lockedUntil !== null && lockout.lockedUntil > now ? lockout.lockedUntil : null;
  if (failures.length === lockout.failures.length && lockedUntil === lockout.lockedUntil) {
    return lockout;
  }
  return { failures, lockedUntil, lockouts: lockout.lockouts };
}

export function isLocked(lockout: PinLockout, now: number): boolean {
  return lockout.lockedUntil !== null && lockout.lockedUntil > now;
}

/** Records a wrong attempt at `now`, locking once more than `PIN_MAX_FAILURES` are in the window. */
export function recordFailure(lockout: PinLockout, now: number): PinLockout {
  const failures = [...expire(lockout, now).failures, now];
  if (failures.length <= PIN_MAX_FAILURES) {
    return { failures, lockedUntil: null, lockouts: lockout.lockouts };
  }
  const lockouts = lockout.lockouts + 1;
  return { failures, lockedUntil: now + lockDuration(lockouts), lockouts };
}

/** Forgets every recorded failure and the lockout count, keeping any lock. */
export function clearFailures(lockout: PinLockout): PinLockout {
  return lockout.failures.length === 0 && lockout.lockouts === 0
    ? lockout
    : { failures: [], lockedUntil: lockout.lockedUntil, lockouts: 0 };
}

/** When the lock lifts, or `null` if there is none. */
export function unlocksAt(lockout: PinLockout): number | null {
  return lockout.lockedUntil;
}
