import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyReplay } from '@wwd/engine';
import { PROTOCOL_VERSION, encode } from '@wwd/protocol';
import { Room, type RoomSnapshot } from '@wwd/referee-core';
import { LIMITS } from '@wwd/referee-service';
import { PING_FRAME, PONG_FRAME } from '../src/room-object.js';
import {
  Client,
  SEED,
  Xorshift,
  createRoom,
  expectUnknownRoom,
  joinBoth,
  play,
  roomStub,
  until,
  upgrade,
} from './helpers.js';

interface Attachment {
  conn: string;
  acceptedAt: number;
  lastMessageAt: number;
  seat?: string;
  welcomedAt?: number;
}

const clients: Client[] = [];

async function open(code: string): Promise<Client> {
  const c = await Client.open(code);
  clients.push(c);
  return c;
}

async function join(code: string): Promise<[Client, Client]> {
  const pair = await joinBoth(code);
  clients.push(...pair);
  return pair;
}

/** Rewrites the attachment of every socket in the room's object. */
async function editAttachments(code: string, edit: (a: Attachment) => Attachment): Promise<void> {
  await runInDurableObject(roomStub(code), (_instance, state) => {
    for (const ws of state.getWebSockets()) {
      ws.serializeAttachment(edit(ws.deserializeAttachment() as Attachment));
    }
  });
}

/** Makes a room report `faulted` once it has handled a message while armed. */
function injectFault(): { armed: boolean } {
  const fault = { armed: false };
  const faulted = new WeakSet<Room>();
  vi.spyOn(Room.prototype, 'faulted', 'get').mockImplementation(function (this: Room) {
    return faulted.has(this);
  });
  const original = Room.prototype.handle;
  vi.spyOn(Room.prototype, 'handle').mockImplementation(function (this: Room, conn, raw) {
    const out = original.call(this, conn, raw);
    if (fault.armed) faulted.add(this);
    return out;
  });
  return fault;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.close();
});

