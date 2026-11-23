import { EngineError, replayTimeline, seedCommitment } from '@wwd/engine';
import type { Command, Event, Pending, Replay, RulesConfig, Seat, View } from '@wwd/engine';
import {
  CLOSING_ERROR_CODES,
  PROTOCOL_VERSION,
  encode,
  parseServerMessage,
  type ClientMessage,
  type SaveFile,
  type ServerMessage,
} from '@wwd/protocol';
import type { Transport } from '@wwd/transport';
import { writable, type Readable } from './store.js';

export type ClientStatus =
  'connecting' | 'waiting' | 'playing' | 'game_over' | 'disconnected' | 'rejected';

/** What this client last heard about its opponent's seat. */
export interface OpponentState {
  connected: boolean;
  name?: string;
  /** When the absent opponent's reconnect window ends, in epoch milliseconds by this client's clock. */
  grace_deadline?: number;
  /** Set once the absent opponent's reconnect window has ended, so this seat may claim the win. */
  can_claim_win?: boolean;
  /** Set when someone has just entered a wrong PIN for the opponent's seat. */
  pin_attempt_failed?: boolean;
}

/** Where the room's pause stands, as the referee last said. */
export interface PauseState {
  /** The seat that asked for a pause after the current round, or null when none is asked for. */
  requestedBy: Seat | null;
  /** Set once the other seat agreed; the pause then applies at the next round boundary. */
  agreed: boolean;
  /** Set while the game is paused at a round boundary. */
  paused: boolean;
  /** The seats that have asked to resume the paused game. */
  resumeReady: Seat[];
}

const NOT_PAUSED: PauseState = { requestedBy: null, agreed: false, paused: false, resumeReady: [] };

/** How a client without a seat token asks for a seat that is already taken. */
export interface RejoinAttempt {
  seat: Seat;
  /** The seat's PIN; without one, the connected opponent is asked to approve. */
  pin?: string;
}

export interface GameClientState {
  status: ClientStatus;
  room: string;
  seat: Seat | null;
  seatToken: string | null;
  /** This seat's PIN for rejoining from another device; secret, so never log it. */
  pin: string | null;
  opponent: OpponentState;
  /** Set while the opponent asks to let a device without the PIN take the opponent's seat. */
  rejoinRequested: boolean;
  /** When the request in `rejoinRequested` expires, in epoch milliseconds by this client's clock. */
  rejoinDeadline: number | null;
  /** Set while this client's PIN-less rejoin waits for the opponent's approval. */
  rejoinPending: boolean;
  /** The room's rules, from the referee's welcome; null until it arrives. */
  config: RulesConfig | null;
  /** Which of the room's games this client follows, from 0 for its first. */
  game: number;
  pause: PauseState;
  /** The save the referee sent when the game paused; null while it is not paused. */
  save: SaveFile | null;
  /** The seats that have asked for a rematch of the finished game. */
  rematchReady: Seat[];
  view: View | null;
  legal: Command[];
  pending: Pending | null;
  events: Array<[number, Event]>;
  /** One more than the highest event sequence number received. */
  lastSeq: number;
  replay: Replay | null;
  /** Set at game over: true only when the replay verifies against the commitment announced at the start. */
  replayVerified: boolean | null;
  /** The latest protocol code or engine message id. */
  lastError: string | null;
  /** Counts every problem recorded in `lastError`, so a repeated code is still a change. */
  errorCount: number;
  /** When the latest `pong` arrived, by the client's clock; null until one does. */
  lastPongAt: number | null;
  /** Counts every `pong` received, so each one is a change even when the clock has not moved. */
  pongCount: number;
}

export interface GameClientOptions {
  room: string;
  name?: string;
  seatToken?: string;
  /** Sent instead of a token-less `hello` until a seat is granted. */
  rejoin?: RejoinAttempt;
  /** The seat a token-less `hello` asks for, which only a room created from a save honours. */
  seat?: Seat;
  /** The clock for `lastPongAt`; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The closing error codes that end this client's part in the room: every closing code except the
 * refusals of a `rejoin` request, after which the client may still try another way in.
 */
const REJECTING_CODES: ReadonlySet<string> = new Set(
  [...CLOSING_ERROR_CODES].filter(
    (code) => code !== 'rejoin_declined' && code !== 'rejoin_unavailable',
  ),
);

/** The refusals of a PIN that end a rejoin attempt, so the same PIN is never sent again. */
const PIN_REFUSALS: ReadonlySet<string> = new Set(['wrong_pin', 'pin_locked']);

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/** The game start or segment start announced by `event`, if it is one. */
function announcedStart(event: Event): { commitment: string; config?: RulesConfig } | null {
  const { kind } = event;
  if ('game_started' in kind) {
    return { commitment: kind.game_started.seed_commitment, config: kind.game_started.config };
  }
  if ('segment_started' in kind) return { commitment: kind.segment_started.seed_commitment };
  return null;
}

/** Mirrors one seat's side of a game hosted by a referee. */
export class GameClient {
  private readonly store;
  private transport: Transport | undefined;
  private detach: Array<() => void> = [];
  // Set by the game's first announcement; a later one would let the commitment be swapped.
  private gameStarted = false;
  private readonly now: () => number;
  // Set once a lost binding has been answered with a fresh hello, so repeated refusals cannot loop.
  private rehelloed = false;
  private rejoin: RejoinAttempt | null;

