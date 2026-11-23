import { createInMemoryPair, parseEnvelope, type Envelope, type Transport } from '@wwd/transport';
import type { MemoryReferee } from './memory-referee.js';

/**
 * Serves a `MemoryReferee` to guests over a `BroadcastChannel`.
 *
 * Any same-origin tab can read and post on the channel, so this is suitable for
 * single-user local play only. Each guest connection id gets its own referee connection.
 */
export class BroadcastChannelHost {
  private readonly channel: BroadcastChannel;
  private readonly guests = new Map<string, Transport>();
  private closed = false;

  constructor(
    private readonly referee: MemoryReferee,
    channelName: string,
  ) {
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event: MessageEvent) => this.receive(parseEnvelope(event.data));
  }

  /** Tells every known guest the host is closing, then releases the channel. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [conn, guest] of [...this.guests]) {
      this.post({ conn, dir: 'close' });
      guest.close();
    }
    this.guests.clear();
    this.channel.close();
  }

  private receive(envelope: Envelope | undefined): void {
    if (envelope === undefined || this.closed) return;
    if (envelope.dir === 'c2s') {
      if (envelope.text === undefined) return;
      this.guestFor(envelope.conn).send(envelope.text);
    } else if (envelope.dir === 'close') {
      const guest = this.guests.get(envelope.conn);
      this.guests.delete(envelope.conn);
      guest?.close();
    }
  }

  private guestFor(conn: string): Transport {
    const existing = this.guests.get(conn);
    if (existing?.open) return existing;
    const [guest, server] = createInMemoryPair();
    this.guests.set(conn, guest);
    guest.onMessage((text) => this.post({ conn, dir: 's2c', text }));
    // A remote close unregisters the guest before closing it, so a still-registered guest was closed locally.
    guest.onClose(() => {
      if (this.guests.get(conn) !== guest) return;
      this.guests.delete(conn);
      if (!this.closed) this.post({ conn, dir: 'close' });
    });
    this.referee.accept(server);
    return guest;
  }

  private post(envelope: Envelope): void {
    this.channel.postMessage(envelope);
  }
}
