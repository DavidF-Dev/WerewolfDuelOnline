import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_BYTES,
  MAX_SAVE_BYTES,
  PROTOCOL_VERSION,
  type CreateRoomRequest,
} from '@wwd/protocol';
import { generateJoinCode } from '@wwd/referee-core';
import {
  LIMITS,
  RateLimiter,
  corsHeaders,
  createRoomLimiter,
  handleHttp,
  isExpired,
  rateLimitKey,
  seededRandom,
  type CreateResult,
  type RoomStore,
  type ServiceConfig,
  type ServiceContext,
} from '../src/index.js';

const ORIGIN = 'https://play.example.com';
const SEED_A = 'a'.repeat(64);
const SEED_B = 'b'.repeat(64);

const BODY = {
  config: { tiebreak: 'badge_only', min_targets: 1, badge_start: 'random' },
  grace_minutes: 10,
};

class FakeStore implements RoomStore {
  readonly rooms = new Map<string, CreateRoomRequest>();
  collisions = 0;
  invalidSave = false;
  async create(code: string, req: CreateRoomRequest): Promise<CreateResult> {
    if (this.invalidSave) return 'invalid_save';
    if (this.collisions > 0) {
      this.collisions -= 1;
      return 'collision';
    }
    this.rooms.set(code, req);
    return 'created';
  }
}

function setup(overrides: Partial<ServiceConfig> = {}, now = { t: 0 }) {
  const store = new FakeStore();
  const config: ServiceConfig = {
    allowedOrigins: [ORIGIN],
    testOverrides: false,
    engineVersion: '9.9.9',
    ...overrides,
  };
  const limiter = createRoomLimiter({ now: () => now.t });
  const ctx = (clientIp = '1.1.1.1'): ServiceContext => ({
    store,
    config,
    limiter,
    clientIp,
    random: seededRandom(SEED_A),
  });
  return { store, config, limiter, ctx, now };
}

