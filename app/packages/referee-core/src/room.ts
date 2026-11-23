import {
  EngineError,
  EngineFault,
  Game,
  type Command,
  type RulesConfig,
  type Seat,
  type View,
} from '@wwd/engine';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type SaveFile,
  type ServerMessage,
} from '@wwd/protocol';
import { constantTimeEqual, errorTo as error, generatePin, toHex } from './codes.js';
import type {
  Clock,
  ConnId,
  Outbound,
  Random,
  RestoreOptions,
  RoomDeps,
  RoomOptions,
} from './deps.js';
import * as pausing from './pause.js';
import { NOT_PAUSED, type Pause } from './pause.js';
import { PauseFlow } from './pause-flow.js';
import { verifySave } from './from-save.js';
import * as rematch from './rematch.js';
import { SEATS, opponentOf, type Pair, type SeatIndex } from './seats.js';
import {
  UNLOCKED,
  clearFailures,
  expire,
  isLocked,
  recordFailure,
  unlocksAt,
  type PinLockout,
} from './pin-lockout.js';
import {
  DEFAULT_GRACE_MS,
  upgradeSnapshot,
  type FromSaveSnapshot,
  type PendingRejoin,
  type RoomSnapshot,
  type RoomSnapshotV1,
  type RoomSnapshotV2,
  type SeatRecord,
} from './snapshot.js';

type Hello = Extract<ClientMessage, { type: 'hello' }>;
type Rejoin = Extract<ClientMessage, { type: 'rejoin' }>;
type OpponentStatus = Extract<ServerMessage, { type: 'opponent_status' }>;

/** How long a rejoin request waits for the opponent's answer before it is declined. */
export const REJOIN_APPROVAL_TIMEOUT_MS = 120_000;

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10_000;
const SEAT_TOKEN_BYTES = 16;
const SEED_BYTES = 32;
// A fixed seed for a throwaway game that only checks the config is accepted.
const CONFIG_PROBE_SEED = '00'.repeat(SEED_BYTES);

/** A seat's live connection and the log index up to which it has been sent events. */
interface Binding {
  conn: ConnId;
  mark: number;
}

/** An unbound connection waiting for the opponent of `seat` to let it take that seat. */
interface RejoinRequest {
  conn: ConnId;
  seat: SeatIndex;
  deadline: number;
  lastSeq: number | undefined;
}

/** The room's durable state apart from the engine game. */
interface RoomState {
  code: string;
  config: RulesConfig;
  /** The rules of the game being played, which for a rematch differ from `config` in the Badge start. */
  gameConfig: RulesConfig;
  seats: Pair<SeatRecord | null>;
  segmentBase: number;
  graceMs: number;
  disconnectedAt: Pair<number | null>;
  pins: Pair<string | null>;
  pinLockouts: Pair<PinLockout>;
  lastActivityAt: number;
  finishedAt: number | null;
  /** Which of the room's games is being played, from 0 for its first. */
  game: number;
  rematchReady: readonly Seat[];
  /** For a room created from a save with a seat still unclaimed, the seat kept for its uploader. */
  reservedSeat: SeatIndex | null;
}

function isGameOver(view: View): boolean {
  return typeof view.phase === 'object' && 'game_over' in view.phase;
}

function earlier(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  return b === null || a <= b ? a : b;
}

function graceOf(options: Partial<RoomOptions>): number {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  if (!Number.isSafeInteger(graceMs) || graceMs < 0) {
    throw new Error('grace period must be a non-negative whole number of milliseconds');
  }
  return graceMs;
}

function reservedIndex(fromSave: FromSaveSnapshot): SeatIndex {
  const i = SEATS.indexOf(fromSave.reserved_seat);
  if (i !== 0 && i !== 1) throw new Error('room snapshot reserves an unknown seat');
  return i;
}

function copySeats(seats: Pair<SeatRecord | null>): Pair<SeatRecord | null> {
  return [seats[0] === null ? null : { ...seats[0] }, seats[1] === null ? null : { ...seats[1] }];
}

/** One two-seat game room: turns inbound client messages into outbound server messages. */
export class Room {
  private readonly bindings: Pair<Binding | undefined> = [undefined, undefined];
  private readonly seatOfConn = new Map<ConnId, SeatIndex>();
  private readonly arrivals = new Map<ConnId, number[]>();
  // Whether each seat's expired grace has been announced to its opponent.
  private readonly graceAnnounced: Pair<boolean> = [false, false];
  private pendingRejoin: RejoinRequest | null = null;
  private readonly pauses: PauseFlow;
  private readonly clock: Clock;
  private readonly random: Random;
  private disposed = false;
  private isFaulted = false;
  private changes = 0;

  private constructor(
    private readonly state: RoomState,
    private game: Game | undefined,
    pause: Pause,
    deps: RoomDeps,
  ) {
    this.clock = deps.clock;
    this.random = deps.random;
    this.pauses = new PauseFlow(pause, {
      code: state.code,
      game: () => this.game,
      now: () => this.clock.now(),
      inProgress: () => this.inProgress(),
      seatOf: (conn) => this.seatOfConn.get(conn),
      connOf: (i) => this.bindings[i]?.conn,
      touch: () => this.touch(),
      stopGrace: () => this.stopGrace(),
      continueIn: (next) => this.continueIn(next),
      newSeed: () => this.newSeed(),
      failure: (conn, thrown) => error(conn, this.codeFor(thrown)),
      pushEvents: (i, out) => this.pushEvents(i, out),
      opponentStatus: (conn, i) => this.opponentStatus(conn, i),
    });
  }

