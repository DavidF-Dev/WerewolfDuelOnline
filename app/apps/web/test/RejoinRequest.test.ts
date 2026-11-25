import { act, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClient, createLocaliser } from '@wwd/client-core';
import { defaultRulesConfig } from '@wwd/engine';
import { encode, parseClientMessage, type ClientMessage } from '@wwd/protocol';
import { createInMemoryPair } from '@wwd/transport';
import RejoinRequest from '../src/components/RejoinRequest.svelte';

const localiser = createLocaliser('en');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A seated client whose opponent's seat has been requested, with what it sends recorded. The
 * referee's clock reads `refereeNow` when it sends the request.
 */
async function requestedClient(
  refereeNow = Date.now(),
): Promise<{ client: GameClient; sent: ClientMessage[] }> {
  const client = new GameClient({ room: 'ABCDEF' });
  const [clientEnd, server] = createInMemoryPair();
  const sent: ClientMessage[] = [];
  server.onMessage((text) => {
    const parsed = parseClientMessage(text);
    if (parsed.ok) sent.push(parsed.msg);
  });
  client.attach(clientEnd);
  server.send(
    encode({
      type: 'welcome',
      seat: 'p0',
      seat_token: 'a'.repeat(32),
      room: 'ABCDEF',
      config: defaultRulesConfig(),
      pin: '1234',
      game: 0,
    }),
  );
  server.send(
    encode({ type: 'rejoin_request', deadline: refereeNow + 120_000, remaining_ms: 120_000 }),
  );
  await settle();
  sent.length = 0;
  return { client, sent };
}

describe('RejoinRequest', () => {
  it('sends approve_rejoin with the answer', async () => {
    const { client, sent } = await requestedClient();
    expect(client.current.rejoinRequested).toBe(true);
    render(RejoinRequest, {
      props: {
        localiser,
        requested: true,
        deadline: client.current.rejoinDeadline,
        opponent: { connected: false },
        onAnswer: (approve: boolean) => client.approveRejoin(approve),
      },
    });
    const dialog = screen.getByRole('alertdialog', {
      name: 'Let this device play as your opponent?',
    });
    expect(dialog.tagName).toBe('DIALOG');
    expect(document.activeElement?.textContent).toBe("Don't allow");
    await userEvent.setup().click(screen.getByRole('button', { name: 'Allow' }));
    await settle();
    expect(sent).toEqual([{ type: 'approve_rejoin', approve: true }]);
    client.dispose();
  });

  it('an answer that could not be sent can be given again, and Escape still works', async () => {
    const answers: boolean[] = [];
    render(RejoinRequest, {
      props: {
        localiser,
        requested: true,
        deadline: null,
        opponent: { connected: false },
        // Not connected: nothing can be sent.
        onAnswer: (approve: boolean) => {
          answers.push(approve);
          return false;
        },
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    const allow = screen.getByRole('button', { name: 'Allow' });
    expect(allow.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement?.textContent).toBe("Don't allow");
    const dialog = screen.getByRole('alertdialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(answers).toEqual([true, false]);
  });

  it('a sent answer is final while the request stays', async () => {
    const answers: boolean[] = [];
    render(RejoinRequest, {
      props: {
        localiser,
        requested: true,
        deadline: null,
        opponent: { connected: false },
        onAnswer: (approve: boolean) => {
          answers.push(approve);
          return true;
        },
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Allow' }));
    await user.click(screen.getByRole('button', { name: "Don't allow" }));
    expect(answers).toEqual([true]);
  });

  it('opens and counts down when this device clock is ahead of the referee', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const refereeNow = 1_000_000;
    vi.setSystemTime(refereeNow + 5 * 60_000);
    const { client } = await requestedClient(refereeNow);
    render(RejoinRequest, {
      props: {
        localiser,
        requested: client.current.rejoinRequested,
        deadline: client.current.rejoinDeadline,
        opponent: { connected: false },
        onAnswer: () => {},
      },
    });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    const expires = screen.getByTestId('rejoin-expires');
    expect(expires.textContent?.trim()).toBe('Expires in 2:00');
    await act(() => vi.advanceTimersByTime(1000));
    expect(expires.textContent?.trim()).toBe('Expires in 1:59');
    client.dispose();
  });

  it('shows when the request expires and closes itself then', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1_000_000);
    render(RejoinRequest, {
      props: {
        localiser,
        requested: true,
        deadline: 1_000_000 + 65_000,
        opponent: { connected: false },
        onAnswer: () => {},
      },
    });
    expect(screen.getByTestId('rejoin-expires').textContent?.trim()).toBe('Expires in 1:05');
    await act(() => vi.advanceTimersByTime(65_000));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('warns when someone enters a wrong PIN for the opponent seat, for a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(RejoinRequest, {
      props: {
        localiser,
        requested: false,
        deadline: null,
        opponent: { connected: false, pin_attempt_failed: true },
        onAnswer: () => {},
      },
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(localiser.t('pin-attempt-failed'));
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
