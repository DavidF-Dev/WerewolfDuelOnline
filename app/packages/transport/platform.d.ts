// The web platform APIs this package uses, for builds without the DOM library.

declare function queueMicrotask(callback: () => void): void;

interface Crypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

declare var crypto: Crypto;

interface MessageEvent {
  readonly data: unknown;
}

interface BroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

declare var BroadcastChannel: {
  prototype: BroadcastChannel;
  new (name: string): BroadcastChannel;
};

interface CloseEvent {
  readonly code: number;
  readonly reason: string;
}

interface WebSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

declare var WebSocket: {
  prototype: WebSocket;
  new (url: string): WebSocket;
};
