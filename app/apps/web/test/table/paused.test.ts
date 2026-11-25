import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig, type Game, type Seat } from '@wwd/engine';
import { createLocaliser, type GameClientState } from '@wwd/client-core';
import { saveHash, type SaveFile, type ServerMessage } from '@wwd/protocol';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { DEFAULT_SERVER } from '../../src/online.js';
import Home from '../../src/screens/Home.svelte';
import JoinOnline from '../../src/screens/JoinOnline.svelte';
import Table from '../../src/screens/Table.svelte';
import { routeFor } from '../../src/router.js';
import {
  initSessions,
  loadOnlineSession,
  markResumedAs,
  resetSessions,
  saveOnlineSession,
} from '../../src/session.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { sessionId } from '../../src/storage/sessions.js';
import { FakeWebSocket } from '../fake-socket.js';
import { newGame, playUntil, stateFor } from '../games.js';

const localiser = createLocaliser('en');
const TOKEN = 'c'.repeat(32);
const OLD = 'K7Q2MX';
const NEW = 'NEWRMS';

let store: DeviceStore;

beforeEach(async () => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  store = await openDeviceStore();
  await store.clearAll();
  await store.identity.put({ deviceId: 'device', displayName: 'Ada' });
  setDeviceStore(store);
  await initSessions(store);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDeviceStore();
  resetSessions();
  location.hash = '';
});

const socket = (): FakeWebSocket => {
  const latest = FakeWebSocket.instances.at(-1);
  if (latest === undefined) throw new Error('no socket was opened');
  return latest;
};

/** A game at the end of its first round, before either seat has asked for the next. */
function atRoundOver(): Game {
  const game = newGame(12);
  playUntil(game, () => game.view({ seat: 'p0' }).phase === 'round_over');
  return game;
}

function saveOf(game: Game, room: string): SaveFile {
  const boundary = game.roundBoundary();
  if (boundary === null) throw new Error('expected a round boundary');
  const fields: Omit<SaveFile, 'hash'> = {
    format_version: 1,
    kind: 'wwd-save',
    room,
    config: defaultRulesConfig(),
    boundary,
    replay: game.replay(),
    saved_at: 1000,
  };
  return { ...fields, hash: saveHash(fields) };
}

/** What the referee sends a seat that joins a paused room, as far as the opponent's status. */
function pausedWelcome(game: Game, room: string, seat: Seat, connected: boolean): ServerMessage[] {
  return [
    {
      type: 'welcome',
      seat,
      seat_token: TOKEN,
      room,
      config: defaultRulesConfig(),
      pin: '1234',
      game: 0,
    },
    {
      type: 'events',
      game: 0,
      from_seq: 0,
      events: game.eventsSince(0, { seat }),
      view: game.view({ seat }),
      legal: game.legalActions(seat),
      pending: game.pending(),
    },
    { type: 'pause_status', requested_by: 'p0', agreed: true },
    { type: 'paused', save: saveOf(game, room) },
    { type: 'resume_status', ready: [] },
    { type: 'opponent_status', connected },
  ];
}

