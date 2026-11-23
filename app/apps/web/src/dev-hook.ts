import type { Command } from '@wwd/engine';
import type { ConnectionState, GameClient, GameClientState, Localiser } from '@wwd/client-core';
import type { NewRoomRequest } from '@wwd/protocol';
import { DEFAULT_SERVER, createRoom } from './online.js';
import { describe } from './table/describe.js';
import { statusText } from './text.js';

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
  grace_minutes?: NewRoomRequest['grace_minutes'];
  /** Honoured only by a referee started with test overrides. */
  test?: NewRoomRequest['test'];
}

declare global {
  interface Window {
    __wwd?: DevHook;
  }
}

/** The table description for this client's seat, or its status while there is no table. */
function describeTable(l: Localiser, state: GameClientState): string {
  const { view, seat } = state;
  if (view === null || seat === null) {
    return l.t('table-status', { status: statusText(l, state.status) });
  }
  return describe(view, seat, l);
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
