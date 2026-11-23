import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import ResignButton from '../src/components/ResignButton.svelte';

const localiser = createLocaliser('en');

describe('ResignButton', () => {
  it('confirms before sending resign', async () => {
    const onResign = vi.fn();
    render(ResignButton, { props: { localiser, onResign } });
    const user = userEvent.setup();
    const resign = screen.getByRole('button', { name: 'Resign' });
    await user.click(resign);
    expect(onResign).not.toHaveBeenCalled();
    screen.getByRole('alertdialog', { name: 'Resign this game? Your opponent wins.' });

    await user.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(resign);
    expect(onResign).not.toHaveBeenCalled();

    await user.click(resign);
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Resign' }));
    expect(onResign).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
