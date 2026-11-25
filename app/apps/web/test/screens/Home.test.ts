import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import Home from '../../src/screens/Home.svelte';
import { openDeviceStore, type DeviceStore, type SessionRecord } from '../../src/storage/db.js';

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

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
});

afterEach(() => {
  resetDeviceStore();
  location.hash = '';
});

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
});