  constructor(private readonly opts: GameClientOptions) {
    this.now = opts.now ?? Date.now;
    this.rejoin = opts.rejoin ?? null;
    this.store = writable<GameClientState>({
      status: 'connecting',
      room: opts.room,
      seat: null,
      seatToken: opts.seatToken ?? null,
      pin: null,
      opponent: { connected: false },
      rejoinRequested: false,
      rejoinDeadline: null,
      rejoinPending: false,
      config: null,
      game: 0,
      pause: NOT_PAUSED,
      save: null,
      rematchReady: [],
      view: null,
      legal: [],
      pending: null,
      events: [],
      lastSeq: 0,
      replay: null,
      replayVerified: null,
      lastError: null,
      errorCount: 0,
      lastPongAt: null,
      pongCount: 0,
    });
  }

  get state(): Readable<GameClientState> {
    return this.store;
  }

  get current(): GameClientState {
    return this.store.get();
  }

  /** Starts talking over `transport` (replacing any earlier one) and sends `hello`. */
  attach(transport: Transport): void {
    this.release();
    this.transport = transport;
    this.detach = [
      transport.onMessage((text) => this.receive(transport, text)),
      transport.onClose(() => this.closed(transport)),
    ];
    this.rehelloed = false;
    const { status } = this.current;
    this.update({
      status: status === 'game_over' ? status : 'connecting',
      legal: [],
      pending: null,
      // The referee drops a pending request when either side's connection goes.
      rejoinRequested: false,
      rejoinDeadline: null,
      rejoinPending: false,
      // Readiness belongs to a connection, so a new one must ask again.
      pause: { ...this.current.pause, resumeReady: [] },
      rematchReady: [],
    });
    this.sendHello(transport);
  }

  /** Sends a keepalive `ping` if attached; the reply sets `lastPongAt`. */
  ping(): void {
    this.transport?.send(encode({ type: 'ping' }));
  }

  /** Sends `cmd`; throws unless it is one of the commands the referee currently offers. */
  command(cmd: Command): void {
    const wanted = canonical(cmd);
    if (!this.current.legal.some((offered) => canonical(offered) === wanted)) {
      throw new Error('command is not currently legal');
    }
    if (this.transport === undefined || !this.transport.open) {
      throw new Error('not connected');
    }
    this.transport.send(encode({ type: 'command', cmd }));
  }

  /** Sets how the next `attach` asks for a seat while no seat token is held; null claims a free seat. */
  setRejoin(rejoin: RejoinAttempt | null): void {
    this.rejoin = rejoin;
  }

  /** Answers the opponent's request to let a device without the PIN take the opponent's seat. */
  approveRejoin(approve: boolean): void {
    this.sendNow({ type: 'approve_rejoin', approve });
    this.update({ rejoinRequested: false, rejoinDeadline: null });
  }

  /** Claims the win; throws unless the referee has said the opponent's reconnect window has ended. */
  claimWin(): void {
    if (this.current.opponent.can_claim_win !== true) {
      throw new Error('the opponent may still reconnect');
    }
    this.sendNow({ type: 'claim_win' });
  }

  /** Resigns; throws unless a game is in progress. Resignation is never among the `legal` commands. */
  resign(): void {
    if (this.current.status !== 'playing') throw new Error('no game is in progress');
    this.sendNow({ type: 'command', cmd: 'resign' });
  }

  /** Asks for a pause once the current round ends. */
  requestPause(): void {
    this.sendNow({ type: 'pause_request' });
  }

  /** Withdraws this seat's pause request, or its agreement to the opponent's. */
  cancelPause(): void {
    this.sendNow({ type: 'pause_cancel' });
  }

  /** Agrees to the opponent's pause request. */
  acceptPause(): void {
    this.sendNow({ type: 'pause_accept' });
  }

  /** Asks to resume the paused game; it resumes once both seats have asked. */
  requestResume(): void {
    this.sendNow({ type: 'resume_request' });
  }

  /** Asks for a rematch of the finished game; it starts once both seats have asked. */
  requestRematch(): void {
    this.sendNow({ type: 'rematch_request' });
  }

  private sendNow(msg: ClientMessage): void {
    if (this.transport === undefined || !this.transport.open) {
      throw new Error('not connected');
    }
    this.transport.send(encode(msg));
  }

