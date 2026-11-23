import type { Replay, RulesConfig, Seat } from '@wwd/engine';

export interface SeatRecord {
  token: string;
  name?: string;
}

/** A connection waiting for the seated opponent to let it take over `seat`. */
export interface PendingRejoin {
  conn: string;
  seat: Seat;
  /** When the request is declined if it is still unanswered. */
  deadline: number;
  last_seq?: number;
}

/** The durable state of a room written before grace windows and seat PINs existed. */
export interface RoomSnapshotV1 {
  version: 1;
  code: string;
  config: RulesConfig;
  seats: [SeatRecord | null, SeatRecord | null];
  /** `null` until both seats have joined. */
  replay: Replay | null;
  /** The game-wide sequence number of the current segment's first event. */
  segment_base: number;
}

/** The durable state of a room, as plain JSON-serialisable data; times are epoch milliseconds. */
export interface RoomSnapshot extends Omit<RoomSnapshotV1, 'version'> {
  version: 2;
  grace_ms: number;
  /** When each seat disconnected from a game in progress, or `null` while it is not in grace. */
  disconnected_at: [number | null, number | null];
  /** Each seat's PIN, or `null` until it is next sent one. */
  pins: [string | null, string | null];
  /** The times of each seat's recent wrong PIN attempts. */
  pin_failures: [number[], number[]];
  pin_locked_until: [number | null, number | null];
  last_activity_at: number;
  finished_at: number | null;
  /** The unanswered rejoin request, kept only by a restore that wakes the room. */
  pending_rejoin?: PendingRejoin | null;
  /**
   * Whether each seat's expired grace window has been announced to its opponent, kept only by a
   * restore that wakes the room; absent means neither has been.
   */
  grace_announced?: [boolean, boolean];
}

export const DEFAULT_GRACE_MS = 600_000;

/** Upgrades a v1 snapshot, taking `now` as its last activity. */
export function upgradeSnapshot(snapshot: RoomSnapshotV1, now: number): RoomSnapshot {
  return {
    ...snapshot,
    version: 2,
    grace_ms: DEFAULT_GRACE_MS,
    disconnected_at: [null, null],
    pins: [null, null],
    pin_failures: [[], []],
    pin_locked_until: [null, null],
    last_activity_at: now,
    finished_at: null,
  };
}
