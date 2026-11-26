import type { Character, Command, Game, PendingKind, Seat } from '@wwd/engine';
import type { ConnectionState, GameClientState } from '@wwd/client-core';
import { getDeviceStore, patchSettings } from '../device-store.js';
import { DEFAULT_SERVER } from '../online.js';
import { listenForInstall } from '../pwa/install.js';
import { watchForUpdates } from '../pwa/update.js';
import { historyId } from '../saves.js';
import type { DeviceStore, HistoryRecord, SessionRecord } from '../storage/db.js';
import { sessionId } from '../storage/sessions.js';
import {
  createGame,
  finishedGame,
  gameDealing,
  playUntil,
  recordFrom,
  stateFor,
  type CreateGame,
} from './games.js';

export const ROOM = 'K7Q2MX';
export const OPPONENT = 'Mika';
export const DISPLAY_NAME = 'Ada';
/** A 24-character name, longer than the opponent strip can show. */
export const LONG_NAME = 'Maximiliane-Alexandra-Ro';

/** The players' names in the fixtures: the opponent, another past opponent, and this device's. */
const names = { opponent: OPPONENT, other: 'Jun', mine: DISPLAY_NAME };

/** The names players are given: the usual short ones, or ones that test the layout. */
export type NameSet = 'usual' | 'long' | 'japanese' | 'cyrillic';

const NAME_SETS: Readonly<Record<NameSet, typeof names>> = {
  usual: { opponent: OPPONENT, other: 'Jun', mine: DISPLAY_NAME },
  // 24 characters each; two are one word, with nowhere to break a line, and one breaks at its hyphen.
  long: {
    opponent: 'Maximilianealexandraroxy',
    other: 'Bartholomew-Konstantinos',
    mine: 'Wilhelminajosephineadele',
  },
  japanese: { opponent: '山田花子', other: '佐藤健', mine: '鈴木一郎' },
  cyrillic: { opponent: 'Анастасия', other: 'Борис', mine: 'Дмитрий' },
};

/** Gives every player a name from `set`. */
export function useNames(set: NameSet): void {
  Object.assign(names, NAME_SETS[set]);
}

export const OTHER_SERVER = 'https://referee.example';
const PIN = '4821';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The time the gallery's clock stands still at. */
export const GALLERY_NOW = Date.UTC(2026, 10, 23, 18, 0);

/**
 * Stops the clock at `GALLERY_NOW` and makes random bytes a fixed sequence, so that every
 * rendering of an entry is the same; returns a function that puts both back.
 */
export function holdStill(): () => void {
  const realNow = Date.now;
  Date.now = () => GALLERY_NOW;
  let state = 0x2545f491;
  const fixedBytes = <T extends ArrayBufferView | null>(array: T): T => {
    if (array !== null) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) {
        // xorshift32, a small generator that is plenty for stand-in randomness.
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        bytes[i] = state & 0xff;
      }
    }
    return array;
  };
  Object.defineProperty(crypto, 'getRandomValues', { value: fixedBytes, configurable: true });
  return () => {
    Date.now = realNow;
    Reflect.deleteProperty(crypto, 'getRandomValues');
  };
}

export const ONLINE: ConnectionState = {
  phase: 'online',
  attempt: 0,
  nextRetryAt: null,
  stopReason: null,
  serverUnavailable: false,
};

export const OFFLINE: ConnectionState = { ...ONLINE, phase: 'offline', attempt: 2 };

/** Runs `build` with a game maker whose games are all disposed of once it returns. */
function withGames<T>(build: (create: CreateGame) => T): T {
  const made: Game[] = [];
  try {
    return build((seed) => {
      const game = createGame(seed);
      made.push(game);
      return game;
    });
  } finally {
    for (const game of made) game.dispose();
  }
}

/** What an online client in `seat` holds for `game`, facing a named, connected opponent. */
const onlineState = (
  game: Game,
  seat: Seat,
  extra: Partial<GameClientState> = {},
): GameClientState => ({
  ...stateFor(game, seat),
  room: ROOM,
  pin: PIN,
  opponent: { connected: true, name: names.opponent },
  ...extra,
});

type PlanCommand = Extract<Command, { submit_plan: unknown }>;

const isPlan = (cmd: Command): cmd is PlanCommand =>
  typeof cmd === 'object' && 'submit_plan' in cmd;

/** The first legal plan for `character` with exactly `targets` target cards. */
export function planOf(legal: Command[], character: Character, targets: number): PlanCommand {
  const plan = legal.find(
    (cmd): cmd is PlanCommand =>
      isPlan(cmd) &&
      cmd.submit_plan.character === character &&
      cmd.submit_plan.targets.length === targets,
  );
  if (plan === undefined) throw new Error(`no ${character} plan with ${targets} targets`);
  return plan;
}

