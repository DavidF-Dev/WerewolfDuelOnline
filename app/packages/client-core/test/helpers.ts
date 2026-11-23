import { Game, defaultRulesConfig, type RulesConfig, type View } from '@wwd/engine';
import { MemoryReferee } from '@wwd/referee-memory';
import { createInMemoryPair } from '@wwd/transport';
import { GameClient } from '../src/index.js';

export const MAX_ROUNDS = 200;

/** A deterministic xorshift generator. */
export class Xorshift {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    this.state >>>= 0;
    return this.state;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.next() % items.length];
    if (item === undefined) throw new Error('nothing to pick from');
    return item;
  }

  asRandom(): { bytes(n: number): Uint8Array } {
    return { bytes: (n) => Uint8Array.from({ length: n }, () => this.next() & 0xff) };
  }
}

export function isOver(view: View | null): boolean {
  return view !== null && typeof view.phase === 'object' && 'game_over' in view.phase;
}

/** Awaits enough microtask turns for chained in-memory deliveries to settle. */
export async function flush(turns = 40): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

export async function until(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Has one client with a legal command play a uniformly random one; false when none can. */
export async function step(clients: GameClient[], rng: Xorshift): Promise<boolean> {
  const movers = clients.filter((c) => c.current.legal.length > 0);
  if (movers.length === 0) return false;
  const mover = rng.pick(movers);
  mover.command(rng.pick(mover.current.legal));
  await flush();
  const round = Math.max(...clients.map((c) => c.current.view?.round ?? 0));
  if (round > MAX_ROUNDS) throw new Error(`game exceeded ${MAX_ROUNDS} rounds`);
  return true;
}

/** Plays every client to game over, failing if the game is too long or stalls. */
export async function playOut(clients: GameClient[], rng: Xorshift): Promise<void> {
  for (let i = 0; i < 20_000; i++) {
    if (clients.every((c) => c.current.status === 'game_over')) return;
    if (!(await step(clients, rng))) {
      await flush();
      if (clients.every((c) => c.current.status === 'game_over')) return;
      throw new Error('no client has a legal command');
    }
  }
  throw new Error('game did not finish');
}

/** Plays a whole game in the engine with random legal commands; returns it finished. */
export function finishedGame(
  seedHex: string,
  rng: Xorshift,
  config: RulesConfig = defaultRulesConfig(),
): Game {
  const game = Game.create(seedHex, config);
  for (let i = 0; i < 20_000; i++) {
    const view = game.view({ seat: 'p0' });
    if (isOver(view)) return game;
    if (view.round > MAX_ROUNDS) throw new Error(`game exceeded ${MAX_ROUNDS} rounds`);
    const seat = rng.pick(game.pending().seats);
    game.apply(seat, rng.pick(game.legalActions(seat)));
  }
  throw new Error('game did not finish');
}

/** A memory referee with a deterministic random source and an advancing clock, closed by `cleanups`. */
export function testReferee(seed: number, cleanups: Array<() => void>): MemoryReferee {
  // An advancing clock keeps long games clear of the per-connection rate limit.
  let time = 0;
  const referee = new MemoryReferee({
    clock: { now: () => (time += 1000) },
    random: new Xorshift(seed).asRandom(),
  });
  cleanups.push(() => referee.close());
  return referee;
}

/** A client that has joined `room` on `referee` over an in-memory link, disposed by `cleanups`. */
export function joinReferee(
  referee: MemoryReferee,
  room: string,
  cleanups: Array<() => void>,
): GameClient {
  const client = new GameClient({ room });
  const [clientEnd, serverEnd] = createInMemoryPair();
  referee.accept(serverEnd);
  client.attach(clientEnd);
  cleanups.push(() => client.dispose());
  return client;
}

/** Plays random legal commands until `done` holds, failing if nobody can act first. */
export async function playUntil(
  clients: GameClient[],
  rng: Xorshift,
  done: () => boolean,
): Promise<void> {
  for (let i = 0; i < 20_000; i++) {
    if (done()) return;
    if (!(await step(clients, rng))) {
      if (done()) return;
      throw new Error('no client has a legal command');
    }
  }
  throw new Error('the wanted state never came');
}
