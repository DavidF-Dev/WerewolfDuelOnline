import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { DEFAULT_SERVER } from '../../src/online.js';
import Home from '../../src/screens/Home.svelte';
import JoinOnline from '../../src/screens/JoinOnline.svelte';
import { initSessions, loadOnlineSession, resetSessions } from '../../src/session.js';
import { openDeviceStore, type DeviceStore, type SessionRecord } from '../../src/storage/db.js';
import { sessionId } from '../../src/storage/sessions.js';
import { FakeWebSocket } from '../fake-socket.js';

const localiser = createLocaliser('en');
const SERVER = 'https://referee.example.com';
const MINUTE = 60_000;

const record = (room: string, extra: Partial<SessionRecord>): SessionRecord => ({
  id: `${encodeURIComponent(SERVER)}.${room}`,
  server: SERVER,
  room,
  seatToken: 'a'.repeat(32),
  lastSeq: 1,
  game: 0,
  status: 'active',
  savedAt: 1000,
  ...extra,
});

const text = (node: Element | null | undefined): string =>
  node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

let store: DeviceStore;
const warn = console.warn;
let warnings: unknown[][] = [];

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
  warnings = [];
  // Captured by hand, so that restoring the tests' own mocks keeps what was said.
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
    warn(...args);
  };
});

afterEach(() => {
  console.warn = warn;
  const svelte = warnings.filter((args) => String(args[0]).includes('[svelte]'));
  resetDeviceStore();
  resetSessions();
  location.hash = '';
  expect(svelte, 'Svelte warnings').toEqual([]);
});

/** Renders Home and waits until it has listed the stored sessions. */
async function renderSettled(): Promise<void> {
  const listed = vi.spyOn(store.sessions, 'list');
  render(Home, { props: { localiser } });
  await waitFor(() => expect(listed).toHaveBeenCalled());
  await listed.mock.results[0]!.value;
  await tick();
}

