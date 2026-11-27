import { writable } from 'svelte/store';
import { defaultRulesConfig, type Command, type Seat } from '@wwd/engine';
import { GameClient, sameCommand, type GameClientState, type Readable } from '@wwd/client-core';
import { MemoryReferee, seededRandom } from '@wwd/referee-memory';
import { createInMemoryPair } from '@wwd/transport';
import {
  TUTORIAL_PLAYER_SEAT,
  TUTORIAL_SEED,
  TUTORIAL_STEPS,
  type TutorialStep,
} from './script.js';

export interface TutorialRun {
  /** The player's side of the game, for the table. */
  player: GameClient;
  /** The index of the current step in the script, from 0. */
  step: Readable<number>;
  /** Moves on from an explain-only step; ignored on a step the player's action ends. */
  next(): void;
  dispose(): void;
}

/** The tutorial's game with both seats taken, before any scripted move. */
export interface TutorialTable {
  referee: MemoryReferee;
  player: GameClient;
  opponent: GameClient;
  dispose(): void;
}

export interface TutorialOptions {
  playerName: string;
  opponentName: string;
  /** How long the opponent waits before each scripted move. */
  delayMs: number;
  /** Abandons the start: the promise rejects and everything opened so far is closed. */
  signal?: AbortSignal;
}

/** How long the room may take to start its game before the tutorial gives up. */
export const TUTORIAL_START_TIMEOUT_MS = 10_000;

/** A display name for `hello`, or none for a blank one, which the referee would refuse. */
const helloName = (name: string): { name?: string } => {
  const trimmed = name.trim();
  return trimmed === '' ? {} : { name: trimmed };
};

/**
 * Resolves once `ready` holds for the client's state; rejects if the client is turned away, loses
 * its connection or is refused before it has a seat.
 */
function until(client: GameClient, ready: (state: GameClientState) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = client.state.subscribe((state) => {
      if (ready(state)) resolve();
      else if (state.status === 'rejected' || state.status === 'disconnected') {
        reject(new Error(`tutorial client ${state.status}`));
      } else if (state.seat === null && state.lastError !== null) {
        reject(new Error(`tutorial seat refused: ${state.lastError}`));
      } else return;
      // The first call runs before `off` is assigned.
      queueMicrotask(() => off());
    });
  });
}

/** Rejects after `ms`, or when `signal` aborts; `cancel` stops both. */
function deadline(ms: number, signal?: AbortSignal): { failed: Promise<never>; cancel(): void } {
  let cancel = (): void => {};
  const failed = new Promise<never>((_resolve, reject) => {
    const abort = (): void => reject(signal?.reason ?? new Error('tutorial start aborted'));
    const timer = setTimeout(() => reject(new Error('tutorial start timed out')), ms);
    signal?.addEventListener('abort', abort, { once: true });
    cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    if (signal?.aborted === true) abort();
  });
  // A rejection after the race is settled is expected and not an error.
  failed.catch(() => undefined);
  return { failed, cancel };
}

/**
 * Opens the tutorial's room in the page: a referee with the tutorial's fixed random source, the
 * Badge with the player, and the player seated before the opponent, so the deal is always the same.
 * Resolves once the game has started for both seats; rejects if it has not within
 * `TUTORIAL_START_TIMEOUT_MS`, or when `signal` aborts first.
 */
export async function openTutorialTable(
  opts: Pick<TutorialOptions, 'playerName' | 'opponentName' | 'signal'>,
): Promise<TutorialTable> {
  const referee = new MemoryReferee({ random: seededRandom(TUTORIAL_SEED) });
  const room = referee.createRoom({
    ...defaultRulesConfig(),
    badge_start: { seat: TUTORIAL_PLAYER_SEAT },
  });
  const player = new GameClient({ room, ...helloName(opts.playerName) });
  const opponent = new GameClient({ room, ...helloName(opts.opponentName) });
  const dispose = (): void => {
    player.dispose();
    opponent.dispose();
    referee.close();
  };
  const connect = (client: GameClient): void => {
    const [clientEnd, serverEnd] = createInMemoryPair();
    referee.accept(serverEnd);
    client.attach(clientEnd);
  };
  const limit = deadline(TUTORIAL_START_TIMEOUT_MS, opts.signal);
  const started = async (): Promise<void> => {
    connect(player);
    await until(player, (state) => state.seat !== null);
    if (player.current.seat !== TUTORIAL_PLAYER_SEAT) throw new Error('tutorial seat mismatch');
    connect(opponent);
    await Promise.all([
      until(player, (state) => state.view !== null),
      until(opponent, (state) => state.view !== null),
    ]);
  };
  try {
    await Promise.race([started(), limit.failed]);
    return { referee, player, opponent, dispose };
  } catch (thrown) {
    dispose();
    throw thrown;
  } finally {
    limit.cancel();
  }
}

/**
 * Whether the engine has moved past the phase a `'game'` step teaches: both seats have sealed their
 * plans, or both have placed their Hourglasses.
 */
function stepDone(step: TutorialStep, events: GameClientState['events']): boolean {
  const seats = new Set<Seat>();
  for (const [, { kind }] of events) {
    if (step.allow.character !== undefined && 'plan_submitted' in kind) {
      seats.add(kind.plan_submitted.seat);
    } else if (step.allow.hourglasses !== undefined && 'hourglasses_placed' in kind) {
      seats.add(kind.hourglasses_placed.seat);
    }
  }
  return seats.size === 2;
}

/**
 * Starts the tutorial's scripted round. The opponent's move for a step is sent `delayMs` after
 * the engine asks for it, once the script has reached that step. A `'game'` step ends once the
 * engine has both seats' moves for it.
 */
export async function startTutorial(opts: TutorialOptions): Promise<TutorialRun> {
  const table = await openTutorialTable(opts);
  const { player, opponent } = table;
  const step = writable(0);
  let current = 0;
  const moves = TUTORIAL_STEPS.flatMap((s, index) =>
    s.opponent === null ? [] : [{ index, command: s.opponent }],
  );
  let nextMove = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const go = (index: number): void => {
    current = index;
    step.set(index);
    update();
  };

  const offered = (command: Command): boolean =>
    opponent.current.legal.some((legal) => sameCommand(legal, command));

  function scheduleMove(): void {
    const move = moves[nextMove];
    if (disposed || timer !== undefined || move === undefined || move.index > current) return;
    if (!offered(move.command)) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed) return;
      if (!offered(move.command)) {
        scheduleMove();
        return;
      }
      nextMove++;
      opponent.command(move.command);
    }, opts.delayMs);
  }

  function checkStep(): void {
    const s = TUTORIAL_STEPS[current];
    if (disposed || s === undefined || s.advance !== 'game') return;
    if (stepDone(s, player.current.events)) go(current + 1);
  }

  function update(): void {
    checkStep();
    scheduleMove();
  }

  const offs = [player.state.subscribe(() => update()), opponent.state.subscribe(() => update())];

  return {
    player,
    step: { subscribe: step.subscribe },
    next(): void {
      const s = TUTORIAL_STEPS[current];
      if (disposed || s?.advance !== 'next' || current >= TUTORIAL_STEPS.length - 1) return;
      go(current + 1);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      for (const off of offs) off();
      table.dispose();
    },
  };
}
