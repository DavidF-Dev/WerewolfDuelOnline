import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe as group, expect, it } from 'vitest';
import type { Seat } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import Table from '../../src/screens/Table.svelte';
import { describe } from '../../src/table/describe.js';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');
const characterName = (c: string): string => localiser.t(`character-${c.replaceAll('_', '-')}`);
const SEAT: Seat = 'p1';

group('describe table', () => {
  it('describe mentions round, markers and whose turn', () => {
    const game = newGame(12);
    const view = game.view({ seat: SEAT });
    const text = describe(view, SEAT, localiser);
    expect(text).toContain('Round 1.');
    expect(text).toContain('Your markers: Health: 2, Crosses: 1, Fangs: 0');
    expect(text).toContain("Your opponent's markers: Health: 2");
    expect(text).toContain('Both of you need to act.');
    for (const c of view.players[1].hand ?? []) expect(text).toContain(characterName(c));
    for (const c of game.view('omniscient').players[0].hand ?? []) {
      expect(text, 'never names a hidden card').not.toContain(characterName(c));
    }

    const plan = game.legalActions(SEAT)[0];
    if (plan === undefined) throw new Error('no plan offered');
    game.apply(SEAT, plan);
    expect(describe(game.view({ seat: SEAT }), SEAT, localiser)).toContain(
      "It's your opponent's turn.",
    );
  });

  it('the describe table button reads the same description', async () => {
    const game = newGame(12);
    const state = stateFor(game, SEAT);
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    await userEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Describe table' }));
    const expected = describe(game.view({ seat: SEAT }), SEAT, localiser);
    expect(screen.getByTestId('table-description').textContent).toBe(expected);
  });
});
