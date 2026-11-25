import { afterEach } from 'vitest';
import { Game, type Character, type Seat } from '@wwd/engine';
import { createGame, gameDealing as dealing } from '../src/gallery/games.js';

export { playUntil, stateFor } from '../src/gallery/games.js';

const games: Game[] = [];
afterEach(() => {
  for (const game of games.splice(0)) game.dispose();
});

/** A fresh game, disposed of after the test. */
export function newGame(seed: number): Game {
  const game = createGame(seed);
  games.push(game);
  return game;
}

/** A fresh game in which `seat` was dealt every card in `cards`. */
export const gameDealing = (seat: Seat, cards: Character[]): Game => dealing(seat, cards, newGame);
