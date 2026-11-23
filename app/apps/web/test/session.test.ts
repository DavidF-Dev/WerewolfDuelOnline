import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOnlineSession,
  initSessions,
  loadOnlineSession,
  loadSession,
  resetSessions,
  saveOnlineSession,
  saveSession,
} from '../src/session.js';
import { openDeviceStore } from '../src/storage/db.js';
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
