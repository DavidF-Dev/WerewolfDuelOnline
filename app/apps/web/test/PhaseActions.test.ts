import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Command } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import PhaseActions from '../src/components/PhaseActions.svelte';

function renderActions(legal: Command[]) {
  const onCommand = vi.fn<(cmd: Command) => void>();
  render(PhaseActions, {
    props: { localiser: createLocaliser('en'), legal, instruction: 'Do something.', onCommand },
  });
  const region = within(screen.getByRole('region', { name: 'Actions' }));
  const labels = region.queryAllByRole('button').map((b) => b.textContent?.trim());
  return { onCommand, region, labels };
}

describe('PhaseActions', () => {
  it('offers the next round', async () => {
    const { labels, region, onCommand } = renderActions(['next_round']);
    expect(labels).toEqual(['Next round']);
    await userEvent.click(region.getByRole('button', { name: 'Next round' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('next_round');
  });

  it('leaves the other commands to their own panels and shows the instruction', () => {
    const { labels, region } = renderActions([
      { submit_plan: { character: 'villager', targets: ['fool'] } },
      { place_hourglasses: { n: 0 } },
      { choose_potion_target: { card: 'witch' } },
      { hunter_spend_cross: { spend: true } },
    ]);
    expect(labels).toEqual([]);
    expect(region.getByText('Do something.')).toBeTruthy();
  });

  it('ignores repeated presses until the legal list changes', async () => {
    const legal: Command[] = ['next_round'];
    const onCommand = vi.fn<(cmd: Command) => void>();
    const { rerender } = render(PhaseActions, {
      props: { localiser: createLocaliser('en'), legal, instruction: 'Go.', onCommand },
    });
    const button = screen.getByRole('button', { name: 'Next round' });
    await userEvent.dblClick(button);
    await userEvent.click(button);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await rerender({ legal: ['next_round'] });
    await userEvent.click(screen.getByRole('button', { name: 'Next round' }));
    expect(onCommand).toHaveBeenCalledTimes(2);
  });
});
