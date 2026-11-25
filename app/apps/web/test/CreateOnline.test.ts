import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { defaultRulesConfig, type RulesConfig } from '@wwd/engine';
import CreateOnline from '../src/screens/CreateOnline.svelte';
import { resetDeviceStore, setDeviceStore } from '../src/device-store.js';
import { DEFAULT_SERVER } from '../src/online.js';
import { DEFAULT_SETTINGS } from '../src/settings/settings.js';
import { openDeviceStore, type DeviceStore } from '../src/storage/db.js';

const localiser = createLocaliser('en');
let store: DeviceStore;

beforeEach(async () => {
  store = await openDeviceStore();
  await store.clearAll();
  setDeviceStore(store);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDeviceStore();
  location.hash = '';
});

const created = (): ReturnType<typeof vi.fn> =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ code: 'K7Q2MX' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );

const unreachable = (): ReturnType<typeof vi.fn> =>
  vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });

interface Sent {
  url: string;
  init: RequestInit;
  body: { grace_minutes: number; config: RulesConfig };
}

function sent(fetchMock: ReturnType<typeof vi.fn>): Sent {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Sent['body'] };
}

describe('CreateOnline', () => {
  it('posts the selected grace and navigates with the code', async () => {
    const fetchMock = created();
    vi.stubGlobal('fetch', fetchMock);
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();

    expect(screen.getByRole('radio', { name: '10 min' })).toHaveProperty('checked', true);
    await user.click(screen.getByRole('radio', { name: '30 min' }));
    await user.click(screen.getByRole('button', { name: 'Create game' }));

    await waitFor(() => expect(location.hash).toBe('#/join/K7Q2MX'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = sent(fetchMock);
    expect(url).toBe(`${DEFAULT_SERVER}/rooms`);
    expect(init.method).toBe('POST');
    expect(body.grace_minutes).toBe(30);
    expect(body.config).toEqual(defaultRulesConfig());
  });

  it('new game on this device opens the local host', async () => {
    const fetchMock = created();
    vi.stubGlobal('fetch', fetchMock);
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();

    const play = screen.getByRole('radiogroup', { name: 'Play' });
    const options = within(play).getAllByRole('radio');
    expect(options.map((option) => option.closest('label')?.textContent?.trim())).toEqual([
      'Online',
      'This device',
    ]);
    expect(within(play).getByRole('radio', { name: 'Online' })).toHaveProperty('checked', true);
    const form = screen.getByTestId('create-form');
    expect(
      play.compareDocumentPosition(
        screen.getByRole('radiogroup', { name: 'Badge (first player)' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(form.contains(play)).toBe(true);

    await user.click(within(play).getByRole('radio', { name: 'This device' }));
    expect(screen.queryByRole('radiogroup', { name: 'Reconnect grace' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create game' }));
    expect(location.hash).toBe('#/local/host');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows one hint, for the selected place only', async () => {
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();
    const play = screen.getByRole('radiogroup', { name: 'Play' });
    const hints = (): string[] =>
      Array.from(play.closest('.panel')!.querySelectorAll('[data-testid="place-hint"]'), (hint) =>
        (hint.textContent ?? '').trim(),
      );
    const describedBy = (): string =>
      (play.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join(' ');

    expect(hints()).toEqual(['Play a friend anywhere with a join code.']);
    expect(describedBy()).toBe('Play a friend anywhere with a join code.');
    await user.click(within(play).getByRole('radio', { name: 'This device' }));
    expect(hints()).toEqual(['Two tabs of this browser, to try the game out.']);
    expect(describedBy()).toBe('Two tabs of this browser, to try the game out.');
  });

  it('shows a spinner while the game is created', async () => {
    let respond: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    );
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();
    const spinner = (): Element | null => document.querySelector('[data-part="spinner"]');
    expect(spinner()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create game' }));
    const status = await screen.findByText('Creating the game');
    expect(status.querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    respond(new Response(JSON.stringify({ code: 'K7Q2MX' }), { status: 201 }));
    await waitFor(() => expect(location.hash).not.toBe(''));
  });

  it('offers the three reconnect times', () => {
    render(CreateOnline, { props: { localiser } });
    for (const minutes of [5, 10, 30]) {
      expect(screen.getByRole('radio', { name: `${minutes} min` })).toBeTruthy();
    }
  });

  it('new game uses segmented controls with the rules defaults', async () => {
    const { container } = render(CreateOnline, { props: { localiser } });
    const defaults = defaultRulesConfig();
    expect(screen.getByRole('heading', { level: 1, name: 'New game' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

    await userEvent.setup().click(screen.getByText('Advanced'));
    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(5);
    const names = groups.map(
      (group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(names).toEqual([
      'Play',
      'Badge (first player)',
      'Reconnect grace',
      'Tiebreak',
      'Minimum targets',
    ]);
    for (const group of groups) {
      expect(group.classList.contains('segmented')).toBe(true);
      expect(group.closest('.panel')).not.toBeNull();
    }
    const checked = groups.map((group) =>
      within(group)
        .getAllByRole('radio')
        .find((radio) => (radio as HTMLInputElement).checked)
        ?.closest('label')
        ?.textContent?.trim(),
    );
    const badge = defaults.badge_start === 'random' ? 'Random' : 'I start';
    expect(checked).toEqual([
      'Online',
      badge,
      '10 min',
      localiser.t(`create-tiebreak-${defaults.tiebreak}`),
      String(defaults.min_targets),
    ]);
    expect(
      within(groups[1]!)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent?.trim()),
    ).toEqual(['Random', 'I start', 'Opponent starts']);
    expect(
      within(groups[2]!)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent?.trim()),
    ).toEqual(['5 min', '10 min', '30 min']);
    const inGroups = groups.reduce((n, group) => n + within(group).getAllByRole('radio').length, 0);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(inGroups);

    const create = screen.getByRole('button', { name: 'Create game' });
    expect(create.getAttribute('type')).toBe('submit');
    expect(create.classList.contains('primary')).toBe(true);
    expect(
      groups.at(-1)!.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('badge choice maps to badge_start', async () => {
    const user = userEvent.setup();
    for (const [label, expected] of [
      ['Random', 'random'],
      ['I start', { seat: 'p0' }],
      ['Opponent starts', { seat: 'p1' }],
    ] as const) {
      const fetchMock = created();
      vi.stubGlobal('fetch', fetchMock);
      const { unmount } = render(CreateOnline, { props: { localiser } });
      expect(screen.getByRole('radio', { name: 'Random' })).toHaveProperty('checked', true);
      await user.click(screen.getByRole('radio', { name: label }));
      await user.click(screen.getByRole('button', { name: 'Create game' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(sent(fetchMock).body.config.badge_start).toEqual(expected);
      unmount();
    }
  });

  it('advanced options default to the rules defaults', async () => {
    const fetchMock = created();
    vi.stubGlobal('fetch', fetchMock);
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();
    const defaults = defaultRulesConfig();

    await user.click(screen.getByText('Advanced'));
    const tiebreak = within(screen.getByRole('radiogroup', { name: 'Tiebreak' }));
    expect(tiebreak.getByRole('radio', { name: 'Hourglasses, then the Badge' })).toHaveProperty(
      'checked',
      defaults.tiebreak === 'hourglasses_then_badge',
    );
    const targets = within(screen.getByRole('radiogroup', { name: 'Minimum targets' }));
    expect(targets.getByRole('radio', { name: String(defaults.min_targets) })).toHaveProperty(
      'checked',
      true,
    );

    await user.click(tiebreak.getByRole('radio', { name: 'Badge only' }));
    await user.click(targets.getByRole('radio', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).body.config).toEqual({
      tiebreak: 'badge_only',
      min_targets: 0,
      badge_start: 'random',
    });
  });

  it('uses the custom server from the settings and names it in the link to the game', async () => {
    await store.settings.put({ ...DEFAULT_SETTINGS, server: 'https://custom.example' });
    const fetchMock = created();
    vi.stubGlobal('fetch', fetchMock);
    render(CreateOnline, { props: { localiser } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create game' }));

    await waitFor(() =>
      expect(location.hash).toBe('#/join/K7Q2MX?server=https%3A%2F%2Fcustom.example'),
    );
    expect(sent(fetchMock).url).toBe('https://custom.example/rooms');
  });

  it('explains a refusal and stays on the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })),
    );
    render(CreateOnline, { props: { localiser } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create game' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(localiser.t('create-failed-rate-limited'));
    expect(location.hash).toBe('');
  });

  it('create failure while online blames the server, not the connection', async () => {
    vi.stubGlobal('fetch', unreachable());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(CreateOnline, { props: { localiser } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create game' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "The game server isn't responding right now; try again later.",
    );
  });

  it('create failure while offline blames the connection', async () => {
    vi.stubGlobal('fetch', unreachable());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(CreateOnline, { props: { localiser } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create game' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      localiser.t('create-failed-network'),
    );
  });
});
