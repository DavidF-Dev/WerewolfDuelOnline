import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { effectiveInitiative, type Command, type Game, type Seat } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { initiative as printedInitiative } from '../../src/cards.js';
import { opponentPlacedState } from '../../src/gallery/fixtures.js';
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

  it("reveal shows the opponent's face-down side on the left, then mine with its targets", () => {
    const { game, seat } = atSecondHourglassChoice();
    renderPanel(game, seat);
    const versus = screen.getByTestId('reveal-sides');
    const sides = Array.from(versus.children, (side) => (side as HTMLElement).dataset['testid']);
    expect(sides, 'opponent left, you right').toEqual(['reveal-side-opponent', 'reveal-side-you']);

    const theirs = within(versus).getByTestId('reveal-side-opponent');
    expect(theirs.querySelector('[data-part="side-face-down"]')).not.toBeNull();
    expect(theirs.querySelector('.card'), 'their card stays face down').toBeNull();
    expect(theirs.querySelector('[data-part="side-initiative"]')?.textContent?.trim()).toBe(
      'Initiative ?',
    );

    const plan = game.view({ seat }).players[seat === 'p0' ? 0 : 1].plan;
    if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('no plan');
    const mine = within(versus).getByTestId('reveal-side-you');
    const card = within(mine).getByRole('button', { name: new RegExp(myCharacter(game, seat)) });
    expect(sizeOf(card.closest('.card')!), 'a target-size card').toBe('target');
    expect(mine.querySelector('[data-part="side-who"]')?.textContent?.trim()).toBe('You');
    expect(mine.querySelectorAll('[data-part="side-target"]')).toHaveLength(
      plan.revealed.targets.length,
    );
    expect(mine.querySelector('[data-part="side-pill"]'), 'my side shows my targets').toBeNull();
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
    const pill = within(screen.getByTestId('reveal-side-opponent')).getByRole('img', {
      name: 'Placed 0 Hourglasses',
    });
    expect(pill.textContent?.trim()).toBe('+0');
    expect(pill.classList).toContain('muted');
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
    const mine = screen.getByTestId('reveal-side-you');
    expect(sizeOf(mine.querySelector('.card')!), 'a target-size card').toBe('target');
    expect(
      screen.getByTestId('reveal-side-opponent').querySelector('[data-part="side-face-down"]'),
      "the opponent's card stays face down",
    ).not.toBeNull();
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
  it('the opponent-placed state draws the pill at full strength', () => {
    const state = opponentPlacedState();
    render(RevealPanel, {
      props: {
        localiser,
        view: state.view!,
        seat: state.seat!,
        events: state.events,
        legal: state.legal,
        onCommand: () => {},
      },
    });
    const pill = screen
      .getByTestId('reveal-side-opponent')
      .querySelector('[data-part="side-pill"]')!;
    expect(pill.textContent?.trim()).toMatch(/^[+][1-9]/u);
    expect(pill.classList).not.toContain('muted');
    expect(pill.getAttribute('aria-label')).toMatch(/^Placed [1-9]/u);
  });
});
