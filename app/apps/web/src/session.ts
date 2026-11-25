import type { Seat } from '@wwd/engine';
import type { SaveFile } from '@wwd/protocol';
import type { DeviceStore, SessionRecord } from './storage/db.js';
import { sessionId } from './storage/sessions.js';

const KEY = 'wwd.session';

/** What a guest tab needs to rejoin its seat after a reload. */
export interface Session {
  room: string;
  seatToken: string;
  lastSeq: number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const { room, seatToken, lastSeq } = value as Record<string, unknown>;
  return typeof room === 'string' && typeof seatToken === 'string' && typeof lastSeq === 'number';
}

/** Reads this tab's session; undefined when there is none or storage is unavailable. */
export function loadSession(): Session | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Without storage a reload simply cannot rejoin.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was stored.
  }
}

/** What a device needs to continue its seat in an online game after the tab closes. */
export interface OnlineSession {
  room: string;
  seatToken: string;
  /** The referee URL the room lives on. */
  server: string;
  /** Unknown until a welcome names it, for a session saved before seats were recorded. */
  seat?: Seat;
  lastSeq: number;
  /** When this was last saved, in epoch milliseconds. */
  savedAt: number;
}

/** What a seat's client knows when its session is saved; fields it does not know yet are left out. */
export interface OnlineSessionUpdate extends Omit<OnlineSession, 'savedAt'> {
  opponentName?: string;
  /** Which of the room's games the seat follows, once the referee has said. */
  game?: number;
  /** The round of the game, once its view has arrived. */
  round?: number;
  /** Whether the seat is being asked for a decision. */
  yourTurn?: boolean;
  /** Set once game `game` is over. */
  finished?: boolean;
}

// Reads stay synchronous against this cache; writes go through to the device store.
const cache = new Map<string, SessionRecord>();
let store: DeviceStore | undefined;
const clears = new Map<string, number>();

const ignoreFailure = (): void => {
  // Without storage a closed tab simply cannot continue its seat.
};

/** Loads the stored sessions, dropping those past their age limit, and writes through to the store from then on. */
export async function initSessions(
  deviceStore: DeviceStore,
  now: number = Date.now(),
): Promise<void> {
  store = deviceStore;
  try {
    for (const record of await deviceStore.sessions.list(now)) {
      if (!cache.has(record.id)) cache.set(record.id, record);
    }
  } catch {
    // The cache starts empty and fills as sessions are saved.
  }
}

/** Replaces the cache with what the store now holds, discarding writes that were still pending. */
export async function reloadSessions(
  deviceStore: DeviceStore,
  now: number = Date.now(),
): Promise<void> {
  for (const id of cache.keys()) clears.set(id, (clears.get(id) ?? 0) + 1);
  cache.clear();
  await initSessions(deviceStore, now);
}

/** Reads the stored seat for `room` on `server`; undefined when there is none. */
export function loadOnlineSession(server: string, room: string): OnlineSession | undefined {
  const record = cache.get(sessionId(server, room));
  if (record === undefined) return undefined;
  return {
    room: record.room,
    seatToken: record.seatToken,
    server: record.server,
    ...(record.seat === undefined ? {} : { seat: record.seat }),
    lastSeq: record.lastSeq,
    savedAt: record.savedAt,
  };
}

// A newer stored record, from another tab, wins over this tab's stale snapshot.
/** Writes `record` to the device store, resolving to whether a record with its id is stored after. */
function writeThrough(record: SessionRecord): Promise<boolean> {
  const target = store;
  if (target === undefined) return Promise.resolve(false);
  const generation = clears.get(record.id) ?? 0;
  return target.sessions
    .get(record.id)
    .then(async (stored) => {
      if ((clears.get(record.id) ?? 0) !== generation) return false;
      if (stored !== undefined && stored.savedAt > record.savedAt) {
        if (cache.get(record.id) === record) cache.set(record.id, stored);
        return true;
      }
      await target.sessions.put(record);
      return true;
    })
    .catch(() => {
      ignoreFailure();
      return false;
    });
}