  dispose(): void {
    this.release();
    if (this.current.status !== 'game_over') this.update({ status: 'disconnected', legal: [] });
  }

  private release(): void {
    for (const off of this.detach) off();
    this.detach = [];
    const old = this.transport;
    this.transport = undefined;
    if (old?.open) old.close();
  }

  private sendHello(transport: Transport): void {
    const { seatToken, lastSeq } = this.current;
    if (seatToken === null && this.rejoin !== null) {
      const { seat, pin } = this.rejoin;
      transport.send(
        encode({
          type: 'rejoin',
          protocol_version: PROTOCOL_VERSION,
          room: this.opts.room,
          seat,
          ...(pin === undefined ? {} : { pin }),
        }),
      );
      return;
    }
    transport.send(
      encode({
        type: 'hello',
        protocol_version: PROTOCOL_VERSION,
        room: this.opts.room,
        ...(seatToken === null ? {} : { seat_token: seatToken, last_seq: lastSeq }),
        ...(seatToken === null && this.opts.seat !== undefined ? { seat: this.opts.seat } : {}),
        ...(this.opts.name === undefined ? {} : { name: this.opts.name }),
      }),
    );
  }

  /** Answers the first `not_joined` of a streak by resuming the held seat on the same transport. */
  private rebindLostSeat(): void {
    const transport = this.transport;
    if (this.rehelloed || this.current.seatToken === null) return;
    if (transport === undefined || !transport.open) return;
    this.rehelloed = true;
    this.sendHello(transport);
  }

  private update(patch: Partial<GameClientState>): void {
    this.store.set({ ...this.current, ...patch });
  }

  private closed(transport: Transport): void {
    if (transport !== this.transport) return;
    const { status } = this.current;
    if (status === 'game_over' || status === 'rejected') return;
    this.update({ status: 'disconnected', legal: [] });
  }

  private receive(transport: Transport, text: string): void {
    if (transport !== this.transport) return;
    const parsed = parseServerMessage(text);
    if (!parsed.ok) {
      this.update({ lastError: parsed.code, errorCount: this.current.errorCount + 1 });
      return;
    }
    this.handle(parsed.msg);
  }

  private handle(msg: ServerMessage): void {
    const lostBinding = msg.type === 'error' && msg.code === 'not_joined';
    if (!lostBinding) this.rehelloed = false;
    switch (msg.type) {
      case 'welcome': {
        // The new token supersedes any rejoin, so a later reconnect resumes by token.
        this.rejoin = null;
        const sameGame = msg.game === this.current.game;
        this.followGame(msg.game);
        this.update({
          seat: msg.seat,
          seatToken: msg.seat_token,
          pin: msg.pin,
          config: msg.config,
          rejoinPending: false,
          // A resumed game, or the next game of the room, keeps connecting until its events arrive.
          ...(sameGame && this.current.status === 'connecting' && this.current.view === null
            ? { status: 'waiting' as const }
            : {}),
        });
        break;
      }
      case 'waiting':
        if (this.current.status === 'connecting' && this.current.view === null) {
          this.update({ status: 'waiting' });
        }
        break;
      case 'events':
        this.followGame(msg.game);
        this.mergeEvents(msg);
        break;
      case 'pause_status': {
        const { requested_by: requestedBy, agreed } = msg;
        // Only the end of a pause clears the request, so a cleared request ends any pause.
        this.update(
          requestedBy === null
            ? { pause: NOT_PAUSED, save: null }
            : { pause: { ...this.current.pause, requestedBy, agreed } },
        );
        break;
      }
      case 'paused':
        this.update({
          pause: { ...this.current.pause, paused: true, resumeReady: [] },
          save: msg.save,
          legal: [],
        });
        break;
      case 'resume_status':
        this.update({ pause: { ...this.current.pause, resumeReady: msg.ready } });
        break;
      case 'rematch_status':
        this.update({ rematchReady: msg.ready });
        break;
      case 'opponent_status': {
        const { type: _type, grace_remaining_ms: remaining, ...opponent } = msg;
        // The remaining time is trusted over the deadline, which is by the referee's clock.
        if (remaining !== undefined) opponent.grace_deadline = this.now() + remaining;
        this.update({
          opponent,
          ...(msg.connected ? { rejoinRequested: false, rejoinDeadline: null } : {}),
        });
        break;
      }
      case 'rejoin_pending':
        this.update({ rejoinPending: true });
        break;
      case 'rejoin_request':
        // Timed by this client's clock; the referee's deadline is on another clock.
        this.update({ rejoinRequested: true, rejoinDeadline: this.now() + msg.remaining_ms });
        break;
      case 'rejoin_withdrawn':
        this.update({ rejoinRequested: false, rejoinDeadline: null });
        break;
      case 'game_over':
        this.finish(msg.replay);
        break;
      case 'error': {
        const rejected =
          REJECTING_CODES.has(msg.code) ||
          (PIN_REFUSALS.has(msg.code) && this.current.seatToken === null);
        this.update({
          lastError: msg.code,
          errorCount: this.current.errorCount + 1,
          ...(rejected ? { status: 'rejected' as const, legal: [] } : {}),
          ...(msg.code === 'unknown_seat' ? { seatToken: null } : {}),
        });
        if (lostBinding) this.rebindLostSeat();
        break;
      }
      case 'pong':
        this.update({ lastPongAt: this.now(), pongCount: this.current.pongCount + 1 });
        break;
    }
  }

