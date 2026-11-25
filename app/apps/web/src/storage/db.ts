import { openDB, type IDBPDatabase } from 'idb';
import type { SaveFile } from '@wwd/protocol';
import type { Replay, RulesConfig, Seat, WinReason } from '@wwd/engine';
import { patchSettings } from '../device-store.js';
import { normaliseSettings, type Settings } from '../settings/settings.js';
import { createHistory } from './history.js';
import { createIdentity } from './identity.js';
import { DB_NAME, DB_VERSION, migrateLocalSessions, upgrade } from './migrations.js';
import { STORE_NAMES, type StoreName } from './names.js';
import { createSessions } from './sessions.js';

export interface Identity {
  deviceId: string;
  displayName?: string;
}

export interface SessionRecord {
  id: string;
  server: string;
  room: string;
  seatToken: string;
  /** Unknown for a migrated entry until the next welcome. */
  seat?: Seat;
  lastSeq: number;
  game: number;
  status: 'active' | 'paused' | 'finished';
  save?: SaveFile;
  /** The room on the same server that this device created from `save`, until its seat is stored. */
  resumedAs?: string;
  opponentName?: string;
  /** The round the game had reached when last saved; unknown for an older record. */
  round?: number;
  /** Whether this seat was asked for a decision when last saved; unknown for an older record. */
  yourTurn?: boolean;
  /** When game `game` was first seen to be over, while `status` is `'finished'`. */
  finishedAt?: number;
  savedAt: number;
}

export interface HistoryRecord {
  id: string;
  finishedAt: number;
  seat: Seat;
  opponentName?: string;
  config: RulesConfig;
  replay: Replay;
  winner: Seat;
  reason: WinReason;
  rounds: number;
}

export interface DeviceStore {
  /** False for the in-memory fallback, which lasts only as long as the page. */
  readonly persistent: boolean;
  settings: { get(): Promise<Settings>; put(s: Settings): Promise<void> };
  identity: { get(): Promise<Identity>; put(i: Identity): Promise<void> };
  sessions: {
    /**
     * Lists the sessions, first deleting any saved more than 30 days before `now` and any whose
     * game finished 24 hours or more before it.
     */
    list(now?: number): Promise<SessionRecord[]>;
    get(id: string): Promise<SessionRecord | undefined>;
    put(r: SessionRecord): Promise<void>;
    delete(id: string): Promise<void>;
    /**
     * Deletes the session the player removed, keeping a mark of its seat token for 30 days so
     * that a tab still holding that seat does not store it again.
     */
    remove(id: string, seatToken: string, now?: number): Promise<void>;
    /** The seat token of the session removed under `id`, while its mark is kept. */
    removedSeat(id: string): Promise<string | undefined>;
    /** Drops the removal mark, as when the player brings the session back from a backup. */
    clearRemoved(id: string): Promise<void>;
    /**
     * Deletes the record under `id` if it holds the seat its removal mark names, checking and
     * deleting in one transaction; resolves to whether it did.
     */
    dropIfRemoved(id: string): Promise<boolean>;
  };
  history: {
    list(): Promise<HistoryRecord[]>;
    get(id: string): Promise<HistoryRecord | undefined>;
    put(r: HistoryRecord): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  clearAll(): Promise<void>;
}

/** The raw key-value operations shared by the IndexedDB store and the in-memory fallback. */
export interface Backend {
  get(store: StoreName, key: string): Promise<unknown>;
  getAll(store: StoreName): Promise<unknown[]>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  /**
   * In one transaction, reads `key` and `other` and deletes `key` when `when` holds for their
   * values; resolves to whether it did.
   */
  deleteWhen(
    store: StoreName,
    key: string,
    other: string,
    when: (value: unknown, otherValue: unknown) => boolean,
  ): Promise<boolean>;
}

function idbBackend(db: IDBPDatabase): Backend {
  return {
    get: (store, key) => db.get(store, key),
    getAll: (store) => db.getAll(store),
    put: async (store, key, value) => {
      await db.put(store, value, key);
    },
    delete: (store, key) => db.delete(store, key),
    clear: (store) => db.clear(store),
    deleteWhen: async (store, key, other, when) => {
      const tx = db.transaction(store, 'readwrite');
      const [value, otherValue] = await Promise.all([tx.store.get(key), tx.store.get(other)]);
      const drop = when(value, otherValue);
      if (drop) await tx.store.delete(key);
      await tx.done;
      return drop;
    },
  };
}

function memoryBackend(): Backend {
  const stores = new Map<StoreName, Map<string, unknown>>(
    STORE_NAMES.map((name) => [name, new Map()]),
  );
  const of = (name: StoreName): Map<string, unknown> => stores.get(name) ?? new Map();
  return {
    get: (store, key) => Promise.resolve(of(store).get(key)),
    getAll: (store) => Promise.resolve([...of(store).values()]),
    put: (store, key, value) => {
      of(store).set(key, value);
      return Promise.resolve();
    },
    delete: (store, key) => {
      of(store).delete(key);
      return Promise.resolve();
    },
    clear: (store) => {
      of(store).clear();
      return Promise.resolve();
    },
    deleteWhen: (store, key, other, when) => {
      const drop = when(of(store).get(key), of(store).get(other));
      if (drop) of(store).delete(key);
      return Promise.resolve(drop);
    },
  };
}

const SETTINGS_KEY = 'current';

function build(backend: Backend, persistent: boolean): DeviceStore {
  return {
    persistent,
    settings: {
      get: async () =>
        normaliseSettings((await backend.get('settings', SETTINGS_KEY)) as Partial<Settings>),
      put: (settings) => backend.put('settings', SETTINGS_KEY, normaliseSettings(settings)),
    },
    identity: createIdentity(backend),
    sessions: createSessions(backend),
    history: createHistory(backend),
    clearAll: async () => {
      for (const name of STORE_NAMES) await backend.clear(name);
    },
  };
}

const OPEN_TIMEOUT_MS = 3000;

async function openPersistent(): Promise<DeviceStore> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
  let timedOut = false;
  let connection: IDBPDatabase | undefined;
  const opened = openDB(DB_NAME, DB_VERSION, {
    upgrade,
    blocking: () => connection?.close(),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('IndexedDB did not open in time'));
    }, OPEN_TIMEOUT_MS);
  });
  opened.then(
    (late) => {
      connection = late;
      if (timedOut) late.close();
    },
    () => undefined,
  );
  try {
    connection = await Promise.race([opened, timeout]);
  } finally {
    clearTimeout(timer);
  }
  const store = build(idbBackend(connection), true);
  try {
    await migrateLocalSessions(store);
  } catch (error) {
    connection.close();
    throw error;
  }
  return store;
}

/** A device store that lasts only as long as the page, like the fallback when IndexedDB fails. */
export const memoryDeviceStore = (): DeviceStore => build(memoryBackend(), false);

/**
 * Opens the device database, moving any M3 localStorage sessions into it. Falls back to an
 * in-memory store when IndexedDB is unavailable, fails to open, or does not open within a few seconds.
 */
export async function openDeviceStore(): Promise<DeviceStore> {
  try {
    return await openPersistent();
  } catch {
    return memoryDeviceStore();
  }
}

/** Asks the browser to keep this device's data; done once, after the first finished game. */
export async function requestPersistence(store: DeviceStore): Promise<void> {
  const settings = await store.settings.get();
  if (settings.firstGameFinished) return;
  await patchSettings({ firstGameFinished: true }, store);
  if (!store.persistent) return;
  try {
    await navigator.storage.persist();
  } catch {
    // The browser may decline or lack the API; the data is stored either way.
  }
}
