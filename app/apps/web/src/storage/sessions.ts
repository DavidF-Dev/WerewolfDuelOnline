import type { Backend, DeviceStore, SessionRecord } from './db.js';

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// A referee keeps a finished room for this long, so the seat can be continued only until then.
export const FINISHED_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Each referee has its own record for a room code, since codes are unique only per referee. */
export const sessionId = (server: string, room: string): string =>
  `${encodeURIComponent(server)}.${room}`;

/** What is kept of a seat the player removed from this device, so that no stale tab stores it again. */
interface RemovedMark {
  removedSeat: string;
  removedAt: number;
}

type StoredMark = RemovedMark & { id: string };

// Session ids start with an encoded URL, which never holds a colon.
const MARK_PREFIX = 'removed:';
const markKey = (id: string): string => `${MARK_PREFIX}${id}`;

function expired(record: SessionRecord, now: number): boolean {
  if (now - record.savedAt > SESSION_MAX_AGE_MS) return true;
  return (
    record.status === 'finished' &&
    record.finishedAt !== undefined &&
    now - record.finishedAt >= FINISHED_SESSION_MAX_AGE_MS
  );
}

const isMark = (value: SessionRecord | StoredMark): value is StoredMark => 'removedSeat' in value;

export function createSessions(backend: Backend): DeviceStore['sessions'] {
  const dropIfRemoved = (id: string): Promise<boolean> =>
    backend.deleteWhen('sessions', id, markKey(id), (record, mark) => {
      const seat = (mark as RemovedMark | undefined)?.removedSeat;
      return seat !== undefined && (record as SessionRecord | undefined)?.seatToken === seat;
    });
  return {
    list: async (now = Date.now()) => {
      const stored = (await backend.getAll('sessions')) as Array<SessionRecord | StoredMark>;
      const removed = new Map(stored.filter(isMark).map((mark) => [mark.id, mark.removedSeat]));
      const fresh: SessionRecord[] = [];
      for (const value of stored) {
        if (isMark(value)) continue;
        // A save that raced the removal may have written the removed seat back.
        if (removed.get(markKey(value.id)) === value.seatToken) {
          await dropIfRemoved(value.id);
        } else if (expired(value, now)) await backend.delete('sessions', value.id);
        else fresh.push(value);
      }
      for (const mark of stored.filter(isMark)) {
        if (now - mark.removedAt > SESSION_MAX_AGE_MS) await backend.delete('sessions', mark.id);
      }
      return fresh;
    },
    get: async (id) => (await backend.get('sessions', id)) as SessionRecord | undefined,
    put: (record) => backend.put('sessions', record.id, record),
    delete: (id) => backend.delete('sessions', id),
    remove: async (id, seatToken, now = Date.now()) => {
      const mark: StoredMark = {
        id: markKey(id),
        removedSeat: seatToken,
        removedAt: now,
      };
      // Marked first, so that a tab saving the seat meanwhile finds the mark.
      await backend.put('sessions', mark.id, mark);
      await backend.delete('sessions', id);
    },
    removedSeat: async (id) =>
      ((await backend.get('sessions', markKey(id))) as RemovedMark | undefined)?.removedSeat,
    clearRemoved: (id) => backend.delete('sessions', markKey(id)),
    dropIfRemoved,
  };
}
