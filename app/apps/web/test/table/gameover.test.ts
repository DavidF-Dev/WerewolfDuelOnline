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
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { FakeWebSocket } from '../fake-socket.js';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');
const TOKEN = 'c'.repeat(32);
const ROOM = 'K7Q2MX';

const isOver = (game: Game): boolean => {
  const { phase } = game.view({ seat: 'p0' });
  return typeof phase === 'object' && 'game_over' in phase;
};

/** A game played to its end, each seat choosing a pseudo-random legal command other than resigning. */
function finished(seed: number): Game {
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
    const button = await screen.findByTestId('view-replay');
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
    expect(await screen.findByTestId('game-over')).toBeTruthy();

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
  function over(seed: number, seat: Seat): GameClientState {
    const game = finished(seed);
    return { ...stateFor(game, seat), status: 'game_over', legal: [], replayVerified: true };
  }

  it('shows the result, how it was won and the round summary', () => {
    const state = over(12, 'p0');
    render(Table, { props: { localiser, state, onCommand: () => {}, onRematch: () => {} } });
    const panel = within(screen.getByTestId('game-over'));
    expect(panel.getByRole('heading', { name: 'Game over' })).toBeTruthy();
    expect(screen.getByTestId('game-over-result').textContent).toMatch(/^(You|Your opponent) win/);
    expect(screen.getByTestId('replay-verified').textContent).toBe(
      'The game record was checked and matches what you saw.',
    );
    expect(screen.getByText(`Round ${state.view?.round} summary`)).toBeTruthy();
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
    const button = screen.getByRole('button', { name: 'Rematch' });
    await userEvent.click(button);
    expect(onRematch).toHaveBeenCalledOnce();

    await view.rerender({ ...props, state: { ...state, rematchReady: ['p0'] } });
    expect(status.textContent?.trim()).toBe('You asked for a rematch. Waiting for your opponent.');
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
