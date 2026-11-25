import { defaultRulesConfig } from '@wwd/engine';
import type { SaveFile } from '@wwd/protocol';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import type { DeviceStore, HistoryRecord, SessionRecord } from '../../src/storage/db.js';

export const SERVER = 'https://a.example';

export const historyRecord = (id: string, finishedAt: number): HistoryRecord => ({
  id,
  finishedAt,
  seat: 'p0',
  opponentName: 'Ada',
  config: defaultRulesConfig(),
  replay: {} as HistoryRecord['replay'],
  winner: 'p0',
  reason: 'resignation' as HistoryRecord['reason'],
  rounds: 3,
});

export const sessionRecord = (
  room: string,
  savedAt: number,
  extra: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: `${encodeURIComponent(SERVER)}.${room}`,
  server: SERVER,
  room,
  seatToken: 't'.repeat(32),
  seat: 'p1',
  lastSeq: 4,
  game: 1,
  status: 'active',
  savedAt,
  ...extra,
});

export const pausedSession = (room: string, savedAt: number): SessionRecord =>
  sessionRecord(room, savedAt, {
    status: 'paused',
    save: { format_version: 1, hash: 'h' } as unknown as SaveFile,
  });

/** Fills `store` with a settings change, an identity, two sessions and two games. */
export async function populate(store: DeviceStore, base = Date.now()): Promise<void> {
  await store.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark', textSize: 125 });
  await store.identity.put({ deviceId: 'device-1', displayName: 'Mika' });
  await store.sessions.put(sessionRecord('AAAAAA', base));
  await store.sessions.put(pausedSession('BBBBBB', base + 1));
  await store.history.put(historyRecord('g1', base + 2));
  await store.history.put(historyRecord('g2', base + 3));
}
