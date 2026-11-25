import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Character } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { TARGET_CARDS, targetId } from '../../src/cards.js';
import Table from '../../src/screens/Table.svelte';
import TargetGrid from '../../src/table/TargetGrid.svelte';
import { isInHand } from '../../src/table/targets.js';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');

/** The text of whatever describes `element`. */
const description = (element: HTMLElement): string =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('Targets', () => {
  it('only the characters in my hand are in hand, never the Fool', () => {
    const hand: Character[] = ['knight', 'wolfen'];
    expect(TARGET_CARDS.filter((card) => isInHand(card, hand)).map(targetId)).toEqual([
      'knight',
      'wolfen',
    ]);
    expect(isInHand('fool', hand)).toBe(false);
  });

  it('targets panel has no manual marks', async () => {
    const hand: Character[] = ['hunter', 'seer', 'villager'];
    render(TargetGrid, { props: { localiser, hand } });
    const panel = screen.getByRole('region', { name: 'Targets' });
    const cards = within(panel).getAllByRole('button');
    expect(cards).toHaveLength(TARGET_CARDS.length);

    const before = cards.map((card) => card.outerHTML);
    for (const card of cards) await userEvent.click(card);
    expect(
      cards.map((card) => card.outerHTML),
      'a tap marks nothing',
    ).toEqual(before);

    cards.forEach((card, i) => {
      const id = targetId(TARGET_CARDS[i]!);
      expect(card.getAttribute('aria-pressed'), id).toBeNull();
      expect(description(card), id).toBe(hand.includes(id as Character) ? 'In hand' : '');
    });
    expect(panel.querySelectorAll('[data-part="in-hand"]')).toHaveLength(hand.length);
    expect(panel.textContent).not.toMatch(/ruled out|possible/i);

    cleanup();

    // Once my plan is sealed the same panel shows it, and a tap still marks nothing.
    const game = newGame(12);
    const mine = game
      .legalActions('p1')
      .find(
        (cmd) =>
          typeof cmd === 'object' && 'submit_plan' in cmd && cmd.submit_plan.targets.length > 0,
      );
    if (mine === undefined || typeof mine !== 'object' || !('submit_plan' in mine)) {
      throw new Error('no plan with targets');
    }
    game.apply('p1', mine);
    const state = stateFor(game, 'p1');
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    const sealed = screen.getByRole('region', { name: 'Targets' });
    const drawn = () =>
      Array.from(sealed.querySelectorAll('.frame'), (frame) =>
        frame.classList.contains('selected'),
      );
    const planned = mine.submit_plan.targets.map(targetId);
    expect(drawn()).toEqual(TARGET_CARDS.map((card) => planned.includes(targetId(card))));
    const sealedCards = within(sealed).getAllByRole('button');
    const html = sealedCards.map((card) => card.outerHTML);
    for (const card of sealedCards) await userEvent.click(card);
    expect(sealedCards.map((card) => card.outerHTML)).toEqual(html);
    expect(drawn()).toEqual(TARGET_CARDS.map((card) => planned.includes(targetId(card))));
    const myHand = state.view?.players[1].hand ?? [];
    expect(sealed.querySelectorAll('[data-part="in-hand"]')).toHaveLength(
      TARGET_CARDS.filter((card) => isInHand(card, myHand)).length,
    );
  });

  it('the table shows one targets panel in the plan and no deduction tracker', () => {
    render(Table, {
      props: { localiser, state: stateFor(newGame(12), 'p1'), onCommand: () => {} },
    });
    expect(screen.getAllByRole('region', { name: 'Targets' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: /deduction/i })).toBeNull();
    expect(screen.queryByText(/ruled out/i)).toBeNull();
  });
});
