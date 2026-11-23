import { isClosingErrorCode, type ClosingErrorCode } from '@wwd/protocol';
import type { Transport } from '@wwd/transport';
import type { ClientStatus, GameClient, GameClientState } from './game-client.js';
import type { Lifecycle } from './lifecycle.js';
import { writable, type Readable, type Writable } from './store.js';

/** How often a visible, connected client pings the referee. */
export const PING_INTERVAL_MS = 30_000;
/** How long a new connection may take to open before it is abandoned and retried. */
export const CONNECT_TIMEOUT_MS = 10_000;
/** How long the ping sent when a new connection opens may go unanswered before reconnecting. */
export const PONG_TIMEOUT_MS = 3_000;
/** How late the ping timer may fire before the device is taken to have been suspended. */
export const TIMER_JUMP_MS = 10_000;
/** The delay before the first retry; each further retry doubles it, up to `RECONNECT_MAX_MS`. */
export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 15_000;
/** Each retry delay is scaled by a random factor within this fraction either way. */
export const RECONNECT_JITTER = 0.2;
/**
 * How long connections must keep failing while the device is online before the server counts as
 * unavailable.
 */
export const SERVER_UNAVAILABLE_AFTER_MS = 180_000;

/** Why a manager has stopped reconnecting: rejection, or a closing error code. */
export type StopReason = 'rejected' | ClosingErrorCode;

export type ConnectionPhase = 'online' | 'connecting' | 'offline' | 'hidden';

export interface ConnectionState {
  phase: ConnectionPhase;
  /** Consecutive failed connections; 0 once a connection answers a ping. */
  attempt: number;
  /** When the next retry is due, by the manager's clock; null when none is scheduled. */
  nextRetryAt: number | null;
  stopReason: StopReason | null;
  /**
   * Set once connections have failed for `SERVER_UNAVAILABLE_AFTER_MS` while the device was
   * online, so the referee rather than the network is likely at fault; cleared by the next pong.
   */
  serverUnavailable: boolean;
}

export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ConnectionManagerOptions {
  client: GameClient;
  /** Opens a fresh transport to the referee; called once per connection attempt. */
  connect: () => Transport;
  lifecycle: Lifecycle;
  timers?: Timers;
  /** A uniform random number in [0, 1), for retry jitter. */
  random?: () => number;
  /** Whether the device has a network connection; assumed to when not given. */
  isOnline?: () => boolean;
}

interface HostTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => (globalThis as unknown as HostTimers).setTimeout(fn, ms),
  clearTimeout: (handle) => (globalThis as unknown as HostTimers).clearTimeout(handle),
};

/** The delay before retry number `failures` (from 1), with jitter applied. */
function retryDelay(failures: number, random: () => number): number {
  const base = Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS);
  return Math.round(base * (1 + RECONNECT_JITTER * (2 * random() - 1)));
}

/**
 * Keeps a `GameClient` connected for as long as the page is visible.
 *
 * Hiding the page closes the connection; showing it, restoring it from the back/forward cache,
 * regaining the network or waking from a suspension opens a fresh one, and the client resumes from
 * its last event. A lost connection is retried with jittered exponential backoff, which resets only
 * once a connection answers a ping. A new connection must open within `CONNECT_TIMEOUT_MS`; once
 * open it is pinged and must answer within `PONG_TIMEOUT_MS`, and after that it is pinged every
 * `PING_INTERVAL_MS` and must answer before the next ping.
 *
 * The connection is kept through game over, so that a rematch can start. Reconnecting stops on
 * rejection or after a closing error code, and `stopReason` says which. Calling `start` after
 * `stop` clears `stopReason` and connects again, so the same manager can serve a fresh attempt
 * such as joining as a new player.
 */
