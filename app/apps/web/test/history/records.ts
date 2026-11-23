import type { Character, Game, Seat } from '@wwd/engine';
import type { HistoryRecord } from '../../src/storage/db.js';
import { newGame } from '../games.js';

const isOver = (game: Game): boolean => {
  const { phase } = game.view({ seat: 'p0' });
  return typeof phase === 'object' && 'game_over' in phase;
};

/** A game played to its end, each seat choosing a pseudo-random legal command other than resigning. */
export function finishedGame(seed: number): Game {
  const game = newGame(seed);
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

/** The first round of `game` played with `seat` choosing `character`, then `loser` resigning. */
export function oneRound(game: Game, seat: Seat, character: Character, loser: Seat): Game {
  for (let step = 0; ; step++) {
    if (step > 200) throw new Error('the round did not end');
    const phase = game.view({ seat }).phase;
    if (phase === 'round_over') break;
    const acting = game.pending().seats[0];
    if (acting === undefined) throw new Error('nobody can act');
    const legal = game.legalActions(acting).filter((c) => c !== 'resign');
    const wanted =
      acting === seat
        ? legal.find(
            (c) =>
              typeof c === 'object' && 'submit_plan' in c && c.submit_plan.character === character,
          )
        : undefined;
    const cmd = wanted ?? legal[0];
    if (cmd === undefined) throw new Error('no command offered');
    game.apply(acting, cmd);
  }
  game.apply(loser, 'resign');
  return game;
}

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
