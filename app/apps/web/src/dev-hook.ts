import type { Command, Seat } from '@wwd/engine';
import type { ConnectionState, GameClient, GameClientState, Localiser } from '@wwd/client-core';
import type { CreateRoomRequest } from '@wwd/protocol';
import { DEFAULT_SERVER, createRoom } from './online.js';
import {
  characterName,
  instructionText,
  listText,
  logLine,
  markerLines,
  planStatus,
  statusText,
} from './text.js';

/** The client state without its secrets: the seat token and the PIN. */
export type PublicState = Omit<GameClientState, 'seatToken' | 'pin'>;

/** A scripting handle on the current game, for development tools and agents. */
export interface DevHook {
  state(): PublicState;
  legal(): Command[];
  act(cmd: Command): void;
  /** A plain-text summary of the table as this seat sees it. */
  describe(): string;
  /** The online connection's state; null in a local game. */
  connection(): ConnectionState | null;
  /** Creates an online room on the default referee, for scripted tests. */
  createOnline(opts?: CreateOnlineOptions): Promise<{ code: string }>;
}

export interface CreateOnlineOptions {
  grace_minutes?: CreateRoomRequest['grace_minutes'];
  /** Honoured only by a referee started with test overrides. */
  test?: CreateRoomRequest['test'];
}

declare global {
  interface Window {
    __wwd?: DevHook;
  }
}

const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);
const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');

export function describeTable(l: Localiser, state: GameClientState): string {
  const lines = [l.t('table-status', { status: statusText(l, state.status) })];
  const { view, seat } = state;
  if (view !== null && seat !== null) {
    const me = view.players[index(seat)];
    const opponentSeat = other(seat);
    const opponent = view.players[index(opponentSeat)];
    const opponentName = state.opponent.name ?? l.t(`seat-${opponentSeat}`);
    lines.push(
      l.t('table-round', { round: view.round }),
      instructionText(l, state),
      l.t('describe-hand', { cards: listText((me.hand ?? []).map((c) => characterName(l, c))) }),
      l.t('describe-markers', {
        name: l.t(`seat-${seat}`),
        markers: listText(markerLines(l, me, view.badge === seat)),
      }),
      planStatus(l, me.plan),
      l.t('describe-markers', {
        name: opponentName,
        markers: listText(markerLines(l, opponent, view.badge === opponentSeat)),
      }),
      l.t('count-hand', { n: opponent.hand_size }),
      planStatus(l, opponent.plan),
    );
    if (state.pending !== null && state.pending.seats.length > 0) {
      const seats = state.pending.seats.map((s) => l.t(`seat-${s}`));
      lines.push(l.t('describe-pending', { seats: listText(seats) }));
    }
  }
  lines.push(...state.events.map(([, event]) => logLine(l, event, seat)));
  return lines.join('\n');
}

function publicState(state: GameClientState): PublicState {
  const { seatToken: _seatToken, pin: _pin, ...rest } = state;
  return rest;
}

/** Creates an online room on the default referee; the result holds only the join code. */
async function createOnline(opts: CreateOnlineOptions = {}): Promise<{ code: string }> {
  const result = await createRoom(DEFAULT_SERVER, opts.grace_minutes ?? 10, opts.test);
  if (!result.ok) throw new Error(`the room could not be created: ${result.problem}`);
  return { code: result.code };
}

const noGame = (): never => {
  throw new Error('no game is open on this page');
};

const BASE_HOOK: DevHook = {
  state: noGame,
  legal: noGame,
  act: noGame,
  describe: noGame,
  connection: () => null,
  createOnline,
};

/** Exposes the game-less part of `window.__wwd` in development builds. */
export function installBaseDevHook(): void {
  if (import.meta.env.DEV) window.__wwd ??= BASE_HOOK;
}

/**
 * Exposes `client` as `window.__wwd` in development builds, with `connection` reading the online
 * connection's state; returns a function that puts back the game-less hook.
 */
export function installDevHook(
  client: GameClient,
  l: Localiser,
  connection: () => ConnectionState | null = () => null,
): () => void {
  if (!import.meta.env.DEV) return () => {};
  const hook: DevHook = {
    state: () => publicState(client.current),
    legal: () => client.current.legal,
    act: (cmd) => client.command(cmd),
    describe: () => describeTable(l, client.current),
    connection,
    createOnline,
  };
  window.__wwd = hook;
  return () => {
    if (window.__wwd === hook) window.__wwd = BASE_HOOK;
  };
}
