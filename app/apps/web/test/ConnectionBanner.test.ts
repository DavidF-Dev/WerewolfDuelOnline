import { act, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser, type ConnectionState, type OpponentState } from '@wwd/client-core';
import ConnectionBanner from '../src/components/ConnectionBanner.svelte';

const localiser = createLocaliser('en');
const ONLINE: ConnectionState = {
  phase: 'online',
  attempt: 0,
  nextRetryAt: null,
  stopReason: null,
  serverUnavailable: false,
};
const START = 1_000_000;

function renderBanner(opponent: OpponentState, onClaimWin = vi.fn()) {
  const result = render(ConnectionBanner, {
    props: { localiser, connection: ONLINE, opponent, lastError: null, onClaimWin },
  });
  return { ...result, onClaimWin };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConnectionBanner', () => {
  it('announces our own connection politely', () => {
    renderBanner({ connected: true });
    const status = screen.getByTestId('connection-phase');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe(localiser.t('connection-online'));
  });

  it('says calmly when the server seems unavailable', () => {
    render(ConnectionBanner, {
      props: {
        localiser,
        connection: { ...ONLINE, phase: 'offline', attempt: 12, serverUnavailable: true },
        opponent: { connected: false },
        lastError: null,
        onClaimWin: vi.fn(),
      },
    });
    expect(screen.getByTestId('connection-phase').textContent).toBe(
      "The game server isn't responding. Your game is kept on the server; this link will work again later.",
    );
  });

  it('counts down the opponent grace, then offers the claim', async () => {
    const deadline = START + (9 * 60 + 41) * 1000;
    const { rerender, onClaimWin } = renderBanner({ connected: false, grace_deadline: deadline });
    const away = screen.getByTestId('opponent-away');
    expect(away.textContent).toBe('Waiting for your opponent to reconnect (9:41)');

    await act(() => vi.advanceTimersByTime(1000));
    expect(away.textContent).toBe('Waiting for your opponent to reconnect (9:40)');
    expect(screen.queryByRole('button', { name: 'Claim the win' })).toBeNull();

    await rerender({ opponent: { connected: false, can_claim_win: true } });
    expect(vi.getTimerCount()).toBe(0);
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    expect(screen.getByRole('button', { name: 'Keep waiting' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Claim the win' }));
    expect(onClaimWin).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Claim the win')!,
    );
    expect(onClaimWin).toHaveBeenCalledTimes(1);
  });

  it('announces only changes in the opponent connection', async () => {
    const { rerender } = renderBanner({ connected: true });
    const announcement = screen.getByTestId('opponent-announcement');
    expect(announcement.getAttribute('role')).toBe('status');
    expect(announcement.textContent).toBe('');

    await rerender({ opponent: { connected: false, grace_deadline: START + 60_000 } });
    expect(announcement.textContent).toBe(localiser.t('opponent-disconnected'));
    await act(() => vi.advanceTimersByTime(3000));
    expect(announcement.textContent).toBe(localiser.t('opponent-disconnected'));

    await rerender({ opponent: { connected: false, can_claim_win: true } });
    expect(announcement.textContent).toBe(localiser.t('opponent-reconnect-over'));
    await rerender({ opponent: { connected: true } });
    expect(announcement.textContent).toBe(localiser.t('opponent-reconnected'));
  });

  it('starts a fresh claim offer after the opponent comes back', async () => {
    const { rerender } = renderBanner({ connected: false, can_claim_win: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await user.click(screen.getByRole('button', { name: 'Keep waiting' }));
    expect(screen.queryByRole('button', { name: 'Keep waiting' })).toBeNull();

    await rerender({ opponent: { connected: true } });
    await rerender({ opponent: { connected: false, can_claim_win: true } });
    expect(screen.getByRole('button', { name: 'Keep waiting' })).toBeTruthy();
    expect(screen.getByTestId('opponent-away').textContent?.trim()).toBe(
      localiser.t('opponent-reconnect-over'),
    );
  });

  it('ticks only while the countdown is visible', async () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderBanner({ connected: false, grace_deadline: START + 60_000 });
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue('visible');
    await act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(vi.getTimerCount()).toBe(1);
    hidden.mockRestore();
  });

  it('says why reconnecting stopped', () => {
    render(ConnectionBanner, {
      props: {
        localiser,
        connection: { ...ONLINE, phase: 'offline', stopReason: 'superseded' },
        opponent: { connected: true },
        lastError: 'superseded',
        onClaimWin: () => {},
      },
    });
    expect(screen.getByRole('alert').textContent).toBe('Continued on another device.');
  });
});
