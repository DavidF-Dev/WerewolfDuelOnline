import {
  MAX_SAVE_BYTES,
  PROTOCOL_VERSION,
  parseCreateRoomRequest,
  type CreateRoomRequest,
  type HealthResponse,
} from '@wwd/protocol';
import { generateJoinCode, type Clock, type Random } from '@wwd/referee-core';
import { JOIN_CODE_PATTERN } from './codes.js';
import { corsHeaders, isOriginAllowed } from './cors.js';
import { LIMITS } from './limits.js';

export interface ServiceConfig {
  allowedOrigins: string[];
  testOverrides: boolean;
  engineVersion: string;
}

/** How creating a room went: `invalid_save` when the save it was asked to continue fails verification. */
export type CreateResult = 'created' | 'collision' | 'invalid_save';

export interface RoomStore {
  create(code: string, req: CreateRoomRequest): Promise<CreateResult>;
}

/** A valid WebSocket upgrade request for the room with join code `upgrade`. */
export interface UpgradeRequest {
  upgrade: string;
}

export interface ServiceContext {
  store: RoomStore;
  config: ServiceConfig;
  limiter: RateLimiter;
  clientIp: string;
  random: Random;
}

const CREATE_ATTEMPTS = 5;
const ONE_HOUR_MS = 3_600_000;
const MAX_TRACKED_KEYS = 10_000;

/** A fixed-window counter per key. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private lastPrune: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: Clock,
    private readonly maxKeys = MAX_TRACKED_KEYS,
  ) {
    this.lastPrune = clock.now();
  }

  /** The number of keys currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  /** Counts one attempt for the key and returns whether it is within the limit. */
  allow(key: string): boolean {
    const now = this.clock.now();
    if (now - this.lastPrune >= this.windowMs) this.prune();
    let entry = this.windows.get(key);
    if (entry === undefined || now - entry.start >= this.windowMs) {
      this.windows.delete(key);
      if (this.windows.size >= this.maxKeys) this.evictOldest();
      entry = { start: now, count: 0 };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** Drops windows that have ended. */
  prune(): void {
    const now = this.clock.now();
    this.lastPrune = now;
    for (const [key, entry] of this.windows) {
      if (now - entry.start >= this.windowMs) this.windows.delete(key);
    }
  }

  // Map iteration follows insertion order and windows are inserted in start order.
  private evictOldest(): void {
    const oldest = this.windows.keys().next();
    if (!oldest.done) this.windows.delete(oldest.value);
  }
}

/** The room-creation limiter: `limit` attempts per IP per hour, 20 unless given. */
export function createRoomLimiter(
  clock: Clock,
  limit: number = LIMITS.ROOM_CREATE_LIMIT,
): RateLimiter {
  return new RateLimiter(limit, ONE_HOUR_MS, clock);
}

function json(
  status: number,
  body: unknown,
  cors: Headers,
  extra?: Record<string, string>,
): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...extra,
  });
  cors.forEach((value, name) => headers.set(name, value));
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Handles the HTTP API shared by every adapter. Returns `{ upgrade: code }`, with the normalised
 * join code, for a valid WebSocket upgrade request, which the adapter then performs itself.
 */
export async function handleHttp(
  req: Request,
  ctx: ServiceContext,
): Promise<Response | UpgradeRequest> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, ctx.config);
  const originAllowed = origin === null || isOriginAllowed(origin, ctx.config);
  const path = new URL(req.url).pathname;
  const notAllowed = (allow: string): Response =>
    json(405, { error: 'method_not_allowed' }, cors, { allow });

  if (req.method === 'OPTIONS') {
    if (!originAllowed) return json(403, { error: 'forbidden_origin' }, cors);
    return new Response(null, { status: 204, headers: cors });
  }

  if (path === '/health') {
    if (req.method !== 'GET') return notAllowed('GET, OPTIONS');
    const body: HealthResponse = {
      ok: true,
      protocol_version: PROTOCOL_VERSION,
      engine_version: ctx.config.engineVersion,
    };
    return json(200, body, cors);
  }

  if (path === '/rooms') {
    if (req.method !== 'POST') return notAllowed('POST, OPTIONS');
    return createRoom(req, ctx, cors, originAllowed);
  }

  const match = /^\/rooms\/([^/]+)\/ws$/.exec(path);
  if (match !== null) {
    const code = match[1]!.toUpperCase();
    if (!JOIN_CODE_PATTERN.test(code)) return json(404, { error: 'not_found' }, cors);
    if (req.method !== 'GET') return notAllowed('GET, OPTIONS');
    if (!originAllowed) return json(403, { error: 'forbidden_origin' }, cors);
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json(426, { error: 'upgrade_required' }, cors);
    }
    return { upgrade: code };
  }

  return json(404, { error: 'not_found' }, cors);
}

/**
 * Reads a request body as text, or returns null once it exceeds the largest body any request
 * may have; the parser applies the tighter cap to bodies without a save.
 */
async function readBody(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SAVE_BYTES) return null;
  if (req.body === null) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value!.length;
    if (total > MAX_SAVE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value!);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}

async function createRoom(
  req: Request,
  ctx: ServiceContext,
  cors: Headers,
  originAllowed: boolean,
): Promise<Response> {
  if (!originAllowed) return json(403, { error: 'forbidden_origin' }, cors);
  if (!ctx.limiter.allow(ctx.clientIp)) return json(429, { error: 'rate_limited' }, cors);

  const body = await readBody(req);
  if (body === null) return json(413, { error: 'too_large' }, cors);
  const parsed = parseCreateRoomRequest(body);
  if (!parsed.ok) {
    return json(parsed.code === 'too_large' ? 413 : 400, { error: parsed.code }, cors);
  }
  const request = parsed.msg;
  if (!('save' in request) && request.test !== undefined && !ctx.config.testOverrides) {
    return json(400, { error: 'test_overrides_disabled' }, cors);
  }

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateJoinCode(ctx.random);
    const result = await ctx.store.create(code, request);
    if (result === 'created') return json(201, { code }, cors);
    if (result === 'invalid_save') return json(400, { error: 'invalid_save' }, cors);
  }
  return json(503, { error: 'unavailable' }, cors);
}
