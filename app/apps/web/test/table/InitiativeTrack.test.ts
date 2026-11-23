import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { showdownOrder, type Command, type Event, type Seat, type View } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import InitiativeTrack from '../../src/table/InitiativeTrack.svelte';
import { newGame, playUntil } from '../games.js';

const localiser = createLocaliser('en');
const names: Record<Seat, string> = { p0: 'Your opponent', p1: 'You' };
const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

/** Places as many Hourglasses as allowed, so effective and printed initiative differ. */
const mostHourglasses = (legal: Command[]): Command | undefined =>
  legal.filter((c) => typeof c === 'object' && 'place_hourglasses' in c).at(-1) ??
  legal.find((c) => c !== 'resign');

/** A view at the end of the first round, after the Hourglasses went back, with its events. */
function revealed(): { view: View; events: Array<[number, Event]>; effective: [number, number] } {
  const game = newGame(12);
  playUntil(game, () => game.view({ seat: 'p1' }).phase === 'round_over', mostHourglasses);
  const view = game.view({ seat: 'p1' });
  const events = game.eventsSince(0, { seat: 'p1' });
  const reveal = events.find(([, e]) => 'plans_revealed' in e.kind)?.[1].kind;
  if (reveal === undefined || !('plans_revealed' in reveal)) throw new Error('no reveal');
  return { view, events, effective: reveal.plans_revealed.effective };
}

function entries(view: View, events: Array<[number, Event]>): string[] {
  const { unmount } = render(InitiativeTrack, { props: { localiser, view, events, names } });
  const track = within(screen.getByRole('region', { name: 'Showdown order' }));
  const lines = track.getAllByRole('listitem').map((li) => li.textContent?.trim() ?? '');
  unmount();
  return lines;
}

describe('InitiativeTrack', () => {
  it('initiative track follows the engine order', () => {
    const { view, events, effective } = revealed();
    expect(
      view.players.every((p) => p.placed === 0),
      'Hourglasses are back after the round',
    ).toBe(true);
    const placed = events.some(
      ([, e]) => 'hourglasses_placed' in e.kind && e.kind.hourglasses_placed.n > 0,
    );
    expect(placed, 'an Hourglass lowered an initiative this round').toBe(true);
    const order = showdownOrder(view);
    expect(order).not.toBeNull();
    for (const engineOrder of [order!, [order![1], order![0]] as [Seat, Seat]]) {
      const lines = entries({ ...view, showdown: engineOrder }, events);
      expect(lines).toHaveLength(2);
      engineOrder.forEach((seat, i) => {
        expect(lines[i]).toMatch(new RegExp(`^${i + 1}\\. ${names[seat]}: `));
        expect(lines[i]).toContain(`initiative ${effective[index(seat)]}`);
      });
    }
  });

  it('shows the order without numbers when the reveal event is not held', () => {
    const { view } = revealed();
    const lines = entries(view, []);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).not.toContain('initiative');
  });

  it('is absent before the reveal', () => {
    const game = newGame(12);
    render(InitiativeTrack, {
      props: { localiser, view: game.view({ seat: 'p1' }), events: [], names },
    });
    expect(screen.queryByRole('region', { name: 'Showdown order' })).toBeNull();
  });
});
