import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { defaultRulesConfig } from '@wwd/engine';
import { BroadcastChannelHost, MemoryReferee } from '@wwd/referee-memory';
import { channelFor } from '../src/local-room.js';
import Join from '../src/screens/Join.svelte';
import { clearSession, loadSession, saveSession } from '../src/session.js';

const localiser = createLocaliser('en');
const waiting = localiser.t('status-waiting');

let referee: MemoryReferee;
let host: BroadcastChannelHost;
let room: string;

beforeEach(() => {
  referee = new MemoryReferee();
  room = referee.createRoom(defaultRulesConfig());
  host = new BroadcastChannelHost(referee, channelFor(room));
});

afterEach(() => {
  host.close();
  referee.close();
  clearSession();
});

const waitUntilWaiting = (): Promise<void> =>
  waitFor(() => expect(screen.getByTestId('join-status').textContent).toBe(waiting));

/** The seat this page's client holds, from the development hook. */
const seat = (): string | null | undefined => window.__wwd?.state().seat;

describe('local Join', () => {
  it('shows a spinner beside the status until the game starts', async () => {
    render(Join, { props: { localiser, code: room } });
    const status = await screen.findByTestId('join-status');
    const panel = status.closest('.panel')!;
    expect(panel.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    await waitUntilWaiting();
    expect(panel.querySelector('[data-part="spinner"]')).not.toBeNull();
  });

  it('shows no spinner once the game is disconnected', async () => {
    // The host's lock is granted at once, as when the host page has closed.
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        query: () => Promise.reject(new Error('not checked here')),
        request: (_name: string, _options: unknown, gone: () => void) =>
          Promise.resolve().then(gone),
      },
    });
    onTestFinished(() => {
      delete (navigator as { locks?: unknown }).locks;
    });
    render(Join, { props: { localiser, code: room } });
    await waitFor(() =>
      expect(screen.getByTestId('join-status').textContent).toBe(
        localiser.t('status-disconnected'),
      ),
    );
    const panel = screen.getByTestId('join-status').closest('.panel')!;
    expect(panel.querySelector('[data-part="spinner"]')).toBeNull();
    expect(panel.querySelector('.dot')).toBeNull();
  });

  it('a linked code joins at once', async () => {
    render(Join, { props: { localiser, code: room.toLowerCase() } });
    await waitUntilWaiting();
    expect(screen.queryByTestId('join-code-input')).toBeNull();
    expect(seat()).toBe('p0');
  });

  it('without a linked code shows the empty form', async () => {
    render(Join, { props: { localiser } });
    const input = screen.getByLabelText('Join code');
    expect(input).toHaveProperty('value', '');
    expect(screen.queryByRole('alert')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('join-status')).toBeNull();
  });

  it('a typed code still joins', async () => {
    render(Join, { props: { localiser } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Join code'), room);
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitUntilWaiting();
  });

  it('an invalid linked code shows the code error and does not join', async () => {
    render(Join, { props: { localiser, code: 'K7Q' } });
    expect((await screen.findByRole('alert')).textContent).toBe(localiser.t('join-code-invalid'));
    expect(screen.getByLabelText('Join code')).toHaveProperty('value', 'K7Q');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('join-status')).toBeNull();
  });

  it('a kept seat for the linked room resumes', async () => {
    const first = render(Join, { props: { localiser, code: room } });
    await waitUntilWaiting();
    const kept = loadSession();
    expect(kept?.room).toBe(room);
    first.unmount();
    if (kept !== undefined) saveSession(kept);

    render(Join, { props: { localiser, code: room } });
    await waitUntilWaiting();
    expect(seat()).toBe('p0');
    // A fresh join would be given a new token.
    expect(loadSession()?.seatToken).toBe(kept?.seatToken);
  });

  it('a linked code for another room replaces the kept seat', async () => {
    saveSession({ room: 'AAAAAA', seatToken: 'a'.repeat(32), lastSeq: 0 });
    render(Join, { props: { localiser, code: room } });
    await waitUntilWaiting();
    await waitFor(() => expect(loadSession()?.room).toBe(room));
  });
});
