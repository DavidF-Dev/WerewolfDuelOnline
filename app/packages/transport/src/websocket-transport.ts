import { OpenSignal } from './open-signal.js';
import { NORMAL_CLOSURE, type CloseInfo, type Transport } from './transport.js';

const READY_STATE_OPEN = 1;
const ABNORMAL_CLOSURE: Readonly<CloseInfo> = { code: 1006, reason: '' };

export interface WebSocketTransportOptions {
  /** The WebSocket constructor to use; defaults to the global `WebSocket`. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * A `Transport` over a WebSocket.
 *
 * It counts as open from construction until either end closes it. Text sent while the socket is
 * still connecting is queued and sent in order once it opens, after which `onOpen` listeners are
 * called. Close listeners receive the socket's
 * close code and reason, or a normal closure when this end closed it; a socket that cannot be
 * created at all reports an abnormal closure (1006). Binary frames are ignored.
 */
export class WebSocketTransport implements Transport {
  private socket: WebSocket | undefined;
  private queue: string[] = [];
  private isOpen = true;
  private readonly messageListeners = new Set<(text: string) => void>();
  private readonly closeListeners = new Set<(info?: CloseInfo) => void>();
  private readonly opened = new OpenSignal();

  constructor(url: string, opts: WebSocketTransportOptions = {}) {
    let socket: WebSocket;
    try {
      const Impl = opts.WebSocketImpl ?? WebSocket;
      socket = new Impl(url);
    } catch {
      queueMicrotask(() => this.shutDown(ABNORMAL_CLOSURE));
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.socketOpened();
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = (event) => this.shutDown({ code: event.code, reason: event.reason });
    // A close event always follows an error; the listener only keeps the error from being unhandled.
    socket.onerror = () => {};
  }

  get open(): boolean {
    return this.isOpen;
  }

  onOpen(cb: () => void): () => void {
    return this.isOpen ? this.opened.subscribe(cb) : () => {};
  }

  send(text: string): void {
    if (!this.isOpen) return;
    if (this.socket?.readyState !== READY_STATE_OPEN) {
      this.queue.push(text);
      return;
    }
    this.write(text);
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
    const socket = this.socket;
    this.shutDown(NORMAL_CLOSURE);
    try {
      socket?.close(NORMAL_CLOSURE.code);
    } catch {
      // The socket is unusable either way.
    }
  }

  private socketOpened(): void {
    if (!this.isOpen) return;
    const queued = this.queue;
    this.queue = [];
    for (const text of queued) this.write(text);
    this.opened.fire();
  }

  private write(text: string): void {
    try {
      this.socket?.send(text);
    } catch {
      // A socket that fails mid-send reports it through its close event.
    }
  }

  private receive(data: unknown): void {
    if (!this.isOpen || typeof data !== 'string') return;
    for (const cb of [...this.messageListeners]) cb(data);
  }

  private shutDown(info: Readonly<CloseInfo>): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.queue = [];
    this.opened.cancel();
    for (const cb of [...this.closeListeners]) cb({ ...info });
  }
}
