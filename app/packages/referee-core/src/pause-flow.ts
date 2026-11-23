import { Game, type RoundBoundary, type RulesConfig, type Seat, type View } from '@wwd/engine';
import { SAVE_FORMAT_VERSION, saveHash, type SaveFile, type ServerMessage } from '@wwd/protocol';
import { errorTo } from './codes.js';
import type { ConnId, Outbound } from './deps.js';
import * as pausing from './pause.js';
import { NOT_PAUSED, type Pause, type PauseRefusal } from './pause.js';
import { SEATS, opponentOf, type SeatIndex } from './seats.js';

/** What a room's pause flow reads from, and does to, the room it runs in. */
export interface PauseHost {
  readonly code: string;
  game(): Game | undefined;
  now(): number;
  /** True while a game exists and is not over. */
  inProgress(): boolean;
  seatOf(conn: ConnId): SeatIndex | undefined;
  /** The connection bound to seat `i`, if any. */
  connOf(i: SeatIndex): ConnId | undefined;
  /** Records a change to the room's durable state as activity. */
  touch(): void;
  /** Ends every grace window, since none runs while paused. */
  stopGrace(): void;
  /** Replaces the game with `next`, the next segment of it, so every seat's events restart. */
  continueIn(next: Game): void;
  newSeed(): string;
  /** The reply to `conn` for a failure caught while using the engine. */
  failure(conn: ConnId, thrown: unknown): Outbound;
  /** Sends seat `i` its events since it was last sent any, returning the view sent. */
  pushEvents(i: SeatIndex, out: Outbound[]): View;
  opponentStatus(conn: ConnId, i: SeatIndex): Outbound;
}

/**
 * The save for `game` stopped at `boundary`; every segment of its replay is finished. Its config
 * is the game's own, which for a rematch differs from the room's in its Badge start.
 */
export function buildSave(
  code: string,
  game: Game,
  boundary: RoundBoundary,
  savedAt: number,
): SaveFile {
  const replay = game.replay();
  const fields: Omit<SaveFile, 'hash'> = {
    format_version: SAVE_FORMAT_VERSION,
    kind: 'wwd-save',
    room: code,
    config: { ...replay.config },
    boundary,
    replay,
    saved_at: savedAt,
  };
  return { ...fields, hash: saveHash(fields) };
}

/**
 * A room's pause: agreeing one, applying it at the round boundary with a save for both seats,
 * and resuming in a new segment once both bound seats ask to.
 */
export class PauseFlow {
  // The save sent when the pause applied, rebuilt identically on demand after a restore.
  private save: SaveFile | null = null;

  constructor(
    private pause: Pause,
    private readonly host: PauseHost,
  ) {}

  get current(): Pause {
    return this.pause;
  }

  get paused(): boolean {
    return this.pause.paused;
  }

  /** Applies a change to the pause asked for by `conn`'s seat, then any pause that is now due. */
  change(conn: ConnId, change: (pause: Pause, seat: Seat) => Pause | PauseRefusal): Outbound[] {
    const i = this.host.seatOf(conn);
    if (i === undefined) return [errorTo(conn, 'not_joined')];
    if (!this.host.inProgress()) return [errorTo(conn, 'not_pausable')];
    const next = change(this.pause, SEATS[i]);
    if (typeof next === 'string') return [errorTo(conn, next)];
    const out: Outbound[] = [];
    if (this.set(next)) this.broadcastStatus(out);
    this.applyDue(out);
    return out;
  }

  /** Pauses the room if a pause is agreed and the game is at a round boundary. */
  applyDue(out: Outbound[]): void {
    const game = this.host.game();
    if (game === undefined || !pausing.isDue(this.pause)) return;
    const boundary = game.roundBoundary();
    if (boundary === null) return;
    this.set(pausing.applied(this.pause, this.host.now()));
    this.host.stopGrace();
    this.save = buildSave(this.host.code, game, boundary, this.pause.pausedAt!);
    for (const s of [0, 1] as const) {
      const conn = this.host.connOf(s);
      if (conn === undefined) continue;
      out.push({ conn, msg: { type: 'paused', save: this.save } });
      // The waiting seat's countdown has stopped.
      if (this.host.connOf(opponentOf(s)) === undefined)
        out.push(this.host.opponentStatus(conn, s));
    }
  }