  /** Creates an empty room; throws if the engine rejects `config` or the options are invalid. */
  static create(
    code: string,
    config: RulesConfig,
    deps: RoomDeps,
    options: Partial<RoomOptions> = {},
  ): Room {
    const graceMs = graceOf(options);
    Game.create(CONFIG_PROBE_SEED, config).dispose();
    const state: RoomState = {
      code,
      config: { ...config },
      gameConfig: { ...config },
      seats: [null, null],
      segmentBase: 0,
      graceMs,
      disconnectedAt: [null, null],
      pins: [null, null],
      pinLockouts: [UNLOCKED, UNLOCKED],
      lastActivityAt: deps.clock.now(),
      finishedAt: null,
      game: 0,
      rematchReady: rematch.NO_ONE,
      reservedSeat: null,
    };
    return new Room(state, undefined, NOT_PAUSED, deps);
  }

  /**
   * Creates a room that continues an uploaded save, paused at its boundary with both seats
   * unclaimed and `seat` kept for the first tokenless hello that names it. Throws
   * `InvalidSaveError` if the save does not verify, and throws if the options are invalid.
   */
  static fromSave(
    code: string,
    save: SaveFile,
    seat: Seat,
    deps: RoomDeps,
    options: Partial<RoomOptions> = {},
  ): Room {
    const graceMs = graceOf(options);
    const reserved = SEATS.indexOf(seat);
    if (reserved !== 0 && reserved !== 1) throw new Error('unknown seat');
    const { game, segmentBase } = verifySave(save);
    const state: RoomState = {
      code,
      config: { ...save.config },
      gameConfig: { ...save.config },
      seats: [null, null],
      segmentBase,
      graceMs,
      disconnectedAt: [null, null],
      pins: [null, null],
      pinLockouts: [UNLOCKED, UNLOCKED],
      lastActivityAt: deps.clock.now(),
      finishedAt: null,
      game: 0,
      rematchReady: rematch.NO_ONE,
      reservedSeat: reserved,
    };
    return new Room(state, game, pausing.applied(NOT_PAUSED, save.saved_at), deps);
  }

  /** Rebuilds a room from a trusted v1, v2 or v3 snapshot; throws if it or its replay is invalid. */
  static restore(
    snapshot: RoomSnapshot | RoomSnapshotV2 | RoomSnapshotV1,
    deps: RoomDeps,
    options: RestoreOptions = {},
  ): Room {
    const now = deps.clock.now();
    const v3 = upgradeSnapshot(snapshot, now);
    const wake = options.wake === true;

    const seats = copySeats(v3.seats);
    const bothSeated = seats[0] !== null && seats[1] !== null;
    const fromSave = v3.from_save;
    if (fromSave !== null && (v3.replay === null || !v3.pause.paused)) {
      throw new Error('room snapshot from a save is not paused at its boundary');
    }
    if (v3.replay !== null && !bothSeated && fromSave === null) {
      throw new Error('room snapshot has a game without two seats');
    }
    if (v3.replay === null && bothSeated) {
      throw new Error('room snapshot has two seats without a game');
    }
    const game = v3.replay === null ? undefined : Game.fromReplay(v3.replay);
    const finishedAt =
      v3.finished_at ?? (game !== undefined && !game.canResign(SEATS[0]) ? now : null);
    const stored = v3.pause;
    if (
      stored.paused &&
      (game === undefined ||
        finishedAt !== null ||
        stored.paused_at === null ||
        game.roundBoundary() === null)
    ) {
      game?.dispose();
      throw new Error('room snapshot is paused away from a round boundary');
    }
    const state: RoomState = {
      code: v3.code,
      config: { ...v3.config },
      gameConfig: { ...(v3.replay?.config ?? v3.config) },
      seats,
      segmentBase: v3.segment_base,
      graceMs: v3.grace_ms,
      disconnectedAt: [...v3.disconnected_at],
      pins: [...v3.pins],
      pinLockouts: [
        {
          failures: [...v3.pin_failures[0]],
          lockedUntil: v3.pin_locked_until[0],
          lockouts: v3.pin_lockouts[0],
        },
        {
          failures: [...v3.pin_failures[1]],
          lockedUntil: v3.pin_locked_until[1],
          lockouts: v3.pin_lockouts[1],
        },
      ],
      lastActivityAt: v3.last_activity_at,
      finishedAt,
      game: v3.game,
      rematchReady: wake ? [...v3.rematch_ready] : rematch.NO_ONE,
      reservedSeat: fromSave === null ? null : reservedIndex(fromSave),
    };
    const pause: Pause = {
      requestedBy: stored.requested_by,
      agreed: stored.agreed,
      paused: stored.paused,
      pausedAt: stored.paused ? stored.paused_at : null,
      resumeReady: wake ? [...stored.resume_ready] : [],
    };
    const room = new Room(state, game, pause, deps);
    // No seat is bound after a restore, so a fresh window keeps downtime from counting against anyone.
    if (room.graceRuns()) {
      for (const s of [0, 1] as const) {
        if (!wake || state.disconnectedAt[s] === null) room.startGrace(s);
        else room.graceAnnounced[s] = v3.grace_announced?.[s] === true;
      }
    }
    const pending = v3.pending_rejoin;
    if (wake && pending != null) {
      const i = SEATS.indexOf(pending.seat);
      if ((i === 0 || i === 1) && seats[i] !== null) {
        room.pendingRejoin = {
          conn: pending.conn,
          seat: i,
          deadline: pending.deadline,
          lastSeq: pending.last_seq,
        };
      }
    }
    return room;
  }

