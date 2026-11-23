import type { Backend, DeviceStore, SessionRecord } from './db.js';

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// A referee keeps a finished room for this long, so the seat can be continued only until then.
export const FINISHED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Each referee has its own record for a room code, since codes are unique only per referee. */
export const sessionId = (server: string, room: string): string =>
  `${encodeURIComponent(server)}.${room}`;

function expired(record: SessionRecord, now: number): boolean {
  if (now - record.savedAt > SESSION_MAX_AGE_MS) return true;
  return (
    record.status === 'finished' &&
    record.finishedAt !== undefined &&
    now - record.finishedAt >= FINISHED_SESSION_MAX_AGE_MS
  );
}

export function createSessions(backend: Backend): DeviceStore['sessions'] {
  return {
    list: async (now = Date.now()) => {
      const records = (await backend.getAll('sessions')) as SessionRecord[];
      const fresh: SessionRecord[] = [];
      for (const record of records) {
        if (expired(record, now)) await backend.delete('sessions', record.id);
        else fresh.push(record);
      }
      return fresh;
    },
    get: async (id) => (await backend.get('sessions', id)) as SessionRecord | undefined,
    put: (record) => backend.put('sessions', record.id, record),
    delete: (id) => backend.delete('sessions', id),
  };
}