/** Stores the seat, resolving to whether it reached the device store. */
export function saveOnlineSession(
  session: OnlineSessionUpdate,
  now: number = Date.now(),
): Promise<boolean> {
  const id = sessionId(session.server, session.room);
  const previous = cache.get(id);
  const seat = session.seat ?? previous?.seat;
  const opponentName = session.opponentName ?? previous?.opponentName;
  const round = session.round ?? previous?.round;
  const yourTurn = session.yourTurn ?? previous?.yourTurn;
  const game = session.game ?? previous?.game ?? 0;
  const wasFinished = previous?.status === 'finished' && previous.game === game;
  // A seat that is playing here continues in no other room.
  const { resumedAs: _resumedAs, finishedAt: _finishedAt, ...kept } = previous ?? {};
  let status: SessionRecord['status'] = previous?.status ?? 'active';
  let finishedAt: number | undefined;
  if (session.finished === true || wasFinished) {
    status = 'finished';
    finishedAt = wasFinished ? (previous.finishedAt ?? now) : now;
  } else if (status === 'finished') {
    status = 'active';
  }
  const record: SessionRecord = {
    ...kept,
    id,
    server: session.server,
    room: session.room,
    seatToken: session.seatToken,
    lastSeq: session.lastSeq,
    game,
    status,
    savedAt: now,
    ...(seat === undefined ? {} : { seat }),
    ...(opponentName === undefined ? {} : { opponentName }),
    ...(round === undefined ? {} : { round }),
    ...(yourTurn === undefined ? {} : { yourTurn }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
  cache.set(id, record);
  return writeThrough(record);
}

/** Marks the stored seat as paused with `save`, or as active again when `save` is null. */
export function setOnlineSessionSave(
  server: string,
  room: string,
  save: SaveFile | null,
  now: number = Date.now(),
): void {
  const id = sessionId(server, room);
  const previous = cache.get(id);
  if (previous === undefined) return;
  const { save: _old, ...rest } = previous;
  const record: SessionRecord =
    save === null
      ? { ...rest, status: 'active', savedAt: now }
      : { ...rest, status: 'paused', save, savedAt: now };
  cache.set(id, record);
  void writeThrough(record);
}

/**
 * Notes on the stored seat for `room` that its save now continues in `newRoom`, resolving to
 * whether the note reached the device store.
 */
export function markResumedAs(
  server: string,
  room: string,
  newRoom: string,
  now: number = Date.now(),
): Promise<boolean> {
  const id = sessionId(server, room);
  const previous = cache.get(id);
  if (previous === undefined || newRoom === room) return Promise.resolve(false);
  const record: SessionRecord = { ...previous, resumedAs: newRoom, savedAt: now };
  cache.set(id, record);
  return writeThrough(record);
}

/** Forgets every stored seat on `server` whose save continues in `room`. */
export function forgetResumedInto(server: string, room: string): void {
  for (const record of [...cache.values()]) {
    if (record.server === server && record.resumedAs === room) {
      clearOnlineSession(record.server, record.room);
    }
  }
}

/** Drops the note on every stored seat on `server` that its save continues in `room`. */
export function unmarkResumedAs(server: string, room: string, now: number = Date.now()): void {
  for (const record of [...cache.values()]) {
    if (record.server !== server || record.resumedAs !== room) continue;
    const { resumedAs: _resumedAs, ...rest } = record;
    const updated: SessionRecord = { ...rest, savedAt: now };
    cache.set(record.id, updated);
    void writeThrough(updated);
  }
}

/** The save kept for `room` on `server` while it is paused, with the seat it belongs to. */
export function loadOnlineSave(
  server: string,
  room: string,
): { save: SaveFile; seat: Seat } | undefined {
  const record = cache.get(sessionId(server, room));
  if (record?.save === undefined || record.seat === undefined) return undefined;
  return { save: record.save, seat: record.seat };
}

export function clearOnlineSession(server: string, room: string): void {
  const id = sessionId(server, room);
  cache.delete(id);
  clears.set(id, (clears.get(id) ?? 0) + 1);
  store?.sessions.delete(id).catch(ignoreFailure);
}

/** Forgets every cached session and detaches the device store; for tests. */
export function resetSessions(): void {
  cache.clear();
  clears.clear();
  store = undefined;
}