describe('referee-cloudflare room object', () => {
  it('full game over websockets', async () => {
    const code = await createRoom({ test: { seed: SEED } });
    const [p0, p1] = await join(code);
    await play([p0, p1], new Xorshift(1));
    const replay = p0.ofType('game_over')[0]!.replay;
    expect(p1.ofType('game_over')[0]!.replay).toEqual(replay);
    expect(() => verifyReplay(replay)).not.toThrow();
    expect(p0.ofType('error')).toEqual([]);
  });

  it('room survives eviction', async () => {
    const code = await createRoom({ test: { seed: SEED } });
    const [p0, p1] = await join(code);
    const rng = new Xorshift(2);
    expect(await play([p0, p1], rng, 6)).toBe(6);
    const before = await runInDurableObject(roomStub(code), (instance) => instance);

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });

    await play([p0, p1], rng, 6);
    const after = await runInDurableObject(roomStub(code), (instance) => instance);
    expect(after).not.toBe(before);
    for (const c of [p0, p1]) {
      expect(c.closed).toBe(false);
      expect(c.ofType('error').map((e) => e.code)).not.toContain('not_joined');
    }
    await play([p0, p1], rng);
    expect(() => verifyReplay(p0.ofType('game_over')[0]!.replay)).not.toThrow();
  });

  it('a pending rejoin survives eviction', async () => {
    const code = await createRoom();
    const [p0, p1] = await join(code);
    p1.close();
    await until(() => p0.ofType('opponent_status').some((m) => !m.connected));
    const asker = await open(code);
    asker.send(
      encode({ type: 'rejoin', protocol_version: PROTOCOL_VERSION, room: code, seat: 'p1' }),
    );
    await until(() => p0.ofType('rejoin_request').length > 0);

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    p0.send(encode({ type: 'approve_rejoin', approve: true }));

    await until(() => asker.ofType('welcome').length > 0);
    expect(asker.ofType('welcome')[0]!.seat).toBe('p1');
    expect(asker.closed).toBe(false);
    expect(p0.ofType('error')).toEqual([]);
  });

  it('a wake keeps grace deadlines', async () => {
    const code = await createRoom({ test: { grace_ms: 1000 } });
    const [p0, p1] = await join(code);
    p1.close();
    await until(() => p0.ofType('opponent_status').some((m) => m.grace_deadline !== undefined));
    const deadline = p0
      .ofType('opponent_status')
      .find((m) => m.grace_deadline !== undefined)!.grace_deadline!;

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    p0.send(PING_FRAME + ' ');
    await until(() => p0.ofType('pong').length > 0);
    const stored = await runInDurableObject(roomStub(code), (_instance, state) =>
      state.storage.get<RoomSnapshot>('room'),
    );
    expect(stored!.disconnected_at[1]! + stored!.grace_ms).toBe(deadline);

    await until(() => p0.ofType('opponent_status').some((m) => m.can_claim_win === true), 3000);
    p0.send(encode({ type: 'claim_win' }));
    await until(() => p0.ofType('game_over').length > 0);
    expect(() => verifyReplay(p0.ofType('game_over')[0]!.replay)).not.toThrow();
  });

  it('a wake with nothing changed sends no status and writes nothing', async () => {
    const code = await createRoom();
    const [p0, p1] = await join(code);
    const statuses = p0.ofType('opponent_status').length + p1.ofType('opponent_status').length;
    const before = await runInDurableObject(roomStub(code), (_instance, state) =>
      state.storage.get<RoomSnapshot>('room'),
    );

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    p0.send(PING_FRAME + ' ');
    await until(() => p0.ofType('pong').length > 0);

    expect(p0.ofType('opponent_status').length + p1.ofType('opponent_status').length).toBe(
      statuses,
    );
    const after = await runInDurableObject(roomStub(code), (_instance, state) =>
      state.storage.get<RoomSnapshot>('room'),
    );
    expect(after).toEqual(before);
  });

  it('a wake supersedes a second socket holding the same seat', async () => {
    const code = await createRoom();
    const [p0, p1] = await join(code);
    await editAttachments(code, (a) => (a.seat === 'p1' ? { ...a, seat: 'p0', welcomedAt: 0 } : a));

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    p0.send(PING_FRAME + ' ');

    expect(await p1.closedNow()).toBe(1000);
    expect(p1.ofType('error').at(-1)?.code).toBe('superseded');
    await until(() => p0.ofType('pong').length > 0);
    expect(p0.closed).toBe(false);
  });

  it('alarm fires grace expiry', async () => {
    const code = await createRoom({ test: { grace_ms: 1000 } });
    const [p0, p1] = await join(code);
    p1.close();
    await until(() => p0.ofType('opponent_status').some((m) => m.grace_deadline !== undefined));
    p0.send(encode({ type: 'claim_win' }));
    await until(() => p0.ofType('error').length > 0);
    expect(p0.ofType('error')[0]!.code).toBe('not_expired');

    await until(() => p0.ofType('opponent_status').some((m) => m.can_claim_win === true), 3000);
    p0.send(encode({ type: 'claim_win' }));
    await until(() => p0.ofType('game_over').length > 0);
    expect(() => verifyReplay(p0.ofType('game_over')[0]!.replay)).not.toThrow();
  });

  it('expired room deletes storage', async () => {
    const code = await createRoom();
    const watcher = await open(code);
    watcher.hello(code);
    await until(() => watcher.ofType('welcome').length > 0);

    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    await runInDurableObject(roomStub(code), async (_instance, state) => {
      const snapshot = (await state.storage.get<RoomSnapshot>('room'))!;
      snapshot.last_activity_at = Date.now() - LIMITS.IDLE_ROOM_TTL_MS - 1;
      await state.storage.put('room', snapshot);
    });
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);

    expect(await watcher.closedNow()).toBe(1000);
    expect(watcher.ofType('error').at(-1)?.code).toBe('room_closed');
    const left = await runInDurableObject(roomStub(code), async (_instance, state) => ({
      keys: [...(await state.storage.list()).keys()],
      alarm: await state.storage.getAlarm(),
    }));
    expect(left).toEqual({ keys: [], alarm: null });
    await expectUnknownRoom(code);
  });

  it('auto-response ping does not wake handler', async () => {
    expect(encode({ type: 'ping' })).toBe(PING_FRAME);
    expect(encode({ type: 'pong' })).toBe(PONG_FRAME);
    const code = await createRoom();
    const c = await open(code);
    c.hello(code);
    await until(() => c.ofType('welcome').length > 0);
    const heard = await runInDurableObject(roomStub(code), (_instance, state) => {
      const pair = state.getWebSocketAutoResponse();
      expect(pair?.request).toBe(PING_FRAME);
      expect(pair?.response).toBe(PONG_FRAME);
      return (state.getWebSockets()[0]!.deserializeAttachment() as Attachment).lastMessageAt;
    });

    c.send(PING_FRAME);
    await until(() => c.ofType('pong').length > 0);
    await runInDurableObject(roomStub(code), (_instance, state) => {
      const ws = state.getWebSockets()[0]!;
      expect((ws.deserializeAttachment() as Attachment).lastMessageAt).toBe(heard);
      expect(state.getWebSocketAutoResponseTimestamp(ws)).not.toBeNull();
    });
  });

  it('faulted room closes 1011', async () => {
    const code = await createRoom({ test: { seed: SEED } });
    const [p0, p1] = await join(code);
    await play([p0, p1], new Xorshift(5), 4);
    const stored = () =>
      runInDurableObject(roomStub(code), (_instance, state) =>
        state.storage.get<RoomSnapshot>('room'),
      );
    const kept = await stored();

    const fault = injectFault();
    fault.armed = true;
    const mover = p0.latest()!.legal.length > 0 ? p0 : p1;
    mover.command(mover.latest()!.legal[0]!);
    expect(await p0.closedNow()).toBe(1011);
    expect(await p1.closedNow()).toBe(1011);
    // The faulting command never reached storage.
    expect((await stored())?.replay).toEqual(kept?.replay);

    // The next connection restores the last persisted state rather than the faulted room.
    fault.armed = false;
    const again = await open(code);
    again.hello(code, p0.token());
    await until(() => again.latest() !== undefined);
    expect(again.ofType('welcome')[0]!.seat).toBe('p0');
  });

  it('a room that keeps faulting is quarantined', async () => {
    const code = await createRoom();
    const fault = injectFault();
    for (let i = 0; i < 3; i++) {
      fault.armed = true;
      const c = await open(code);
      c.hello(code);
      expect(await c.closedNow()).toBe(1011);
    }
    fault.armed = false;
    await expectUnknownRoom(code);
    const keys = await runInDurableObject(roomStub(code), async (_instance, state) => [
      ...(await state.storage.list()).keys(),
    ]);
    expect(keys).not.toContain('room');
    expect(keys).toContain('quarantined_at');

    await runInDurableObject(roomStub(code), (_instance, state) =>
      state.storage.put('quarantined_at', Date.now() - LIMITS.FINISHED_ROOM_TTL_MS),
    );
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    const left = await runInDurableObject(roomStub(code), async (_instance, state) => [
      ...(await state.storage.list()).keys(),
    ]);
    expect(left).toEqual([]);
  });

  it('a fault during the alarm leaves an alarm set', async () => {
    const code = await createRoom();
    vi.spyOn(Room.prototype, 'tick').mockImplementationOnce(() => {
      throw new Error('tick failed');
    });
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    const alarm = await runInDurableObject(roomStub(code), (_instance, state) =>
      state.storage.getAlarm(),
    );
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeLessThanOrEqual(Date.now() + 60_000);

    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect((await upgrade(code)).status).toBe(101);
  });

  it('keeps an unrestorable room until its idle expiry', async () => {
    const code = await createRoom();
    const watcher = await open(code);
    await evictDurableObject(roomStub(code), { webSockets: 'hibernate' });
    const lastActivity = await runInDurableObject(roomStub(code), async (_instance, state) => {
      const snapshot = (await state.storage.get<RoomSnapshot>('room'))!;
      await state.storage.put('room', { ...snapshot, version: 99 });
      await state.storage.deleteAlarm();
      return snapshot.last_activity_at;
    });

    await expectUnknownRoom(code);
    const init = await roomStub(code).fetch('https://room.internal/init', {
      method: 'POST',
      body: JSON.stringify({ code, request: { config: {}, grace_minutes: 10 } }),
    });
    expect(init.status).toBe(409);
    watcher.send(PING_FRAME + ' ');
    expect(await watcher.closedNow()).toBe(1001);
    expect(watcher.ofType('error').at(-1)?.code).toBe('room_closed');
    const kept = await runInDurableObject(roomStub(code), async (_instance, state) => ({
      room: (await state.storage.get('room')) !== undefined,
      alarm: await state.storage.getAlarm(),
    }));
    expect(kept).toEqual({ room: true, alarm: lastActivity + LIMITS.IDLE_ROOM_TTL_MS });

    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect(
      await runInDurableObject(roomStub(code), (_instance, state) => state.storage.get('room')),
    ).toBeDefined();

    await runInDurableObject(roomStub(code), async (_instance, state) => {
      const snapshot = (await state.storage.get<RoomSnapshot>('room'))!;
      await state.storage.put('room', {
        ...snapshot,
        last_activity_at: Date.now() - LIMITS.IDLE_ROOM_TTL_MS,
      });
    });
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    const left = await runInDurableObject(roomStub(code), async (_instance, state) => [
      ...(await state.storage.list()).keys(),
    ]);
    expect(left).toEqual([]);
  });

  it('connection cap', async () => {
    const code = await createRoom();
    for (let i = 0; i < LIMITS.MAX_CONNECTIONS_PER_ROOM; i++) await open(code);
    const refused = await upgrade(code);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: 'too_many_connections' });
  });

  it('pre-hello timeout closes', async () => {
    const code = await createRoom();
    const silent = await open(code);
    const seated = await open(code);
    seated.hello(code);
    await until(() => seated.ofType('welcome').length > 0);

    await editAttachments(code, (a) => ({
      ...a,
      acceptedAt: a.acceptedAt - LIMITS.PRE_HELLO_TIMEOUT_MS,
    }));
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect(await silent.closedNow()).toBe(1008);
    expect(seated.closed).toBe(false);
  });

  it('closes an idle socket, starting its grace', async () => {
    const code = await createRoom();
    const [p0, p1] = await join(code);
    await editAttachments(code, (a) =>
      a.seat === 'p1' ? { ...a, lastMessageAt: a.lastMessageAt - LIMITS.IDLE_TIMEOUT_MS } : a,
    );
    expect(await runDurableObjectAlarm(roomStub(code))).toBe(true);
    expect(await p1.closedNow()).toBe(1001);
    await until(() => p0.ofType('opponent_status').some((m) => m.grace_deadline !== undefined));
    expect(p0.closed).toBe(false);
  });

  it('oversized frame closes socket', async () => {
    const code = await createRoom();
    const c = await open(code);
    c.send('x'.repeat(LIMITS.MAX_FRAME_BYTES + 1));
    expect(await c.closedNow()).toBe(1009);
  });

  it('refuses to create a room twice', async () => {
    const code = await createRoom();
    const res = await roomStub(code).fetch('https://room.internal/init', {
      method: 'POST',
      body: JSON.stringify({ code, request: { config: {}, grace_minutes: 10 } }),
    });
    expect(res.status).toBe(409);
  });
});
