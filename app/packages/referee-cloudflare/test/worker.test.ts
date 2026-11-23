import { SELF, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type CreateRoomRequest } from '@wwd/protocol';
import { LIMITS } from '@wwd/referee-service';
import { DurableRoomStore } from '../src/do-store.js';
import { BASE, ORIGIN, createRoom, expectUnknownRoom, roomStub, upgrade } from './helpers.js';

function createFrom(ip: string): Promise<Response> {
  return SELF.fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ config: {}, grace_minutes: 10 }),
  });
}

describe('referee-cloudflare worker', () => {
  it('health and create via worker', async () => {
    const health = await SELF.fetch(`${BASE}/health`, { headers: { origin: ORIGIN } });
    expect(health.status).toBe(200);
    expect(health.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const body = (await health.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, protocol_version: PROTOCOL_VERSION });
    expect(typeof body['engine_version']).toBe('string');

    const code = await createRoom();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect((await upgrade(code)).status).toBe(101);
    expect((await upgrade(code.toLowerCase())).status).toBe(101);
  });

  it('tells an upgrade for an unknown room so, then closes it 1008', async () => {
    await expectUnknownRoom('ZZZZZZ');
  });

  it('refuses an upgrade for a malformed room code with 404', async () => {
    expect((await upgrade('ZZZ')).status).toBe(404);
  });

  it('unknown-room sockets never hold a slot or leave state behind', async () => {
    const code = 'ZZZZZY';
    for (let i = 0; i <= LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) await expectUnknownRoom(code);
    const left = await runInDurableObject(roomStub(code), async (_instance, state) => ({
      sockets: state.getWebSockets().length,
      keys: [...(await state.storage.list()).keys()],
      alarm: await state.storage.getAlarm(),
    }));
    expect(left).toEqual({ sockets: 0, keys: [], alarm: null });
  });

  it('asks for an upgrade on a plain request to a room socket', async () => {
    const code = await createRoom();
    const res = await SELF.fetch(`${BASE}/rooms/${code}/ws`);
    expect(res.status).toBe(426);
  });

  it('refuses a disallowed origin', async () => {
    const res = await SELF.fetch(`${BASE}/rooms`, {
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('rate limits room creation by the connecting address', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < LIMITS.ROOM_CREATE_LIMIT; i++) {
      expect((await createFrom(ip)).status).not.toBe(429);
    }
    expect((await createFrom(ip)).status).toBe(429);
    expect((await createFrom('203.0.113.8')).status).not.toBe(429);
  });

  it('refuses a room from a save that does not verify', async () => {
    const save = {
      format_version: 1,
      kind: 'wwd-save',
      room: 'ABCDEF',
      config: {},
      boundary: {},
      replay: {},
      saved_at: 0,
      hash: '0'.repeat(64),
    };
    const res = await SELF.fetch(`${BASE}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ save, seat: 'p0', grace_minutes: 10 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_save' });
  });

  it('takes only an invalid-save answer from a room object as an invalid save', async () => {
    const answering = (res: () => Response): DurableObjectNamespace =>
      ({
        idFromName: () => ({}),
        get: () => ({ fetch: async () => res() }),
      }) as unknown as DurableObjectNamespace;
    const request: CreateRoomRequest = {
      config: { tiebreak: 'badge_only', min_targets: 1, badge_start: 'random' },
      grace_minutes: 10,
    };
    const plain = new DurableRoomStore(answering(() => new Response(null, { status: 400 })));
    await expect(plain.create('ABCDEF', request)).rejects.toThrow(/status 400/);
    const other = new DurableRoomStore(
      answering(() => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })),
    );
    await expect(other.create('ABCDEF', request)).rejects.toThrow(/status 400/);
    const invalid = new DurableRoomStore(
      answering(() => new Response(JSON.stringify({ error: 'invalid_save' }), { status: 400 })),
    );
    expect(await invalid.create('ABCDEF', request)).toBe('invalid_save');
  });
});