function post(body: unknown, origin: string | null = ORIGIN, path = '/rooms'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers['origin'] = origin;
  return new Request(`https://api.example.com${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function run(req: Request, ctx: ServiceContext): Promise<Response> {
  const res = await handleHttp(req, ctx);
  if (!(res instanceof Response)) throw new Error('unexpected upgrade');
  return res;
}

describe('POST /rooms', () => {
  it('creates a room', async () => {
    const { store, ctx } = setup();
    const res = await run(post(BODY), ctx());
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(store.rooms.get(code)?.grace_minutes).toBe(10);
  });

  it('rejects an invalid body', async () => {
    const { ctx } = setup();
    expect((await run(post('not json'), ctx())).status).toBe(400);
    expect((await run(post({ ...BODY, grace_minutes: 7 }), ctx())).status).toBe(400);
  });

  it('rejects test overrides unless enabled', async () => {
    const test = { grace_ms: 1000, seed: SEED_A };
    const off = setup();
    expect((await run(post({ ...BODY, test }), off.ctx())).status).toBe(400);
    expect(off.store.rooms.size).toBe(0);
    const on = setup({ testOverrides: true });
    expect((await run(post({ ...BODY, test }), on.ctx())).status).toBe(201);
  });

  it('retries a collision and gives 503 after five', async () => {
    const one = setup();
    one.store.collisions = 1;
    expect((await run(post(BODY), one.ctx())).status).toBe(201);
    const five = setup();
    five.store.collisions = 5;
    expect((await run(post(BODY), five.ctx())).status).toBe(503);
    expect(five.store.rooms.size).toBe(0);
  });

  it('limits creation attempts per IP per hour', async () => {
    const { ctx, now } = setup();
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) {
      expect((await run(post(BODY), ctx())).status).toBe(201);
    }
    expect((await run(post(BODY), ctx())).status).toBe(429);
    expect((await run(post(BODY), ctx('2.2.2.2'))).status).toBe(201);
    now.t += 3_600_000;
    expect((await run(post(BODY), ctx())).status).toBe(201);
  });

  it('counts invalid attempts against the limit', async () => {
    const { ctx } = setup();
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) await run(post('bad'), ctx());
    expect((await run(post(BODY), ctx())).status).toBe(429);
  });
});

describe('request body cap', () => {
  it('rejects an oversized body declared by content-length', async () => {
    const { ctx } = setup();
    const req = new Request('https://api.example.com/rooms', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-length': '9000' },
      body: 'x'.repeat(9000),
    });
    expect((await run(req, ctx())).status).toBe(413);
  });

  it('rejects an oversized streamed body with no content-length', async () => {
    const { ctx } = setup();
    const chunk = new TextEncoder().encode('x'.repeat(4096));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 4) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const req = new Request('https://api.example.com/rooms', {
      method: 'POST',
      headers: { origin: ORIGIN },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await run(req, ctx())).status).toBe(413);
  });
});

describe('cors', () => {
  it('echoes an allowed origin and varies on it', async () => {
    const { ctx } = setup();
    const res = await run(post(BODY), ctx());
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('rejects a disallowed origin on POST', async () => {
    const { store, ctx } = setup();
    const res = await run(post(BODY, 'https://evil.example'), ctx());
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(store.rooms.size).toBe(0);
  });

  it('allows a request with no origin', async () => {
    const { ctx } = setup();
    expect((await run(post(BODY, null), ctx())).status).toBe(201);
  });

  it('allows localhost only with test overrides', async () => {
    const off = setup();
    expect((await run(post(BODY, 'http://localhost:5173'), off.ctx())).status).toBe(403);
    const on = setup({ testOverrides: true });
    expect((await run(post(BODY, 'http://localhost:5173'), on.ctx())).status).toBe(201);
    expect(
      corsHeaders('http://localhost.evil.com', on.config).get('access-control-allow-origin'),
    ).toBeNull();
  });

  it('answers a preflight with 204', async () => {
    const { ctx } = setup();
    const req = new Request('https://api.example.com/rooms', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    const res = await run(req, ctx());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type');
  });

  it('rejects a preflight from a disallowed origin', async () => {
    const { ctx } = setup();
    const req = new Request('https://api.example.com/rooms', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    expect((await run(req, ctx())).status).toBe(403);
  });
});

describe('routes', () => {
  it('reports health', async () => {
    const { ctx } = setup();
    const res = await run(new Request('https://api.example.com/health'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      protocol_version: PROTOCOL_VERSION,
      engine_version: '9.9.9',
    });
  });

  it('gives 404 for unknown routes and 405 for wrong methods', async () => {
    const { ctx } = setup();
    expect((await run(new Request('https://api.example.com/nope'), ctx())).status).toBe(404);
    expect((await run(new Request('https://api.example.com/rooms'), ctx())).status).toBe(405);
    const del = new Request('https://api.example.com/health', { method: 'DELETE' });
    expect((await run(del, ctx())).status).toBe(405);
  });

  it('detects a websocket upgrade for a valid code, normalising case', async () => {
    const { ctx } = setup();
    const upgrade = (code: string, headers: Record<string, string> = { upgrade: 'websocket' }) =>
      handleHttp(new Request(`https://api.example.com/rooms/${code}/ws`, { headers }), ctx());
    expect(await upgrade('ABC234')).toEqual({ upgrade: 'ABC234' });
    expect(await upgrade('abc234')).toEqual({ upgrade: 'ABC234' });
    const bad = (await upgrade('ABC23I')) as Response;
    expect(bad.status).toBe(404);
    expect(((await upgrade('ABC')) as Response).status).toBe(404);
    expect(((await upgrade('ABC234', {})) as Response).status).toBe(426);
  });

  it('checks the origin on a websocket upgrade', async () => {
    const { ctx } = setup();
    const upgrade = (origin: string) =>
      handleHttp(
        new Request('https://api.example.com/rooms/ABC234/ws', {
          headers: { upgrade: 'websocket', origin },
        }),
        ctx(),
      );
    expect(await upgrade(ORIGIN)).toEqual({ upgrade: 'ABC234' });
    expect(((await upgrade('https://evil.example')) as Response).status).toBe(403);
  });
});

describe('RateLimiter', () => {
  it('stays within the key cap and drops expired keys without prune', () => {
    const now = { t: 0 };
    const limiter = new RateLimiter(5, 1000, { now: () => now.t }, 100);
    for (let i = 0; i < 1000; i++) limiter.allow(`k${i}`);
    expect(limiter.size).toBeLessThanOrEqual(100);
    now.t = 2000;
    limiter.allow('fresh');
    expect(limiter.size).toBe(1);
  });

  it('prunes ended windows', () => {
    const now = { t: 0 };
    const limiter = new RateLimiter(1, 1000, { now: () => now.t });
    expect(limiter.allow('k')).toBe(true);
    expect(limiter.allow('k')).toBe(false);
    now.t = 1000;
    limiter.prune();
    expect(limiter.allow('k')).toBe(true);
  });
});