export class ConnectionManager {
  private readonly store: Writable<ConnectionState>;
  private readonly client: GameClient;
  private readonly openTransport: () => Transport;
  private readonly lifecycle: Lifecycle;
  private readonly timers: Timers;
  private readonly random: () => number;
  private readonly isOnline: () => boolean;
  private running = false;
  /** When connections began failing while the device was online; null while they are not. */
  private failingSince: number | null = null;
  private subscriptions: Array<() => void> = [];
  private transport: Transport | undefined;
  private offTransportClose: (() => void) | undefined;
  private offTransportOpen: (() => void) | undefined;
  private connectTimer: unknown;
  private retryTimer: unknown;
  private pingTimer: unknown;
  private pongTimer: unknown;
  private pingDueAt = 0;
  private pongSincePing = true;
  private seenPongCount = 0;
  private seenErrorCount = 0;
  private seenStatus: ClientStatus = 'connecting';

  constructor(opts: ConnectionManagerOptions) {
    this.client = opts.client;
    this.openTransport = opts.connect;
    this.lifecycle = opts.lifecycle;
    this.timers = opts.timers ?? systemTimers;
    this.random = opts.random ?? Math.random;
    this.isOnline = opts.isOnline ?? (() => true);
    this.store = writable<ConnectionState>({
      phase: 'offline',
      attempt: 0,
      nextRetryAt: null,
      stopReason: null,
      serverUnavailable: false,
    });
  }

  get state(): Readable<ConnectionState> {
    return this.store;
  }

  /** Starts managing the connection; after `stop`, this clears `stopReason` and connects again. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const { pongCount, errorCount, status } = this.client.current;
    this.seenPongCount = pongCount;
    this.seenErrorCount = errorCount;
    this.seenStatus = status;
    this.patch({ stopReason: null });
    this.subscriptions = [
      this.lifecycle.onVisibilityChange((visible) => (visible ? this.resume(false) : this.hide())),
      this.lifecycle.onPageShow((persisted) => {
        if (persisted) this.resume(true);
      }),
      this.lifecycle.onOnline(() => this.resume(true)),
      this.client.state.subscribe((state) => this.observe(state)),
    ];
    if (!this.lifecycle.isVisible()) this.hide();
    else if (this.store.get().stopReason === null) this.connect(0);
  }

  /** Stops managing the connection and closes it. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
    this.clearTimers();
    this.dropTransport();
    this.failingSince = null;
    this.patch({ phase: 'offline', attempt: 0, nextRetryAt: null, serverUnavailable: false });
  }

  private patch(patch: Partial<ConnectionState>): void {
    this.store.set({ ...this.store.get(), ...patch });
  }

  private hide(): void {
    this.clearTimers();
    this.dropTransport();
    // Time in the background is not spent reconnecting, so it does not count as failing.
    this.failingSince = null;
    this.patch({ phase: 'hidden', attempt: 0, nextRetryAt: null });
  }

  /** Opens a fresh connection unless one is already being made; `force` also replaces a live one. */
  private resume(force: boolean): void {
    if (!this.running || !this.lifecycle.isVisible()) return;
    const { phase, stopReason } = this.store.get();
    if (stopReason !== null) {
      if (phase === 'hidden') this.patch({ phase: 'offline' });
      return;
    }
    if (phase === 'connecting' || (phase === 'online' && !force)) return;
    this.connect(0);
  }

  private connect(attempt: number): void {
    this.clearTimers();
    this.dropTransport();
    const transport = this.openTransport();
    this.transport = transport;
    this.offTransportClose = transport.onClose(() => this.lost(transport));
    this.patch({ phase: 'connecting', attempt, nextRetryAt: null });
    this.client.attach(transport);
    if (this.transport !== transport || this.store.get().stopReason !== null) return;
    this.connectTimer = this.timers.setTimeout(() => {
      this.connectTimer = undefined;
      this.fail();
    }, CONNECT_TIMEOUT_MS);
    if (transport.onOpen === undefined) this.opened(transport);
    else this.offTransportOpen = transport.onOpen(() => this.opened(transport));
  }

  /** Starts keepalive on a connection that has just opened. */
  private opened(transport: Transport): void {
    if (transport !== this.transport || this.store.get().stopReason !== null) return;
    if (this.connectTimer !== undefined) this.timers.clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.ping();
    this.pongTimer = this.timers.setTimeout(() => {
      this.pongTimer = undefined;
      if (!this.pongSincePing) this.fail();
    }, PONG_TIMEOUT_MS);
  }

