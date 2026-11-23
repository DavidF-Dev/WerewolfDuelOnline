export const LIMITS = {
  MAX_FRAME_BYTES: 16_384,
  PRE_HELLO_TIMEOUT_MS: 10_000,
  MAX_CONNECTIONS_PER_ROOM: 8,
  ROOM_CREATE_LIMIT: 20,
  IDLE_ROOM_TTL_MS: 30 * 24 * 3_600_000,
  FINISHED_ROOM_TTL_MS: 24 * 3_600_000,
  IDLE_TIMEOUT_MS: 75_000,
} as const;

/** The activity times that decide a room's retention. */
export interface RetainedRoom {
  lastActivityAt: number;
  finishedAt: number | null;
}

/** When a room passes its retention: finished rooms expire sooner than idle ones. */
export function expiresAt(room: RetainedRoom): number {
  const idle = room.lastActivityAt + LIMITS.IDLE_ROOM_TTL_MS;
  if (room.finishedAt === null) return idle;
  return Math.min(idle, room.finishedAt + LIMITS.FINISHED_ROOM_TTL_MS);
}

/** Whether a room is past its retention. */
export function isExpired(room: RetainedRoom, now: number): boolean {
  return now >= expiresAt(room);
}
