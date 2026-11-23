import { afterEach } from 'vitest';
import { Game, defaultRulesConfig, type Character, type Command, type Seat } from '@wwd/engine';
import type { GameClientState } from '@wwd/client-core';

const games: Game[] = [];
afterEach(() => {
  for (const game of games.splice(0)) game.dispose();
});

export const seedHex = (n: number): string => n.toString(16).padStart(64, '0');

export function newGame(seed: number): Game {
  const game = Game.create(seedHex(seed), defaultRulesConfig());
  games.push(game);
  return game;
}

/** A fresh game in which `seat` was dealt every card in `cards`. */
export function gameDealing(seat: Seat, cards: Character[]): Game {
  for (let seed = 1; seed < 2000; seed++) {
    const game = newGame(seed);
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
