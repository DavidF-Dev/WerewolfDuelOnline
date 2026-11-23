import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import About from '../../src/screens/About.svelte';
import CharacterReference from '../../src/screens/CharacterReference.svelte';
import Settings from '../../src/screens/Settings.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';

const localiser = createLocaliser('en');
let store: DeviceStore;

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
});

afterEach(() => {
  resetDeviceStore();
  setDisplaySettings(DEFAULT_SETTINGS);
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-contrast');
  root.style.removeProperty('--text-scale');
  location.hash = '';
});

describe('Settings', () => {
  it('changing theme applies at once and persists', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(async () => expect((await store.settings.get()).theme).toBe('dark'));
  });

  it('saving a change keeps fields changed elsewhere', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    await store.settings.put({ ...(await store.settings.get()), installCardDismissed: true });
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(async () => expect((await store.settings.get()).theme).toBe('light'));
    expect((await store.settings.get()).installCardDismissed).toBe(true);
  });

  it('two quick changes both persist', async () => {
    render(Settings, { props: { localiser } });
    const contrast = await screen.findByRole('switch', { name: /High contrast/ });
    const patterns = screen.getByRole('switch', { name: /Colour-blind patterns/ });
    await fireEvent.click(contrast);
    await fireEvent.click(patterns);
    await waitFor(async () => {
      const stored = await store.settings.get();
      expect([stored.highContrast, stored.colourBlindPatterns]).toEqual([true, true]);
    });
  });

  it('card text changes are shared with the cards and persist', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Text only' }));
    await waitFor(async () => expect((await store.settings.get()).cardText).toBe('text-only'));
  });

  it('toggles show their state in words', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const toggle = await screen.findByRole('switch', { name: /High contrast/ });
    expect(toggle.closest('label')?.textContent).toContain('OFF');
    await user.click(toggle);
    expect(toggle.closest('label')?.textContent).toContain('ON');
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
    await waitFor(async () => expect((await store.settings.get()).highContrast).toBe(true));
  });

  it('text size is clamped to 90–150', async () => {
    render(Settings, { props: { localiser } });
    const slider = (await screen.findByRole('slider', { name: /Text size/ })) as HTMLInputElement;
    expect(slider.min).toBe('90');
    expect(slider.max).toBe('150');
    expect(slider.step).toBe('10');
    await fireEvent.input(slider, { target: { value: '400' } });
    await waitFor(async () => expect((await store.settings.get()).textSize).toBe(150));
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
    await fireEvent.input(slider, { target: { value: '10' } });
    await waitFor(async () => expect((await store.settings.get()).textSize).toBe(90));
  });

  it('custom server must be https', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Custom' }));
    const input = screen.getByLabelText('Server address');
    await user.type(input, 'http://example.com');
    await user.click(screen.getByRole('button', { name: 'Use this server' }));
    expect(screen.getByRole('alert').textContent).toContain('https://');
    expect((await store.settings.get()).server).toBeNull();

    await user.clear(input);
    await user.type(input, 'https://game.example.com/');
    await user.click(screen.getByRole('button', { name: 'Use this server' }));
    await waitFor(async () =>
      expect((await store.settings.get()).server).toBe('https://game.example.com'),
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(
      within(screen.getByRole('group', { name: 'Server' })).getByRole('radio', { name: 'Default' }),
    );
    await waitFor(async () => expect((await store.settings.get()).server).toBeNull());
  });

  it('display name edits the identity', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const input = await screen.findByLabelText('Display name');
    await user.type(input, '  Mika  ');
    await user.tab();
    await waitFor(async () => expect((await store.identity.get()).displayName).toBe('Mika'));
  });

  it('language lists system and English', async () => {
    render(Settings, { props: { localiser } });
    const select = await screen.findByRole('combobox', { name: 'Language' });
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'System (English)',
      'English',
    ]);
  });

  it('has one h1 and a back button', async () => {
    render(Settings, { props: { localiser } });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});

describe('About', () => {
  it('about shows the unofficial notice and credits', () => {
    render(About, { props: { localiser } });
    expect(screen.getByText(localiser.t('footer-unofficial'))).toBeTruthy();
    expect(screen.getByText('© 2026 David F Dev')).toBeTruthy();
    expect(screen.getByText(/Version \d/)).toBeTruthy();
    for (const name of ['Lexend', 'OpenDyslexic', 'Cinzel', 'Atkinson Hyperlegible Next', 'idb']) {
      expect(screen.getByText(new RegExp(`^${name},`))).toBeTruthy();
    }
    expect(
      screen.getByText(/^The fonts are used under the SIL Open Font License 1.1/),
    ).toBeTruthy();
    expect(screen.getByText(/MIT OR Apache-2.0/)).toBeTruthy();
    expect(screen.getByText(/Placeholder shapes/)).toBeTruthy();
  });
});

describe('Character reference', () => {
  it('lists all eight characters and the Fool with their abilities', () => {
    render(CharacterReference, { props: { localiser } });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
    expect(screen.getByRole('button', { name: /^3, Knight, Human[.] Gain an/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^The Fool\./ })).toBeTruthy();
  });
});