describe('paused games', () => {
  it('paused session shows on home', async () => {
    const game = atRoundOver();
    const view = render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    for (const msg of pausedWelcome(game, OLD, 'p1', true)) socket().receive(msg);

    expect(await screen.findByRole('heading', { name: 'Game paused' })).toBeTruthy();
    // The heading takes focus and says it once; the status region stays quiet.
    expect(screen.getByTestId('pause-announcement').textContent).toBe('');
    const id = sessionId(DEFAULT_SERVER, OLD);
    await waitFor(async () => expect((await store.sessions.get(id))?.status).toBe('paused'));
    const stored = await store.sessions.get(id);
    expect(stored?.save).toEqual(saveOf(game, OLD));
    expect(stored?.seat).toBe('p1');
    view.unmount();

    render(Home, { props: { localiser } });
    const region = await screen.findByRole('region', { name: 'Continue' });
    expect(within(region).getByTestId('home-session').textContent).toContain('Paused');
  });

  it('resume from save offers a new room when the old one is gone', async () => {
    const game = atRoundOver();
    const save = saveOf(game, OLD);
    await store.sessions.put({
      id: sessionId(DEFAULT_SERVER, OLD),
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p1',
      lastSeq: 9,
      game: 0,
      status: 'paused',
      save,
      savedAt: Date.now(),
    });
    resetSessions();
    await initSessions(store);
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ code: NEW }), { status: 201 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const old = render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    await user.click(await screen.findByRole('button', { name: 'Resume from save' }));
    await waitFor(() => expect(location.hash).toBe(`#/join/${NEW}?seat=p1`));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_SERVER}/rooms`);
    expect(JSON.parse(String(init.body))).toEqual({ save, seat: 'p1', grace_minutes: 10 });
    expect(
      loadOnlineSession(DEFAULT_SERVER, OLD),
      'kept until the new seat is stored',
    ).toBeDefined();
    old.unmount();

    render(JoinOnline, { props: { localiser, code: NEW, seat: 'p1' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    expect(socket().messages()[0]).toMatchObject({ type: 'hello', room: NEW, seat: 'p1' });
    expect(socket().messages()[0]).not.toHaveProperty('seat_token');
    for (const msg of pausedWelcome(game, NEW, 'p1', false)) socket().receive(msg);

    const panel = await screen.findByTestId('pause-panel');
    expect(within(panel).getByText('Invite your opponent')).toBeTruthy();
    expect(
      within(panel).getByText(
        'Share the code or the link with your opponent. The game is paused: it continues once they join and you both choose "Resume".',
      ),
    ).toBeTruthy();
    expect(within(panel).queryByText(/The game starts when they join/)).toBeNull();
    await waitFor(async () =>
      expect(await store.sessions.get(sessionId(DEFAULT_SERVER, OLD))).toBeUndefined(),
    );
    expect(loadOnlineSession(DEFAULT_SERVER, OLD)).toBeUndefined();
    const replacement = await store.sessions.get(sessionId(DEFAULT_SERVER, NEW));
    expect(replacement).toMatchObject({ seatToken: TOKEN, seat: 'p1', status: 'paused' });
    expect(within(panel).getByText('NEW·RMS')).toBeTruthy();
    // The restored markers are on the table before anyone resumes.
    expect(screen.getByRole('region', { name: /^You:/ })).toBeTruthy();

    socket().receive({ type: 'opponent_status', connected: true });
    await waitFor(() => expect(within(panel).queryByText('Invite your opponent')).toBeNull());
    await user.click(
      within(screen.getByTestId('phase-bar')).getByRole('button', { name: 'Resume' }),
    );
    expect(socket().messages().at(-1)).toEqual({ type: 'resume_request' });
  });

  it('a tab closed before the new room welcomes it keeps the old seat', async () => {
    const game = atRoundOver();
    await store.sessions.put({
      id: sessionId(DEFAULT_SERVER, OLD),
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p1',
      lastSeq: 9,
      game: 0,
      status: 'paused',
      save: saveOf(game, OLD),
      savedAt: Date.now(),
    });
    resetSessions();
    await initSessions(store);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: NEW }), { status: 201 }))),
    );
    const old = render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    await userEvent.click(await screen.findByRole('button', { name: 'Resume from save' }));
    await waitFor(() => expect(location.hash).toContain(NEW));
    old.unmount();

    const fresh = render(JoinOnline, { props: { localiser, code: NEW, seat: 'p1' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    // The tab closes before the new room answers.
    fresh.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const kept = await store.sessions.get(sessionId(DEFAULT_SERVER, OLD));
    expect(kept).toMatchObject({
      status: 'paused',
      seat: 'p1',
      save: saveOf(game, OLD),
      resumedAs: NEW,
    });

    // Continue then goes on in the room the save continues in.
    render(Home, { props: { localiser } });
    const region = await screen.findByRole('region', { name: 'Continue' });
    expect(within(region).getByRole('link').getAttribute('href')).toBe(`#/join/${NEW}?seat=p1`);
  });

  it('resume from save is still offered when the resumed room is gone', async () => {
    const game = atRoundOver();
    const id = sessionId(DEFAULT_SERVER, OLD);
    await store.sessions.put({
      id,
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p1',
      lastSeq: 9,
      game: 0,
      status: 'paused',
      save: saveOf(game, OLD),
      resumedAs: NEW,
      savedAt: Date.now() - 1000,
    });
    resetSessions();
    await initSessions(store);

    const gone = render(JoinOnline, { props: { localiser, code: NEW, seat: 'p1' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    await waitFor(async () => expect((await store.sessions.get(id))?.resumedAs).toBeUndefined());
    expect(await store.sessions.get(id)).toMatchObject({
      status: 'paused',
      save: saveOf(game, OLD),
    });
    gone.unmount();

    const home = render(Home, { props: { localiser } });
    const region = await screen.findByRole('region', { name: 'Continue' });
    expect(within(region).getByRole('link').getAttribute('href')).toBe(`#/join/${OLD}`);
    home.unmount();

    render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    expect(await screen.findByRole('button', { name: 'Resume from save' })).toBeTruthy();
  });

  it('a seat never continues in its own room or keeps a note once played', async () => {
    const id = sessionId(DEFAULT_SERVER, OLD);
    await store.sessions.put({
      id,
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p1',
      lastSeq: 9,
      game: 0,
      status: 'active',
      savedAt: Date.now() - 1000,
    });
    resetSessions();
    await initSessions(store);
    expect(await markResumedAs(DEFAULT_SERVER, OLD, OLD)).toBe(false);
    expect((await store.sessions.get(id))?.resumedAs).toBeUndefined();

    expect(await markResumedAs(DEFAULT_SERVER, OLD, NEW)).toBe(true);
    expect((await store.sessions.get(id))?.resumedAs).toBe(NEW);
    expect(
      await saveOnlineSession({ room: OLD, seatToken: TOKEN, server: DEFAULT_SERVER, lastSeq: 10 }),
    ).toBe(true);
    expect(await store.sessions.get(id)).not.toHaveProperty('resumedAs');
  });

  it('a join link cannot delete another session', async () => {
    const game = atRoundOver();
    const active = {
      id: sessionId(DEFAULT_SERVER, 'ABCDEF'),
      server: DEFAULT_SERVER,
      room: 'ABCDEF',
      seatToken: 'd'.repeat(32),
      seat: 'p0' as const,
      lastSeq: 4,
      game: 0,
      status: 'active' as const,
      savedAt: Date.now(),
    };
    const paused = {
      ...active,
      id: sessionId(DEFAULT_SERVER, OLD),
      room: OLD,
      status: 'paused' as const,
      save: saveOf(game, OLD),
    };
    await store.sessions.put(active);
    await store.sessions.put(paused);
    resetSessions();
    await initSessions(store);

    // Whatever the link adds, the screen is told only the room, the server and the seat.
    const route = routeFor(`#/join/${NEW}?seat=p1&replaces=${OLD}&resumedAs=${NEW}&from=ABCDEF`);
    expect(route).toEqual({ name: 'join', code: NEW, seat: 'p1' });
    if (route.name !== 'join') throw new Error('not a join route');
    const { name: _name, ...address } = route;
    render(JoinOnline, { props: { localiser, ...address } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    for (const msg of pausedWelcome(game, NEW, 'p1', false)) socket().receive(msg);
    await waitFor(async () =>
      expect(await store.sessions.get(sessionId(DEFAULT_SERVER, NEW))).toBeDefined(),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await store.sessions.get(active.id)).toEqual(active);
    expect(await store.sessions.get(paused.id)).toEqual(paused);
    expect(loadOnlineSession(DEFAULT_SERVER, OLD)).toBeDefined();
    expect(loadOnlineSession(DEFAULT_SERVER, 'ABCDEF')).toBeDefined();
  });

  it('shows a spinner while the room for the save is created', async () => {
    const game = atRoundOver();
    await store.sessions.put({
      id: sessionId(DEFAULT_SERVER, OLD),
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p0',
      lastSeq: 9,
      game: 0,
      status: 'paused',
      save: saveOf(game, OLD),
      savedAt: Date.now(),
    });
    resetSessions();
    await initSessions(store);
    let respond: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    );
    render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    const panel = await screen.findByTestId('saved-game');
    expect(panel.querySelector('[data-part="spinner"]')).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: 'Resume from save' }));
    const status = within(panel).getByText('Creating a room from the save');
    expect(status.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    respond(new Response(JSON.stringify({ error: 'invalid_save' }), { status: 400 }));
    await screen.findByTestId('resume-from-save-problem');
    expect(panel.querySelector('[data-part="spinner"]')).toBeNull();
  });

  it('a refused save is explained', async () => {
    const game = atRoundOver();
    await store.sessions.put({
      id: sessionId(DEFAULT_SERVER, OLD),
      server: DEFAULT_SERVER,
      room: OLD,
      seatToken: TOKEN,
      seat: 'p0',
      lastSeq: 9,
      game: 0,
      status: 'paused',
      save: saveOf(game, OLD),
      savedAt: Date.now(),
    });
    resetSessions();
    await initSessions(store);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'invalid_save' }), { status: 400 })),
      ),
    );
    render(JoinOnline, { props: { localiser, code: OLD } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    await userEvent.click(await screen.findByRole('button', { name: 'Resume from save' }));
    expect((await screen.findByTestId('resume-from-save-problem')).textContent).toBe(
      "The game server didn't accept the save.",
    );
    expect(loadOnlineSession(DEFAULT_SERVER, OLD)).toBeDefined();
  });
});