  get code(): string {
    return this.state.code;
  }

  /** True once the engine has failed internally; the room then only replies `internal_error`. */
  get faulted(): boolean {
    return this.isFaulted;
  }

  /** When room state last changed: a handled message, a processed deadline or a seat leaving. */
  get lastActivityAt(): number {
    return this.state.lastActivityAt;
  }

  /**
   * A counter that increases whenever state captured by `snapshot` changes, so an adapter can
   * tell whether the room needs saving; replies that change nothing leave it as it was.
   */
  get revision(): number {
    return this.changes;
  }

  /** When the game was first seen to be over, or `null` while it is not. */
  get finishedAt(): number | null {
    return this.state.finishedAt;
  }

  handle(conn: ConnId, raw: string): Outbound[] {
    if (this.isFaulted) return [error(conn, 'internal_error')];
    try {
      if (!this.admit(conn)) return [error(conn, 'rate_limited')];
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) return [error(conn, parsed.code)];
      const msg = parsed.msg;
      if (msg.type === 'ping') return [{ conn, msg: { type: 'pong' } }];
      if (this.pendingRejoin?.conn === conn) return [error(conn, 'not_joined')];
      switch (msg.type) {
        case 'hello':
          return this.hello(conn, msg);
        case 'rejoin':
          return this.rejoin(conn, msg);
        case 'approve_rejoin':
          return this.answerRejoin(conn, msg.approve);
        case 'claim_win':
          return this.claimWin(conn);
        case 'pause_request':
          return this.pauses.change(conn, pausing.request);
        case 'pause_accept':
          return this.pauses.change(conn, pausing.accept);
        case 'pause_cancel':
          return this.pauses.change(conn, pausing.cancel);
        case 'resume_request':
          return this.pauses.requestResume(conn);
        case 'rematch_request':
          return this.requestRematch(conn);
        case 'command':
          return this.command(conn, msg.cmd);
      }
    } catch (thrown) {
      return [error(conn, this.codeFor(thrown))];
    }
  }

  /**
   * Processes every deadline at or before the clock's current time. An expired grace window
   * tells the waiting seat, if connected, that it may claim the win; an expired PIN lock is
   * lifted; an unanswered rejoin request is declined.
   */
  tick(): Outbound[] {
    if (this.isFaulted) return [];
    const now = this.clock.now();
    const out: Outbound[] = [];
    for (const s of [0, 1] as const) {
      this.setLockout(s, expire(this.state.pinLockouts[s], now));
      const deadline = this.graceDeadline(s);
      if (deadline === null || deadline > now || this.graceAnnounced[s]) continue;
      this.graceAnnounced[s] = true;
      this.touch();
      const waiting = this.bindings[opponentOf(s)];
      if (waiting !== undefined) out.push(this.opponentStatus(waiting.conn, opponentOf(s)));
    }
    this.expireRejoin(now, out);
    return out;
  }

  /** The earliest deadline `tick` has yet to process, or `null` if there is none. */
  nextDeadline(): number | null {
    if (this.isFaulted) return null;
    let next = this.pendingRejoin?.deadline ?? null;
    for (const s of [0, 1] as const) {
      if (!this.graceAnnounced[s]) next = earlier(next, this.graceDeadline(s));
      next = earlier(next, unlocksAt(this.state.pinLockouts[s]));
    }
    return next;
  }

  /**
   * Binds `conn` to `seat` without resending anything, for an adapter that restored this room
   * while the connection stayed open; the connection's next events start at the current log end.
   */
  rebind(conn: ConnId, seat: Seat): Outbound[] {
    if (this.isFaulted) return [error(conn, 'internal_error')];
    try {
      const i = SEATS.indexOf(seat);
      if ((i !== 0 && i !== 1) || this.state.seats[i] === null) return [error(conn, 'not_joined')];
      const held = this.seatOfConn.get(conn);
      if (held !== undefined && held !== i) this.bindings[held] = undefined;
      const previous = this.bindings[i];
      if (previous !== undefined && previous.conn !== conn) this.seatOfConn.delete(previous.conn);
      this.bind(conn, i, this.game?.logLength() ?? 0);
      const out: Outbound[] = [];
      this.withdrawRejoinFor(i, out);
      if (previous !== undefined && previous.conn !== conn) this.askAgain(conn, i, out);
      const opponent = this.bindings[opponentOf(i)];
      if (opponent === undefined) return out;
      out.push(this.opponentStatus(conn, i), this.opponentStatus(opponent.conn, opponentOf(i)));
      return out;
    } catch (thrown) {
      return [error(conn, this.codeFor(thrown))];
    }
  }

  /**
   * Unbinds `conn`; a seat leaving a game in progress starts its grace window. A rejoin request
   * is withdrawn when its connection leaves, and becomes unavailable when the seat that would
   * answer it leaves.
   */
  disconnect(conn: ConnId): Outbound[] {
    try {
      this.arrivals.delete(conn);
      const request = this.pendingRejoin;
      if (request?.conn === conn) {
        this.setPendingRejoin(null);
        const out: Outbound[] = [];
        this.tellApproverWithdrawn(request, out);
        return out;
      }
      const i = this.seatOfConn.get(conn);
      if (i === undefined) return [];
      this.seatOfConn.delete(conn);
      this.bindings[i] = undefined;
      if (this.graceRuns()) this.startGrace(i);
      this.touch();
      const out: Outbound[] = [];
      if (request !== null && request.seat === opponentOf(i)) {
        this.setPendingRejoin(null);
        out.push(error(request.conn, 'rejoin_unavailable'));
      }
      this.pauses.forgetReadiness(i, out);
      this.forgetRematch(i, out);
      const opponent = this.bindings[opponentOf(i)];
      if (opponent === undefined) return out;
      out.push(this.opponentStatus(opponent.conn, opponentOf(i)));
      return out;
    } catch {
      return [];
    }
  }

  /** Captures the room's durable state; throws once the room has been disposed. */
  snapshot(): RoomSnapshot {
    if (this.disposed) throw new Error('room has been disposed');
    const s = this.state;
    const pause = this.pauses.current;
    return {
      version: 3,
      code: s.code,
      config: { ...s.config },
      seats: copySeats(s.seats),
      replay: this.game === undefined ? null : this.game.replay(),
      segment_base: s.segmentBase,
      grace_ms: s.graceMs,
      disconnected_at: [...s.disconnectedAt],
      pins: [...s.pins],
      pin_failures: [[...s.pinLockouts[0].failures], [...s.pinLockouts[1].failures]],
      pin_locked_until: [s.pinLockouts[0].lockedUntil, s.pinLockouts[1].lockedUntil],
      pin_lockouts: [s.pinLockouts[0].lockouts, s.pinLockouts[1].lockouts],
      last_activity_at: s.lastActivityAt,
      finished_at: s.finishedAt,
      grace_announced: [...this.graceAnnounced],
      pause: {
        requested_by: pause.requestedBy,
        agreed: pause.agreed,
        paused: pause.paused,
        paused_at: pause.pausedAt,
        resume_ready: [...pause.resumeReady],
      },
      game: s.game,
      rematch_ready: [...s.rematchReady],
      from_save: s.reservedSeat === null ? null : { reserved_seat: SEATS[s.reservedSeat] },
      ...(this.pendingRejoin === null
        ? {}
        : { pending_rejoin: this.pendingSnapshot(this.pendingRejoin) }),
    };
  }

  /** Releases the engine game; the room must not be used afterwards. */
  dispose(): void {
    this.disposed = true;
    this.game?.dispose();
    this.game = undefined;
  }

  /** Maps a caught failure to its error code, marking the room faulted on an engine fault. */
  private codeFor(thrown: unknown): ErrorCode {
    if (thrown instanceof EngineFault) {
      this.isFaulted = true;
      return 'internal_error';
    }
    if (thrown instanceof EngineError && thrown.id.startsWith('error-')) {
      return thrown.id as ErrorCode;
    }
    return 'invalid_message';
  }

  /** Records an arrival, or returns false if the connection is over its rolling-window limit. */
  private admit(conn: ConnId): boolean {
    const now = this.clock.now();
    let times = this.arrivals.get(conn);
    if (times === undefined) {
      times = [];
      this.arrivals.set(conn, times);
    }
    while (times.length > 0 && times[0]! <= now - RATE_WINDOW_MS) times.shift();
    if (times.length >= RATE_LIMIT) return false;
    times.push(now);
    return true;
  }

  private touch(): void {
    this.state.lastActivityAt = this.clock.now();
    this.changes += 1;
  }

  private setPendingRejoin(request: RejoinRequest | null): void {
    this.pendingRejoin = request;
    this.changes += 1;
  }

  private pendingSnapshot(request: RejoinRequest): PendingRejoin {
    const pending: PendingRejoin = {
      conn: request.conn,
      seat: SEATS[request.seat],
      deadline: request.deadline,
    };
    if (request.lastSeq !== undefined) pending.last_seq = request.lastSeq;
    return pending;
  }

  private setLockout(i: SeatIndex, lockout: PinLockout): void {
    if (this.state.pinLockouts[i] === lockout) return;
    this.state.pinLockouts[i] = lockout;
    this.changes += 1;
  }

  /** True while a game exists and is not over. */
  private inProgress(): boolean {
    return this.game !== undefined && this.state.finishedAt === null;
  }

  /** True while a game is in progress and not paused, the only time grace windows run. */
  private graceRuns(): boolean {
    return this.inProgress() && !this.pauses.paused;
  }

  private startGrace(i: SeatIndex): void {
    this.state.disconnectedAt[i] = this.clock.now();
    this.graceAnnounced[i] = false;
    this.changes += 1;
  }

  private stopGrace(): void {
    this.state.disconnectedAt = [null, null];
    this.graceAnnounced[0] = false;
    this.graceAnnounced[1] = false;
  }

  /** When seat `i`'s grace window ends, or `null` if it is not in one. */
  private graceDeadline(i: SeatIndex): number | null {
    const at = this.state.disconnectedAt[i];
    return at === null || !this.graceRuns() ? null : at + this.state.graceMs;
  }

  private hello(conn: ConnId, msg: Hello): Outbound[] {
    if (msg.protocol_version !== PROTOCOL_VERSION) return [error(conn, 'protocol_version')];
    if (msg.room !== this.state.code) return [error(conn, 'unknown_room')];

    const held = this.seatOfConn.get(conn);
    if (msg.seat_token === undefined) {
      if (held !== undefined) return [error(conn, 'invalid_message')];
      return this.claim(conn, msg);
    }
    const claimed = this.seatWithToken(msg.seat_token);
    if (held !== undefined && held !== claimed) return [error(conn, 'invalid_message')];
    if (claimed === undefined) return [error(conn, 'unknown_seat')];
    if (msg.name !== undefined) this.state.seats[claimed]!.name = msg.name;
    return this.resume(conn, claimed, this.markFor(msg.last_seq));
  }

  private rejoin(conn: ConnId, msg: Rejoin): Outbound[] {
    if (msg.protocol_version !== PROTOCOL_VERSION) return [error(conn, 'protocol_version')];
    if (msg.room !== this.state.code) return [error(conn, 'unknown_room')];
    if (this.seatOfConn.has(conn)) return [error(conn, 'invalid_message')];
    const i = SEATS.indexOf(msg.seat) as SeatIndex;
    if (this.state.seats[i] === null) return [error(conn, 'rejoin_unavailable')];
    if (msg.pin === undefined) return this.requestRejoin(conn, i, msg.last_seq);
    return this.rejoinWithPin(conn, i, msg.pin, msg.last_seq);
  }

  /** Grants seat `i` for its PIN, or records a failed attempt and tells the opponent. */
  private rejoinWithPin(
    conn: ConnId,
    i: SeatIndex,
    pin: string,
    lastSeq: number | undefined,
  ): Outbound[] {
    const now = this.clock.now();
    const lockout = expire(this.state.pinLockouts[i], now);
    this.setLockout(i, lockout);
    if (isLocked(lockout, now)) return [error(conn, 'pin_locked')];
    const expected = this.state.pins[i];
    if (expected !== null && constantTimeEqual(expected, pin)) return this.grant(conn, i, lastSeq);

    // Deliberately no touch: unauthenticated attempts must not keep the room alive.
    const failed = recordFailure(lockout, now);
    this.setLockout(i, failed);
    const out = [error(conn, isLocked(failed, now) ? 'pin_locked' : 'wrong_pin')];
    const opponent = this.bindings[opponentOf(i)];
    if (opponent !== undefined) out.push(this.opponentStatus(opponent.conn, opponentOf(i), true));
    return out;
  }

  /** Asks the connected opponent of disconnected seat `i` to let `conn` take that seat. */
  private requestRejoin(conn: ConnId, i: SeatIndex, lastSeq: number | undefined): Outbound[] {
    const now = this.clock.now();
    const out: Outbound[] = [];
    this.expireRejoin(now, out);
    const opponent = this.bindings[opponentOf(i)];
    // A bound seat is never offered, so the opponent cannot approve its own takeover of it.
    if (this.bindings[i] !== undefined || opponent === undefined || this.pendingRejoin !== null) {
      out.push(error(conn, 'rejoin_unavailable'));
      return out;
    }
    this.setPendingRejoin({ conn, seat: i, deadline: now + REJOIN_APPROVAL_TIMEOUT_MS, lastSeq });
    out.push({ conn, msg: { type: 'rejoin_pending' } }, this.rejoinRequest(opponent.conn, now));
    return out;
  }

  /** The pending rejoin request, put to the approver on `conn`, with its time left as of `now`. */
  private rejoinRequest(conn: ConnId, now: number): Outbound {
    const deadline = this.pendingRejoin!.deadline;
    return {
      conn,
      msg: { type: 'rejoin_request', deadline, remaining_ms: Math.max(0, deadline - now) },
    };
  }

  /** Puts a pending request for the opponent of seat `i` to `conn`, which has just taken over `i`. */
  private askAgain(conn: ConnId, i: SeatIndex, out: Outbound[]): void {
    const request = this.pendingRejoin;
    const now = this.clock.now();
    if (request === null || request.seat !== opponentOf(i) || request.deadline <= now) return;
    out.push(this.rejoinRequest(conn, now));
  }

  /** Applies the answer of `conn`'s seat to the rejoin request for its opponent's seat. */
  private answerRejoin(conn: ConnId, approve: boolean): Outbound[] {
    const i = this.seatOfConn.get(conn);
    if (i === undefined) return [error(conn, 'not_joined')];
    const request = this.pendingRejoin;
    if (request === null || request.seat !== opponentOf(i)) return [error(conn, 'invalid_message')];
    this.setPendingRejoin(null);
    if (approve && this.clock.now() < request.deadline) {
      return this.grant(request.conn, request.seat, request.lastSeq);
    }
    this.touch();
    return [error(request.conn, 'rejoin_declined')];
  }

  /** Declines the pending rejoin request if its deadline has passed. */
  private expireRejoin(now: number, out: Outbound[]): void {
    const request = this.pendingRejoin;
    if (request === null || request.deadline > now) return;
    this.setPendingRejoin(null);
    out.push(error(request.conn, 'rejoin_declined'));
    this.tellApproverWithdrawn(request, out);
  }

  /** Tells the connection waiting to take seat `i`, if any, that the seat is no longer on offer. */
  private withdrawRejoinFor(i: SeatIndex, out: Outbound[]): void {
    const request = this.pendingRejoin;
    if (request === null || request.seat !== i) return;
    this.setPendingRejoin(null);
    out.push(error(request.conn, 'rejoin_unavailable'));
    this.tellApproverWithdrawn(request, out);
  }

  /** Tells the seat that was asked to approve `request`, if connected, that it is no longer open. */
  private tellApproverWithdrawn(request: RejoinRequest, out: Outbound[]): void {
    const approver = this.bindings[opponentOf(request.seat)];
    if (approver !== undefined)
      out.push({ conn: approver.conn, msg: { type: 'rejoin_withdrawn' } });
  }

  /** Gives seat `i` a new token and binds `conn` to it, superseding any earlier connection. */
  private grant(conn: ConnId, i: SeatIndex, lastSeq: number | undefined): Outbound[] {
    this.state.seats[i]!.token = toHex(this.random.bytes(SEAT_TOKEN_BYTES));
    this.setLockout(i, clearFailures(this.state.pinLockouts[i]));
    return this.resume(conn, i, this.markFor(lastSeq));
  }

  private seatWithToken(token: string): SeatIndex | undefined {
    const matches = [0, 1].map((i) => {
      const record = this.state.seats[i as SeatIndex];
      return record !== null && constantTimeEqual(record.token, token);
    });
    if (matches[0]) return 0;
    if (matches[1]) return 1;
    return undefined;
  }

  private claim(conn: ConnId, msg: Hello): Outbound[] {
    if (this.state.reservedSeat !== null)
      return this.claimSaved(conn, msg, this.state.reservedSeat);
    const seats = this.state.seats;
    const i: SeatIndex | undefined = seats[0] === null ? 0 : seats[1] === null ? 1 : undefined;
    if (i === undefined) return [error(conn, 'room_full')];

    const record: SeatRecord = { token: toHex(this.random.bytes(SEAT_TOKEN_BYTES)) };
    if (msg.name !== undefined) record.name = msg.name;
    const pin = generatePin(this.random);
    const o = opponentOf(i);
    const starts = seats[o] !== null;

    // The game is created before any seat state changes, so a failure leaves the room joinable.
    let game: Game | undefined;
    if (starts) {
      try {
        game = Game.create(this.newSeed(), this.state.config);
      } catch (thrown) {
        return [error(conn, this.codeFor(thrown))];
      }
    }

    seats[i] = record;
    this.state.pins[i] = pin;
    this.bind(conn, i, 0);
    this.touch();
    const out: Outbound[] = [this.welcome(conn, i)];
    if (game === undefined) {
      out.push({ conn, msg: { type: 'waiting' } });
      this.pauses.pushState(conn, out);
      return out;
    }

    this.game?.dispose();
    this.game = game;
    if (this.bindings[o] === undefined) this.startGrace(o);
    for (const s of [0, 1] as const) {
      const binding = this.bindings[s];
      if (binding === undefined) continue;
      this.pushEvents(s, out);
      if (s === i) this.pauses.pushState(conn, out);
      out.push(this.opponentStatus(binding.conn, s));
    }
    return out;
  }

  /**
   * Claims a seat of a room created from a save: the reserved seat only for a hello that names
   * it, the other for any hello. The game is already there, so the claimer joins it at once.
   */
  private claimSaved(conn: ConnId, msg: Hello, reserved: SeatIndex): Outbound[] {
    const seats = this.state.seats;
    const other = opponentOf(reserved);
    let i: SeatIndex;
    if (seats[reserved] === null && msg.seat === SEATS[reserved]) i = reserved;
    else if (seats[other] === null) i = other;
    else return [error(conn, 'room_full')];

    const record: SeatRecord = { token: toHex(this.random.bytes(SEAT_TOKEN_BYTES)) };
    if (msg.name !== undefined) record.name = msg.name;
    seats[i] = record;
    this.state.pins[i] = generatePin(this.random);
    if (seats[opponentOf(i)] !== null) this.state.reservedSeat = null;
    return this.resume(conn, i, 0);
  }

  /** Binds `conn` to claimed seat `i` from log index `mark`, superseding any earlier connection. */
  private resume(conn: ConnId, i: SeatIndex, mark: number): Outbound[] {
    const out: Outbound[] = [];
    const previous = this.bindings[i];
    if (previous !== undefined && previous.conn !== conn) {
      out.push(error(previous.conn, 'superseded'));
      this.seatOfConn.delete(previous.conn);
    }
    this.bind(conn, i, mark);
    this.touch();
    this.withdrawRejoinFor(i, out);

    out.push(this.welcome(conn, i));
    // A new connection must ask again before the game resumes.
    this.pauses.forgetReadiness(i, out);
    this.forgetRematch(i, out);
    if (this.game === undefined) {
      out.push({ conn, msg: { type: 'waiting' } });
      this.pauses.pushState(conn, out);
      return out;
    }
    if (isGameOver(this.pushEvents(i, out))) {
      out.push({ conn, msg: { type: 'game_over', replay: this.game.replay() } });
    }
    this.pauses.pushState(conn, out);
    if (this.state.finishedAt !== null) out.push({ conn, msg: this.rematchStatus() });
    out.push(this.opponentStatus(conn, i));
    const opponent = this.bindings[opponentOf(i)];
    if (opponent !== undefined) out.push(this.opponentStatus(opponent.conn, opponentOf(i)));
    if (previous !== undefined && previous.conn !== conn) this.askAgain(conn, i, out);
    return out;
  }

  private command(conn: ConnId, cmd: Command): Outbound[] {
    const i = this.seatOfConn.get(conn);
    if (i === undefined) return [error(conn, 'not_joined')];
    if (this.game === undefined) return [error(conn, 'invalid_message')];
    if (this.pauses.paused) return [error(conn, 'paused')];
    return this.applyAndBroadcast(conn, this.game, i, cmd);
  }

  /** Resigns the opponent of `conn`'s seat once that opponent's grace window has expired. */
  private claimWin(conn: ConnId): Outbound[] {
    const i = this.seatOfConn.get(conn);
    if (i === undefined) return [error(conn, 'not_joined')];
    if (this.game === undefined) return [error(conn, 'not_expired')];
    if (this.state.finishedAt !== null) return [error(conn, 'error-game-over')];
    if (this.pauses.paused) return [error(conn, 'paused')];
    const o = opponentOf(i);
    const deadline = this.graceDeadline(o);
    if (this.bindings[o] !== undefined || deadline === null || this.clock.now() < deadline) {
      return [error(conn, 'not_expired')];
    }
    return this.applyAndBroadcast(conn, this.game, o, 'resign');
  }

  /** Applies `cmd` for seat `i`, then sends every bound seat its events and any game over. */
  private applyAndBroadcast(conn: ConnId, game: Game, i: SeatIndex, cmd: Command): Outbound[] {
    try {
      game.apply(SEATS[i], cmd);
    } catch (thrown) {
      return [error(conn, this.codeFor(thrown))];
    }
    this.touch();

    const out: Outbound[] = [];
    let over = false;
    for (const s of [0, 1] as const) {
      if (this.bindings[s] !== undefined) over = isGameOver(this.pushEvents(s, out)) || over;
    }
    if (over) {
      this.finish();
      const replay = game.replay();
      for (const binding of this.bindings) {
        if (binding !== undefined)
          out.push({ conn: binding.conn, msg: { type: 'game_over', replay } });
      }
      this.pauses.end(out);
    } else {
      this.pauses.applyDue(out);
    }
    return out;
  }

  /** Marks `conn`'s seat ready for a rematch, starting the next game once both bound seats are. */
  private requestRematch(conn: ConnId): Outbound[] {
    const i = this.seatOfConn.get(conn);
    if (i === undefined) return [error(conn, 'not_joined')];
    const finished = this.game;
    if (finished === undefined || this.state.finishedAt === null) {
      return [error(conn, 'invalid_message')];
    }
    const current = this.boundRematchReady();
    const next = rematch.request(current, SEATS[i]);
    if (next === current) return [];
    if (rematch.bothReady(next)) return this.startRematch(conn, finished);
    this.setRematchReady(next);
    const out: Outbound[] = [];
    for (const binding of this.bindings) {
      if (binding !== undefined) out.push({ conn: binding.conn, msg: this.rematchStatus() });
    }
    return out;
  }

  /** Starts the next game with the same seats, the Badge going to the loser of `finished`. */
  private startRematch(conn: ConnId, finished: Game): Outbound[] {
    const loser = rematch.loserOf(finished.view({ seat: SEATS[0] }).phase)!;
    const gameConfig = rematch.rematchConfig(this.state.config, loser);
    let next: Game;
    try {
      next = Game.create(this.newSeed(), gameConfig);
    } catch (thrown) {
      return [error(conn, this.codeFor(thrown))];
    }
    finished.dispose();
    this.game = next;
    this.state.gameConfig = gameConfig;
    this.state.game += 1;
    this.state.segmentBase = 0;
    this.state.finishedAt = null;
    this.state.rematchReady = rematch.NO_ONE;
    this.stopGrace();
    this.touch();
    const out: Outbound[] = [];
    for (const s of [0, 1] as const) {
      this.bindings[s]!.mark = 0;
      this.pushEvents(s, out);
    }
    return out;
  }

  /** Forgets that seat `i` asked for a rematch, telling its bound opponent if it had. */
  private forgetRematch(i: SeatIndex, out: Outbound[]): void {
    const next = rematch.forget(this.state.rematchReady, SEATS[i]);
    if (next === this.state.rematchReady) return;
    this.setRematchReady(next);
    const waiting = this.bindings[opponentOf(i)];
    if (waiting !== undefined) out.push({ conn: waiting.conn, msg: this.rematchStatus() });
  }

  private setRematchReady(ready: readonly Seat[]): void {
    this.state.rematchReady = ready;
    this.touch();
  }

  /** The seats ready for a rematch that are bound, since readiness belongs to a connection. */
  private boundRematchReady(): readonly Seat[] {
    let kept = this.state.rematchReady;
    for (const s of [0, 1] as const) {
      if (this.bindings[s] === undefined) kept = rematch.forget(kept, SEATS[s]);
    }
    return kept;
  }

  private rematchStatus(): ServerMessage {
    return { type: 'rematch_status', ready: [...this.boundRematchReady()] };
  }

  private newSeed(): string {
    return toHex(this.random.bytes(SEED_BYTES));
  }

  /** Replaces the game with `next`, the next segment of it, so every seat's events restart. */
  private continueIn(next: Game): void {
    const game = this.game!;
    this.state.segmentBase += game.logLength();
    game.dispose();
    this.game = next;
    for (const binding of this.bindings) {
      if (binding !== undefined) binding.mark = 0;
    }
  }

  private finish(): void {
    if (this.state.finishedAt !== null) return;
    this.state.finishedAt = this.clock.now();
    this.state.disconnectedAt = [null, null];
    this.changes += 1;
  }

  private bind(conn: ConnId, i: SeatIndex, mark: number): void {
    this.bindings[i] = { conn, mark };
    this.seatOfConn.set(conn, i);
    this.state.pins[i] ??= generatePin(this.random);
    this.state.disconnectedAt[i] = null;
    this.graceAnnounced[i] = false;
    this.changes += 1;
  }

  /** Converts a client's game-wide `last_seq` to a log index, falling back to a full resend. */
  private markFor(lastSeq: number | undefined): number {
    if (lastSeq === undefined || this.game === undefined) return 0;
    // A hello does not say which game its last_seq is from, so one is trusted only in the first game.
    if (this.state.game !== 0) return 0;
    const index = lastSeq - this.state.segmentBase;
    if (index < 0 || index > this.game.logLength()) return 0;
    return index;
  }

  /** Sends seat `i` everything since its mark, advances the mark, and returns the view sent. */
  private pushEvents(i: SeatIndex, out: Outbound[]): View {
    const game = this.game!;
    const binding = this.bindings[i]!;
    const seat = SEATS[i];
    const viewer = { seat };
    const base = this.state.segmentBase;
    const raw = game.eventsSince(binding.mark, viewer);
    const events =
      base === 0 ? raw : raw.map(([index, ev]): [number, typeof ev] => [base + index, ev]);
    const view = game.view(viewer);
    const msg: ServerMessage = {
      type: 'events',
      game: this.state.game,
      from_seq: base + binding.mark,
      events,
      view,
      legal: game.legalActions(seat),
      pending: game.pending(),
    };
    out.push({ conn: binding.conn, msg });
    binding.mark = game.logLength();
    return view;
  }

  /** Welcomes `conn` to seat `i`, which must be bound. */
  private welcome(conn: ConnId, i: SeatIndex): Outbound {
    const pin = this.state.pins[i]!;
    const msg: ServerMessage = {
      type: 'welcome',
      seat: SEATS[i],
      seat_token: this.state.seats[i]!.token,
      room: this.state.code,
      config: { ...this.state.gameConfig },
      pin,
      game: this.state.game,
    };
    return { conn, msg };
  }

  /**
   * Tells seat `i`, on `conn`, whether its opponent is connected and how its grace stands, and
   * whether someone has just tried a wrong PIN for the opponent's seat.
   */
  private opponentStatus(conn: ConnId, i: SeatIndex, pinAttemptFailed = false): Outbound {
    const o = opponentOf(i);
    const msg: OpponentStatus = {
      type: 'opponent_status',
      connected: this.bindings[o] !== undefined,
    };
    const name = this.state.seats[o]?.name;
    if (name !== undefined) msg.name = name;
    if (pinAttemptFailed) msg.pin_attempt_failed = true;
    const deadline = this.graceDeadline(o);
    if (deadline !== null) {
      if (this.clock.now() >= deadline) {
        msg.can_claim_win = true;
        if (!this.graceAnnounced[o]) {
          this.graceAnnounced[o] = true;
          this.changes += 1;
        }
      } else {
        msg.grace_deadline = deadline;
        msg.grace_remaining_ms = deadline - this.clock.now();
      }
    }
    return { conn, msg };
  }
}
