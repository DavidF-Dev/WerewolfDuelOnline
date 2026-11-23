import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command, Game, Seat } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings/settings.js';
import ShowdownList from '../../src/table/ShowdownList.svelte';
import { showdownSteps } from '../../src/table/showdown.js';
import { newGame, playUntil } from '../games.js';

const localiser = createLocaliser('en');
const SEAT: Seat = 'p1';

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
  vi.useRealTimers();
});

/** A game whose first round has been played to the end. */
function afterShowdown(): Game {
  const game = newGame(12);
  playUntil(game, () => game.pending().kind === 'next_round');
  return game;
}

const isHunterPlan = (cmd: Command): boolean =>
  typeof cmd === 'object' &&
  'submit_plan' in cmd &&
  cmd.submit_plan.character === 'hunter' &&
  cmd.submit_plan.targets.length > 0;

/** A game waiting on a Hunter's owner to choose whether to spend a Cross. */
function atHunterChoice(): Game {
  for (let seed = 1; seed < 500; seed++) {
    const game = newGame(seed);
    try {
      playUntil(
        game,
        () => ['hunter_choice', 'next_round'].includes(game.pending().kind),
        (legal) => legal.find(isHunterPlan) ?? legal.find((c) => c !== 'resign'),
      );
    } catch {
      continue;
    }
    if (game.pending().kind === 'hunter_choice') return game;
  }
  throw new Error('no seed reaches a Hunter choice');
}

function renderList(game: Game, seat: Seat, settings: Partial<Settings> = {}) {
  setDisplaySettings({ ...DEFAULT_SETTINGS, ...settings });
  const viewer = { seat };
  const events = game.eventsSince(0, viewer);
  const onCommand = vi.fn<(cmd: Command) => void>();
  const onCaughtUp = vi.fn();
  render(ShowdownList, {
    props: { localiser, events, seat, legal: game.legalActions(seat), onCommand, onCaughtUp },
  });
  return { events, steps: showdownSteps(events), onCommand, onCaughtUp };
}

const shownSteps = (): HTMLElement[] =>
  within(screen.getByTestId('showdown-steps')).queryAllByRole('listitem');

describe('showdownSteps', () => {
  it('groups the results after the reveal, one step per resolution', () => {
    const game = afterShowdown();
    const events = game.eventsSince(0, { seat: SEAT });
    const steps = showdownSteps(events);
    expect(steps.length).toBeGreaterThan(1);
    const first = steps[0]?.[0]?.[1].kind;
    expect(first && ('potion_resolved' in first || 'character_resolved' in first)).toBe(true);
    expect(steps.flat().some(([, e]) => 'plans_revealed' in e.kind)).toBe(false);
    expect(steps.at(-1)?.[0]?.[1].kind).toHaveProperty('round_ended');
  });

  it('is empty before the plans are revealed', () => {
    expect(showdownSteps(newGame(12).eventsSince(0, { seat: SEAT }))).toEqual([]);
  });
});

describe('ShowdownList', () => {
  it('showdown steps one at a time', async () => {
    const game = afterShowdown();
    const { steps, onCaughtUp } = renderList(game, SEAT, { showdownSpeed: 'step' });
    expect(shownSteps()).toHaveLength(1);
    const next = screen.getByRole('button', { name: 'Next result' });
    for (let n = 2; n <= steps.length; n++) {
      await userEvent.click(next);
      expect(shownSteps()).toHaveLength(n);
    }
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
    expect(onCaughtUp).toHaveBeenCalledOnce();
    const text = shownSteps()[0]?.textContent ?? '';
    const firstEvent = steps[0]?.[0]?.[1];
    if (firstEvent === undefined) throw new Error('no step');
    expect(text).toContain(localiser.renderEvent(firstEvent, SEAT));
  });

  it('steps automatically every 1.2 seconds', async () => {
    vi.useFakeTimers();
    const game = afterShowdown();
    const { steps } = renderList(game, SEAT, { showdownSpeed: 'auto', reducedMotion: 'off' });
    expect(shownSteps()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
    vi.advanceTimersByTime(1_199);
    await tick();
    expect(shownSteps()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await tick();
    expect(shownSteps()).toHaveLength(Math.min(2, steps.length));
    vi.advanceTimersByTime(1_200 * steps.length);
    await tick();
    expect(shownSteps()).toHaveLength(steps.length);
  });

  it('instant under reduced motion', () => {
    const game = afterShowdown();
    const { steps } = renderList(game, SEAT, { showdownSpeed: 'auto', reducedMotion: 'on' });
    expect(shownSteps()).toHaveLength(steps.length);
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
  });

  it('keeps stepping under reduced motion when the player chose it', () => {
    const game = afterShowdown();
    renderList(game, SEAT, { showdownSpeed: 'step', reducedMotion: 'on' });
    expect(shownSteps()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Next result' })).toBeTruthy();
  });

  it('shows the Hunter prompt inline once the results so far are shown', async () => {
    const game = atHunterChoice();
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('nobody to choose');
    const { steps, onCommand } = renderList(game, seat, { showdownSpeed: 'step' });
    for (let n = 1; n < steps.length; n++) {
      expect(screen.queryByTestId('action-hunter-spend')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    }
    const prompt = screen.getByTestId('hunter-prompt');
    expect(screen.getByRole('region', { name: 'Showdown' }).contains(prompt)).toBe(true);
    await userEvent.click(within(prompt).getByRole('button', { name: 'Keep the Cross' }));
    await userEvent.click(within(prompt).getByRole('button', { name: 'Spend a Cross to attack' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ hunter_spend_cross: { spend: false } });
  });
});
