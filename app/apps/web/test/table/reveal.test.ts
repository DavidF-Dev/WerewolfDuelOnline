import { render, screen, within } from '@testing-library/svelte';
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
      tiebreak: 'hourglasses_then_badge',
    },
  });
  return { onCommand };
}

const myCharacter = (game: Game, seat: Seat): string => {
  const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
  if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
  return localiser.t(`character-${plan.revealed.character.replaceAll('_', '-')}`);
};

const sizeOf = (element: Element): string | undefined =>
  ['large', 'medium', 'target'].find((size) => element.classList.contains(size));

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

    const place = screen.getByRole('button', { name: 'Place 2 Hourglasses' });
    expect(place.querySelector('[data-part="spinner"]')).toBeNull();
    await userEvent.click(place);
    expect(place.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0], 'the legal entry itself is sent').toBe(legal[2]);
  });

  it('reveal shows the face-down card against mine', () => {
    const { game, seat } = atSecondHourglassChoice();
    renderPanel(game, seat);
    const versus = screen.getByTestId('reveal-versus');
    const faceDown = within(versus).getByRole('img', {
      name: "Your opponent's character, face down",
    });
    const mine = within(versus).getByTestId('reveal-my-card');
    const vs = within(versus).getByText('vs');
    const follows = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(faceDown, vs) && follows(vs, mine), 'face-down, vs, then mine').toBe(true);
    expect(mine.getAttribute('aria-label')).toContain(myCharacter(game, seat));
    const frame = mine.closest('.card');
    if (frame === null) throw new Error('no card frame');
    expect(sizeOf(frame), 'a medium card while placing Hourglasses').toBe('medium');
    expect(sizeOf(faceDown), 'the face-down card matches mine').toBe('medium');

    const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
    if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
    const summary = within(versus).getByTestId('reveal-my-plan');
    const bold = Array.from(summary.querySelectorAll('strong'), (b) => b.textContent);
    expect(bold[0]).toBe(myCharacter(game, seat));
    expect(bold, 'the character and each target').toHaveLength(1 + plan.revealed.targets.length);
  });

  it('spend panel shows the initiative change, a track and the tiebreak', async () => {
    const { game, seat } = atSecondHourglassChoice();
    const legal: Command[] = [0, 1, 2].map((n) => ({ place_hourglasses: { n } }));
    renderPanel(game, seat, legal);
    const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
    if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
    const printed = printedInitiative(plan.revealed.character);
    const panel = screen.getByRole('group', { name: 'Spend Hourglasses' });
    const change = within(panel).getByTestId('initiative-change');
    const flat = (element: Element): string =>
      element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(flat(change)).toBe(`${myCharacter(game, seat)} initiative ${printed} → ${printed}`);
    expect(
      within(panel).getByTestId('hourglass-count').getAttribute('aria-live'),
      'the status line is the one announcement',
    ).toBe('off');
    expect(screen.getByTestId('effective-initiative').getAttribute('role')).toBe('status');
    const mark = () => panel.querySelector('[data-part="track"] [data-mine]');
    expect(panel.querySelectorAll('[data-part="track"] [data-slot]')).toHaveLength(9);
    expect(mark()?.getAttribute('data-slot')).toBe(String(printed));
    expect(mark()?.textContent).toContain('▲');
    await userEvent.click(within(panel).getByRole('button', { name: 'More Hourglasses' }));
    const effective = effectiveInitiative(plan.revealed.character, 1);
    expect(flat(change)).toBe(`${myCharacter(game, seat)} initiative ${printed} → ${effective}`);
    expect(mark()?.getAttribute('data-slot')).toBe(String(effective));
    expect(within(panel).getByTestId('reveal-note').textContent?.trim()).toBe(
      'Lower initiative resolves first. On a tie, the player who placed more Hourglasses goes first, then the Badge holder.',
    );
  });

  it("shows the opponent's choice once it arrives", () => {
    const { game, seat } = atSecondHourglassChoice();
    renderPanel(game, seat);
    expect(screen.getByTestId('opponent-hourglasses').textContent).toBe('Placed 0 Hourglasses');
    expect(screen.getByTestId('hourglass-count').textContent).toBe('0');
  });

  it('offers the Potion targets from legal and confirms the one aimed at', async () => {
    const { game, seat } = atSecondHourglassChoice();
    const legal: Command[] = [
      { choose_potion_target: { card: 'wolf_king' } },
      { choose_potion_target: { card: 'witch' } },
    ];
    const { onCommand } = renderPanel(game, seat, legal);
    expect(screen.queryByTestId('hourglass-count')).toBeNull();
    const versus = screen.getByTestId('reveal-versus');
    const faceDown = within(versus).getByRole('img', {
      name: "Your opponent's character, face down",
    });
    expect(sizeOf(faceDown), 'the Potion uses target-size cards').toBe('target');
    expect(sizeOf(within(versus).getByTestId('reveal-my-card').closest('.card')!)).toBe('target');
    const picker = screen.getByRole('region', { name: 'Choose the Potion target' });
    expect(picker.querySelectorAll('[data-testid^="action-potion-"]')).toHaveLength(2);
    const confirm = screen.getByTestId('confirm-potion');
    expect(confirm.hasAttribute('disabled'), 'nothing is aimed at yet').toBe(true);
    await userEvent.click(screen.getByTestId('action-potion-witch'));
    await userEvent.click(screen.getByTestId('action-potion-wolf_king'));
    expect(onCommand, 'choosing a card only aims').not.toHaveBeenCalled();
    expect(screen.getByTestId('action-potion-wolf_king').getAttribute('aria-pressed')).toBe('true');
    expect(confirm.textContent?.trim()).toBe('Aim the Potion at Wolf King');
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({
      choose_potion_target: { card: 'wolf_king' },
    });
  });
});
