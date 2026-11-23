import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import ContinueElsewhere from '../src/components/ContinueElsewhere.svelte';
import { DEFAULT_SERVER } from '../src/online.js';

const localiser = createLocaliser('en');

describe('ContinueElsewhere', () => {
  it('hides the PIN until asked', async () => {
    const { container } = render(ContinueElsewhere, {
      props: { localiser, room: 'K7Q2MX', seat: 'p1', server: DEFAULT_SERVER, pin: '4821' },
    });
    expect(container.innerHTML).not.toContain('4821');
    expect(screen.getByTestId('rejoin-link').textContent).toBe(
      `Rejoin link: ${location.origin}${location.pathname}#/rejoin?code=K7Q2MX&seat=p1`,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Continue on another device'));
    await user.click(screen.getByRole('button', { name: 'Show PIN' }));
    expect(screen.getByTestId('pin').textContent).toBe('PIN: 4821');
    await user.click(screen.getByRole('button', { name: 'Hide PIN' }));
    expect(container.innerHTML).not.toContain('4821');
  });
});
