import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import InvitePanel from '../src/components/InvitePanel.svelte';
import { DEFAULT_SERVER } from '../src/online.js';

const localiser = createLocaliser('en');
const base = (): string => `${location.origin}${location.pathname}`;

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'share');
});

describe('InvitePanel', () => {
  it('shows the grouped code and copies the link built from the code and server without a share sheet', async () => {
    // userEvent installs its own clipboard, so it is set up before the stub replaces it.
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(InvitePanel, {
      props: { localiser, room: 'K7Q2MX', server: 'https://other.example' },
    });
    expect(screen.getByTestId('invite-code').textContent).toBe('K7Q·2MX');

    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${base()}#/join/K7Q2MX?server=https%3A%2F%2Fother.example`,
    );
    await waitFor(() =>
      expect(screen.getByTestId('invite-feedback').textContent).toBe(localiser.t('copy-done')),
    );

    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenLastCalledWith('K7Q2MX');
  });

  it('leaves the default server out of the link', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(InvitePanel, { props: { localiser, room: 'K7Q2MX', server: DEFAULT_SERVER } });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(writeText).toHaveBeenCalledWith(`${base()}#/join/K7Q2MX`);
  });

  it('shares the link with the browser share sheet when there is one', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(InvitePanel, { props: { localiser, room: 'K7Q2MX', server: DEFAULT_SERVER } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Share link' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${base()}#/join/K7Q2MX` }));
  });

  it('share falls back to copy', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(InvitePanel, { props: { localiser, room: 'K7Q2MX', server: DEFAULT_SERVER } });
    await user.click(screen.getByRole('button', { name: 'Share link' }));
    expect(writeText).toHaveBeenCalledWith(`${base()}#/join/K7Q2MX`);
    await waitFor(() => expect(screen.getByTestId('invite-feedback').textContent).toBe('Copied'));
  });

  it('shows a QR code of the link and the waiting status', () => {
    render(InvitePanel, { props: { localiser, room: 'K7Q2MX', server: DEFAULT_SERVER } });
    expect(screen.getByRole('img', { name: `${base()}#/join/K7Q2MX` })).toBeTruthy();
    expect(screen.getByText('Waiting for your opponent…')).toBeTruthy();
  });
});
