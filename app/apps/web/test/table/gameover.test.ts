import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig, type Game, type Seat } from '@wwd/engine';
import { createLocaliser, type GameClientState } from '@wwd/client-core';
import type { ServerMessage } from '@wwd/protocol';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { DEFAULT_SERVER } from '../../src/online.js';
import { historyId } from '../../src/saves.js';
import JoinOnline from '../../src/screens/JoinOnline.svelte';
import Table from '../../src/screens/Table.svelte';
import { initSessions, resetSessions } from '../../src/session.js';
import { characterName, instructionText } from '../../src/text.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { FakeWebSocket } from '../fake-socket.js';
import { newGame, playUntil, stateFor } from '../games.js';

const localiser = createLocaliser('en');
const TOKEN = 'c'.repeat(32);
const ROOM = 'K7Q2MX';
// A finished game's first screen can take over a second while other test files build the app.
const FIRST_SCREEN = { timeout: 5_000 };

const isOver = (game: Game): boolean => {
  const { phase } = game.view({ seat: 'p0' });
  return typeof phase === 'object' && 'game_over' in phase;
};

/**
 * A game played to its end, each seat choosing a pseudo-random legal command other than
 * resigning; `before` sees the game before each command.
 */
function finished(seed: number, before?: (game: Game) => void): Game {
  const game = newGame(seed);
  let pick = seed;
  for (let step = 0; !isOver(game); step++) {
    if (step > 5000) throw new Error('the game did not end');
    before?.(game);
    const seat = game.pending().seats[0];
    const legal = seat === undefined ? [] : game.legalActions(seat).filter((c) => c !== 'resign');
    pick = (pick * 1103515245 + 12345) % 2147483648;
    const cmd = legal[pick % legal.length];
    if (seat === undefined || cmd === undefined) throw new Error('nobody can act');
    game.apply(seat, cmd);
  }
  return game;
}

/** What the referee sends a seat that reconnects to a finished game. */
function finishedWelcome(game: Game, seat: Seat, index = 0): ServerMessage[] {
  return [
    {
      type: 'welcome',
      seat,
      seat_token: TOKEN,
      room: ROOM,
      config: defaultRulesConfig(),
      pin: '1234',
      game: index,
    },
    {
      type: 'events',
      game: index,
      from_seq: 0,
      events: game.eventsSince(0, { seat }),
      view: game.view({ seat }),
      legal: [],
      pending: game.pending(),
    },
    { type: 'game_over', replay: game.replay() },
    { type: 'pause_status', requested_by: null, agreed: false },
    { type: 'rematch_status', ready: [] },
    { type: 'opponent_status', connected: true, name: 'Mika' },
  ];
}

/** Steps through the final showdown, which a game ending in one seen live shows before its result. */
async function catchUp(): Promise<void> {
  await screen.findByTestId('showdown', {}, FIRST_SCREEN);
  for (
    let next = screen.queryByTestId('showdown-next');
    next !== null;
    next = screen.queryByTestId('showdown-next')
  ) {
    await userEvent.click(next);
  }
}

const socket = (): FakeWebSocket => {
  const latest = FakeWebSocket.instances.at(-1);
  if (latest === undefined) throw new Error('no socket was opened');
  return latest;
};