  /** Ends any pause or pause request because the game is over. */
  end(out: Outbound[]): void {
    if (this.set(NOT_PAUSED)) this.broadcastStatus(out);
  }

  /** Marks `conn`'s seat ready to resume, resuming the game once both bound seats are. */
  requestResume(conn: ConnId): Outbound[] {
    const i = this.host.seatOf(conn);
    if (i === undefined) return [errorTo(conn, 'not_joined')];
    const current = this.withBoundReadiness(this.pause);
    const next = pausing.ready(current, SEATS[i]);
    if (typeof next === 'string') return [errorTo(conn, next)];
    if (next === current) return [];
    if (pausing.bothReady(next)) return this.resumeGame(conn);
    this.set(next);
    const out: Outbound[] = [];
    for (const s of [0, 1] as const) {
      const bound = this.host.connOf(s);
      if (bound !== undefined) out.push({ conn: bound, msg: this.resumeStatus() });
    }
    return out;
  }

  /** Forgets that seat `i` asked to resume, telling its bound opponent if it had. */
  forgetReadiness(i: SeatIndex, out: Outbound[]): void {
    if (!this.set(pausing.unready(this.pause, SEATS[i]))) return;
    const waiting = this.host.connOf(opponentOf(i));
    if (waiting !== undefined) out.push({ conn: waiting, msg: this.resumeStatus() });
  }

  /** Tells `conn` how the pause stands and, while paused, sends the save and who is ready. */
  pushState(conn: ConnId, out: Outbound[]): void {
    out.push({ conn, msg: this.status() });
    if (!this.pause.paused) return;
    const game = this.host.game()!;
    this.save ??= buildSave(this.host.code, game, game.roundBoundary()!, this.pause.pausedAt!);
    out.push(
      { conn, msg: { type: 'paused', save: this.save } },
      { conn, msg: this.resumeStatus() },
    );
  }

  /** Continues the paused game in a new segment with a fresh seed, sending both seats its start. */
  private resumeGame(conn: ConnId): Outbound[] {
    const game = this.host.game()!;
    const boundary = game.roundBoundary()!;
    let resumed: Game;
    try {
      resumed = Game.resume(boundary, game.replay(), this.host.newSeed());
    } catch (thrown) {
      return [this.host.failure(conn, thrown)];
    }
    this.host.continueIn(resumed);
    this.save = null;
    this.set(NOT_PAUSED);
    const out: Outbound[] = [];
    for (const s of [0, 1] as const) {
      const bound = this.host.connOf(s)!;
      this.host.pushEvents(s, out);
      out.push({ conn: bound, msg: this.status() }, { conn: bound, msg: this.resumeStatus() });
    }
    return out;
  }

  /** Replaces the pause, returning whether it changed. */
  private set(next: Pause): boolean {
    if (next === this.pause) return false;
    this.pause = next;
    this.host.touch();
    return true;
  }

  private broadcastStatus(out: Outbound[]): void {
    for (const s of [0, 1] as const) {
      const conn = this.host.connOf(s);
      if (conn !== undefined) out.push({ conn, msg: this.status() });
    }
  }

  private status(): ServerMessage {
    const { requestedBy, agreed } = this.pause;
    return { type: 'pause_status', requested_by: requestedBy, agreed };
  }

  private resumeStatus(): ServerMessage {
    return { type: 'resume_status', ready: [...this.withBoundReadiness(this.pause).resumeReady] };
  }

  /** `pause` with readiness kept only for bound seats, since readiness belongs to a connection. */
  private withBoundReadiness(pause: Pause): Pause {
    let kept = pause;
    for (const s of [0, 1] as const) {
      if (this.host.connOf(s) === undefined) kept = pausing.unready(kept, SEATS[s]);
    }
    return kept;
  }
}
