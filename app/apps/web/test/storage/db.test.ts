import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { openDeviceStore, requestPersistence, type HistoryRecord } from '../../src/storage/db.js';
import * as migrations from '../../src/storage/migrations.js';
import { sessionId } from '../../src/storage/sessions.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SERVER = 'https://a.example';
const TOKEN = 'd'.repeat(32);

const local = (room: string, savedAt: number, server = SERVER): string =>
  JSON.stringify({ room, seatToken: TOKEN, server, lastSeq: 7, savedAt });

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('device store', () => {
  it('starts with the default settings and a random device id', async () => {
    const store = await openDeviceStore();
    expect(store.persistent).toBe(true);
    expect(await store.settings.get()).toEqual(DEFAULT_SETTINGS);
    const identity = await store.identity.get();
    expect(identity.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.identity.get()).toEqual(identity);
  });

  it('keeps settings, identity and history across opens', async () => {
    const first = await openDeviceStore();
    await first.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark', textSize: 120 });
    await first.identity.put({ deviceId: 'device-1', displayName: 'Ada' });
    const record: HistoryRecord = {
      id: 'g1',
      finishedAt: 5,
      seat: 'p0',
      config: defaultRulesConfig(),
      replay: {} as HistoryRecord['replay'],
      winner: 'p0',
      reason: 'resignation' as HistoryRecord['reason'],
      rounds: 3,
    };
    await first.history.put(record);
    await first.history.put({ ...record, id: 'g2', finishedAt: 9 });

    const second = await openDeviceStore();
    expect(await second.settings.get()).toMatchObject({ theme: 'dark', textSize: 120 });
    expect(await second.identity.get()).toEqual({ deviceId: 'device-1', displayName: 'Ada' });
    expect((await second.history.list()).map((r) => r.id)).toEqual(['g2', 'g1']);
    await second.history.clear();
    expect(await second.history.list()).toEqual([]);
  });

  it('clamps a stored text size', async () => {
    const store = await openDeviceStore();
    await store.settings.put({ ...DEFAULT_SETTINGS, textSize: 400 });
    expect((await store.settings.get()).textSize).toBe(150);
  });

  it('migrates localStorage sessions once', async () => {
    localStorage.setItem(`wwd.online.${encodeURIComponent(SERVER)}.K7Q2MX`, local('K7Q2MX', 1000));
    localStorage.setItem('wwd.online.OLDKEY', local('ABCDEF', 2000));
    localStorage.setItem('wwd.online.broken', 'not json');
    localStorage.setItem('unrelated', 'kept');

    const store = await openDeviceStore();
    const sessions = await store.sessions.list(3000);
    expect(sessions.map((s) => s.id).sort()).toEqual(
      [sessionId(SERVER, 'K7Q2MX'), sessionId(SERVER, 'ABCDEF')].sort(),
    );
    expect(sessions.find((s) => s.room === 'K7Q2MX')).toEqual({
      id: sessionId(SERVER, 'K7Q2MX'),
      server: SERVER,
      room: 'K7Q2MX',
      seatToken: TOKEN,
      lastSeq: 7,
      game: 0,
      status: 'active',
      savedAt: 1000,
    });
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('unrelated')).toBe('kept');

    await store.sessions.delete(sessionId(SERVER, 'K7Q2MX'));
    localStorage.setItem(`wwd.online.${encodeURIComponent(SERVER)}.K7Q2MX`, 'not json');
    await openDeviceStore();
    expect(await store.sessions.get(sessionId(SERVER, 'K7Q2MX'))).toBeUndefined();
  });

  it('prunes sessions older than 30 days', async () => {
    const now = 100 * DAY_MS;
    const store = await openDeviceStore();
    const base = {
      server: SERVER,
      seatToken: TOKEN,
      lastSeq: 0,
      game: 0,
      status: 'active' as const,
    };
    await store.sessions.put({ ...base, id: 'old', room: 'OLDOLD', savedAt: now - 31 * DAY_MS });
    await store.sessions.put({ ...base, id: 'new', room: 'NEWNEW', savedAt: now - DAY_MS });
    expect((await store.sessions.list(now)).map((s) => s.id)).toEqual(['new']);
    expect(await store.sessions.get('old')).toBeUndefined();
  });

  it('clearAll returns to first run', async () => {
    const store = await openDeviceStore();
    const { deviceId } = await store.identity.get();
    await store.settings.put({ ...DEFAULT_SETTINGS, highContrast: true });
    await store.sessions.put({
      id: 'x',
      server: SERVER,
      room: 'K7Q2MX',
      seatToken: TOKEN,
      lastSeq: 0,
      game: 0,
      status: 'active',
      savedAt: Date.now(),
    });
    await store.clearAll();
    expect(await store.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(await store.sessions.list()).toEqual([]);
    expect(await store.history.list()).toEqual([]);
    expect((await store.identity.get()).deviceId).not.toBe(deviceId);
  });
});

describe('app works without IndexedDB', () => {
  it('uses memory when indexedDB is undefined', async () => {
    vi.stubGlobal('indexedDB', undefined);
    localStorage.setItem(`wwd.online.${encodeURIComponent(SERVER)}.K7Q2MX`, local('K7Q2MX', 1));
    const store = await openDeviceStore();
    expect(store.persistent).toBe(false);
    await store.settings.put({ ...DEFAULT_SETTINGS, theme: 'light' });
    await store.sessions.put({
      id: 'x',
      server: SERVER,
      room: 'K7Q2MX',
      seatToken: TOKEN,
      lastSeq: 0,
      game: 0,
      status: 'paused',
      savedAt: Date.now(),
    });
    expect((await store.settings.get()).theme).toBe('light');
    expect(await store.sessions.list()).toHaveLength(1);
    expect(localStorage.length).toBe(1);
  });

  it('uses memory when opening throws', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const store = await openDeviceStore();
    expect(store.persistent).toBe(false);
    expect((await store.identity.get()).deviceId).toBeTruthy();
  });
});

describe('a storage failure', () => {
  it('open that never settles falls back to memory', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('indexedDB', { open: () => ({}) });
      const opening = openDeviceStore();
      await vi.advanceTimersByTimeAsync(3100);
      const store = await opening;
      expect(store.persistent).toBe(false);
      expect((await store.identity.get()).deviceId).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a failing migration', () => {
  it('closes the connection and falls back to memory', async () => {
    const close = vi.spyOn(IDBDatabase.prototype, 'close');
    vi.spyOn(migrations, 'migrateLocalSessions').mockRejectedValue(new Error('boom'));
    const store = await openDeviceStore();
    expect(store.persistent).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('requestPersistence', () => {
  it('asks the browser once, after the first finished game', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist } });
    const store = await openDeviceStore();
    await requestPersistence(store);
    await requestPersistence(store);
    expect(persist).toHaveBeenCalledTimes(1);
    expect((await store.settings.get()).firstGameFinished).toBe(true);
  });

  it('does not throw when the browser declines', async () => {
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('no')) } });
    const store = await openDeviceStore();
    await expect(requestPersistence(store)).resolves.toBeUndefined();
  });
});
