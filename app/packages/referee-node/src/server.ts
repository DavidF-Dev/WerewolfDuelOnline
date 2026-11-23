import { readFile } from 'node:fs/promises';
import { STATUS_CODES, createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import type { Duplex } from 'node:stream';
import { Readable } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { engineVersion, initEngine } from '@wwd/engine';
import { encode, type ServerMessage } from '@wwd/protocol';
import type { Clock, Random } from '@wwd/referee-core';
import {
  CLOSE,
  LIMITS,
  createRoomLimiter,
  errorResponse,
  handleHttp,
  rateLimitKey,
  type ServiceConfig,
  type ServiceContext,
} from '@wwd/referee-service';
import { Connection, type ConnectionTimeouts } from './connection.js';
import { FileStore } from './file-store.js';
import { RoomRegistry, type HostedRoom, type Logger } from './rooms.js';

export interface NodeRefereeOptions {
  port: number;
  host?: string;
  /** Where room snapshot files are kept; defaults to `./data`. */
  dataDir?: string;
  allowedOrigins: string[];
  /** Honours `test` room options and allows `http://localhost:*` origins. */
  testOverrides?: boolean;
  /**
   * Takes the client address from the last `X-Forwarded-For` hop, which is the one added by
   * the single reverse proxy this assumes; earlier hops are client-supplied and ignored.
   */
  trustProxy?: boolean;
  clock?: Clock;
  random?: Random;
  logger?: Logger;
  /** Defaults to an hour. */
  sweepIntervalMs?: number;
  /** Defaults to `LIMITS.PRE_HELLO_TIMEOUT_MS`. */
  preHelloTimeoutMs?: number;
  /** Defaults to `LIMITS.IDLE_TIMEOUT_MS`. */
  idleTimeoutMs?: number;
}

export interface RunningReferee {
  url: string;
  close(): Promise<void>;
}

const SWEEP_INTERVAL_MS = 3_600_000;
const DISMISS_GRACE_MS = 1_000;
// Only the path matters to the shared service, so requests get a fixed origin.
const REQUEST_BASE = 'http://referee.invalid';

const systemClock: Clock = { now: () => Date.now() };
const systemRandom: Random = { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) };

/** Loads the engine's WebAssembly module from the installed engine package. */
export async function loadEngine(): Promise<void> {
  const require = createRequire(import.meta.url);
  await initEngine(await readFile(require.resolve('@wwd/engine/wasm')));
}

