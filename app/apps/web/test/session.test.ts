import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOnlineSession,
  confirmOnlineSession,
  initSessions,
  loadOnlineSession,
  loadSession,
  removeOnlineSession,
  resetSessions,
  saveOnlineSession,
  saveSession,
  setOnlineSessionSave,
} from '../src/session.js';
import { openDeviceStore, type DeviceStore } from '../src/storage/db.js';
import { sessionId } from '../src/storage/sessions.js';

const TOKEN = 'b'.repeat(32);
const DAY_MS = 24 * 60 * 60 * 1000;
const A = 'https://a.example';
const B = 'https://b.example';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSessions();
  localStorage.clear();
  sessionStorage.clear();
});

describe('online sessions', () => {
  it('keeps each room, apart from local sessions', () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 4 }, 1000);
    saveOnlineSession({ room: 'ABCDEF', seatToken: TOKEN, server: A, lastSeq: 9 });
    expect(loadOnlineSession(A, 'K7Q2MX')).toEqual({
      room: 'K7Q2MX',
      seatToken: TOKEN,
      server: A,
      lastSeq: 4,
      savedAt: 1000,
    });
    expect(loadOnlineSession(A, 'ABCDEF')?.lastSeq).toBe(9);
    expect(sessionStorage.length).toBe(0);
    expect(loadSession()).toBeUndefined();

    clearOnlineSession(A, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    expect(loadOnlineSession(A, 'ABCDEF')).toBeDefined();
  });

  it('keeps the same room code on two servers apart', () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1 });
    saveOnlineSession({ room: 'K7Q2MX', seatToken: 'c'.repeat(32), server: B, lastSeq: 2 });
    expect(loadOnlineSession(A, 'K7Q2MX')?.seatToken).toBe(TOKEN);
    expect(loadOnlineSession(B, 'K7Q2MX')?.lastSeq).toBe(2);
    clearOnlineSession(B, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeDefined();
  });

  it('keeps local sessions in sessionStorage', () => {
    saveSession({ room: 'K7Q2MX', seatToken: TOKEN, lastSeq: 2 });
    expect(localStorage.length).toBe(0);
    expect(loadSession()?.room).toBe('K7Q2MX');
  });

  it('stores the round and turn, and keeps them when a later save leaves them out', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    saveOnlineSession(
      { room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1, round: 3, yourTurn: true },
      1000,
    );
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 2 }, 2000);
    await vi.waitFor(async () => {
      const record = await store.sessions.get(sessionId(A, 'K7Q2MX'));
      expect(record).toMatchObject({ round: 3, yourTurn: true, lastSeq: 2 });
    });
    saveOnlineSession(
      { room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 3, round: 3, yourTurn: false },
      3000,
    );
    await vi.waitFor(async () => {
      expect((await store.sessions.get(sessionId(A, 'K7Q2MX')))?.yourTurn).toBe(false);
    });
  });

  it('keeps a known seat when a later save does not name one', () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, seat: 'p1', lastSeq: 1 });
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 2 });
    expect(loadOnlineSession(A, 'K7Q2MX')).toMatchObject({ seat: 'p1', lastSeq: 2 });
  });

  it('writes through to the device store and loads from it after a restart', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, seat: 'p0', lastSeq: 3 }, 500);
    await vi.waitFor(async () =>
      expect(await store.sessions.get(sessionId(A, 'K7Q2MX'))).toMatchObject({
        seatToken: TOKEN,
        seat: 'p0',
        lastSeq: 3,
        game: 0,
        status: 'active',
        savedAt: 500,
      }),
    );

    resetSessions();
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    await initSessions(store, 500 + DAY_MS);
    expect(loadOnlineSession(A, 'K7Q2MX')?.seat).toBe('p0');

    clearOnlineSession(A, 'K7Q2MX');
    await vi.waitFor(async () =>
      expect(await store.sessions.get(sessionId(A, 'K7Q2MX'))).toBeUndefined(),
    );
  });

  it('never lets a link to another server read or clear the default server entry', async () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1 });
    expect(loadOnlineSession(B, 'K7Q2MX')).toBeUndefined();
    clearOnlineSession(B, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')?.seatToken).toBe(TOKEN);
  });

  it('works when the store fails', async () => {
    const store = await openDeviceStore();
    vi.spyOn(store.sessions, 'put').mockRejectedValue(new Error('quota'));
    vi.spyOn(store.sessions, 'delete').mockRejectedValue(new Error('quota'));
    await initSessions(store);
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 5 });
    await Promise.resolve();
    expect(loadOnlineSession(A, 'K7Q2MX')).toMatchObject({ seatToken: TOKEN, lastSeq: 5 });
    clearOnlineSession(A, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
  });

  it('clear right after save stays cleared', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1 });
    clearOnlineSession(A, 'K7Q2MX');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await store.sessions.get(sessionId(A, 'K7Q2MX'))).toBeUndefined();
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
  });

  it('stores the opponent, the game and its end, and a rematch makes the seat active again', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    const seat = { room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 3 };
    saveOnlineSession({ ...seat, opponentName: 'Jo', game: 0 }, 100);
    saveOnlineSession({ ...seat, lastSeq: 4 }, 200);
    const id = sessionId(A, 'K7Q2MX');
    await vi.waitFor(async () =>
      expect(await store.sessions.get(id)).toMatchObject({
        opponentName: 'Jo',
        game: 0,
        status: 'active',
        savedAt: 200,
      }),
    );

    saveOnlineSession({ ...seat, lastSeq: 9, game: 0, finished: true }, 300);
    saveOnlineSession({ ...seat, lastSeq: 9, game: 0, finished: true }, 400);
    await vi.waitFor(async () =>
      expect(await store.sessions.get(id)).toMatchObject({
        status: 'finished',
        finishedAt: 300,
        savedAt: 400,
      }),
    );

    // A reloaded client reports no finish until its events arrive, which keeps the game over.
    saveOnlineSession({ ...seat, lastSeq: 0 }, 500);
    await vi.waitFor(async () =>
      expect(await store.sessions.get(id)).toMatchObject({ status: 'finished', savedAt: 500 }),
    );

    saveOnlineSession({ ...seat, lastSeq: 1, game: 1 }, 600);
    await vi.waitFor(async () =>
      expect(await store.sessions.get(id)).toMatchObject({ status: 'active', game: 1 }),
    );
    expect((await store.sessions.get(id))?.finishedAt).toBeUndefined();
  });

  it('prunes a finished session 24 hours after its game ended', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    const seat = { seatToken: TOKEN, server: A, lastSeq: 3, game: 0 };
    saveOnlineSession({ ...seat, room: 'DONEDN', finished: true }, 1000);
    saveOnlineSession({ ...seat, room: 'PLAYNG' }, 1000);
    await vi.waitFor(async () => expect(await store.sessions.list(1000)).toHaveLength(2));

    resetSessions();
    await initSessions(store, 1000 + DAY_MS - 1);
    expect(loadOnlineSession(A, 'DONEDN')).toBeDefined();

    resetSessions();
    await initSessions(store, 1000 + DAY_MS);
    expect(loadOnlineSession(A, 'DONEDN')).toBeUndefined();
    expect(loadOnlineSession(A, 'PLAYNG')).toBeDefined();
    expect(await store.sessions.get(sessionId(A, 'DONEDN'))).toBeUndefined();
  });

  it('keeps a newer record saved by another tab over a stale snapshot', async () => {
    const store = await openDeviceStore();
    await initSessions(store);
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1 }, 100);
    await vi.waitFor(async () =>
      expect(await store.sessions.get(sessionId(A, 'K7Q2MX'))).toBeDefined(),
    );

    const stored = await store.sessions.get(sessionId(A, 'K7Q2MX'));
    await store.sessions.put({ ...stored!, seatToken: 'e'.repeat(32), lastSeq: 9, savedAt: 900 });
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 2 }, 200);

    await vi.waitFor(() =>
      expect(loadOnlineSession(A, 'K7Q2MX')).toMatchObject({ lastSeq: 9, savedAt: 900 }),
    );
    expect(await store.sessions.get(sessionId(A, 'K7Q2MX'))).toMatchObject({
      seatToken: 'e'.repeat(32),
      lastSeq: 9,
    });
  });
});