describe('isExpired', () => {
  it('expires idle rooms after 30 days', () => {
    const room = { lastActivityAt: 1000, finishedAt: null };
    expect(isExpired(room, 1000 + LIMITS.IDLE_ROOM_TTL_MS - 1)).toBe(false);
    expect(isExpired(room, 1000 + LIMITS.IDLE_ROOM_TTL_MS)).toBe(true);
  });

  it('expires finished rooms after 24 hours', () => {
    const room = { lastActivityAt: 1000, finishedAt: 5000 };
    expect(isExpired(room, 5000 + LIMITS.FINISHED_ROOM_TTL_MS - 1)).toBe(false);
    expect(isExpired(room, 5000 + LIMITS.FINISHED_ROOM_TTL_MS)).toBe(true);
  });
});

describe('seededRandom', () => {
  const stream = (seed: string) => Array.from(seededRandom(seed).bytes(64));

  it('repeats for the same seed', () => {
    expect(stream(SEED_A)).toEqual(stream(SEED_A));
  });

  it('differs between seeds', () => {
    expect(stream(SEED_A)).not.toEqual(stream(SEED_B));
  });

  it('advances between calls', () => {
    const r = seededRandom(SEED_A);
    expect(Array.from(r.bytes(16))).not.toEqual(Array.from(r.bytes(16)));
  });

  it('rejects a malformed seed', () => {
    expect(() => seededRandom('abc')).toThrow();
    expect(() => seededRandom('G'.repeat(64))).toThrow();
  });

  it('gives deterministic join codes', () => {
    expect(generateJoinCode(seededRandom(SEED_A))).toBe(generateJoinCode(seededRandom(SEED_A)));
    expect(generateJoinCode(seededRandom(SEED_A))).not.toBe(generateJoinCode(seededRandom(SEED_B)));
  });
});

describe('rateLimitKey', () => {
  it('unmaps IPv4-mapped IPv6 addresses', () => {
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('keys IPv6 addresses by their /64 prefix', () => {
    expect(rateLimitKey('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('[2001:DB8:1:2::9]')).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('passes anything else through', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
    expect(rateLimitKey('1:2:3')).toBe('1:2:3');
  });
});

describe('POST /rooms with a save', () => {
  // The store stands in for the referee, which verifies the save itself.
  const save = { format_version: 1, kind: 'wwd-save', hash: 'ab' };
  const saveBody = (pad = 0): string =>
    JSON.stringify({ save: { ...save, pad: 'x'.repeat(pad) }, seat: 'p1', grace_minutes: 30 });

  it('creates a room from a save larger than a message', async () => {
    const { store, ctx } = setup();
    const raw = saveBody(MAX_MESSAGE_BYTES * 4);
    const res = await run(post(raw), ctx());
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(store.rooms.get(code)).toMatchObject({ seat: 'p1', grace_minutes: 30, save });
  });

  it('room from save rejects tampered saves', async () => {
    const { store, ctx } = setup();
    store.invalidSave = true;
    const res = await run(post(saveBody()), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_save' });
    expect(store.rooms.size).toBe(0);
  });

  it('caps a body with a save at the save limit', async () => {
    const { store, ctx } = setup();
    const raw = saveBody(MAX_SAVE_BYTES);
    expect((await run(post(raw), ctx())).status).toBe(413);
    const declared = new Request('https://api.example.com/rooms', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-length': String(MAX_SAVE_BYTES + 1) },
      body: 'x'.repeat(MAX_SAVE_BYTES + 1),
    });
    expect((await run(declared, ctx())).status).toBe(413);
    expect(store.rooms.size).toBe(0);
  });

  it('applies the origin rule and the rate limit to saves too', async () => {
    const { ctx } = setup();
    expect((await run(post(saveBody(), 'https://evil.example.com'), ctx())).status).toBe(403);
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) await run(post(saveBody()), ctx());
    expect((await run(post(saveBody()), ctx())).status).toBe(429);
  });
});
