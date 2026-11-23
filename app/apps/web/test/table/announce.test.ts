import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Seat } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import Table from '../../src/screens/Table.svelte';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');
const SEAT: Seat = 'p1';

describe('Table announcements', () => {
  it('opponent action is announced', async () => {
    const game = newGame(12);
    const { rerender } = render(Table, {
      props: { localiser, state: stateFor(game, SEAT), onCommand: () => {} },
    });
    const log = screen.getByRole('log', { name: 'Announcements' });
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.textContent?.trim(), 'the backlog is not read out').toBe('');

    const theirs = game.legalActions('p0')[0];
    if (theirs === undefined) throw new Error('no plan offered');
    const [sealed] = game.apply('p0', theirs);
    if (sealed === undefined) throw new Error('no event');
    await rerender({ state: stateFor(game, SEAT) });
    const announced = localiser.renderEvent(sealed, SEAT);
    expect(announced).toMatch(/^Your opponent seals/);
    expect(log.textContent).toContain(announced);

    const mine = game.legalActions(SEAT)[0];
    if (mine === undefined) throw new Error('no plan offered');
    const [own] = game.apply(SEAT, mine);
    if (own === undefined) throw new Error('no event');
    await rerender({ state: stateFor(game, SEAT) });
    expect(log.textContent, 'my own action is not announced').not.toContain(
      localiser.renderEvent(own, SEAT),
    );
  });
});
