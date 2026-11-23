import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import Home from '../../src/screens/Home.svelte';
import { openDeviceStore, type DeviceStore, type SessionRecord } from '../../src/storage/db.js';

const localiser = createLocaliser('en');
const SERVER = 'https://referee.example.com';

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
  it('lists continue sessions newest first', async () => {
    await store.sessions.put(
      record('AAAAAA', { savedAt: Date.now() - 5000, opponentName: 'Jo', status: 'paused' }),
    );
    await store.sessions.put(
      record('BBBBBB', { savedAt: Date.now() - 1000, opponentName: 'Mika', seat: 'p1' }),
    );
    render(Home, { props: { localiser } });

    const region = await screen.findByRole('region', { name: 'Continue' });
    const links = within(region).getAllByRole('link');
    expect(links.map((link) => link.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Mika, room BBBBBB In progress',
      'Jo, room AAAAAA Paused',
    ]);
    expect(links[0]?.getAttribute('href')).toContain('#/join/BBBBBB');
    expect(links[0]?.getAttribute('href')).not.toContain('rejoin');
  });

  it('shows a finished session as game over with its opponent', async () => {
    await store.sessions.put(
      record('CCCCCC', {
        savedAt: Date.now() - 1000,
        finishedAt: Date.now() - 1000,
        opponentName: 'Ana',
        status: 'finished',
      }),
    );
    render(Home, { props: { localiser } });

    const region = await screen.findByRole('region', { name: 'Continue' });
    const link = within(region).getByRole('link');
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ana, room CCCCCC Game over · rematch possible',
    );
    expect(link.getAttribute('href')).toContain('#/join/CCCCCC');
  });

  it('shows no continue section without sessions', async () => {
    render(Home, { props: { localiser } });
    expect(await screen.findByRole('button', { name: 'Create a game' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull();
  });

  it('keeps the online and local entries', async () => {
    render(Home, { props: { localiser } });
    for (const name of [
      'Create a game',
      'Join a game',
      'Rejoin a game',
      'Host a local game',
      'Join a local game',
    ]) {
      expect(await screen.findByRole('button', { name })).toBeTruthy();
    }
  });

  it('opens settings and how to play', async () => {
    const user = userEvent.setup();
    render(Home, { props: { localiser } });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(location.hash).toBe('#/settings');
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    expect(location.hash).toBe('#/how-to-play');
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
  });
});
