import type { ClientMessage, ServerMessage } from '@wwd/protocol';

/** A stand-in for the browser `WebSocket` that records what it is sent and is driven by hand. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.readyState = 3;
  }

  /** Opens the socket, flushing anything queued by the transport. */
  accept(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  messages(): ClientMessage[] {
    return this.sent.map((text) => JSON.parse(text) as ClientMessage);
  }
}
