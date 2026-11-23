import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { PROTOCOL_VERSION } from '@wwd/protocol';
import JoinOnline from '../src/screens/JoinOnline.svelte';
import { loadOnlineSession, saveOnlineSession } from '../src/session.js';
import { defaultRulesConfig } from '@wwd/engine';
import { DEFAULT_SERVER } from '../src/online.js';
import { FakeWebSocket } from './fake-socket.js';

const localiser = createLocaliser('en');
const TOKEN = 'c'.repeat(32);

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  location.hash = '';
});

const socket = (): FakeWebSocket => {
  const latest = FakeWebSocket.instances.at(-1);
  if (latest === undefined) throw new Error('no socket was opened');
  return latest;
};

describe('JoinOnline', () => {
  it('joins the room in the link with a fresh hello', async () => {
    render(JoinOnline, { props: { localiser, code: 'k7q2mx' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(socket().url).toBe('ws://localhost:8787/rooms/K7Q2MX/ws');
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'hello',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
    });
    expect(screen.queryByTestId('server-warning')).toBeNull();
  });

  it('asks before connecting to a different server from the link, then names it', async () => {
    render(JoinOnline, {
      props: { localiser, code: 'K7Q2MX', server: 'https://other.example' },
    });
    expect(
      screen.getByRole('heading', {
        name: 'Connect to other.example? Only continue if you trust it.',
      }),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(FakeWebSocket.instances).toHaveLength(0);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(socket().url).toBe('wss://other.example/rooms/K7Q2MX/ws');
    expect(screen.getByTestId('server-warning').textContent).toBe(
      'This game uses a different server: other.example',
    );
  });

  it('keeps the seat stored for another server apart from a linked server', async () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: DEFAULT_SERVER, lastSeq: 3 });
    const other = 'https://other.example';
    const user = userEvent.setup();

    const first = render(JoinOnline, { props: { localiser, code: 'K7Q2MX', server: other } });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'hello',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
    });
    socket().receive({ type: 'error', code: 'room_full' });
    await waitFor(() => expect(screen.getByTestId('connection-stopped')).toBeTruthy());
    expect(loadOnlineSession(DEFAULT_SERVER, 'K7Q2MX')?.seatToken).toBe(TOKEN);
    first.unmount();

    render(JoinOnline, { props: { localiser, code: 'K7Q2MX', server: other } });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    const otherToken = 'e'.repeat(32);
    socket().receive({
      type: 'welcome',
      seat: 'p0',
      seat_token: otherToken,
      room: 'K7Q2MX',
      config: defaultRulesConfig(),
      pin: '1234',
    });
    await waitFor(() => expect(loadOnlineSession(other, 'K7Q2MX')?.seatToken).toBe(otherToken));
    expect(loadOnlineSession(DEFAULT_SERVER, 'K7Q2MX')?.seatToken).toBe(TOKEN);
  });
  it('refuses a server address that is not http or https', () => {
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX', server: 'javascript:alert(1)' } });
    expect(screen.getByRole('alert').textContent).toBe(localiser.t('online-server-invalid'));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('resumes a stored seat for the room', async () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: DEFAULT_SERVER, lastSeq: 3 });
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).toMatchObject({ type: 'hello', seat_token: TOKEN });
  });

  it('offers a new seat or a PIN rejoin when the stored seat is unknown', async () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: DEFAULT_SERVER, lastSeq: 0 });
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_seat' });
    socket().onclose?.({ code: 1000, reason: '' });

    expect(await screen.findByText(localiser.t('stop-unknown-seat'))).toBeTruthy();
    const rejoin = screen.getByRole('link', { name: 'Rejoin with PIN' });
    expect(rejoin.getAttribute('href')).toBe('#/rejoin?code=K7Q2MX');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Join as a new player' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'hello',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
    });
  });

  it('explains an unknown room and stops trying to connect', async () => {
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({ type: 'error', code: 'unknown_room' });
    socket().onclose?.({ code: 1008, reason: '' });

    expect((await screen.findByRole('alert')).textContent).toBe(localiser.t('stop-unknown-room'));
    expect(window.__wwd?.connection()).toMatchObject({
      stopReason: 'unknown_room',
      nextRetryAt: null,
    });
    expect(screen.getByRole('link', { name: localiser.t('online-join-other') })).toBeTruthy();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('fills the code typed into the form into the link', async () => {
    render(JoinOnline, { props: { localiser } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Join code'), 'k7q 2mx');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(location.hash).toBe('#/join/K7Q2MX');
  });
});
