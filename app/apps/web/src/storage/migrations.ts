import type { IDBPDatabase } from 'idb';
import type { DeviceStore, SessionRecord } from './db.js';
import { STORE_NAMES } from './names.js';
import { sessionId } from './sessions.js';

export const DB_NAME = 'wwd';

/** Schema changes keyed by the version that introduces them, applied in order. */
const MIGRATIONS: Record<number, (db: IDBPDatabase) => void> = {
  1: (db) => {
    for (const name of STORE_NAMES) db.createObjectStore(name);
  },
};

export const DB_VERSION = Math.max(...Object.keys(MIGRATIONS).map(Number));

export function upgrade(db: IDBPDatabase, oldVersion: number, newVersion: number | null): void {
  const target = newVersion ?? DB_VERSION;
  for (let version = oldVersion + 1; version <= target; version++) MIGRATIONS[version]?.(db);
}

const LOCAL_PREFIX = 'wwd.online.';

function toRecord(value: unknown): SessionRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { room, seatToken, server, lastSeq, savedAt } = value as Record<string, unknown>;
  if (
    typeof room !== 'string' ||
    typeof seatToken !== 'string' ||
    typeof server !== 'string' ||
    typeof lastSeq !== 'number' ||
    typeof savedAt !== 'number'
  ) {
    return undefined;
  }
  return {
    id: sessionId(server, room),
    server,
    room,
    seatToken,
    lastSeq,
    game: 0,
    status: 'active',
    savedAt,
  };
}

/** Removes every M3 localStorage session entry, whether or not it was migrated. */
export function clearLocalSessions(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(LOCAL_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Without localStorage there is nothing to remove.
  }
}

/** Copies the M3 localStorage session entries into the store, then removes them. */
export async function migrateLocalSessions(store: DeviceStore): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(LOCAL_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      let record: SessionRecord | undefined;
      try {
        record = raw === null ? undefined : toRecord(JSON.parse(raw));
      } catch {
        record = undefined;
      }
      if (record !== undefined && (await store.sessions.get(record.id)) === undefined) {
        await store.sessions.put(record);
      }
      localStorage.removeItem(key);
    }
  } catch {
    // Anything left behind is migrated on the next open.
  }
}
