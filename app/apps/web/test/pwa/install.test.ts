import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { installState, listenForInstall, promptInstall } from '../../src/pwa/install.js';
import Home from '../../src/screens/Home.svelte';
import Settings from '../../src/screens/Settings.svelte';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';

const localiser = createLocaliser('en');

const UA = {
  chrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

type Platform = 'prompt' | 'ios' | 'installed' | 'unavailable';

let stopListening: () => void = () => {};

/** An install offer like the one Chrome sends, answered with `outcome`. */
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event;
}

/** Makes this page look like `platform` and starts listening for install offers. */
function onPlatform(platform: Platform, userAgent = UA.chrome): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    platform === 'ios' ? UA.iosSafari : platform === 'unavailable' ? UA.firefox : userAgent,
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: platform === 'installed' && query === '(display-mode: standalone)',
    media: query,
  }));
  stopListening = listenForInstall();
  if (platform === 'prompt') offer();
}

afterEach(() => {
  stopListening();
  stopListening = () => {};
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('installState', () => {
  it('is prompt once the browser offers an install', () => {
    onPlatform('unavailable', UA.chrome);
    expect(installState()).toBe('unavailable');
    const event = offer();
    expect(event.defaultPrevented).toBe(true);
    expect(installState()).toBe('prompt');
  });

  it('is ios for Safari on an iPhone, but not for other iPhone browsers', () => {
    onPlatform('ios');
    expect(installState()).toBe('ios');
    stopListening();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.iosChrome);
    stopListening = listenForInstall();
    expect(installState()).toBe('unavailable');
  });

  it('is installed when running standalone, including from the iOS home screen', () => {
    onPlatform('installed');
    expect(installState()).toBe('installed');
    stopListening();
    vi.unstubAllGlobals();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.iosSafari);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try {
      stopListening = listenForInstall();
      expect(installState()).toBe('installed');
    } finally {
      delete (navigator as { standalone?: boolean }).standalone;
    }
  });

  it('is unavailable where installing is impossible', () => {
    onPlatform('unavailable');
    expect(installState()).toBe('unavailable');
  });

  it('shows the browser prompt once, then is installed when accepted', async () => {
    onPlatform('unavailable', UA.chrome);
    const event = offer('accepted');
    expect(await promptInstall()).toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(await promptInstall()).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(installState()).toBe('installed');
  });
});

describe('install in Settings and Home', () => {
  let store: DeviceStore;

  beforeEach(async () => {
    store = await openDeviceStore();
    await store.clearAll();
    setDeviceStore(store);
  });

  afterEach(() => {
    resetDeviceStore();
    location.hash = '';
  });

  const finishedFirstGame = async (): Promise<void> =>
    store.settings.put({ ...(await store.settings.get()), firstGameFinished: true });

  it('install row matches the platform', async () => {
    const general = async () =>
      screen.findByRole('region', { name: localiser.t('settings-general') });

    onPlatform('prompt');
    let view = render(Settings, { props: { localiser } });
    let row = within(await general()).getByTestId('install-row');
    expect(row.textContent).toContain('Install app');
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Install' }));
    view.unmount();
    stopListening();

    onPlatform('ios');
    view = render(Settings, { props: { localiser } });
    row = within(await general()).getByTestId('install-row');
    expect(row.textContent).toContain(localiser.t('install-ios-steps'));
    expect(within(row).queryByRole('button')).toBeNull();
    view.unmount();
    stopListening();

    onPlatform('installed');
    view = render(Settings, { props: { localiser } });
    row = within(await general()).getByTestId('install-row');
    expect(row.textContent).toContain('Installed');
    expect(within(row).queryByRole('button')).toBeNull();
    view.unmount();
    stopListening();

    onPlatform('unavailable');
    render(Settings, { props: { localiser } });
    expect(within(await general()).queryByTestId('install-row')).toBeNull();
  });

  it('install card only after the first finished game', async () => {
    onPlatform('prompt');
    const first = render(Home, { props: { localiser } });
    await screen.findByRole('button', { name: 'New game' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('region', { name: 'Install the app' })).toBeNull();
    first.unmount();

    await finishedFirstGame();
    const second = render(Home, { props: { localiser } });
    const card = await screen.findByRole('region', { name: 'Install the app' });
    expect(card.textContent).toContain(localiser.t('install-card-text'));
    expect(card.textContent).not.toContain('saved games');
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Install' }));
    second.unmount();
    stopListening();

    onPlatform('unavailable');
    const third = render(Home, { props: { localiser } });
    await screen.findByRole('button', { name: 'New game' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('region', { name: 'Install the app' })).toBeNull();
    third.unmount();
    stopListening();

    onPlatform('ios');
    render(Home, { props: { localiser } });
    const ios = await screen.findByRole('region', { name: 'Install the app' });
    expect(ios.textContent).toContain('keep your saved games safe');
    expect(ios.textContent).toContain(localiser.t('install-ios-steps'));
  });

  it('dismissed card stays hidden', async () => {
    onPlatform('prompt');
    await finishedFirstGame();
    const user = userEvent.setup();
    const first = render(Home, { props: { localiser } });
    const card = await screen.findByRole('region', { name: 'Install the app' });
    await store.settings.put({ ...(await store.settings.get()), theme: 'dark' });
    await user.click(within(card).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Install the app' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(async () => expect((await store.settings.get()).installCardDismissed).toBe(true));
    expect((await store.settings.get()).theme).toBe('dark');
    first.unmount();

    render(Home, { props: { localiser } });
    await screen.findByRole('button', { name: 'New game' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('region', { name: 'Install the app' })).toBeNull();
  });
});
