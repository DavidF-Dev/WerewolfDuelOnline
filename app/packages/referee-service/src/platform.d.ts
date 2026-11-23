// The WHATWG fetch types this package uses, for builds without the DOM library.

interface Headers {
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  forEach(callback: (value: string, name: string) => void): void;
}

declare var Headers: {
  prototype: Headers;
  new (init?: Record<string, string>): Headers;
};

interface Request {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

interface ReadableStreamDefaultReader<T> {
  read(): Promise<{ done: boolean; value?: T }>;
  cancel(): Promise<void>;
}

interface ReadableStream<T> {
  getReader(): ReadableStreamDefaultReader<T>;
}

interface TextDecoder {
  decode(input?: Uint8Array): string;
}

declare var TextDecoder: {
  prototype: TextDecoder;
  new (): TextDecoder;
};

interface Response {
  readonly status: number;
  readonly headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

declare var Response: {
  prototype: Response;
  new (body?: string | null, init?: { status?: number; headers?: Headers }): Response;
};

interface URL {
  readonly pathname: string;
}

declare var URL: {
  prototype: URL;
  new (url: string): URL;
};