describe('game over', () => {
  let store: DeviceStore;
  const persist = vi.fn(() => Promise.resolve(true));

  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
    persist.mockClear();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    store = await openDeviceStore();
    await store.identity.put({ deviceId: 'device', displayName: 'Ada' });
    setDeviceStore(store);
    await initSessions(store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDeviceStore();
    resetSessions();
    Reflect.deleteProperty(navigator, 'storage');
    location.hash = '';
  });

  it("view replay opens the finished game's replay", async () => {
    const game = finished(12);
    render(JoinOnline, { props: { localiser, code: ROOM } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    for (const msg of finishedWelcome(game, 'p1')) socket().receive(msg);
    const button = await screen.findByTestId('view-replay', {}, FIRST_SCREEN);
    await userEvent.setup().click(button);
    expect(location.hash).toBe(
      `#/history/${encodeURIComponent(historyId(DEFAULT_SERVER, ROOM, 0))}`,
    );
  });

  it('game over writes history once', async () => {
    const game = finished(12);
    const first = render(JoinOnline, { props: { localiser, code: ROOM } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    // The game ends while this seat plays, so the opponent's name is already known.
    const [welcome, events, gameOver] = finishedWelcome(game, 'p1');
    for (const msg of [
      welcome!,
      { type: 'opponent_status', connected: true, name: 'Mika' } as const,
      events!,
      gameOver!,
    ]) {
      socket().receive(msg);
    }
    // A game that was already over when this screen opened shows its result at once.
    expect(await screen.findByTestId('game-over', {}, FIRST_SCREEN)).toBeTruthy();
    expect(screen.queryByTestId('showdown')).toBeNull();

    const id = historyId(DEFAULT_SERVER, ROOM, 0);
    await waitFor(async () => expect(await store.history.list()).toHaveLength(1));
    const [record] = await store.history.list();
    const { phase } = game.view({ seat: 'p1' });
    if (typeof phase !== 'object' || !('game_over' in phase)) throw new Error('not over');
    expect(record).toMatchObject({
      id,
      seat: 'p1',
      opponentName: 'Mika',
      winner: phase.game_over.winner,
      reason: phase.game_over.reason,
      rounds: game.view({ seat: 'p1' }).round,
      config: defaultRulesConfig(),
    });
    expect(record?.replay).toEqual(game.replay());
    await waitFor(async () => expect((await store.settings.get()).firstGameFinished).toBe(true));
    expect(persist).toHaveBeenCalledOnce();
    first.unmount();

    render(JoinOnline, { props: { localiser, code: ROOM } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    for (const msg of finishedWelcome(game, 'p1')) socket().receive(msg);
    expect(await screen.findByTestId('game-over')).toBeTruthy();
    expect(screen.queryByTestId('showdown')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await store.history.list()).toEqual([record]);
    expect(persist).toHaveBeenCalledOnce();

    // A rematch is a game of its own, with a record of its own.
    const rematch = finished(13);
    socket().receive({ type: 'rematch_status', ready: ['p0'] });
    expect(await screen.findByText('Your opponent wants a rematch.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(socket().messages().at(-1)).toEqual({ type: 'rematch_request' });
    for (const msg of finishedWelcome(rematch, 'p1', 1).slice(1, 3)) socket().receive(msg);
    await waitFor(async () => expect(await store.history.list()).toHaveLength(2));
    expect((await store.history.list()).map((r) => r.id).sort()).toEqual(
      [id, historyId(DEFAULT_SERVER, ROOM, 1)].sort(),
    );
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe('game over panel', () => {
  const ended = (game: Game, seat: Seat): GameClientState => ({
    ...stateFor(game, seat),
    status: 'game_over',
    legal: [],
    replayVerified: true,
  });

  function over(seed: number, seat: Seat): GameClientState {
    return ended(finished(seed), seat);
  }

  /** The table just before a game's last command, and once it has ended, as seen live. */
  function lastCommand(seed: number, seat: Seat): [GameClientState, GameClientState] {
    let before: GameClientState | undefined;
    const game = finished(seed, (g) => {
      before = stateFor(g, seat);
    });
    return [before!, ended(game, seat)];
  }

  it('shows the result, how it was won and my markers', () => {
    const state = over(12, 'p0');
    render(Table, {
      props: { localiser, state, onCommand: () => {}, onRematch: () => {}, onViewReplay: () => {} },
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Game over' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByTestId('phase-bar')).toBeNull();
    const result = within(screen.getByTestId('game-over-result'));
    const phase = state.view?.phase;
    if (typeof phase !== 'object' || phase === null || !('game_over' in phase)) {
      throw new Error('not over');
    }
    const won = phase.game_over.winner === 'p0';
    expect(result.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(
      won ? 'You win!' : 'You lose.',
    );
    expect(result.getByTestId('game-over-how').textContent?.trim()).toMatch(
      new RegExp(`in round ${state.view!.round}\\.$`),
    );
    const me = state.view!.players[0];
    expect(
      within(result.getByTestId('game-over-markers'))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      expect.stringMatching(new RegExp(`\\b${me.health}$`)),
      expect.stringMatching(new RegExp(`\\b${me.cross}$`)),
      expect.stringMatching(new RegExp(`\\b${me.fang}$`)),
    ]);
    expect(screen.queryByTestId('replay-verified')).toBeNull();
    const shown = screen.getByTestId('game-over').textContent;
    expect(shown).not.toMatch(/game record/);
    expect(shown).not.toMatch(/Play again in the same room/);
    expect(screen.getByRole('button', { name: 'Rematch' }).hasAttribute('aria-describedby')).toBe(
      false,
    );
    const actions = screen
      .getAllByRole('button')
      .filter((b) => b.closest('[data-testid="game-over"]'));
    expect(actions.map((b) => b.textContent?.trim())).toEqual(['View replay', 'Rematch']);
  });

  it('a game already over when the table opens shows the result at once, without its showdown', () => {
    const state = over(12, 'p0');
    expect(state.view?.showdown).not.toBeNull();
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.getByTestId('game-over')).toBeTruthy();
    expect(screen.queryByTestId('showdown')).toBeNull();
  });

  it('game over shows the unofficial notice at the foot of the screen', () => {
    render(Table, { props: { localiser, state: over(12, 'p0'), onCommand: () => {} } });
    expect(screen.queryByRole('button', { name: 'Game menu' })).toBeNull();
    const notices = screen.getAllByTestId('unofficial-notice');
    expect(notices).toHaveLength(1);
    expect(notices[0]!.textContent?.trim()).toBe(localiser.t('footer-unofficial'));
    expect(notices[0]!.closest('[data-part="note"]')?.parentElement?.dataset['part']).toBe(
      'screen',
    );
  });

  it('a game that ends in a showdown seen live shows its results before the result', async () => {
    const [before, after] = lastCommand(12, 'p0');
    const props = { localiser, onCommand: () => {} };
    const view = render(Table, { props: { ...props, state: before } });
    await view.rerender({ ...props, state: after });
    expect(screen.getByTestId('showdown')).toBeTruthy();
    expect(screen.queryByTestId('game-over')).toBeNull();
    expect(screen.getByTestId('showdown-next')).toBeTruthy();
    // The bar and the phase bar both name the showdown until the result is shown.
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
      `Round ${after.view!.round} · Showdown`,
    );
    expect(screen.getByTestId('phase-step').textContent?.trim()).toBe('Showdown');
    expect(screen.getByTestId('phase-bar').textContent).not.toMatch(/Game over/);
    await catchUp();
    expect(screen.getByTestId('game-over')).toBeTruthy();
    expect(screen.queryByTestId('showdown')).toBeNull();
    expect(document.activeElement?.textContent?.trim()).toMatch(/^You (win!|lose\.)$/);
  });

  it('a resignation during a showdown shows the result at once, saying who resigned', async () => {
    const game = newGame(12);
    playUntil(game, () => game.view({ seat: 'p0' }).phase === 'round_over');
    const props = { localiser, onCommand: () => {} };
    const view = render(Table, { props: { ...props, state: stateFor(game, 'p0') } });
    expect(screen.getByTestId('showdown')).toBeTruthy();
    game.apply('p1', 'resign');
    const after = ended(game, 'p0');
    expect(after.view?.showdown).not.toBeNull();
    await view.rerender({ ...props, state: after });
    expect(screen.getByTestId('game-over')).toBeTruthy();
    expect(screen.queryByTestId('showdown')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe('You win!');
    expect(screen.getByTestId('game-over-how').textContent?.trim()).toBe(
      'Your opponent resigned in round 1.',
    );
  });

  it('the final-showdown instruction is given only after a final showdown', () => {
    expect(instructionText(localiser, over(12, 'p0'))).toBe("The last round's results are in.");
    const game = newGame(12);
    playUntil(game, () => game.view({ seat: 'p0' }).phase === 'round_over');
    game.apply('p1', 'resign');
    const resigned = ended(game, 'p0');
    expect(resigned.view?.showdown).not.toBeNull();
    expect(instructionText(localiser, resigned)).toBe('Game over');
  });

  it("game over never names the opponent's hidden cards", () => {
    const game = newGame(12);
    game.apply('p1', 'resign');
    const state = ended(game, 'p0');
    expect(state.view?.players[1].hand).toBeNull();
    const mine = new Set(state.view?.players[0].hand ?? []);
    const hidden = (game.view('omniscient').players[1].hand ?? []).filter((c) => !mine.has(c));
    expect(hidden.length).toBeGreaterThan(0);
    render(Table, {
      props: { localiser, state, onCommand: () => {}, onRematch: () => {}, onViewReplay: () => {} },
    });
    expect(screen.getByTestId('game-over')).toBeTruthy();
    const shown = document.body.textContent ?? '';
    for (const c of hidden) expect(shown).not.toContain(characterName(localiser, c));
  });

  it("shows the opponent's readiness and keeps Rematch in place once asked", async () => {
    const onRematch = vi.fn();
    const state = over(12, 'p0');
    const props = { localiser, onCommand: () => {}, onRematch };
    const view = render(Table, { props: { ...props, state } });
    const status = screen.getByTestId('rematch-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent?.trim()).toBe('');

    await view.rerender({ ...props, state: { ...state, rematchReady: ['p1'] } });
    expect(status.textContent?.trim()).toBe('Your opponent wants a rematch.');
    expect(status.querySelector('[data-part="spinner"]')).toBeNull();
    const button = screen.getByRole('button', { name: 'Rematch' });
    await userEvent.click(button);
    expect(onRematch).toHaveBeenCalledOnce();

    await view.rerender({ ...props, state: { ...state, rematchReady: ['p0'] } });
    expect(status.textContent?.trim()).toBe('You asked for a rematch. Waiting for your opponent.');
    expect(status.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);
    expect(onRematch).toHaveBeenCalledOnce();
  });

  it('announces a rematch and leaves Rematch out when the table is not told how', async () => {
    const state = over(12, 'p0');
    const view = render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull();
    const next = { ...stateFor(newGame(14), 'p0'), game: 1 };
    await view.rerender({ localiser, state: next, onCommand: () => {} });
    expect(screen.queryByTestId('game-over')).toBeNull();
    expect(screen.getByTestId('game-announcement').textContent?.trim()).toBe(
      'Rematch started: game 2 in this room.',
    );
  });
});
