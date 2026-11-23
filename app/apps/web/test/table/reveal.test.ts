import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { effectiveInitiative, type Command, type Game, type Seat } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { initiative as printedInitiative } from '../../src/cards.js';
import RevealPanel from '../../src/table/RevealPanel.svelte';
import { newGame, playUntil } from '../games.js';

const localiser = createLocaliser('en');

/** A game in which the second seat to reveal (returned) must now place Hourglasses. */
function atSecondHourglassChoice(): { game: Game; seat: Seat } {
  const game = newGame(12);
  let placed = 0;
  playUntil(
    game,
    () => game.pending().kind === 'place_hourglasses' && placed === 1,
    (legal) => {
      const cmd = legal[0];
      if (cmd !== undefined && typeof cmd === 'object' && 'place_hourglasses' in cmd) placed += 1;
      return cmd;
    },
  );
  const seat = game.pending().seats[0];
  if (seat === undefined) throw new Error('nobody to place Hourglasses');
  return { game, seat };
}

function renderPanel(game: Game, seat: Seat, legal: Command[] = game.legalActions(seat)) {
  const onCommand = vi.fn<(cmd: Command) => void>();
  const viewer = { seat };
  render(RevealPanel, {
    props: {
      localiser,
      view: game.view(viewer),
      seat,
      events: game.eventsSince(0, viewer),
      legal,
      onCommand,
    },
  });
  return { onCommand };
}

const myCharacter = (game: Game, seat: Seat): string => {
  const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
  if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
  return localiser.t(`character-${plan.revealed.character.replaceAll('_', '-')}`);
};

describe('RevealPanel', () => {
  it('hourglass stepper offers only legal values and shows effective initiative', async () => {
    const { game, seat } = atSecondHourglassChoice();
    const legal: Command[] = [0, 1, 2].map((n) => ({ place_hourglasses: { n } }));
    const { onCommand } = renderPanel(game, seat, legal);
    const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
    if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
    const initiative = printedInitiative(plan.revealed.character);

    const count = screen.getByTestId('hourglass-count');
    const fewer = screen.getByRole('button', { name: 'Fewer Hourglasses' });
    const more = screen.getByRole('button', { name: 'More Hourglasses' });
    const effective = screen.getByTestId('effective-initiative');
    expect(count.textContent).toBe('0');
    expect(fewer.getAttribute('aria-disabled')).toBe('true');
    expect(effective.textContent).toBe(
      `${myCharacter(game, seat)}: initiative ${initiative} (printed ${initiative})`,
    );

    await userEvent.click(more);
    await userEvent.click(more);
    expect(count.textContent).toBe('2');
    expect(effective.textContent).toBe(
      `${myCharacter(game, seat)}: initiative ${effectiveInitiative(plan.revealed.character, 2)} (printed ${initiative})`,
    );
    expect(more.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(more);
    expect(count.textContent).toBe('2');

    await userEvent.click(screen.getByRole('button', { name: 'Place 2 Hourglasses' }));
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0], 'the legal entry itself is sent').toBe(legal[2]);
  });

  it("shows the opponent's choice once it arrives", () => {
    const { game, seat } = atSecondHourglassChoice();
    renderPanel(game, seat);
    expect(screen.getByTestId('opponent-hourglasses').textContent).toBe(
      'Your opponent placed 0 Hourglasses.',
    );
    expect(screen.getByTestId('hourglass-count').textContent).toBe('0');
  });

  it('offers the Potion targets from legal', async () => {
    const { game, seat } = atSecondHourglassChoice();
    const legal: Command[] = [
      { choose_potion_target: { card: 'wolf_king' } },
      { choose_potion_target: { card: 'witch' } },
    ];
    const { onCommand } = renderPanel(game, seat, legal);
    expect(screen.queryByTestId('hourglass-count')).toBeNull();
    const picker = screen.getByRole('region', { name: 'Choose the Potion target' });
    expect(picker.querySelectorAll('button')).toHaveLength(2);
    await userEvent.click(screen.getByTestId('action-potion-witch'));
    await userEvent.click(screen.getByTestId('action-potion-wolf_king'));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ choose_potion_target: { card: 'witch' } });
  });
});
