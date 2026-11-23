import type WebSocket from 'ws';
import { encode, type ServerMessage } from '@wwd/protocol';
import type { ConnId } from '@wwd/referee-core';
import { CLOSE } from '@wwd/referee-service';

/** Output a peer may leave unread before its socket is closed rather than queued further. */
export const MAX_BUFFERED_BYTES = 1_048_576;

export interface ConnectionTimeouts {
  /** How long the socket has to be welcomed to a seat or told its rejoin request is pending. */
  helloMs: number;
  /** How long the socket may go without sending anything. */
  idleMs: number;
}

/**
 * One client socket in a room. It is ended, and `onEnd` called once, when it misses its hello
 * deadline, goes idle, or stops reading what it is sent.
 */
export class Connection {
  private helloTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly idleTimer: ReturnType<typeof setTimeout>;
  private ended = false;

  constructor(
    readonly id: ConnId,
    private readonly socket: WebSocket,
    timeouts: ConnectionTimeouts,
    private readonly onEnd: (conn: Connection) => void,
  ) {
    this.helloTimer = setTimeout(() => this.end(CLOSE.POLICY_VIOLATION), timeouts.helloMs);
    this.idleTimer = setTimeout(() => this.end(CLOSE.GOING_AWAY), timeouts.idleMs);
  }

  /** Records that the peer sent something, restarting the idle deadline. */
  heard(): void {
    if (!this.ended) this.idleTimer.refresh();
  }

  send(msg: ServerMessage): void {
    if (this.ended) return;
    if (msg.type === 'welcome' || msg.type === 'rejoin_pending') this.clearHelloTimer();
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.end(CLOSE.TRY_AGAIN_LATER);
      return;
    }
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(encode(msg));
  }

  /** Closes the socket with `code` and reports the end at once, without waiting for the peer. */
  end(code: number): void {
    if (this.ended) return;
    this.release();
    if (this.socket.readyState === this.socket.OPEN) this.socket.close(code);
    this.onEnd(this);
  }

  /** Stops every timer; called once the socket has closed. */
  release(): void {
    this.ended = true;
    this.clearHelloTimer();
    clearTimeout(this.idleTimer);
  }

  private clearHelloTimer(): void {
    if (this.helloTimer === undefined) return;
    clearTimeout(this.helloTimer);
    this.helloTimer = undefined;
  }
}
