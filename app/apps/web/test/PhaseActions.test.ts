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

describe('PhaseActions renders one button per legal command', () => {
  it('offers each Hourglass count', async () => {
    const legal: Command[] = [0, 1, 2].map((n) => ({ place_hourglasses: { n } }));
    const { labels, region, onCommand } = renderActions(legal);
    expect(labels).toEqual(['Place 0 Hourglasses', 'Place 1 Hourglass', 'Place 2 Hourglasses']);
    await userEvent.click(region.getByRole('button', { name: 'Place 1 Hourglass' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ place_hourglasses: { n: 1 } });
  });

  it('offers each Potion target', async () => {
    const { labels, region, onCommand } = renderActions([
      { choose_potion_target: { card: 'wolf_king' } },
      { choose_potion_target: { card: 'witch' } },
    ]);
    expect(labels).toEqual(['Aim the Potion at Wolf King', 'Aim the Potion at Witch']);
    await userEvent.click(region.getByRole('button', { name: 'Aim the Potion at Witch' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ choose_potion_target: { card: 'witch' } });
  });

  it('offers the Hunter choice', async () => {
    const { labels, region, onCommand } = renderActions([
      { hunter_spend_cross: { spend: true } },
      { hunter_spend_cross: { spend: false } },
    ]);
    expect(labels).toEqual(['Spend a Cross to attack', 'Keep the Cross']);
    await userEvent.click(region.getByRole('button', { name: 'Keep the Cross' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ hunter_spend_cross: { spend: false } });
  });

  it('offers the next round', async () => {
    const { labels, region, onCommand } = renderActions(['next_round']);
    expect(labels).toEqual(['Next round']);
    await userEvent.click(region.getByRole('button', { name: 'Next round' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('next_round');
  });

  it('leaves plans to the plan builder and shows the instruction', () => {
    const { labels, region } = renderActions([
      { submit_plan: { character: 'villager', targets: ['fool'] } },
    ]);
    expect(labels).toEqual([]);
    expect(region.getByText('Do something.')).toBeTruthy();
  });
});

describe('PhaseActions sends once per offer', () => {
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
