import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replayTimeline } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import History from '../../src/screens/History.svelte';
import Replay from '../../src/screens/Replay.svelte';
import Stats from '../../src/screens/Stats.svelte';
import { routeFor } from '../../src/router.js';
import { openDeviceStore, type DeviceStore, type HistoryRecord } from '../../src/storage/db.js';
import { finishedGame, recordFrom } from './records.js';

const localiser = createLocaliser('en');
let store: DeviceStore;
let record: HistoryRecord;

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
  record = recordFrom(finishedGame(3), 'p0', 'https%3A%2F%2Fx.example.K7Q2MX.0', {
    opponentName: 'Mika',
  });
  await store.history.put(record);
});

afterEach(() => {
  resetDeviceStore();
  location.hash = '';
});

const position = (): string => screen.getByTestId('replay-position').textContent ?? '';
const handItems = (seat: string): HTMLElement[] =>
  within(screen.getByTestId(`replay-hand-${seat}`)).queryAllByRole('listitem');

async function open(): Promise<void> {
  render(Replay, { props: { localiser, id: record.id } });
  await screen.findByTestId('replay-position');
}

describe('routes', () => {
  it('reads the history routes', () => {
    expect(routeFor('#/history')).toEqual({ name: 'history' });
    expect(routeFor('#/stats')).toEqual({ name: 'stats' });
    expect(routeFor(`#/history/${encodeURIComponent(record.id)}`)).toEqual({
      name: 'replay',
      id: record.id,
    });
  });
});

describe('Replay', () => {
  it('replay my view hides the opponent hand until revealed', async () => {
    await open();
    const total = replayTimeline(record.replay, { seat: 'p0' }).length;
    expect(position()).toMatch(new RegExp(`^Step 1 of ${total}, round `));
    expect(handItems('p0').length).toBeGreaterThan(0);
    expect(handItems('p1')).toHaveLength(0);
    expect(screen.getByTestId('replay-hand-p1').textContent).toMatch(/hidden/);
    for (let i = 1; i < total; i++) {
      await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(handItems('p1')).toHaveLength(0);
    }
    expect(position()).toMatch(new RegExp(`^Step ${total} of ${total}`));
  });

  it("my view never shows the opponent's commands", async () => {
    const mine = replayTimeline(record.replay, { seat: 'p0' });
    const theirs = mine.filter((step) => step.seat === 'p1');
    expect(theirs.length).toBeGreaterThan(0);
    for (const step of theirs) expect(step.command).toBeNull();

    await open();
    const shown = (): string | null => screen.queryByTestId('replay-command')?.textContent ?? null;
    for (let i = 0; i < mine.length; i++) {
      expect(shown() ?? '').not.toContain('Mika');
      await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    }
    // The full view does name the opponent's commands, so the check above can fail.
    const full = replayTimeline(record.replay, 'omniscient');
    expect(full.some((step) => step.seat === 'p1' && step.command !== null)).toBe(true);
  });

  it('full view shows both', async () => {
    await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Full' }));
    expect(screen.getByRole('button', { name: 'Full' }).getAttribute('aria-pressed')).toBe('true');
    expect(handItems('p0').length).toBeGreaterThan(0);
    expect(handItems('p1').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'My view' }));
    expect(handItems('p1')).toHaveLength(0);
  });

  it('stepping back and forth is stable', async () => {
    await open();
    const user = userEvent.setup();
    const first = position();
    const log = screen.getByTestId('replay-log').textContent;
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(position()).not.toBe(first);
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Previous step' }));
    }
    expect(position()).toBe(first);
    expect(screen.getByTestId('replay-log').textContent).toBe(log);
  });

  it('arrow keys step through the replay', async () => {
    await open();
    const user = userEvent.setup();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(position()).toMatch(/^Step 3 of /);
    await user.keyboard('{ArrowLeft}');
    expect(position()).toMatch(/^Step 2 of /);
  });

  it('jumps by round', async () => {
    await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next round' }));
    expect(position()).toMatch(/round 2$/);
    await user.click(screen.getByRole('button', { name: 'Previous round' }));
    expect(position()).toMatch(/^Step 1 of /);
  });

  it('says so when the game is not on this device', async () => {
    render(Replay, { props: { localiser, id: 'missing' } });
    expect(await screen.findByText('This game is not on this device.')).toBeTruthy();
  });
});

describe('History', () => {
  it('lists finished games newest first with a replay link', async () => {
    await store.history.put({ ...record, id: 'older', finishedAt: 500, opponentName: 'Jo' });
    render(History, { props: { localiser } });
    const links = await screen.findAllByRole('link', { name: /Replay/ });
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toBe(`#/history/${encodeURIComponent(record.id)}`);
    expect(screen.getByRole('link', { name: 'Stats' }).getAttribute('href')).toBe('#/stats');
  });

  it('says when there are no games', async () => {
    await store.history.clear();
    render(History, { props: { localiser } });
    expect(await screen.findByText(/No finished games yet/)).toBeTruthy();
  });
});

describe('Stats', () => {
  it('shows the totals', async () => {
    render(Stats, { props: { localiser } });
    await waitFor(() => expect(screen.getByTestId('stats-games').textContent).toMatch(/1/));
    expect(screen.getByRole('table', { name: 'Results by win condition' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Characters picked' })).toBeTruthy();
  });
});
