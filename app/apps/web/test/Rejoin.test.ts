import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { defaultRulesConfig } from '@wwd/engine';
import { PROTOCOL_VERSION } from '@wwd/protocol';
import Rejoin from '../src/screens/Rejoin.svelte';
import { loadOnlineSession, resetSessions } from '../src/session.js';
import { DEFAULT_SERVER } from '../src/online.js';
import { FakeWebSocket } from './fake-socket.js';

const localiser = createLocaliser('en');
const TOKEN = 'd'.repeat(32);

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSessions();
  location.hash = '';
});

const socket = (): FakeWebSocket => {
  const latest = FakeWebSocket.instances.at(-1);
  if (latest === undefined) throw new Error('no socket was opened');
  return latest;
};

describe('Rejoin', () => {
  it('rejoins the chosen seat with its PIN, then opens the game', async () => {
    render(Rejoin, { props: { localiser, code: 'K7Q2MX', seat: 'p1' } });
    expect(screen.getByRole('radio', { name: 'Player 2' })).toHaveProperty('checked', true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('PIN'), '4821');
    await user.click(screen.getByRole('button', { name: 'Rejoin' }));

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'rejoin',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
      seat: 'p1',
      pin: '4821',
    });
    socket().receive({
      type: 'welcome',
      seat: 'p1',
      seat_token: TOKEN,
      room: 'K7Q2MX',
      config: defaultRulesConfig(),
      pin: '4821',
      game: 0,
    });
    await waitFor(() => expect(location.hash).toBe('#/join/K7Q2MX'));
    expect(loadOnlineSession(DEFAULT_SERVER, 'K7Q2MX')?.seatToken).toBe(TOKEN);
  });

  it('says a PIN was wrong and lets the player try again', async () => {
    render(Rejoin, { props: { localiser, code: 'K7Q2MX', seat: 'p0' } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Rejoin' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'wrong_pin' });
    expect((await screen.findByRole('alert')).textContent).toBe(localiser.t('rejected-wrong-pin'));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('asks before showing the PIN form for a different server', async () => {
    render(Rejoin, {
      props: { localiser, code: 'K7Q2MX', seat: 'p0', server: 'https://other.example' },
    });
    expect(screen.queryByLabelText('PIN')).toBeNull();
    expect(FakeWebSocket.instances).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('PIN'), '4821');
    await user.click(screen.getByRole('button', { name: 'Rejoin' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(socket().url).toBe('wss://other.example/rooms/K7Q2MX/ws');
  });

  it('asks the opponent when the PIN is not known', async () => {
    render(Rejoin, { props: { localiser, code: 'K7Q2MX', seat: 'p0' } });
    await userEvent.setup().click(screen.getByRole('button', { name: "I don't know my PIN" }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'rejoin',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
      seat: 'p0',
    });
    socket().receive({ type: 'rejoin_pending' });
    expect(await screen.findByText(localiser.t('rejoin-waiting-approval'))).toBeTruthy();
  });
});