describe('pause panel', () => {
  const actions = () => ({ accept: vi.fn(), cancel: vi.fn(), resume: vi.fn() });

  function withPause(pause: Partial<GameClientState['pause']>): GameClientState {
    const state = stateFor(newGame(12), 'p1');
    return { ...state, pause: { ...state.pause, ...pause } };
  }

  it('offers the pause in the menu only while none is open', async () => {
    const onPause = vi.fn();
    const props = { localiser, onCommand: () => {}, onPause, pauseActions: actions() };
    const view = render(Table, { props: { ...props, state: withPause({}) } });
    const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Pause after this round' }));
    expect(onPause).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('game-menu'), 'asking to pause closes the menu').toBeNull();

    await view.rerender({ ...props, state: withPause({ requestedBy: 'p1' }) });
    await openMenu();
    expect(screen.getByTestId('game-menu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause after this round' })).toBeNull();
    expect(screen.getByTestId('pause-status').textContent).toBe(
      'You asked to pause after this round. Waiting for your opponent to agree.',
    );
    expect(
      screen
        .getByTestId('pause-status')
        .querySelector('[data-part="spinner"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it("answers the opponent's request and says when an agreed pause applies", async () => {
    const pauseActions = actions();
    const props = { localiser, onCommand: () => {}, pauseActions };
    const view = render(Table, { props: { ...props, state: withPause({ requestedBy: 'p0' }) } });
    const announcement = screen.getByTestId('pause-announcement');
    expect(announcement.getAttribute('role')).toBe('status');
    expect(announcement.textContent).toBe('Your opponent asks to pause after this round.');
    await userEvent.click(screen.getByRole('button', { name: 'Agree to pause' }));
    expect(pauseActions.accept).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(pauseActions.cancel).toHaveBeenCalledOnce();

    await view.rerender({ ...props, state: withPause({ requestedBy: 'p0', agreed: true }) });
    expect(announcement.textContent).toBe('Pause agreed: applies at the end of the round');
    expect(screen.getByTestId('pause-panel').querySelector('[data-part="spinner"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel the pause' })).toBeTruthy();
  });

  it('moves focus to a pause and keeps it on Resume once asked', async () => {
    const pauseActions = actions();
    const base = withPause({ requestedBy: 'p0', agreed: true, paused: true });
    const state = { ...base, legal: [] };
    const props = { localiser, onCommand: () => {}, pauseActions };
    const view = render(Table, { props: { ...props, state } });
    const heading = screen.getByRole('heading', { name: 'Game paused' });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(screen.getByTestId('phase-bar').contains(resume), 'Resume is the phase bar action').toBe(
      true,
    );
    expect(
      document.querySelectorAll('[data-part="spinner"]'),
      'nothing is awaited while Resume is still to press',
    ).toHaveLength(0);
    await userEvent.click(resume);
    expect(pauseActions.resume).toHaveBeenCalledOnce();
    await view.rerender({
      ...props,
      state: { ...state, pause: { ...state.pause, resumeReady: ['p1'] } },
    });
    expect(resume.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('pause-announcement').textContent).toBe(
      "You're ready to resume. Waiting for your opponent.",
    );
    const waiting = screen.getByTestId('pause-status');
    expect(waiting.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(
      document.querySelectorAll('[data-part="spinner"]'),
      'one spinner for one wait',
    ).toHaveLength(1);
    await userEvent.click(resume);
    expect(pauseActions.resume).toHaveBeenCalledOnce();

    await view.rerender({
      ...props,
      state: { ...state, pause: { ...state.pause, resumeReady: ['p0'] } },
    });
    expect(screen.getByTestId('pause-announcement').textContent).toBe(
      'Your opponent is ready to resume.',
    );
    expect(screen.getByTestId('pause-status').querySelector('[data-part="spinner"]')).toBeNull();
  });

  it('is left out in local games', () => {
    render(Table, {
      props: { localiser, onCommand: () => {}, state: withPause({ requestedBy: 'p0' }) },
    });
    expect(screen.queryByTestId('pause-panel')).toBeNull();
  });
});
