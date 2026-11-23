/** Wrong PIN attempts a seat may make within `PIN_LOCK_MS`; the next one locks its PIN. */
export const PIN_MAX_FAILURES = 5;
/** How long a wrong PIN attempt counts, and how long a locked PIN stays locked. */
export const PIN_LOCK_MS = 900_000;

/** One seat's recent wrong PIN attempts and lock; times are epoch milliseconds. */
export interface PinLockout {
  readonly failures: readonly number[];
  readonly lockedUntil: number | null;
}

export const UNLOCKED: PinLockout = { failures: [], lockedUntil: null };

/** Drops failures older than the window and a lock that has run out by `now`. */
export function expire(lockout: PinLockout, now: number): PinLockout {
  const failures = lockout.failures.filter((at) => at > now - PIN_LOCK_MS);
  const lockedUntil =
    lockout.lockedUntil !== null && lockout.lockedUntil > now ? lockout.lockedUntil : null;
  if (failures.length === lockout.failures.length && lockedUntil === lockout.lockedUntil) {
    return lockout;
  }
  return { failures, lockedUntil };
}

export function isLocked(lockout: PinLockout, now: number): boolean {
  return lockout.lockedUntil !== null && lockout.lockedUntil > now;
}

/** Records a wrong attempt at `now`, locking once more than `PIN_MAX_FAILURES` are in the window. */
export function recordFailure(lockout: PinLockout, now: number): PinLockout {
  const failures = [...expire(lockout, now).failures, now];
  const lockedUntil = failures.length > PIN_MAX_FAILURES ? now + PIN_LOCK_MS : null;
  return { failures, lockedUntil };
}

/** Forgets every recorded failure, keeping any lock. */
export function clearFailures(lockout: PinLockout): PinLockout {
  return lockout.failures.length === 0
    ? lockout
    : { failures: [], lockedUntil: lockout.lockedUntil };
}

/** When the lock lifts, or `null` if there is none. */
export function unlocksAt(lockout: PinLockout): number | null {
  return lockout.lockedUntil;
}
