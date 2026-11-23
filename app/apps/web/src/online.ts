import { defaultRulesConfig, type RulesConfig, type Seat } from '@wwd/engine';
import {
  ConnectionManager,
  GameClient,
  browserLifecycle,
  type Lifecycle,
  type RejoinAttempt,
} from '@wwd/client-core';
import type { CreateRoomRequest, NewRoomRequest } from '@wwd/protocol';
import { WebSocketTransport, type Transport } from '@wwd/transport';
import { normaliseCode } from './code.js';

// URL host names keep the brackets around an IPv6 address.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Reads a referee address: an `http:` or `https:` URL without credentials, returned as its
 * origin and path with no trailing slash. In a production build, plain `http:` is accepted only
 * for `localhost`, `127.0.0.1` and `[::1]`. Anything else is undefined.
 */
export function parseServer(
  input: string,
  production: boolean = import.meta.env.PROD,
): string | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  if (production && url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    return undefined;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * The default referee from the configured `raw` address. A production build throws when it is
 * missing or unusable, rather than quietly using another server; other builds use a local referee.
 */
export function resolveDefaultServer(raw: string | undefined, production: boolean): string {
  const server = parseServer(raw ?? '', production);
  if (server !== undefined) return server;
  if (production) {
    throw new Error(`VITE_REFEREE_URL is not a usable referee address: ${JSON.stringify(raw)}`);
  }
  return 'http://localhost:8787';
}

/** The referee for online games unless an invite link names another. */
export const DEFAULT_SERVER: string = resolveDefaultServer(
  import.meta.env.VITE_REFEREE_URL,
  import.meta.env.PROD,
);

/** The referee for new games: the custom server from the settings when it is usable, otherwise the default. */
export const serverFor = (custom: string | null): string =>
  (custom === null ? undefined : parseServer(custom)) ?? DEFAULT_SERVER;

/** The WebSocket URL of `room` on the referee at `server`. */
export function socketUrl(server: string, room: string): string {
  const url = new URL(`${server.replace(/\/+$/, '')}/rooms/${room}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

const appBase = (): string => `${location.origin}${location.pathname}`;

const serverQuery = (server: string): string =>
  server === DEFAULT_SERVER ? '' : `server=${encodeURIComponent(server)}`;

/**
 * The app route that joins `room`, naming `server` only when it is not the default, and the
 * seat to claim when one is given.
 */
export function joinHash(room: string, server: string, seat?: Seat): string {
  const params = [serverQuery(server), seat === undefined ? '' : `seat=${seat}`];
  const query = params.filter((p) => p !== '').join('&');
  return `#/join/${room}${query === '' ? '' : `?${query}`}`;
}

/** The app route that rejoins `room`, with the seat when it is known. */
export function rejoinHash(room: string, seat: Seat | null, server: string): string {
  const params = [`code=${room}`, ...(seat === null ? [] : [`seat=${seat}`]), serverQuery(server)];
  return `#/rejoin?${params.filter((p) => p !== '').join('&')}`;
}

export const inviteLink = (room: string, server: string): string =>
  appBase() + joinHash(room, server);

export const rejoinLink = (room: string, seat: Seat, server: string): string =>
  appBase() + rejoinHash(room, seat, server);

/** A host name to show for `server`. */
export const serverHost = (server: string): string => new URL(server).host;

export type CreateRoomProblem =
  'rate_limited' | 'unavailable' | 'network' | 'invalid_save' | 'other';

const CREATE_PROBLEM_IDS: Readonly<Record<CreateRoomProblem, string>> = {
  rate_limited: 'create-failed-rate-limited',
  unavailable: 'create-failed-unavailable',
  network: 'create-failed-network',
  invalid_save: 'save-failed-invalid',
  other: 'create-failed-other',
};

/** The Fluent id explaining `problem`; a network failure while `online` is put down to the server. */
export const createProblemId = (problem: CreateRoomProblem, online: boolean): string =>
  problem === 'network' && online ? 'create-failed-server' : CREATE_PROBLEM_IDS[problem];

export type CreateRoomResult =
  { ok: true; code: string } | { ok: false; problem: CreateRoomProblem };

/** Creates a room on the referee at `server` under `config`; `test` needs a referee started with test overrides. */
export async function createRoom(
  server: string,
  graceMinutes: NewRoomRequest['grace_minutes'],
  test?: NewRoomRequest['test'],
  config: RulesConfig = defaultRulesConfig(),
): Promise<CreateRoomResult> {
  const body: NewRoomRequest = {
    config,
    grace_minutes: graceMinutes,
    ...(test === undefined ? {} : { test }),
  };
  return postRoom(server, body);
}

/** Sends `body` to the referee at `server` to create a room. */
export async function postRoom(server: string, body: CreateRoomRequest): Promise<CreateRoomResult> {
  let response: Response;
  try {
    response = await fetch(`${server}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, problem: 'network' };
  }
  if (response.status === 429) return { ok: false, problem: 'rate_limited' };
  if (response.status === 503) return { ok: false, problem: 'unavailable' };
  if (response.status === 400 && (await errorOf(response)) === 'invalid_save') {
    return { ok: false, problem: 'invalid_save' };
  }
  if (response.status !== 201) return { ok: false, problem: 'other' };
  try {
    const parsed = (await response.json()) as { code?: unknown };
    const code = typeof parsed.code === 'string' ? normaliseCode(parsed.code) : undefined;
    return code === undefined ? { ok: false, problem: 'other' } : { ok: true, code };
  } catch {
    return { ok: false, problem: 'other' };
  }
}

async function errorOf(response: Response): Promise<unknown> {
  try {
    return ((await response.json()) as { error?: unknown }).error;
  } catch {
    return undefined;
  }
}

export interface OnlineGameOptions {
  server: string;
  room: string;
  /** The display name sent to the referee. */
  name?: string;
  seatToken?: string;
  rejoin?: RejoinAttempt;
  /** The seat to claim in a room created from a save. */
  seat?: Seat;
  lifecycle?: Lifecycle;
}

/** A `GameClient` kept connected to one online room. */
export interface OnlineGame {
  readonly client: GameClient;
  readonly manager: ConnectionManager;
  /** Connects again as a newcomer claiming a free seat, forgetting any seat token or rejoin. */
  joinAsNew(): void;
  /** Connects again to ask for a taken seat. */
  rejoin(attempt: RejoinAttempt): void;
  /** Closes the connection for good. */
  stop(): void;
}

/** Connects to `room` on `server` over WebSocket and keeps it connected while the page is visible. */
export function startOnlineGame(opts: OnlineGameOptions): OnlineGame {
  const client = new GameClient({
    room: opts.room,
    ...(opts.name === undefined ? {} : { name: opts.name }),
    ...(opts.seatToken === undefined ? {} : { seatToken: opts.seatToken }),
    ...(opts.rejoin === undefined ? {} : { rejoin: opts.rejoin }),
    ...(opts.seat === undefined ? {} : { seat: opts.seat }),
  });
  const url = socketUrl(opts.server, opts.room);
  const manager = new ConnectionManager({
    client,
    connect: (): Transport => new WebSocketTransport(url),
    lifecycle: opts.lifecycle ?? browserLifecycle(),
    isOnline: () => navigator.onLine,
  });
  const restart = (rejoin: RejoinAttempt | null): void => {
    manager.stop();
    client.setRejoin(rejoin);
    manager.start();
  };
  manager.start();
  return {
    client,
    manager,
    joinAsNew: () => {
      if (client.current.seatToken === null) restart(null);
    },
    rejoin: (attempt) => restart(attempt),
    stop: () => {
      manager.stop();
      client.dispose();
    },
  };
}