/** The first seat the engine waits on. */
function pendingSeat(game: Game): Seat {
  const seat = game.pending().seats[0];
  if (seat === undefined) throw new Error('nobody can act');
  return seat;
}

/** The plan phase: this seat holds the Knight, and the opponent has sealed a one-target plan. */
export const planState = (extra: Partial<GameClientState> = {}): GameClientState =>
  withGames((create) => {
    const game = gameDealing('p0', ['knight'], create);
    const theirs = game.legalActions('p1').find((c) => isPlan(c) && c.submit_plan.targets.length);
    if (theirs === undefined) throw new Error('no plan for the opponent');
    game.apply('p1', theirs);
    return onlineState(game, 'p0', extra);
  });

/** The plan phase with this seat's plan sealed, waiting for the opponent's. */
export const sealedPlanState = (): GameClientState =>
  withGames((create) => {
    const game = gameDealing('p0', ['knight'], create);
    game.apply('p0', planOf(game.legalActions('p0'), 'knight', 1));
    return onlineState(game, 'p0');
  });

/** Both plans sealed, with this seat to place Hourglasses first. */
export const hourglassState = (): GameClientState =>
  withGames((create) => {
    const game = create(12);
    for (const seat of ['p0', 'p1'] as const) {
      const plan = game.legalActions(seat)[0];
      if (plan === undefined) throw new Error('no plan offered');
      game.apply(seat, plan);
    }
    return onlineState(game, pendingSeat(game));
  });

/** A game waiting on a seat for `kind`, reached by playing `character` with targets whenever offered. */
const reaching = (kind: PendingKind, character: Character): GameClientState =>
  withGames((create) => {
    for (let seed = 1; seed < 500; seed++) {
      const game = create(seed);
      try {
        playUntil(
          game,
          () => [kind, 'none'].includes(game.pending().kind),
          (legal) =>
            legal.find(
              (c) =>
                isPlan(c) && c.submit_plan.character === character && c.submit_plan.targets.length,
            ) ?? legal.find((c) => c !== 'resign'),
        );
      } catch {
        continue;
      }
      if (game.pending().kind === kind) return onlineState(game, pendingSeat(game));
    }
    throw new Error(`no seed reaches ${kind}`);
  });

export const potionState = (): GameClientState => reaching('choose_potion_target', 'witch');

export const hunterState = (): GameClientState => reaching('hunter_choice', 'hunter');

/** The end of the first round, its showdown played out. */
export const roundOverState = (extra: Partial<GameClientState> = {}): GameClientState =>
  withGames((create) => {
    const game = create(12);
    playUntil(game, () => game.pending().kind === 'next_round');
    return onlineState(game, 'p1', extra);
  });

/** The end of a first round in which a character was eliminated before it could act. */
export const eliminationState = (): GameClientState =>
  withGames((create) => {
    for (let seed = 1; seed < 500; seed++) {
      const game = create(seed);
      // The second seat to plan aims at the character the first one played.
      playUntil(
        game,
        () => game.pending().kind === 'next_round' || isGameOver(game),
        (legal) => {
          const played = game
            .view('omniscient')
            .players.map((p) =>
              typeof p.plan === 'object' && 'revealed' in p.plan ? p.plan.revealed.character : null,
            )
            .find((c) => c !== null);
          return (
            legal.find(
              (c) =>
                isPlan(c) &&
                c.submit_plan.targets.some((t) => t !== 'fool' && t.character === played),
            ) ?? legal.find((c) => c !== 'resign')
          );
        },
      );
      if (game.pending().kind !== 'next_round') continue;
      const eliminated = game
        .eventsSince(0, { seat: 'p1' })
        .some(
          ([, event]) =>
            'attack_hit' in event.kind ||
            ('potion_resolved' in event.kind && event.kind.potion_resolved.hit),
        );
      if (eliminated) return onlineState(game, 'p1');
    }
    throw new Error('no seed eliminates a character in the first round');
  });

const isGameOver = (game: Game): boolean => {
  const { phase } = game.view({ seat: 'p0' });
  return typeof phase === 'object' && 'game_over' in phase;
};

export const pausedState = (): GameClientState =>
  roundOverState({
    legal: [],
    pause: { requestedBy: 'p0', agreed: true, paused: true, resumeReady: [] },
  });

export const rejoinRequestState = (): GameClientState =>
  planState({ rejoinRequested: true, rejoinDeadline: GALLERY_NOW + 2 * MINUTE_MS });

export const opponentAwayState = (): GameClientState =>
  planState({
    opponent: {
      connected: false,
      name: names.opponent,
      grace_deadline: GALLERY_NOW + 5 * MINUTE_MS,
    },
  });

