import { Game, defaultRulesConfig, type Character, type Command, type Seat } from '@wwd/engine';
import type { GameClientState } from '@wwd/client-core';
import type { HistoryRecord } from '../storage/db.js';

/** Makes a fresh game from a numbered seed; the caller disposes of it. */
export type CreateGame = (seed: number) => Game;

export const seedHex = (n: number): string => n.toString(16).padStart(64, '0');

export const createGame: CreateGame = (seed) => Game.create(seedHex(seed), defaultRulesConfig());

const isOver = (game: Game): boolean => {
  const { phase } = game.view({ seat: 'p0' });
  return typeof phase === 'object' && 'game_over' in phase;
};

/** A fresh game, made by `create`, in which `seat` was dealt every card in `cards`. */
export function gameDealing(seat: Seat, cards: Character[], create: CreateGame): Game {
  for (let seed = 1; seed < 2000; seed++) {
    const game = create(seed);
    const hand = game.view({ seat }).players[seat === 'p0' ? 0 : 1].hand ?? [];
    if (cards.every((c) => hand.includes(c))) return game;
  }
  throw new Error('no seed deals those cards');
}

/** What a client in `seat` holds for `game` right now. */
export function stateFor(game: Game, seat: Seat): GameClientState {
  const viewer = { seat };
  const view = game.view(viewer);
  const events = game.eventsSince(0, viewer);
  return {
    status: 'playing',
    room: 'ABCDEF',
    seat,
    seatToken: 'a'.repeat(32),
    pin: null,
    opponent: { connected: true },
    rejoinRequested: false,
    rejoinDeadline: null,
    rejoinPending: false,
    config: defaultRulesConfig(),
    game: 0,
    pause: { requestedBy: null, agreed: false, paused: false, resumeReady: [] },
    save: null,
    rematchReady: [],
    view,
    legal: game.legalActions(seat),
    pending: view.pending,
    events,
    lastSeq: events.length,
    replay: null,
    replayVerified: null,
    lastError: null,
    errorCount: 0,
    lastPongAt: null,
    pongCount: 0,
  };
}

/**
 * Plays a command for each pending seat until `done` holds: by default the first legal one other
 * than resigning.
 */
export function playUntil(
  game: Game,
  done: () => boolean,
  choose: (legal: Command[]) => Command | undefined = (legal) => legal.find((c) => c !== 'resign'),
): void {
  for (let step = 0; !done(); step++) {
    if (step > 200) throw new Error('the game never reached the wanted state');
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('nobody can act');
    const cmd = choose(game.legalActions(seat));
    if (cmd === undefined) throw new Error('no command offered');
    game.apply(seat, cmd);
  }
}

/**
 * A game, made by `create`, played to its end, each seat choosing a pseudo-random legal command
 * other than resigning.
 */
export function finishedGame(seed: number, create: CreateGame): Game {
  const game = create(seed);
  let pick = seed;
  for (let step = 0; !isOver(game); step++) {
    if (step > 5000) throw new Error('the game did not end');
    const seat = game.pending().seats[0];
    const legal = seat === undefined ? [] : game.legalActions(seat).filter((c) => c !== 'resign');
    pick = (pick * 1103515245 + 12345) % 2147483648;
    const cmd = legal[pick % legal.length];
    if (seat === undefined || cmd === undefined) throw new Error('nobody can act');
    game.apply(seat, cmd);
  }
  return game;
}

/** The history record of the finished `game` as `seat` played it. */
export function recordFrom(
  game: Game,
  seat: Seat,
  id: string,
  extra: Partial<HistoryRecord> = {},
): HistoryRecord {
  const view = game.view({ seat });
  if (typeof view.phase !== 'object' || !('game_over' in view.phase)) {
    throw new Error('the game is not over');
  }
  const replay = game.replay();
  return {
    id,
    finishedAt: 1_000,
    seat,
    config: replay.config,
    replay,
    winner: view.phase.game_over.winner,
    reason: view.phase.game_over.reason,
    rounds: view.round,
    ...extra,
  };
}