function headersOf(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

function toRequest(req: IncomingMessage, withBody: boolean): Request {
  const method = req.method ?? 'GET';
  const init: RequestInit & { duplex?: 'half' } = { method, headers: headersOf(req) };
  if (withBody && method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(new URL(req.url ?? '/', REQUEST_BASE), init);
}

function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(header) ? header.join(',') : header;
    const last = forwarded?.split(',').at(-1)?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Answers an upgrade request with a plain HTTP response and closes the socket. */
async function refuseUpgrade(socket: Duplex, response: Response): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  let head = `HTTP/1.1 ${response.status} ${STATUS_CODES[response.status] ?? ''}\r\n`;
  response.headers.forEach((value, name) => {
    head += `${name}: ${value}\r\n`;
  });
  head += `content-length: ${body.length}\r\nconnection: close\r\n\r\n`;
  socket.end(Buffer.concat([Buffer.from(head), body]));
}

/**
 * Closes a socket that never joins a room with `code`, after an optional final message. Any
 * error, such as a malformed frame from the peer, ends it at once, and it is ended regardless
 * once `DISMISS_GRACE_MS` has passed, so a peer that never answers the close cannot keep it.
 */
function dismiss(ws: WebSocket, code: number, notice?: ServerMessage): void {
  ws.on('error', () => ws.terminate());
  const timer = setTimeout(() => ws.terminate(), DISMISS_GRACE_MS);
  ws.once('close', () => clearTimeout(timer));
  if (notice !== undefined) ws.send(encode(notice));
  ws.close(code);
}

function isFull(hosted: HostedRoom): boolean {
  return hosted.connections.size >= LIMITS.MAX_CONNECTIONS_PER_ROOM;
}

/** Starts a referee serving the shared HTTP API and room WebSockets on `opts.port`. */
export async function startReferee(opts: NodeRefereeOptions): Promise<RunningReferee> {
  await loadEngine();
  const logger = opts.logger ?? console;
  const clock = opts.clock ?? systemClock;
  const random = opts.random ?? systemRandom;
  const trustProxy = opts.trustProxy ?? false;
  const timeouts: ConnectionTimeouts = {
    helloMs: opts.preHelloTimeoutMs ?? LIMITS.PRE_HELLO_TIMEOUT_MS,
    idleMs: opts.idleTimeoutMs ?? LIMITS.IDLE_TIMEOUT_MS,
  };

  const files = new FileStore(opts.dataDir ?? './data', (code, thrown) => {
    logger.error(`room ${code} snapshot write failed: ${String(thrown)}`);
  });
  await files.init();
  const testOverrides = opts.testOverrides ?? false;
  const registry = new RoomRegistry({ files, clock, random, logger, testOverrides });
  const config: ServiceConfig = {
    allowedOrigins: opts.allowedOrigins,
    testOverrides,
    engineVersion: engineVersion(),
  };
  const limiter = createRoomLimiter(clock);
  const context = (req: IncomingMessage): ServiceContext => ({
    store: registry,
    config,
    limiter,
    clientIp: rateLimitKey(clientAddress(req, trustProxy)),
    random,
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.MAX_FRAME_BYTES });
  let nextConn = 1;

  const accept = (hosted: HostedRoom, req: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      // The room may have filled or gone while the handshake completed.
      if (!registry.isLive(hosted) || isFull(hosted)) {
        dismiss(ws, registry.isLive(hosted) ? CLOSE.TRY_AGAIN_LATER : CLOSE.GOING_AWAY);
        return;
      }
      const conn = new Connection(`n${nextConn++}`, ws, timeouts, (ended) =>
        registry.disconnect(hosted, ended),
      );
      hosted.connections.set(conn.id, conn);
      const heard = () => conn.heard();
      ws.on('message', (data) => {
        conn.heard();
        try {
          registry.handle(hosted, conn, data.toString());
        } catch (thrown) {
          logger.error(`room ${hosted.room.code} connection failed: ${String(thrown)}`);
          conn.end(CLOSE.INTERNAL_ERROR);
        }
      });
      ws.on('ping', heard);
      ws.on('pong', heard);
      ws.on('error', () => conn.end(CLOSE.INTERNAL_ERROR));
      ws.on('close', () => registry.disconnect(hosted, conn));
    });
  };

  // Completing the handshake lets a browser read why; a refused upgrade looks like a dropped connection.
  const turnAway = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      dismiss(ws, CLOSE.POLICY_VIOLATION, { type: 'error', code: 'unknown_room' });
    });
  };

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    const result = await handleHttp(toRequest(req, false), context(req));
    if (result instanceof Response) return refuseUpgrade(socket, result);
    const hosted = await registry.open(result.upgrade);
    if (hosted === undefined) return turnAway(req, socket, head);
    if (isFull(hosted)) return refuseUpgrade(socket, errorResponse(503, 'too_many_connections'));
    accept(hosted, req, socket, head);
  };

  const server = createServer((req, res) => {
    handleHttp(toRequest(req, true), context(req))
      .then((result) =>
        writeResponse(
          res,
          result instanceof Response ? result : errorResponse(426, 'upgrade_required'),
        ),
      )
      .catch((thrown: unknown) => {
        logger.error(`request failed: ${String(thrown)}`);
        if (!res.headersSent) return writeResponse(res, errorResponse(500, 'internal_error'));
        res.destroy();
      });
  });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    onUpgrade(req, socket, head).catch((thrown: unknown) => {
      logger.error(`upgrade failed: ${String(thrown)}`);
      socket.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const sweepTimer = setInterval(() => {
    registry.sweep().catch((thrown: unknown) => logger.error(`sweep failed: ${String(thrown)}`));
  }, opts.sweepIntervalMs ?? SWEEP_INTERVAL_MS);

  const address = server.address() as AddressInfo;
  const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;

  let closed: Promise<void> | undefined;
  return {
    url: `http://${host}:${address.port}`,
    close() {
      closed ??= (async () => {
        clearInterval(sweepTimer);
        await registry.close();
        const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
        server.closeAllConnections();
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        await stopped;
      })();
      return closed;
    },
  };
}