/** The opponent stayed away past the grace period, so the win can be claimed. */
export const opponentGoneState = (): GameClientState =>
  planState({ opponent: { connected: false, name: names.opponent, can_claim_win: true } });

export const gameOverState = (): GameClientState =>
  withGames((create) => {
    const game = finishedGame(3, create);
    return onlineState(game, 'p0', {
      status: 'game_over',
      legal: [],
      replay: game.replay(),
      replayVerified: true,
    });
  });

/** The creator's client, seated, before anyone else has joined. */
export const waitingState = (): GameClientState =>
  withGames((create) => ({
    ...onlineState(create(1), 'p0'),
    status: 'waiting',
    opponent: { connected: false },
    view: null,
    legal: [],
    pending: null,
    events: [],
    lastSeq: 0,
  }));

const store = (): DeviceStore => {
  const current = getDeviceStore();
  if (current === undefined) throw new Error('the gallery has no device store');
  return current;
};

/** Offers to install the app, as a browser that can install it does; returns how to stop. */
export function offerInstall(): () => void {
  const stop = listenForInstall();
  const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
  });
  window.dispatchEvent(offer);
  return stop;
}

/** An iPhone's Safari, which installs from its Share menu; returns how to take that back. */
export function offerIosInstall(): () => void {
  const real = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const stop = listenForInstall();
  return () => {
    stop();
    if (real === undefined) delete (navigator as { userAgent?: string }).userAgent;
    else Object.defineProperty(navigator, 'userAgent', real);
  };
}

/** Reports a new version of the app waiting to be loaded; returns how to take that back. */
export function offerUpdate(): () => void {
  const inactive = (): Promise<void> => Promise.resolve();
  watchForUpdates((hooks) => {
    hooks.onNeedRefresh();
    return inactive;
  });
  return () => watchForUpdates(() => inactive);
}

export async function nameThisDevice(): Promise<void> {
  const identity = await store().identity.get();
  await store().identity.put({ ...identity, displayName: names.mine });
}

const session = (
  room: string,
  opponentName: string,
  status: SessionRecord['status'],
  savedAt: number,
  extra: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: sessionId(DEFAULT_SERVER, room),
  server: DEFAULT_SERVER,
  room,
  seatToken: 'a'.repeat(32),
  seat: 'p0',
  lastSeq: 12,
  game: 0,
  status,
  opponentName,
  savedAt,
  ...extra,
});

/** A returning player: named, with a paused and an active game, past their first finished game. */
export async function returningPlayer(): Promise<void> {
  await nameThisDevice();
  await patchSettings({ firstGameFinished: true }, store());
  await store().sessions.put(
    session(ROOM, names.opponent, 'paused', GALLERY_NOW - 2 * HOUR_MS, { round: 2 }),
  );
  await store().sessions.put(
    session('Q4TR8N', names.other, 'active', GALLERY_NOW - 10 * MINUTE_MS, {
      round: 4,
      yourTurn: true,
    }),
  );
}

/** Three finished games against two opponents, kept in the history. */
export async function pastGames(): Promise<void> {
  const records = withGames((create): HistoryRecord[] =>
    [
      { seed: 3, seat: 'p0' as const, opponentName: names.opponent, day: 20 },
      { seed: 5, seat: 'p1' as const, opponentName: names.other, day: 21 },
      { seed: 7, seat: 'p0' as const, opponentName: names.opponent, day: 22 },
    ].map(({ seed, seat, opponentName, day }, game) =>
      recordFrom(finishedGame(seed, create), seat, historyId(DEFAULT_SERVER, ROOM, game), {
        opponentName,
        finishedAt: Date.UTC(2026, 10, day, 19, 30),
      }),
    ),
  );
  for (const record of records) await store().history.put(record);
}

/** The id of the first game `pastGames` keeps. */
export const FIRST_PAST_GAME = historyId(DEFAULT_SERVER, ROOM, 0);

/** The id of the game `hunterGame` keeps. */
export const HUNTER_PAST_GAME = historyId(DEFAULT_SERVER, ROOM, 9);

/** The replay step of `hunterGame` at which a Hunter, after its owner's choice, eliminates a character. */
export const HUNTER_STEP = 83;

/** Keeps a past game in which a Hunter's choice leads to an elimination, at step `HUNTER_STEP`. */
export async function hunterGame(): Promise<void> {
  const record = withGames((create) =>
    recordFrom(finishedGame(41, create), 'p0', HUNTER_PAST_GAME, {
      opponentName: names.opponent,
      finishedAt: Date.UTC(2026, 10, 23, 19, 30),
    }),
  );
  await store().history.put(record);
}
