import type { Character, Game, Seat } from '@wwd/engine';
import { finishedGame as finished } from '../../src/gallery/games.js';
import { newGame } from '../games.js';

export { recordFrom } from '../../src/gallery/games.js';

/** A game played to its end, each seat choosing a pseudo-random legal command other than resigning. */
export const finishedGame = (seed: number): Game => finished(seed, newGame);

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
