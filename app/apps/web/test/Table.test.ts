import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Command, Game, Seat } from '@wwd/engine';
import { createLocaliser, type GameClientState } from '@wwd/client-core';
import Table from '../src/screens/Table.svelte';
import { newGame, stateFor } from './games.js';

const localiser = createLocaliser('en');
const characterName = (c: string): string => localiser.t(`character-${c.replaceAll('_', '-')}`);

function renderTable(state: GameClientState, onCommand: (cmd: Command) => void = () => {}) {
  return render(Table, { props: { localiser, state, onCommand } });
}

/** A game whose plans are both sealed, so `seat` (returned) must place Hourglasses. */
function atHourglassChoice(): { game: Game; seat: Seat } {
  const game = newGame(12);
  for (const seat of ['p0', 'p1'] as const) {
    const plan = game.legalActions(seat)[0];
    if (plan === undefined) throw new Error('no plan offered');
    game.apply(seat, plan);
  }
  const seat = game.pending().seats[0];
  if (seat === undefined) throw new Error('nobody to place Hourglasses');
  return { game, seat };
}

describe('Table hides opponent hand', () => {
  it('shows the opponent hand size but no opponent cards', () => {
    const state = stateFor(newGame(12), 'p1');
    const opponent = state.view?.players[0];
    expect(opponent?.hand).toBeNull();
    renderTable(state);
    const region = within(screen.getByRole('region', { name: /^Opponent/ }));
    expect(region.getByText(`Cards in hand: ${opponent?.hand_size}`)).toBeTruthy();
    expect(region.queryAllByRole('button')).toEqual([]);
    expect(region.queryAllByTestId(/^card-/)).toEqual([]);
  });

  it('lists my own hand and offers my plans', () => {
    const state = stateFor(newGame(12), 'p1');
    const hand = state.view?.players[1].hand ?? [];
    expect(hand.length).toBeGreaterThan(0);
    renderTable(state);
    const mine = within(screen.getByRole('region', { name: /^You:/ }));
    expect(mine.getAllByTestId(/^card-/)).toHaveLength(hand.length);
    const builder = within(screen.getByTestId('plan-characters'));
    expect(builder.getAllByRole('button')).toHaveLength(hand.length);
  });

  it('never names the opponent dealt cards in the log', () => {
    const game = newGame(12);
    const theirs = game.view('omniscient').players[0].hand ?? [];
    expect(theirs.length).toBeGreaterThan(0);
    renderTable(stateFor(game, 'p1'));
    const log = screen.getByRole('region', { name: 'Game log' }).textContent ?? '';
    expect(log).toContain('You are dealt');
    for (const card of theirs) expect(log, card).not.toContain(characterName(card));
  });

  it('keeps the log in a drawer, announces politely elsewhere and never shows the seed commitment', async () => {
    renderTable(stateFor(newGame(12), 'p1'));
    expect(screen.getByRole('log', { name: 'Announcements' }).getAttribute('aria-live')).toBe(
      'polite',
    );
    await userEvent.click(screen.getByText('Game log and rules'));
    expect(screen.getByTestId('log-drawer').hasAttribute('open')).toBe(true);
    const log = screen.getByRole('region', { name: 'Game log' });
    const list = within(log).getByRole('list');
    expect(list.getAttribute('aria-live')).toBeNull();
    expect(within(list).getByText('The game has started.')).toBeTruthy();
    expect(log.textContent).not.toMatch(/[0-9a-f]{16}/);
  });
});

describe('Table keeps focus on the action', () => {
  it('focuses the first action on mount and stays in the phase bar after acting', async () => {
    const { game, seat } = atHourglassChoice();
    let sent: Command | undefined;
    const { rerender } = renderTable(stateFor(game, seat), (cmd) => (sent = cmd));
    const reveal = screen.getByRole('region', { name: 'Reveal' });
    expect(reveal.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe('Place 0 Hourglasses');

    await userEvent.keyboard('{Enter}');
    expect(sent).toEqual({ place_hourglasses: { n: 0 } });
    if (sent === undefined) return;
    game.apply(seat, sent);
    await rerender({ state: stateFor(game, seat) });
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByTestId('phase-bar').contains(document.activeElement)).toBe(true);
  });

  it('does not take focus from a text input', async () => {
    const { game, seat } = atHourglassChoice();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    renderTable(stateFor(game, seat));
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('shows a problem politely without a rejection', () => {
    const state = { ...stateFor(newGame(12), 'p1'), lastError: 'error-target-not-allowed' };
    renderTable(state);
    expect(screen.getByTestId('problem').textContent?.trim()).toBe(
      "Last problem: That character can't target this card.",
    );
  });
});

describe('Table after a refusal', () => {
  it('frees a sent command for a retry when a problem is reported, even a repeated one', async () => {
    const { game, seat } = atHourglassChoice();
    const sent: Command[] = [];
    const before = stateFor(game, seat);
    const { rerender } = renderTable(before, (cmd) => sent.push(cmd));
    const button = () => screen.getByRole('button', { name: 'Place 0 Hourglasses' });

    await userEvent.click(button());
    await userEvent.click(button());
    expect(sent).toHaveLength(1);
    expect(button().getAttribute('aria-disabled')).toBe('true');

    const refused = { ...before, lastError: 'rate_limited', errorCount: 1 };
    await rerender({ state: refused });
    expect(button().getAttribute('aria-disabled')).toBe('false');
    await userEvent.click(button());
    expect(sent).toHaveLength(2);

    await rerender({ state: { ...refused, errorCount: 2 } });
    await userEvent.click(button());
    expect(sent).toHaveLength(3);
    expect(screen.getByTestId('problem').textContent).toContain('Too many actions');
  });
});