describe('removing an online session', () => {
  const ID = sessionId(A, 'K7Q2MX');
  const seat = (lastSeq: number, seatToken = TOKEN) =>
    ({ room: 'K7Q2MX', seatToken, server: A, lastSeq }) as const;

  async function stored(): Promise<DeviceStore> {
    const store = await openDeviceStore();
    await initSessions(store);
    await saveOnlineSession(seat(1), 100);
    return store;
  }

  it('forgets the seat in this tab and in the store', async () => {
    const store = await stored();
    await removeOnlineSession(store, A, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    expect(await store.sessions.get(ID)).toBeUndefined();
    expect(await store.sessions.list()).toEqual([]);
  });

  it('a later save from a tab that still holds the removed seat does not bring it back', async () => {
    const store = await stored();
    // Another tab removes it; this tab's cache still holds the seat.
    await store.sessions.remove(ID, TOKEN);
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeDefined();

    expect(await saveOnlineSession(seat(2), 200)).toBe(false);
    expect(await store.sessions.get(ID)).toBeUndefined();
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    setOnlineSessionSave(A, 'K7Q2MX', null, 300);
    expect(await saveOnlineSession(seat(3), 400)).toBe(false);
    expect(await store.sessions.get(ID)).toBeUndefined();
  });

  it('a save that raced the removal is undone by the next one', async () => {
    const store = await stored();
    await store.sessions.remove(ID, TOKEN);
    // As if the other tab's write landed just after the removal.
    await store.sessions.put({
      id: ID,
      server: A,
      room: 'K7Q2MX',
      seatToken: TOKEN,
      lastSeq: 2,
      game: 0,
      status: 'active',
      savedAt: 150,
    });
    expect(await saveOnlineSession(seat(3), 200)).toBe(false);
    expect(await store.sessions.get(ID)).toBeUndefined();
  });

  it('undoing a raced save never deletes a seat rejoined with a new token meanwhile', async () => {
    const store = await stored();
    await store.sessions.remove(ID, TOKEN);
    const fresh = 'f'.repeat(32);
    const rejoined = {
      id: ID,
      server: A,
      room: 'K7Q2MX',
      seatToken: fresh,
      lastSeq: 5,
      game: 0,
      status: 'active' as const,
      savedAt: 300,
    };
    // This tab read the old record just before another tab's PIN rejoin stored the new seat.
    vi.spyOn(store.sessions, 'get').mockImplementationOnce(async () => {
      await store.sessions.put(rejoined);
      return { ...rejoined, seatToken: TOKEN };
    });
    expect(await saveOnlineSession(seat(2), 200)).toBe(false);
    expect(await store.sessions.get(ID)).toEqual(rejoined);
  });

  it('a new seat in the same room is stored again', async () => {
    const store = await stored();
    await removeOnlineSession(store, A, 'K7Q2MX');
    const fresh = 'f'.repeat(32);
    expect(await saveOnlineSession(seat(1, fresh), 500)).toBe(true);
    expect(await store.sessions.get(ID)).toMatchObject({ seatToken: fresh });
    expect(await store.sessions.removedSeat(ID)).toBeUndefined();
  });

  it('checking before a join drops a seat removed in another tab', async () => {
    const store = await stored();
    await store.sessions.remove(ID, TOKEN);
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeDefined();
    expect(await confirmOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
  });

  it('checking before a join keeps a seat that was not removed', async () => {
    await stored();
    expect(await confirmOnlineSession(A, 'K7Q2MX')).toMatchObject({ seatToken: TOKEN });
  });
});
