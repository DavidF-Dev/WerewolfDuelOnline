import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import Table from '../../src/screens/Table.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { potionState } from '../../src/gallery/fixtures.js';
import { newGame, playUntil, stateFor } from '../games.js';

const localiser = createLocaliser('en');
afterEach(() => setDisplaySettings(DEFAULT_SETTINGS));

describe('PhaseBar', () => {
  it('adds a rules hint under the instruction only while rules hints are on', () => {
    const state = potionState();
    const { unmount } = render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.getByTestId('phase-hint').textContent).toBe(
      localiser.t('hint-choose-potion-target'),
    );
    unmount();

    setDisplaySettings({ ...DEFAULT_SETTINGS, rulesHints: false });
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.queryByTestId('phase-hint')).toBeNull();
  });

  it('leaves the plan hint to the seal confirmation while the plan builder shows its summary', () => {
    render(Table, {
      props: { localiser, state: stateFor(newGame(12), 'p1'), onCommand: () => {} },
    });
    expect(screen.getByTestId('phase-instruction').textContent?.trim()).toBe('Choose a character');
    expect(screen.queryByTestId('phase-hint')).toBeNull();
  });

  it('drops the Badge hint once the round summary says who takes the Badge', () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'instant' });
    const game = newGame(12);
    playUntil(game, () => game.pending().kind === 'next_round');
    render(Table, { props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} } });
    expect(screen.getByTestId('round-badge')).toBeTruthy();
    expect(screen.getByTestId('phase-instruction').textContent?.trim()).toBe('The round is over.');
    expect(screen.queryByTestId('phase-hint')).toBeNull();
  });

  it('shows a spinner after the instruction only while waiting for the opponent', () => {
    const game = newGame(12);
    game.apply('p0', game.legalActions('p0')[0]!);
    const { unmount } = render(Table, {
      props: { localiser, state: stateFor(game, 'p0'), onCommand: () => {} },
    });
    const instruction = screen.getByTestId('phase-instruction');
    expect(instruction.textContent?.trim()).toBe('Waiting for your opponent.');
    const spinner = instruction.querySelector('[data-part="spinner"]');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(instruction.lastElementChild, 'after the text').toBe(spinner);
    unmount();

    render(Table, { props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} } });
    expect(
      screen.getByTestId('phase-instruction').querySelector('[data-part="spinner"]'),
    ).toBeNull();
  });

  it('asks only how many Hourglasses, since the spend panel shows the rule', () => {
    const game = newGame(12);
    for (const seat of ['p0', 'p1'] as const) game.apply(seat, game.legalActions(seat)[0]!);
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('nobody to place Hourglasses');
    render(Table, { props: { localiser, state: stateFor(game, seat), onCommand: () => {} } });
    expect(screen.getByTestId('phase-instruction').textContent?.trim()).toBe(
      'How many Hourglasses will you place?',
    );
    expect(screen.queryByTestId('phase-hint')).toBeNull();
    expect(screen.getByTestId('reveal-note').textContent).toContain(
      'Lower initiative resolves first.',
    );
  });
});
