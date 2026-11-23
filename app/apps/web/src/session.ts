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

const ONLINE_PREFIX = 'wwd.online.';
const ONLINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** What a device needs to continue its seat in an online game after the tab closes. */
export interface OnlineSession {
  room: string;
  seatToken: string;
  /** The referee URL the room lives on. */
  server: string;
  lastSeq: number;
  /** When this was last saved, in epoch milliseconds. */
  savedAt: number;
}

/** Each referee has its own entry for a room code, since codes are unique only per referee. */
const onlineKey = (server: string, room: string): string =>
  `${ONLINE_PREFIX}${encodeURIComponent(server)}.${room}`;

function isOnlineSession(value: unknown): value is OnlineSession {
  if (!isSession(value)) return false;
  const { server, savedAt } = value as unknown as Record<string, unknown>;
  return typeof server === 'string' && typeof savedAt === 'number';
}

function readOnline(key: string): OnlineSession | undefined {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isOnlineSession(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the stored seat for `room` on `server`; undefined when there is none or storage is unavailable. */
export function loadOnlineSession(server: string, room: string): OnlineSession | undefined {
  try {
    const session = readOnline(onlineKey(server, room));
    return session?.server === server && session.room === room ? session : undefined;
  } catch {
    return undefined;
  }
}

export function saveOnlineSession(
  session: Omit<OnlineSession, 'savedAt'>,
  now: number = Date.now(),
): void {
  try {
    const stored: OnlineSession = { ...session, savedAt: now };
    localStorage.setItem(onlineKey(session.server, session.room), JSON.stringify(stored));
  } catch {
    // Without storage a closed tab simply cannot continue its seat.
  }
}

export function clearOnlineSession(server: string, room: string): void {
  try {
    localStorage.removeItem(onlineKey(server, room));
  } catch {
    // Nothing was stored.
  }
}

/**
 * Removes online sessions saved more than 30 days before `now`, and any that are malformed. An
 * entry stored under any other key, such as one keyed by room alone, moves to its own key.
 */
export function pruneOnlineSessions(now: number = Date.now()): void {
  try {
    const stale: string[] = [];
    const moved: OnlineSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(ONLINE_PREFIX)) continue;
      const session = readOnline(key);
      const fresh = session !== undefined && now - session.savedAt <= ONLINE_MAX_AGE_MS;
      if (fresh && key === onlineKey(session.server, session.room)) continue;
      stale.push(key);
      if (fresh) moved.push(session);
    }
    for (const key of stale) localStorage.removeItem(key);
    for (const session of moved) {
      const key = onlineKey(session.server, session.room);
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(session));
    }
  } catch {
    // Pruning is retried on the next load.
  }
}