  /** Sends a ping and schedules the next one. */
  private ping(): void {
    this.pongSincePing = false;
    this.client.ping();
    this.pingDueAt = this.timers.now() + PING_INTERVAL_MS;
    this.pingTimer = this.timers.setTimeout(() => this.pingDue(), PING_INTERVAL_MS);
  }

  private pingDue(): void {
    this.pingTimer = undefined;
    if (this.timers.now() - this.pingDueAt > TIMER_JUMP_MS) {
      this.connect(this.store.get().attempt);
    } else if (!this.pongSincePing) {
      this.fail();
    } else {
      this.ping();
    }
  }

  /** Abandons the current connection as dead and schedules a retry. */
  private fail(): void {
    this.clearTimers();
    this.dropTransport();
    this.scheduleRetry();
  }

  private lost(transport: Transport): void {
    if (transport !== this.transport) return;
    this.release();
    this.clearTimers();
    if (this.store.get().stopReason !== null) this.patch({ phase: 'offline' });
    else this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const failures = this.store.get().attempt + 1;
    const delay = retryDelay(failures, this.random);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      this.connect(failures);
    }, delay);
    const now = this.timers.now();
    this.patch({
      phase: 'offline',
      attempt: failures,
      nextRetryAt: now + delay,
      serverUnavailable: this.failedTooLong(now),
    });
  }

  /**
   * Records a failed connection, returning whether connections have now failed for too long while
   * the device was online.
   */
  private failedTooLong(now: number): boolean {
    if (!this.isOnline()) {
      this.failingSince = null;
      return false;
    }
    this.failingSince ??= now;
    return (
      this.store.get().serverUnavailable || now - this.failingSince >= SERVER_UNAVAILABLE_AFTER_MS
    );
  }

  private observe(state: GameClientState): void {
    if (!this.running) return;
    const ponged = state.pongCount !== this.seenPongCount;
    this.seenPongCount = state.pongCount;
    const newError = state.errorCount !== this.seenErrorCount;
    this.seenErrorCount = state.errorCount;
    const newlyRejected = state.status === 'rejected' && this.seenStatus !== 'rejected';
    this.seenStatus = state.status;
    if (this.store.get().stopReason === null) {
      const reason = this.stopReasonFor(state, newError, newlyRejected);
      if (reason !== null) {
        this.halt(reason);
        return;
      }
    }
    if (this.transport === undefined) return;
    if (ponged) {
      this.pongSincePing = true;
      this.failingSince = null;
      this.patch({ phase: 'online', attempt: 0, nextRetryAt: null, serverUnavailable: false });
      return;
    }
    const answered =
      state.status === 'waiting' || state.status === 'playing' || state.status === 'game_over';
    if (answered && this.store.get().phase === 'connecting') this.patch({ phase: 'online' });
  }

  private stopReasonFor(
    state: GameClientState,
    newError: boolean,
    newlyRejected: boolean,
  ): StopReason | null {
    if (newError && isClosingErrorCode(state.lastError)) return state.lastError;
    if (newlyRejected) return 'rejected';
    return null;
  }

  /** Stops reconnecting for good; a connection that is still open stays attached. */
  private halt(reason: StopReason): void {
    this.clearTimers();
    const live = this.transport?.open === true;
    this.patch({
      phase: live ? 'online' : this.store.get().phase === 'hidden' ? 'hidden' : 'offline',
      attempt: live ? 0 : this.store.get().attempt,
      nextRetryAt: null,
      stopReason: reason,
    });
  }

  private dropTransport(): void {
    const transport = this.transport;
    this.release();
    if (transport?.open) transport.close();
  }

  /** Forgets the current transport and removes this manager's listeners from it. */
  private release(): void {
    this.offTransportClose?.();
    this.offTransportOpen?.();
    this.offTransportClose = undefined;
    this.offTransportOpen = undefined;
    this.transport = undefined;
  }

  private clearTimers(): void {
    for (const handle of [this.retryTimer, this.connectTimer, this.pingTimer, this.pongTimer]) {
      if (handle !== undefined) this.timers.clearTimeout(handle);
    }
    this.retryTimer = undefined;
    this.connectTimer = undefined;
    this.pingTimer = undefined;
    this.pongTimer = undefined;
  }
}
