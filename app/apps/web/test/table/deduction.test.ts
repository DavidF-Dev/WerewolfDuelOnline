import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Character, Seat, View } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { CHARACTERS, TARGET_CARDS, targetId } from '../../src/cards.js';
import DeductionTracker from '../../src/table/DeductionTracker.svelte';
import {
  cycleMark,
  markOf,
  observe,
  startDeduction,
  type Deduction,
  type DeductionMark,
} from '../../src/table/deduction.js';
import { newGame, playUntil } from '../games.js';

const localiser = createLocaliser('en');
const SEAT: Seat = 'p1';
const OPPONENT: Seat = 'p0';
const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

function marks(d: Deduction, autoMark = true): Record<string, DeductionMark> {
  return Object.fromEntries(
    TARGET_CARDS.map((card) => [targetId(card), markOf(d, card, autoMark)]),
  );
}

const revealedCharacter = (view: View, seat: Seat): Character | undefined => {
  const plan = view.players[index(seat)].plan;
  return typeof plan === 'object' && 'revealed' in plan ? plan.revealed.character : undefined;
};

describe('deduction tracker', () => {
  it('auto-mark marks my hand and revealed cards only', () => {
    const game = newGame(12);
    const view = (): View => game.view({ seat: SEAT });
    const hand = view().players[index(SEAT)].hand ?? [];
    const theirs = game.view('omniscient').players[index(OPPONENT)].hand ?? [];
    let d = observe(startDeduction(0), view(), SEAT);

    const dealt = marks(d);
    for (const c of CHARACTERS) expect(dealt[c], c).toBe(hand.includes(c) ? 'mine' : 'possible');
    for (const c of theirs) expect(dealt[c], `hidden ${c}`).toBe('possible');
    expect(dealt['fool']).toBe('possible');

    playUntil(game, () => view().showdown !== null);
    d = observe(d, view(), SEAT);
    const theirCard = revealedCharacter(view(), OPPONENT);
    expect(theirCard).toBeDefined();
    const after = marks(d);
    for (const c of CHARACTERS) {
      const expected = hand.includes(c) ? 'mine' : c === theirCard ? 'ruled-out' : 'possible';
      expect(after[c], c).toBe(expected);
    }

    const off = marks(d, false);
    expect(Object.values(off).every((m) => m === 'possible')).toBe(true);
  });

  it('marks reset each round', () => {
    const game = newGame(12);
    const view = (): View => game.view({ seat: SEAT });
    let d = observe(startDeduction(0), view(), SEAT);
    const firstHand = view().players[index(SEAT)].hand ?? [];
    const notMine = CHARACTERS.find((c) => !firstHand.includes(c));
    if (notMine === undefined) throw new Error('every card is in hand');
    d = cycleMark(d, { character: notMine }, true);
    d = cycleMark(d, 'fool', true);
    expect(markOf(d, 'fool', true)).toBe('ruled-out');

    playUntil(game, () => view().round === 2 && view().players[index(SEAT)].hand !== null);
    d = observe(d, view(), SEAT);
    const secondHand = view().players[index(SEAT)].hand ?? [];
    const now = marks(d);
    for (const c of CHARACTERS)
      expect(now[c], c).toBe(secondHand.includes(c) ? 'mine' : 'possible');
    expect(now['fool']).toBe('possible');
  });

  it('manual marks cycle', async () => {
    const user = userEvent.setup();
    const game = newGame(12);
    const view = game.view({ seat: SEAT });
    const hand = view.players[index(SEAT)].hand ?? [];
    const notMine = CHARACTERS.find((c) => !hand.includes(c));
    const mine = hand[0];
    if (notMine === undefined || mine === undefined) throw new Error('unexpected deal');
    render(DeductionTracker, { props: { localiser, view, seat: SEAT } });
    const region = within(screen.getByRole('region', { name: 'Deduction' }));

    const card = within(region.getByTestId(`deduction-${notMine}`));
    const button = card.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(card.getByText('Possible')).toBeTruthy();
    await user.click(button);
    expect(button.getAttribute('aria-pressed'), 'ruled out is not a selection').toBe('false');
    expect(button.classList.contains('ruled-out')).toBe(true);
    expect(card.getByText('Ruled out')).toBeTruthy();
    await user.click(button);
    expect(button.classList.contains('ruled-out')).toBe(false);
    expect(card.getByText('Possible')).toBeTruthy();

    const own = within(region.getByTestId(`deduction-${mine}`));
    const ownButton = own.getByRole('button');
    expect(ownButton.getAttribute('aria-disabled')).toBe('true');
    expect(own.getByText('In your hand')).toBeTruthy();
    await user.click(ownButton);
    expect(own.getByText('In your hand')).toBeTruthy();
    expect(own.queryByText('Ruled out')).toBeNull();
  });
});
