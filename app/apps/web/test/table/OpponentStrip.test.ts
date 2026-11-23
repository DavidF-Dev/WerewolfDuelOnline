import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import OpponentStrip from '../../src/table/OpponentStrip.svelte';
import { newGame } from '../games.js';

const localiser = createLocaliser('en');

function connection(connected: boolean): { text: string; shape: string | null } {
  const player = newGame(12).view({ seat: 'p1' }).players[0];
  const { unmount } = render(OpponentStrip, {
    props: { localiser, name: 'Mika', connected, player, hasBadge: true },
  });
  const region = within(screen.getByRole('region', { name: 'Opponent: Mika' }));
  const status = region.getByTestId('opponent-connection');
  const icon = status.querySelector('svg');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  const result = { text: status.textContent?.trim() ?? '', shape: icon?.innerHTML ?? null };
  unmount();
  return { text: result.text, shape: result.shape };
}

describe('OpponentStrip', () => {
  it('connection state is not colour alone', () => {
    const on = connection(true);
    const off = connection(false);
    expect(on.text).toBe('Connected');
    expect(off.text).toBe('Not connected');
    expect(on.shape).not.toBe(off.shape);
  });

  it('shows markers, hand size and plan status as text', () => {
    const player = newGame(12).view({ seat: 'p1' }).players[0];
    render(OpponentStrip, {
      props: { localiser, name: 'Mika', connected: true, player, hasBadge: true },
    });
    const region = within(screen.getByRole('region', { name: 'Opponent: Mika' }));
    expect(region.getByText('Health: 2')).toBeTruthy();
    expect(region.getByText('Badge')).toBeTruthy();
    expect(region.getByText(`Cards in hand: ${player.hand_size}`)).toBeTruthy();
    expect(region.getByText('Plan: not sealed yet')).toBeTruthy();
  });
});
