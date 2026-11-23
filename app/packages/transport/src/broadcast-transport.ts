import { parseEnvelope, type Envelope } from './envelope.js';
import { OpenSignal } from './open-signal.js';
import { NORMAL_CLOSURE, type CloseInfo, type Transport } from './transport.js';

function randomConnId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Guest side of a local connection carried over a `BroadcastChannel`.
 *
 * Any same-origin tab can read and post on the channel, so this is suitable for
 * single-user local play only. The guest ignores everything not addressed to its
 * own connection id.
 */
export class BroadcastChannelTransport implements Transport {
  readonly connId: string;
  private readonly channel: BroadcastChannel;
  private isOpen = true;
  private readonly messageListeners = new Set<(text: string) => void>();
  private readonly closeListeners = new Set<(info?: CloseInfo) => void>();
  private readonly opened = new OpenSignal();

  constructor(channelName: string, connId: string = randomConnId()) {
    this.connId = connId;
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event: MessageEvent) => this.receive(parseEnvelope(event.data));
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
    if (!this.isOpen) return;
    const envelope: Envelope = { conn: this.connId, dir: 'c2s', text };
    this.channel.postMessage(envelope);
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
    const envelope: Envelope = { conn: this.connId, dir: 'close' };
    this.channel.postMessage(envelope);
    this.shutDown();
  }

  private receive(envelope: Envelope | undefined): void {
    if (envelope === undefined || !this.isOpen || envelope.conn !== this.connId) return;
    if (envelope.dir === 's2c') {
      if (envelope.text === undefined) return;
      for (const cb of [...this.messageListeners]) cb(envelope.text);
    } else if (envelope.dir === 'close') {
      this.shutDown();
    }
  }

  private shutDown(): void {
    this.isOpen = false;
    this.opened.cancel();
    this.channel.close();
    for (const cb of [...this.closeListeners]) cb({ ...NORMAL_CLOSURE });
  }
}
