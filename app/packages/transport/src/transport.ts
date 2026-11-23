import { OpenSignal } from './open-signal.js';

/** Why a connection closed, in WebSocket close-frame terms. */
export interface CloseInfo {
  code: number;
  reason: string;
}

/** The close info for an orderly close. */
export const NORMAL_CLOSURE: Readonly<CloseInfo> = { code: 1000, reason: '' };

/**
 * A bidirectional text channel between a client and a referee.
 *
 * `send` never throws: text sent before the connection opens is queued and flushed once it
 * opens, and text sent after it closes is dropped.
 */
export interface Transport {
  send(text: string): void;
  /** Registers a message listener; returns a function that removes it. */
  onMessage(cb: (text: string) => void): () => void;
  /** Registers a close listener, passed the close info when known; returns a function that removes it. */
  onClose(cb: (info?: CloseInfo) => void): () => void;
  /**
   * Registers a listener called once the connection is established, or at once if it already is;
   * never called if it closes first. Returns a function that removes it. A transport without
   * this method is established from the start.
   */
  onOpen?(cb: () => void): () => void;
  close(): void;
  readonly open: boolean;
}

class MemoryEnd implements Transport {
  peer: MemoryEnd | undefined;
  private isOpen = true;
  private readonly messageListeners = new Set<(text: string) => void>();
  private readonly closeListeners = new Set<(info?: CloseInfo) => void>();
  private readonly opened = new OpenSignal();

  constructor() {
    queueMicrotask(() => {
      if (this.isOpen) this.opened.fire();
    });
  }

  get open(): boolean {
    return this.isOpen;
  }

  onOpen(cb: () => void): () => void {
    return this.isOpen ? this.opened.subscribe(cb) : () => {};
  }

  send(text: string): void {
    const peer = this.peer;
    if (!this.isOpen || peer === undefined) return;
    queueMicrotask(() => peer.receive(text));
  }

  onMessage(cb: (text: string) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onClose(cb: (info?: CloseInfo) => void): () => void {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  close(): void {
    if (!this.isOpen) return;
    this.shutDown();
    const peer = this.peer;
    if (peer !== undefined) queueMicrotask(() => peer.shutDown());
  }

  private receive(text: string): void {
    if (!this.isOpen) return;
    for (const cb of [...this.messageListeners]) cb(text);
  }

  private shutDown(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.opened.cancel();
    for (const cb of [...this.closeListeners]) cb({ ...NORMAL_CLOSURE });
  }
}

/** Creates two connected transports; delivery and close propagation are asynchronous. */
export function createInMemoryPair(): [Transport, Transport] {
  const a = new MemoryEnd();
  const b = new MemoryEnd();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
