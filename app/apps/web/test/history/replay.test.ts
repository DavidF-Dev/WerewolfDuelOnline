import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replayTimeline, verifyReplay, type Replay as ReplayRecord } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import History from '../../src/screens/History.svelte';
import Replay from '../../src/screens/Replay.svelte';
import Stats from '../../src/screens/Stats.svelte';
import { routeFor } from '../../src/router.js';
import { openDeviceStore, type DeviceStore, type HistoryRecord } from '../../src/storage/db.js';
import { characterName } from '../../src/text.js';
import { finishedGame, recordFrom } from './records.js';

const localiser = createLocaliser('en');
let store: DeviceStore;
let record: HistoryRecord;

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
  // A short game: three tests step through every step of it.
  record = recordFrom(finishedGame(6), 'p0', 'https%3A%2F%2Fx.example.K7Q2MX.0', {
    opponentName: 'Mika',
  });
  await store.history.put(record);
});

afterEach(() => {
  resetDeviceStore();
  location.hash = '';
});

const position = (): string => screen.getByTestId('replay-position').textContent ?? '';
// Once a round's showdown has begun with both hands empty, the hands are left out.
const handItems = (seat: string): HTMLElement[] => {
  const hand = screen.queryByTestId(`replay-hand-${seat}`);
  return hand === null ? [] : within(hand).queryAllByRole('listitem');
};

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

  it("my view never names the opponent's cards before the showdown", async () => {
    const mine = replayTimeline(record.replay, { seat: 'p0' });
    const full = replayTimeline(record.replay, 'omniscient');
    expect(full).toHaveLength(mine.length);
    await open();
    let checked = 0;
    for (let i = 0; i < mine.length; i++) {
      const view = mine[i]!.view;
      if (view.showdown === null) {
        // My own cards and the targets of my own plan may name the same characters.
        const plan = view.players[0].plan;
        const own = new Set<string>([
          ...(view.players[0].hand ?? []),
          ...(typeof plan === 'object' && 'revealed' in plan
            ? plan.revealed.targets.flatMap((t) => (t === 'fool' ? [] : [t.character]))
            : []),
        ]);
        const hidden = (full[i]!.view.players[1].hand ?? []).filter((c) => !own.has(c));
        const shown = document.body.textContent ?? '';
        for (const c of hidden) {
          expect(shown, `step ${i + 1}`).not.toContain(characterName(localiser, c));
        }
        checked += hidden.length;
      }
      await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    }
    expect(checked, 'some hidden cards were checked').toBeGreaterThan(0);
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
    await user.click(screen.getByRole('radio', { name: 'Full' }));
    expect((screen.getByRole('radio', { name: 'Full' }) as HTMLInputElement).checked).toBe(true);
    expect(handItems('p0').length).toBeGreaterThan(0);
    expect(handItems('p1').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('radio', { name: 'My view' }));
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

  it('a showdown step shows the plan panels and every result, and logs the rest', async () => {
    await open();
    const user = userEvent.setup();
    const total = replayTimeline(record.replay, { seat: 'p0' }).length;
    for (let i = 1; i < total && screen.queryByTestId('showdown') === null; i++) {
      await user.click(screen.getByRole('button', { name: 'Next step' }));
    }
    expect(screen.getByTestId('opponent')).toBeTruthy();
    expect(screen.getByTestId('plan-panels')).toBeTruthy();
    expect(screen.getByTestId('my-area')).toBeTruthy();
    expect(screen.queryByTestId('showdown-next')).toBeNull();
    expect(screen.getByTestId('round-summary')).toBeTruthy();
    const log = screen.getByTestId('replay-log').textContent ?? '';
    expect(log).not.toMatch(/Plans revealed/);
    expect(log).not.toMatch(/resolves/);
  });

  it('the bar menu shows the unofficial notice, and arrow keys wait while it is open', async () => {
    await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Replay menu' }));
    const menu = screen.getByTestId('replay-menu');
    expect(within(menu).getByTestId('unofficial-notice').textContent?.trim()).toBe(
      'An unofficial digital version of Werewolf: Duel!',
    );
    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(position()).toMatch(/^Step 1 of /);
    await user.click(within(menu).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('replay-menu')).toBeNull();
    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(position()).toMatch(/^Step 2 of /);
  });

  it('says so when the game is not on this device', async () => {
    render(Replay, { props: { localiser, id: 'missing' } });
    expect(await screen.findByText('This game is not on this device.')).toBeTruthy();
  });

  it("a stored game that broke today's rules says it can't be replayed", async () => {
    // A game recorded by engine 0.1.0 whose plan targets a card in its player's hand.
    const old = JSON.parse(
      readFileSync(
        join(process.cwd(), '../../../engine/crates/wwd-core/tests/fixtures/replay-0.1.0.json'),
        'utf8',
      ),
    ) as ReplayRecord;
    expect(() => verifyReplay(old)).toThrow('error-replay-rule');
    // Overwrites the shared record rather than adding one.
    await store.history.put({ ...record, replay: old });
    render(Replay, { props: { localiser, id: record.id } });
    expect(
      await screen.findByText("This game was played under older rules and can't be replayed."),
    ).toBeTruthy();
    expect(screen.queryByTestId('replay-missing')).toBeNull();
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