describe('Home', () => {
  it('lists continue sessions newest first, with their status and age', async () => {
    await store.sessions.put(
      record('AAAAAA', {
        savedAt: Date.now() - 125 * MINUTE,
        opponentName: 'Jo',
        status: 'paused',
      }),
    );
    await store.sessions.put(
      record('BBBBBB', { savedAt: Date.now() - 2 * MINUTE, opponentName: 'Mika', seat: 'p1' }),
    );
    render(Home, { props: { localiser } });

    const region = await screen.findByRole('region', { name: 'Continue' });
    const rows = within(region).getAllByTestId('home-session');
    expect(rows.map(text)).toEqual([
      'Mika In progress · 2 minutes ago Resume',
      'Jo Paused · 2 hours ago Resume',
    ]);
    const links = within(region).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Resume game with Mika, room BBBBBB',
      'Resume game with Jo, room AAAAAA',
    ]);
    expect(links[0]?.getAttribute('href')).toContain('#/join/BBBBBB');
    expect(links[0]?.getAttribute('href')).not.toContain('rejoin');
    expect(links[0]?.classList.contains('primary')).toBe(true);
    expect(links[1]?.classList.contains('primary')).toBe(false);
  });

  it('shows a finished session as game over with its opponent', async () => {
    await store.sessions.put(
      record('CCCCCC', {
        savedAt: Date.now() - 180 * MINUTE,
        finishedAt: Date.now() - 180 * MINUTE,
        opponentName: 'Ana',
        status: 'finished',
      }),
    );
    render(Home, { props: { localiser } });

    const region = await screen.findByRole('region', { name: 'Continue' });
    const row = within(region).getByTestId('home-session');
    expect(text(row)).toBe('Ana Game over · rematch possible · 3 hours ago Open');
    const link = within(row).getByRole('link');
    expect(link.getAttribute('href')).toContain('#/join/CCCCCC');
    expect(link.classList.contains('primary')).toBe(false);
    expect(link.getAttribute('aria-label')).toBe('Open game with Ana, room CCCCCC');
  });

  it('shows the round and whose turn it is when the record holds them', async () => {
    const mk = (room: string, minutes: number, extra: Partial<SessionRecord>) =>
      store.sessions.put(record(room, { savedAt: Date.now() - minutes * MINUTE, ...extra }));
    await mk('EEEEEE', 2, { opponentName: 'Mika', round: 4, yourTurn: true });
    await mk('FFFFFF', 3, { opponentName: 'Bo', round: 2, yourTurn: false });
    await mk('GGGGGG', 125, { opponentName: 'Jo', status: 'paused', round: 2 });
    render(Home, { props: { localiser } });

    const rows = await screen.findAllByTestId('home-session');
    expect(rows.map(text)).toEqual([
      'Mika Round 4 · your turn · 2 minutes ago Resume',
      'Bo Round 2 · waiting for the opponent · 3 minutes ago Resume',
      'Jo Paused · Round 2 · 2 hours ago Resume',
    ]);
  });

  it('shows an older record with what it holds', async () => {
    await store.sessions.put(record('HHHHHH', { savedAt: Date.now() - 2 * MINUTE }));
    render(Home, { props: { localiser } });
    expect(text(await screen.findByTestId('home-session'))).toBe(
      'Unknown opponent In progress · 2 minutes ago Resume',
    );
  });

  it('sends a session without a seat token to the PIN flow', async () => {
    await store.sessions.put(
      record('DDDDDD', { seatToken: '', opponentName: 'Bo', seat: 'p0', savedAt: Date.now() }),
    );
    render(Home, { props: { localiser } });
    const link = await screen.findByTestId('home-continue');
    expect(link.getAttribute('href')).toContain('#/rejoin?code=DDDDDD');
  });

  it('shows no continue section without sessions', async () => {
    render(Home, { props: { localiser } });
    expect(await screen.findByRole('button', { name: 'New game' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull();
  });

  it('home follows the mockup order', async () => {
    await store.sessions.put(record('AAAAAA', { opponentName: 'Mika', savedAt: Date.now() }));
    render(Home, { props: { localiser } });
    await screen.findByRole('region', { name: 'Continue' });

    const order = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByRole('region', { name: 'Continue' }),
      screen.getByRole('button', { name: 'New game' }),
      screen.getByRole('button', { name: 'Join game' }),
      screen.getByRole('button', { name: 'How to play' }),
      screen.getByRole('button', { name: 'History' }),
      screen.getByTestId('footer'),
    ];
    for (let i = 1; i < order.length; i++) {
      const position = (order[i - 1] as Node).compareDocumentPosition(order[i] as Node);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const how = screen.getByRole('button', { name: 'How to play' });
    expect(how.parentElement).toBe(screen.getByRole('button', { name: 'History' }).parentElement);
    expect(how.classList.contains('primary')).toBe(false);
    expect(screen.getByRole('button', { name: 'New game' }).classList.contains('primary')).toBe(
      true,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('settings is reached from the bar', async () => {
    const user = userEvent.setup();
    render(Home, { props: { localiser } });
    const settings = screen.getAllByRole('button', { name: 'Settings' });
    expect(settings).toHaveLength(1);
    expect(settings[0]?.closest('header')).not.toBeNull();
    await user.click(settings[0] as HTMLElement);
    expect(location.hash).toBe('#/settings');
  });

  it('opens how to play and history', async () => {
    const user = userEvent.setup();
    render(Home, { props: { localiser } });
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    expect(location.hash).toBe('#/how-to-play');
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(location.hash).toBe('#/history');
  });

  it('home has no local or rejoin links', () => {
    render(Home, { props: { localiser } });
    for (const id of ['home-local', 'home-rejoin-online', 'home-local-sheet']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('button').map(text)).toEqual([
      'New game',
      'Join game',
      'How to play',
      'History',
    ]);
    expect(within(main).queryAllByRole('link')).toEqual([]);
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe('Werewolf: Duel! Online');
  });

  it('the footer is the page landmark, after main', () => {
    render(Home, { props: { localiser } });
    const footer = screen.getByRole('contentinfo');
    const main = screen.getByRole('main');
    expect(main.contains(footer)).toBe(false);
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('footer link opens in a new tab safely', () => {
    render(Home, { props: { localiser } });
    const link = screen.getByRole('link', { name: /opens in a new tab/ });
    expect(link.getAttribute('href')).toBe(
      'https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe('Get the physical game ↗');
    expect(screen.getByTestId('footer').querySelectorAll('p')).toHaveLength(4);
    expect(screen.getAllByTestId('unofficial-notice')).toHaveLength(1);
  });

  describe('removing a game', () => {
    const put = (room: string, minutes: number, extra: Partial<SessionRecord> = {}) =>
      store.sessions.put(record(room, { savedAt: Date.now() - minutes * MINUTE, ...extra }));

    const moreFor = (name: string): HTMLElement =>
      screen.getByRole('button', { name: `More for the game with ${name}` });

    async function chooseRemove(
      user: ReturnType<typeof userEvent.setup>,
      name: string,
    ): Promise<HTMLElement> {
      await user.click(moreFor(name));
      const menu = screen.getByRole('menu');
      await user.click(within(menu).getByRole('menuitem', { name: 'Remove from this device' }));
      return screen.getByRole('alertdialog', { name: 'Remove this game?' });
    }

    const description = (dialog: HTMLElement): string =>
      text(document.getElementById(dialog.getAttribute('aria-describedby') ?? ''));

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('each continue row has a named more button', async () => {
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      await put('BBBBBB', 2);
      render(Home, { props: { localiser } });
      const rows = await screen.findAllByTestId('home-session');
      expect(
        rows.map((row) => within(row).getByTestId('home-more').getAttribute('aria-label')),
      ).toEqual(['More for the game with Mika', 'More for the game with an unknown opponent']);
      for (const row of rows) {
        const more = within(row).getByTestId('home-more');
        expect(more.getAttribute('aria-haspopup')).toBe('menu');
        expect(more.getAttribute('aria-expanded')).toBe('false');
      }
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('the more menu closes on escape, outside click, its button and selection', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      render(Home, { props: { localiser } });
      await screen.findByTestId('home-session');
      const more = moreFor('Mika');

      await user.click(more);
      const menu = screen.getByRole('menu');
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(more.getAttribute('aria-controls')).toBe(menu.id);
      expect(menu.getAttribute('aria-labelledby')).toBe(more.id);
      expect(document.activeElement).toBe(within(menu).getByRole('menuitem'));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(more);

      await user.click(more);
      expect(screen.getByRole('menu')).toBeTruthy();
      await user.click(screen.getByRole('heading', { level: 1 }));
      expect(screen.queryByRole('menu')).toBeNull();

      await user.click(more);
      await user.click(more);
      expect(screen.queryByRole('menu')).toBeNull();

      await user.click(more);
      await user.tab();
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New game' }));

      await user.click(more);
      await user.click(screen.getByRole('menuitem', { name: 'Remove from this device' }));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByRole('alertdialog', { name: 'Remove this game?' })).toBeTruthy();
    });

    it('remove asks first and cancel keeps the game', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      await put('BBBBBB', 2, { opponentName: 'Jo' });
      const removed = vi.spyOn(store.sessions, 'remove');
      render(Home, { props: { localiser } });
      await screen.findAllByTestId('home-session');

      const dialog = await chooseRemove(user, 'Jo');
      expect(text(dialog)).toContain('Jo');
      expect(description(dialog)).toContain(
        "You won't be able to resume it from this device. If the game is still in progress, your seat may time out and your opponent may win. To rejoin later you'd need the join code and your PIN.",
      );
      const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
      expect(document.activeElement).toBe(cancel);
      expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeTruthy();

      await user.click(cancel);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(removed).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('home-session')).toHaveLength(2);
      expect(document.activeElement).toBe(moreFor('Jo'));
    });

    it('remove deletes only that session', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      await put('BBBBBB', 2, { opponentName: 'Jo' });
      const removed = vi.spyOn(store.sessions, 'remove');
      const untouched = [
        vi.spyOn(store.history, 'delete'),
        vi.spyOn(store.history, 'clear'),
        vi.spyOn(store.history, 'put'),
        vi.spyOn(store.settings, 'put'),
        vi.spyOn(store, 'clearAll'),
      ];
      const network = vi.fn();
      vi.stubGlobal('fetch', network);
      vi.stubGlobal('WebSocket', network);
      render(Home, { props: { localiser } });
      await screen.findAllByTestId('home-session');
      const status = screen.getByRole('status');
      expect(text(status)).toBe('');

      const dialog = await chooseRemove(user, 'Mika');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(screen.getAllByTestId('home-session')).toHaveLength(1));
      expect(removed).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith(record('AAAAAA', {}).id, 'a'.repeat(32));
      expect(text(screen.getByTestId('home-session'))).toContain('Jo');
      expect((await store.sessions.list()).map((s) => s.room)).toEqual(['BBBBBB']);
      for (const spy of untouched) expect(spy).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBe(status);
      expect(text(status)).toBe('Game removed');
    });

    it("a finished game's dialog says it stays in history", async () => {
      const user = userEvent.setup();
      await put('CCCCCC', 1, { opponentName: 'Ana', status: 'finished', finishedAt: Date.now() });
      render(Home, { props: { localiser } });
      await screen.findByTestId('home-session');
      const dialog = await chooseRemove(user, 'Ana');
      expect(description(dialog)).toContain('It stays in your history.');
      expect(description(dialog)).not.toContain("You won't be able to resume it");
    });

    it('removing the only game moves focus to New game', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      render(Home, { props: { localiser } });
      await screen.findByTestId('home-session');
      const dialog = await chooseRemove(user, 'Mika');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull());
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New game' }));
    });

    it('removing a game moves focus to the next row, or the previous when it was last', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      await put('BBBBBB', 2, { opponentName: 'Jo' });
      await put('CCCCCC', 3, { opponentName: 'Bo' });
      render(Home, { props: { localiser } });
      await screen.findAllByTestId('home-session');

      let dialog = await chooseRemove(user, 'Jo');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.getAllByTestId('home-session')).toHaveLength(2));
      expect(document.activeElement).toBe(moreFor('Bo'));

      dialog = await chooseRemove(user, 'Bo');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.getAllByTestId('home-session')).toHaveLength(1));
      expect(document.activeElement).toBe(moreFor('Mika'));
    });

    it('a removed session is gone for another Home tab after reload', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      const here = render(Home, { props: { localiser } });
      await within(here.container).findByTestId('home-session');
      const there = render(Home, { props: { localiser } });
      const stale = await within(there.container).findByTestId('home-session');

      await user.click(within(here.container).getByTestId('home-more'));
      await user.click(screen.getByRole('menuitem', { name: 'Remove from this device' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(within(here.container).queryByTestId('home-session')).toBeNull());

      // The other tab still shows its row until it reloads, and removing it there too is harmless.
      expect(within(there.container).getByTestId('home-session')).toBe(stale);
      await user.click(within(there.container).getByTestId('home-more'));
      await user.click(screen.getByRole('menuitem', { name: 'Remove from this device' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(within(there.container).queryByTestId('home-session')).toBeNull());
      expect(text(within(there.container).getByRole('status'))).toBe('Game removed');

      here.unmount();
      there.unmount();
      await renderSettled();
      expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull();
      expect(await store.sessions.get(record('AAAAAA', {}).id)).toBeUndefined();
    });

    /** A seat on the default server, which a join link connects to without asking. */
    const seatHere = (room: string): SessionRecord => ({
      ...record(room, { opponentName: 'Mika', savedAt: Date.now() - MINUTE }),
      id: sessionId(DEFAULT_SERVER, room),
      server: DEFAULT_SERVER,
    });

    /** Opens the join screen for `room`, as Back or an invite link would, and returns its hello. */
    async function joinFromLink(room: string): Promise<Record<string, unknown>> {
      await store.identity.put({ ...(await store.identity.get()), displayName: 'Ada' });
      render(JoinOnline, { props: { localiser, code: room } });
      await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
      const socket = FakeWebSocket.instances[0]!;
      socket.accept();
      return socket.messages()[0] as Record<string, unknown>;
    }

    it('a removed seat cannot be resumed in this tab by Back or an invite link', async () => {
      const user = userEvent.setup();
      FakeWebSocket.instances = [];
      vi.stubGlobal('WebSocket', FakeWebSocket);
      const seat = seatHere('AAAAAA');
      await store.sessions.put(seat);
      await initSessions(store);
      render(Home, { props: { localiser } });
      await screen.findByTestId('home-session');

      const dialog = await chooseRemove(user, 'Mika');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.queryByTestId('home-session')).toBeNull());
      expect(loadOnlineSession(DEFAULT_SERVER, 'AAAAAA')).toBeUndefined();

      const hello = await joinFromLink('AAAAAA');
      expect(hello).not.toHaveProperty('seat_token');
      expect(await store.sessions.get(seat.id)).toBeUndefined();
    });

    it("another tab's stale row cannot resume a seat removed elsewhere", async () => {
      FakeWebSocket.instances = [];
      vi.stubGlobal('WebSocket', FakeWebSocket);
      const seat = seatHere('AAAAAA');
      await store.sessions.put(seat);
      // This tab loaded the seat before another tab removed it.
      await initSessions(store);
      render(Home, { props: { localiser } });
      const row = await screen.findByTestId('home-session');
      await store.sessions.remove(seat.id, seat.seatToken);

      expect(within(row).getByTestId('home-continue').getAttribute('href')).toContain(
        '#/join/AAAAAA',
      );
      const hello = await joinFromLink('AAAAAA');
      expect(hello).not.toHaveProperty('seat_token');
      expect(loadOnlineSession(DEFAULT_SERVER, 'AAAAAA')).toBeUndefined();
      expect(await store.sessions.get(seat.id)).toBeUndefined();
    });

    it('says so when the game could not be removed, and keeps it', async () => {
      const user = userEvent.setup();
      await put('AAAAAA', 1, { opponentName: 'Mika' });
      vi.spyOn(store.sessions, 'remove').mockRejectedValue(new Error('quota'));
      render(Home, { props: { localiser } });
      await screen.findByTestId('home-session');
      const dialog = await chooseRemove(user, 'Mika');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() =>
        expect(text(screen.getByRole('status'))).toBe("The game couldn't be removed. Try again."),
      );
      expect(screen.getAllByTestId('home-session')).toHaveLength(1);
      expect(document.activeElement).toBe(moreFor('Mika'));
    });
  });
});
