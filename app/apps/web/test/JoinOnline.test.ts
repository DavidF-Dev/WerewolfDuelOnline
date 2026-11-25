import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { PROTOCOL_VERSION } from '@wwd/protocol';
import Join from '../src/screens/Join.svelte';
import JoinOnline from '../src/screens/JoinOnline.svelte';
import Rejoin from '../src/screens/Rejoin.svelte';
import { loadOnlineSession, resetSessions, saveOnlineSession } from '../src/session.js';
import { defaultRulesConfig } from '@wwd/engine';
import { DEFAULT_SERVER } from '../src/online.js';
import { resetDeviceStore, setDeviceStore } from '../src/device-store.js';
import { openDeviceStore, type DeviceStore } from '../src/storage/db.js';
import { FakeWebSocket } from './fake-socket.js';

const localiser = createLocaliser('en');
const TOKEN = 'c'.repeat(32);

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

describe('JoinOnline display name', () => {
  let store: DeviceStore;

  beforeEach(async () => {
    store = await openDeviceStore();
    await store.clearAll();
    setDeviceStore(store);
  });

  afterEach(() => resetDeviceStore());

  it('first join asks for a display name once', async () => {
    const user = userEvent.setup();
    const first = render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    const field = await screen.findByLabelText('Your name');
    expect(field.getAttribute('maxlength')).toBe('24');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(FakeWebSocket.instances).toHaveLength(0);

    await user.type(field, ' Ada ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).toEqual({
      type: 'hello',
      protocol_version: PROTOCOL_VERSION,
      room: 'K7Q2MX',
      name: 'Ada',
    });
    expect((await store.identity.get()).displayName).toBe('Ada');
    first.unmount();

    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    expect(screen.queryByLabelText('Your name')).toBeNull();
    socket().accept();
    expect(socket().messages()[0]).toMatchObject({ name: 'Ada' });
  });

  it('the name question is a kit dialog that Escape skips', async () => {
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    const field = await screen.findByLabelText('Your name');
    const dialog = field.closest('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    expect(dialog?.classList.contains('dialog')).toBe(true);
    expect(within(dialog!).getByRole('heading', { level: 2 }).textContent).toBe(
      localiser.t('name-title'),
    );
    expect(document.activeElement).toBe(field);
    const buttons = within(dialog!).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Continue', 'Skip']);
    expect(buttons[0]!.classList.contains('primary')).toBe(true);

    dialog!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).not.toHaveProperty('name');
  });

  it('joins without a name when the player skips the question', async () => {
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(socket().messages()[0]).not.toHaveProperty('name');
    expect((await store.identity.get()).displayName).toBeUndefined();
  });
});

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
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.tagName).toBe('DIALOG');
    const answers = Array.from(dialog.querySelectorAll('button, a'));
    expect(answers.map((answer) => answer.textContent)).toEqual(['Continue', 'Cancel']);
    expect(answers[0]!.classList.contains('primary')).toBe(true);
    expect(answers[1]!.getAttribute('href')).toBe('#/');
    expect(document.activeElement).toBe(answers[1]);
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
      game: 0,
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
    expect(screen.queryByTestId('room-full-rejoin')).toBeNull();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('join on this device opens the local join with the code', async () => {
    render(JoinOnline, { props: { localiser } });
    const user = userEvent.setup();
    const play = screen.getByRole('radiogroup', { name: 'Play' });
    expect(within(play).getByRole('radio', { name: 'Online' })).toHaveProperty('checked', true);
    const code = screen.getByLabelText('Join code');
    expect(play.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(play).getByRole('radio', { name: 'This device' }));
    await user.type(code, 'k7q 2mx');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(location.hash).toBe('#/local/join?code=K7Q2MX');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('shows one hint, for the selected place only, on both join screens', async () => {
    const user = userEvent.setup();
    const views = [
      render(JoinOnline, { props: { localiser } }).container,
      render(Join, { props: { localiser } }).container,
    ];
    const [online, local] = views.map((container) => {
      const play = within(container).getByRole('radiogroup', { name: 'Play' });
      return {
        play,
        hints: (): string[] =>
          Array.from(
            play.closest('.panel')!.querySelectorAll('[data-testid="place-hint"]'),
            (hint) => (hint.textContent ?? '').trim(),
          ),
        describedBy: (): string =>
          (play.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent?.trim())
            .join(' '),
      };
    });
    const ONLINE = 'Enter the code your friend shared.';
    const DEVICE = 'Enter the code shown in the other tab.';
    expect(online!.hints()).toEqual([ONLINE]);
    expect(online!.describedBy()).toBe(ONLINE);
    expect(local!.hints()).toEqual([DEVICE]);
    expect(local!.describedBy()).toBe(DEVICE);
    await user.click(within(online!.play).getByRole('radio', { name: 'This device' }));
    expect(online!.hints()).toEqual([DEVICE]);
    await user.click(within(local!.play).getByRole('radio', { name: 'Online' }));
    expect(local!.hints()).toEqual([ONLINE]);
  });

  it('a full room offers rejoin with the same code', async () => {
    const other = 'https://other.example';
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX', server: other } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    expect(screen.queryByRole('button', { name: 'Rejoin with your PIN' })).toBeNull();
    socket().receive({ type: 'error', code: 'room_full' });

    const rejoin = await screen.findByRole('button', { name: 'Rejoin with your PIN' });
    expect(rejoin.classList.contains('primary')).toBe(true);
    expect(screen.getByTestId('connection-stopped').textContent).toBe(
      localiser.t('rejected-room-full'),
    );
    await user.click(rejoin);
    expect(location.hash).toBe(`#/rejoin?code=K7Q2MX&server=${encodeURIComponent(other)}`);
  });

  it('fills the code typed into the form into the link', async () => {
    render(JoinOnline, { props: { localiser } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Join code'), 'k7q 2mx');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(location.hash).toBe('#/join/K7Q2MX');
  });
});

describe('join screens', () => {
  it('invite follows the mockup order', async () => {
    render(JoinOnline, { props: { localiser, code: 'K7Q2MX' } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    socket().accept();
    socket().receive({
      type: 'welcome',
      seat: 'p0',
      seat_token: TOKEN,
      room: 'K7Q2MX',
      config: { ...defaultRulesConfig(), badge_start: { seat: 'p0' } },
      pin: '1234',
      game: 0,
    });
    socket().receive({ type: 'waiting' });

    const invite = await screen.findByTestId('invite');
    expect(screen.getByRole('heading', { level: 1, name: 'Invite a friend' })).toBeTruthy();
    const order = [
      within(invite).getByText('Join code'),
      within(invite).getByTestId('invite-code'),
      within(invite).getByRole('img', { name: /#\/join\/K7Q2MX$/ }),
      within(invite).getByRole('button', { name: 'Copy code' }),
      within(invite).getByRole('button', { name: 'Share link' }),
      within(invite).getByRole('list', { name: 'Game options' }),
      within(invite).getByTestId('invite-waiting'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(invite).getByTestId('invite-code').textContent).toBe('K7Q·2MX');
    const copy = within(invite).getByRole('button', { name: 'Copy code' });
    const share = within(invite).getByRole('button', { name: 'Share link' });
    expect(copy.classList.contains('small')).toBe(true);
    expect(copy.classList.contains('primary')).toBe(false);
    expect(share.classList.contains('small')).toBe(true);
    expect(share.classList.contains('primary')).toBe(true);
    const chips = within(within(invite).getByRole('list', { name: 'Game options' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(chips).toEqual([
      'Badge: you start',
      'Tiebreak: Hourglasses, then the Badge',
      `Minimum targets: ${defaultRulesConfig().min_targets}`,
    ]);
    for (const item of within(invite).getAllByRole('listitem')) {
      expect(item.firstElementChild?.classList.contains('chip')).toBe(true);
    }
    const status = within(invite).getByTestId('invite-waiting');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent?.trim()).toBe('Waiting for your opponent…');
    const panel = status.closest('.panel')!;
    expect(panel.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(panel.querySelector('.dot')).toBeNull();
    expect(screen.queryByTestId('continue-elsewhere')).toBeNull();

    socket().receive({ type: 'opponent_status', connected: true });
    await waitFor(() => expect(status.textContent?.trim()).toBe(localiser.t('invite-joined')));
    expect(panel.querySelector('[data-part="spinner"]')).toBeNull();
    expect(panel.querySelector('.dot')).not.toBeNull();
  });

  it('join and rejoin use the kit panel', async () => {
    const forms = [
      render(JoinOnline, { props: { localiser } }),
      render(Join, { props: { localiser } }),
      render(Rejoin, { props: { localiser, code: 'K7Q2MX' } }),
    ];
    const [online, local, rejoin] = forms.map(({ container }) => container);
    for (const container of [online!, local!, rejoin!]) {
      const view = within(container);
      expect(view.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(view.getByRole('button', { name: 'Back' })).toBeTruthy();
      const code = view.getByLabelText('Join code');
      const panel = code.closest('.panel');
      expect(panel).not.toBeNull();
      expect(code.classList.contains('code')).toBe(true);
      const submit = within(panel as HTMLElement)
        .getAllByRole('button')
        .find((button) => button.getAttribute('type') === 'submit');
      expect(submit?.classList.contains('primary')).toBe(true);
      expect(code.compareDocumentPosition(submit!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const [container, place] of [
      [online!, 'Online'],
      [local!, 'This device'],
    ] as const) {
      const play = within(container).getByRole('radiogroup', { name: 'Play' });
      expect(play.classList.contains('segmented')).toBe(true);
      expect(play.closest('.panel')).toBe(
        within(container).getByLabelText('Join code').closest('.panel'),
      );
      expect(within(play).getByRole('radio', { name: place })).toHaveProperty('checked', true);
    }
    const view = within(rejoin!);
    const panel = view.getByLabelText('Join code').closest('.panel') as HTMLElement;
    const seat = within(panel).getByRole('radiogroup', { name: 'Which player were you?' });
    expect(seat.classList.contains('segmented')).toBe(true);
    expect(
      within(seat)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent?.trim()),
    ).toEqual(['Player 1', 'Player 2']);
    expect(within(panel).getByLabelText('PIN')).toBeTruthy();
    expect(view.queryByRole('radiogroup', { name: 'Play' })).toBeNull();
  });
});
