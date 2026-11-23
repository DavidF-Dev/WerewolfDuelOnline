import type { Seat } from '@wwd/engine';
import type { GraceMinutes, SaveFile } from '@wwd/protocol';
import type { GameClientState } from '@wwd/client-core';
import { postRoom, type CreateRoomResult } from './online.js';
import { requestPersistence, type DeviceStore, type HistoryRecord } from './storage/db.js';
import { sessionId } from './storage/sessions.js';

/** The reconnect time for a room continued from a save. */
export const SAVE_GRACE_MINUTES: GraceMinutes = 10;

/**
 * Creates a room on the referee at `server` that continues `save`, keeping `seat` for this
 * device. The room starts paused, so neither player sees a new deal until both ask to resume.
 */
export function createRoomFromSave(
  server: string,
  save: SaveFile,
  seat: Seat,
  graceMinutes: GraceMinutes = SAVE_GRACE_MINUTES,
): Promise<CreateRoomResult> {
  return postRoom(server, { save, seat, grace_minutes: graceMinutes });
}

/** The id of the history record for game `game` of `room` on `server`. */
export const historyId = (server: string, room: string, game: number): string =>
  `${sessionId(server, room)}.${game}`;

/**
 * The history record for the finished game `state` holds, or undefined while it holds no
 * finished game. `id` names the game, so the same game always gets the same record.
 */
export function historyRecordFor(
  id: string,
  state: GameClientState,
  finishedAt: number = Date.now(),
): HistoryRecord | undefined {
  const { seat, replay, view } = state;
  if (state.status !== 'game_over' || seat === null || replay === null || view === null) {
    return undefined;
  }
  if (typeof view.phase !== 'object' || !('game_over' in view.phase)) return undefined;
  const { winner, reason } = view.phase.game_over;
  return {
    id,
    finishedAt,
    seat,
    ...(state.opponent.name === undefined ? {} : { opponentName: state.opponent.name }),
    config: replay.config,
    replay,
    winner,
    reason,
    rounds: view.round,
  };
}

// Ids being written now, so a game reported twice before its first write lands is written once.
const writing = new Set<string>();

/**
 * Records a finished game unless a record with its id is already kept, then asks the browser to
 * keep this device's data. Resolves to whether a record was written.
 */
export async function recordFinishedGame(
  store: DeviceStore,
  record: HistoryRecord,
): Promise<boolean> {
  if (writing.has(record.id)) return false;
  writing.add(record.id);
  try {
    if ((await store.history.get(record.id)) !== undefined) return false;
    await store.history.put(record);
    await requestPersistence(store);
    return true;
  } finally {
    writing.delete(record.id);
  }
}