  private mergeEvents(msg: Extract<ServerMessage, { type: 'events' }>): void {
    const bySeq = new Map(this.current.events);
    let violation = false;
    let resumed = false;
    for (const [seq, event] of msg.events) {
      if (bySeq.has(seq)) continue;
      if ('game_started' in event.kind) {
        if (this.gameStarted) {
          violation = true;
          continue;
        }
        this.gameStarted = true;
      }
      // A new segment starts only when a paused game resumes.
      if ('segment_started' in event.kind) resumed = true;
      bySeq.set(seq, event);
    }
    const events = [...bySeq].sort(([a], [b]) => a - b);
    const highest = events.at(-1)?.[0];
    const { status } = this.current;
    const settled = status === 'game_over' || status === 'rejected';
    const pause = resumed ? { ...this.current.pause, paused: false, resumeReady: [] } : null;
    const paused = (pause ?? this.current.pause).paused;
    this.update({
      ...(pause === null ? {} : { pause, save: null }),
      events,
      lastSeq: highest === undefined ? 0 : highest + 1,
      view: msg.view,
      // A paused room refuses every command, so it offers none.
      legal: settled || paused ? [] : msg.legal,
      pending: msg.pending,
      status: settled ? status : 'playing',
      // A fresh events message supersedes any earlier problem.
      ...(violation
        ? { lastError: 'protocol_violation', errorCount: this.current.errorCount + 1 }
        : { lastError: null }),
    });
  }

  private finish(replay: Replay): void {
    const problem = this.check(replay);
    this.update({
      status: 'game_over',
      legal: [],
      replay,
      replayVerified: problem === null,
      lastError: problem ?? this.current.lastError,
      errorCount: this.current.errorCount + (problem === null ? 0 : 1),
    });
  }

  /** Forgets the game this client followed once the room has moved on to `game`. */
  private followGame(game: number): void {
    const current = this.current;
    if (game === current.game) return;
    this.gameStarted = false;
    this.update({
      game,
      events: [],
      lastSeq: 0,
      replay: null,
      replayVerified: null,
      pause: NOT_PAUSED,
      save: null,
      rematchReady: [],
      view: null,
      legal: [],
      pending: null,
      ...(current.status === 'game_over' ? { status: 'connecting' as const } : {}),
    });
  }

  /**
   * Returns why the replay cannot be trusted, or null when it matches everything this client saw.
   *
   * Each segment start this client received must announce the commitment of that segment's seed,
   * and the events rebuilt from the replay must end with exactly the events received. A client
   * that joined a game continued from a save first hears of it at a segment start, so it cannot
   * check the segments before that one; the referee verified them when the room was created.
   */
  private check(replay: Replay): string | null {
    const { current } = this;
    const received = current.events.map(([, event]) => event);
    const starts = received
      .map(announcedStart)
      .filter((start): start is NonNullable<typeof start> => start !== null);
    const first = received[0];
    if (first === undefined || announcedStart(first) === null) return 'commitment_mismatch';
    if (current.seat === null) return 'replay_mismatch';
    try {
      const segments = replay.segments.slice(replay.segments.length - starts.length);
      if (segments.length !== starts.length) return 'commitment_mismatch';
      for (const [k, segment] of segments.entries()) {
        if (seedCommitment(segment.seed) !== starts[k]?.commitment) return 'commitment_mismatch';
      }
      const announced = starts[0]?.config ?? current.config;
      if (canonical(replay.config) !== canonical(announced)) return 'replay_mismatch';
      const rebuilt = replayTimeline(replay, { seat: current.seat }).flatMap((step) => step.events);
      // A client that saw the game start must have received every event of it.
      if ('game_started' in first.kind && rebuilt.length !== received.length) {
        return 'replay_mismatch';
      }
      const tail = rebuilt.slice(rebuilt.length - received.length);
      return rebuilt.length >= received.length && canonical(tail) === canonical(received)
        ? null
        : 'replay_mismatch';
    } catch (thrown) {
      return thrown instanceof EngineError ? thrown.id : 'error-invalid-input';
    }
  }
}
