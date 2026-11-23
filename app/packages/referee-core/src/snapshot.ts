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

/** The durable state of a room written before pauses existed; times are epoch milliseconds. */
export interface RoomSnapshotV2 extends Omit<RoomSnapshotV1, 'version'> {
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

/** A room's pause as stored. */
export interface PauseSnapshot {
  requested_by: Seat | null;
  agreed: boolean;
  paused: boolean;
  /** When the pause applied, or `null` while it has not; a save's `saved_at`. */
  paused_at: number | null;
  /** The seats that asked to resume, kept only by a restore that wakes the room. */
  resume_ready: Seat[];
}

/** How the seats of a room created from a save are being claimed. */
export interface FromSaveSnapshot {
  /** The seat kept for the first tokenless hello that names it, while it is unclaimed. */
  reserved_seat: Seat;
}

/** The durable state of a room, as plain JSON-serialisable data; times are epoch milliseconds. */
export interface RoomSnapshot extends Omit<RoomSnapshotV2, 'version'> {
  version: 3;
  pause: PauseSnapshot;
  /** Which of the room's games is being played, from 0 for its first. */
  game: number;
  /** The seats that asked for a rematch, kept only by a restore that wakes the room. */
  rematch_ready: Seat[];
  /** How many times each seat's PIN has locked since it was last used successfully. */
  pin_lockouts: [number, number];
  /** Set while a room created from a save still has a seat to claim. */
  from_save: FromSaveSnapshot | null;
}

/** Any snapshot version an adapter may have stored, all of which `Room.restore` accepts. */
export type StoredRoomSnapshot = RoomSnapshot | RoomSnapshotV2 | RoomSnapshotV1;

export const DEFAULT_GRACE_MS = 600_000;

/**
 * Upgrades a v1 or v2 snapshot, taking `now` as a v1 snapshot's last activity; throws for a
 * version it does not know.
 */
export function upgradeSnapshot(
  snapshot: RoomSnapshotV1 | RoomSnapshotV2 | RoomSnapshot,
  now: number,
): RoomSnapshot {
  const version: number = snapshot.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error('unsupported room snapshot version');
  }
  if (snapshot.version === 3) {
    // v3 snapshots written before rematches and saves existed lack these fields.
    return {
      ...snapshot,
      game: snapshot.game ?? 0,
      rematch_ready: snapshot.rematch_ready ?? [],
      pin_lockouts: snapshot.pin_lockouts ?? [0, 0],
      from_save: snapshot.from_save ?? null,
    };
  }
  const v2 = snapshot.version === 2 ? snapshot : upgradeV1(snapshot, now);
  return {
    ...v2,
    version: 3,
    pause: { requested_by: null, agreed: false, paused: false, paused_at: null, resume_ready: [] },
    game: 0,
    rematch_ready: [],
    pin_lockouts: [0, 0],
    from_save: null,
  };
}

function upgradeV1(snapshot: RoomSnapshotV1, now: number): RoomSnapshotV2 {
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
